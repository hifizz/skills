'use client'

import { useEffect, useState } from 'react'
import { PaidMediaCard } from '@/components/paid-media-card'
import type { PaidMediaItem } from '@/lib/paid-media/types'
import { PaidMediaProvider } from '@/providers/paid-media-provider'

/**
 * /paid-media-demo —— 装完直接看效果的演示页。
 *
 * 前置：
 *   1. config.ts 两个 adapter 已实现，且当前浏览器处于登录态
 *   2. 已用 scripts/upload-media.ts 灌过至少一条数据
 *
 * 验证链路：未解锁 → 模糊预览 + 按钮 → 点击解锁（走 charge 扣费）→
 * 预签名 URL 签发 → 出图/出视频；刷新页面权限仍在（DB 记录）。
 */
export default function PaidMediaDemoPage() {
  const [items, setItems] = useState<PaidMediaItem[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'unauthorized' | 'error'>('loading')

  useEffect(() => {
    fetch('/api/media/list')
      .then(async (res) => {
        if (res.status === 401) return setState('unauthorized')
        if (!res.ok) return setState('error')
        const data = await res.json()
        setItems(data.items ?? [])
        setState('ready')
      })
      .catch(() => setState('error'))
  }, [])

  return (
    <PaidMediaProvider>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-semibold">Paid Media Demo</h1>
        <p className="mt-1 text-sm text-neutral-500">
          锁定态 = blurhash + 高斯模糊缩略图；解锁后浏览器直连 R2 预签名 URL。
        </p>

        {state === 'loading' && <p className="mt-8 text-neutral-400">Loading…</p>}
        {state === 'unauthorized' && (
          <p className="mt-8 text-amber-600">请先登录（getUserId 返回了 null）。</p>
        )}
        {state === 'error' && (
          <p className="mt-8 text-red-500">列表加载失败，检查 /api/media/list 与数据库连接。</p>
        )}
        {state === 'ready' && items.length === 0 && (
          <p className="mt-8 text-neutral-400">
            还没有媒体资产。先跑：<code>pnpm tsx scripts/upload-media.ts ./demo.jpg --cost 10</code>
          </p>
        )}

        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3">
          {items.map((item) => (
            <div key={item.id}>
              <PaidMediaCard item={item} />
              <p className="mt-1 text-xs text-neutral-500">
                {item.mediaType} · {item.creditsCost > 0 ? `${item.creditsCost} credits` : 'Free'}
              </p>
            </div>
          ))}
        </div>
      </main>
    </PaidMediaProvider>
  )
}
