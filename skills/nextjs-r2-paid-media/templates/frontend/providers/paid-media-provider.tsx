'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  CheckPermissionsResponse,
  MediaAccessResponse,
  PaidMediaItem,
  UnlockResponse,
} from '@/lib/paid-media/types'

/**
 * PaidMediaProvider —— headless 数据层，不渲染任何 UI。
 *
 * 职责：
 * - 权限缓存：批量 check-permissions 的结果 + 解锁成功后的本地更新
 * - 解锁：POST unlock，成功后更新缓存
 * - URL 生命周期：签发预签名 URL、过期前自动续签（REFRESH_BUFFER）、失败退避重试
 *
 * 展示组件由业务实现（用 usePaidMediaItem 拿数据），参考实现见 paid-media-card.tsx。
 */

// ==================== 可调常量 ====================

/** URL 过期前多久自动续签。必须留缓冲，否则正在播放的视频会在续签间隙 403 断流 */
const REFRESH_BUFFER_MS = 5 * 60 * 1000
/** 签发失败的退避重试间隔 */
const RETRY_DELAYS_MS = [2_000, 5_000, 15_000]

// ==================== 类型 ====================

interface MediaAccess {
  url: string
  expiresAt: string
}

interface PaidMediaContextValue {
  /** undefined = 还没查过 */
  getPermission: (mediaId: string) => boolean | undefined
  /** 批量查权限并写入缓存（列表页挂载时调用一次） */
  checkPermissions: (mediaIds: string[]) => Promise<void>
  /** 解锁（扣费）。成功返回 true 并更新权限缓存 */
  unlock: (mediaId: string) => Promise<boolean>
  isUnlocking: (mediaId: string) => boolean
  /** 当前有效的预签名 URL（未签发/已失效则 undefined） */
  getAccess: (mediaId: string) => MediaAccess | undefined
  /** 签发/续签预签名 URL（幂等：已有有效 URL 且未强制时直接返回） */
  fetchAccess: (mediaId: string, force?: boolean) => Promise<void>
  getError: (mediaId: string) => string | null
  clearError: (mediaId: string) => void
}

const PaidMediaContext = createContext<PaidMediaContextValue | null>(null)

// ==================== Provider ====================

export interface PaidMediaProviderProps {
  children: ReactNode
  /** API 前缀，默认 /api/media */
  apiBase?: string
  /** 401 时回调（如弹登录框） */
  onAuthError?: () => void
}

export function PaidMediaProvider({
  children,
  apiBase = '/api/media',
  onAuthError,
}: PaidMediaProviderProps) {
  const [permissions, setPermissions] = useState<Record<string, boolean>>({})
  const [accessMap, setAccessMap] = useState<Record<string, MediaAccess>>({})
  const [unlockingIds, setUnlockingIds] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, string | null>>({})

  // 续签定时器 / 重试计数 / 进行中的请求，都不触发渲染，放 ref
  const refreshTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const retryCounts = useRef<Map<string, number>>(new Map())
  const inflight = useRef<Map<string, Promise<void>>>(new Map())

  // 回调里要读「最新」状态但不想让状态进依赖数组（避免反复重建回调），镜像进 ref
  const accessMapRef = useRef(accessMap)
  accessMapRef.current = accessMap
  const unlockingIdsRef = useRef(unlockingIds)
  unlockingIdsRef.current = unlockingIds

  useEffect(() => {
    const timers = refreshTimers.current
    return () => {
      for (const t of timers.values()) clearTimeout(t)
      timers.clear()
    }
  }, [])

  const setError = useCallback((mediaId: string, message: string | null) => {
    setErrors((prev) => ({ ...prev, [mediaId]: message }))
  }, [])

  // ---------- 权限 ----------

  const checkPermissions = useCallback(
    async (mediaIds: string[]) => {
      if (mediaIds.length === 0) return
      const res = await fetch(`${apiBase}/check-permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaIds }),
      })
      if (res.status === 401) {
        onAuthError?.()
        return
      }
      if (!res.ok) return
      const data: CheckPermissionsResponse = await res.json()
      setPermissions((prev) => ({ ...prev, ...data.permissions }))
    },
    [apiBase, onAuthError]
  )

  // ---------- URL 签发与续签 ----------

  const fetchAccess = useCallback(
    async (mediaId: string, force = false) => {
      // 幂等：有效期内不重复签发
      const current = accessMapRef.current[mediaId]
      if (!force && current && new Date(current.expiresAt).getTime() - Date.now() > REFRESH_BUFFER_MS) {
        return
      }
      const pending = inflight.current.get(mediaId)
      if (pending) return pending

      const task = (async () => {
        try {
          const res = await fetch(`${apiBase}/access`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mediaId }),
          })
          if (res.status === 401) {
            onAuthError?.()
            throw new Error('Please sign in first')
          }
          if (res.status === 403) {
            // 服务端认为未解锁 → 校正本地缓存
            setPermissions((prev) => ({ ...prev, [mediaId]: false }))
            throw new Error('Media not unlocked')
          }
          if (!res.ok) throw new Error(`Failed to get media access (HTTP ${res.status})`)

          const data: MediaAccessResponse = await res.json()
          setAccessMap((prev) => ({ ...prev, [mediaId]: { url: data.url, expiresAt: data.expiresAt } }))
          setError(mediaId, null)
          retryCounts.current.delete(mediaId)

          // 过期前 REFRESH_BUFFER 自动续签
          const old = refreshTimers.current.get(mediaId)
          if (old) clearTimeout(old)
          const delay = Math.max(0, new Date(data.expiresAt).getTime() - Date.now() - REFRESH_BUFFER_MS)
          refreshTimers.current.set(
            mediaId,
            setTimeout(() => void fetchAccess(mediaId, true), delay)
          )
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to get media access'
          setError(mediaId, message)

          // 未解锁/未登录不重试；其他错误退避重试
          if (message !== 'Media not unlocked' && message !== 'Please sign in first') {
            const attempt = retryCounts.current.get(mediaId) ?? 0
            if (attempt < RETRY_DELAYS_MS.length) {
              retryCounts.current.set(mediaId, attempt + 1)
              const old = refreshTimers.current.get(mediaId)
              if (old) clearTimeout(old)
              refreshTimers.current.set(
                mediaId,
                setTimeout(() => void fetchAccess(mediaId, true), RETRY_DELAYS_MS[attempt])
              )
            }
          }
        } finally {
          inflight.current.delete(mediaId)
        }
      })()

      inflight.current.set(mediaId, task)
      return task
    },
    [apiBase, onAuthError, setError]
  )

  // ---------- 解锁 ----------

  const unlock = useCallback(
    async (mediaId: string): Promise<boolean> => {
      if (unlockingIdsRef.current.has(mediaId)) return false
      setUnlockingIds((prev) => new Set(prev).add(mediaId))
      setError(mediaId, null)
      try {
        const res = await fetch(`${apiBase}/${mediaId}/unlock`, { method: 'POST' })
        if (res.status === 401) {
          onAuthError?.()
          setError(mediaId, 'Please sign in first')
          return false
        }
        const data: UnlockResponse = await res.json()
        if (!res.ok || !data.success) {
          setError(mediaId, data.error || 'Failed to unlock')
          return false
        }
        // 解锁成功：本地缓存直接置 true，随后签发 URL
        setPermissions((prev) => ({ ...prev, [mediaId]: true }))
        void fetchAccess(mediaId, true)
        return true
      } catch {
        setError(mediaId, 'Network error, please retry')
        return false
      } finally {
        setUnlockingIds((prev) => {
          const next = new Set(prev)
          next.delete(mediaId)
          return next
        })
      }
    },
    [apiBase, fetchAccess, onAuthError, setError]
  )

  // ---------- context value ----------

  const value = useMemo<PaidMediaContextValue>(
    () => ({
      getPermission: (id) => permissions[id],
      checkPermissions,
      unlock,
      isUnlocking: (id) => unlockingIds.has(id),
      getAccess: (id) => {
        const access = accessMap[id]
        if (!access) return undefined
        return new Date(access.expiresAt).getTime() > Date.now() ? access : undefined
      },
      fetchAccess,
      getError: (id) => errors[id] ?? null,
      clearError: (id) => setError(id, null),
    }),
    [permissions, accessMap, unlockingIds, errors, checkPermissions, unlock, fetchAccess, setError]
  )

  return <PaidMediaContext.Provider value={value}>{children}</PaidMediaContext.Provider>
}

// ==================== Hooks ====================

export function usePaidMedia(): PaidMediaContextValue {
  const ctx = useContext(PaidMediaContext)
  if (!ctx) throw new Error('usePaidMedia must be used within <PaidMediaProvider>')
  return ctx
}

export type PaidMediaItemStatus =
  | 'locked' // 未解锁，展示付费预览 + 解锁入口
  | 'unlocking' // 解锁请求进行中
  | 'fetching-url' // 已解锁，正在签发预签名 URL
  | 'ready' // url 可用
  | 'error'

export interface UsePaidMediaItemResult {
  status: PaidMediaItemStatus
  /** status === 'ready' 时非 null；过期前 Provider 自动续签 */
  url: string | null
  /** 触发解锁（扣费）。返回是否成功 */
  unlock: () => Promise<boolean>
  /** 强制重签 URL（如 <video> onError 时调用） */
  refresh: () => Promise<void>
  error: string | null
}

/**
 * 单个媒体的渲染数据。业务展示组件只依赖这个 hook：
 *
 *   const media = usePaidMediaItem(item)
 *   if (media.status !== 'ready') return <你的锁定态 UI onClick={media.unlock} />
 *   return <img src={media.url!} />
 */
export function usePaidMediaItem(item: PaidMediaItem): UsePaidMediaItemResult {
  const ctx = usePaidMedia()

  // 权限：Provider 缓存优先，列表接口带出的 isUnlocked 兜底
  const cached = ctx.getPermission(item.id)
  const isUnlocked = cached ?? item.isUnlocked ?? item.creditsCost === 0

  const access = ctx.getAccess(item.id)
  const error = ctx.getError(item.id)

  // 已解锁但还没有有效 URL → 自动签发
  useEffect(() => {
    if (isUnlocked && !access) {
      void ctx.fetchAccess(item.id)
    }
  }, [isUnlocked, access, item.id, ctx])

  let status: PaidMediaItemStatus
  if (ctx.isUnlocking(item.id)) status = 'unlocking'
  else if (!isUnlocked) status = 'locked'
  else if (access) status = 'ready'
  else if (error) status = 'error'
  else status = 'fetching-url'

  return {
    status,
    url: access?.url ?? null,
    unlock: () => ctx.unlock(item.id),
    refresh: () => ctx.fetchAccess(item.id, true),
    error,
  }
}
