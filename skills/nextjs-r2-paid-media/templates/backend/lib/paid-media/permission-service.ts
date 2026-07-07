import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db' // ← 换成你项目的 Drizzle db 实例导出
import { mediaAssets, mediaUnlocks } from './schema'

/**
 * 媒体权限服务：查用户对媒体的解锁状态。
 * 批量场景一律走 checkBatch（单条 inArray 查询），不要循环调 checkSingle。
 */

/** 单个媒体是否已解锁。免费媒体（creditsCost=0）不需要解锁记录，直接放行 */
export async function checkSingleMediaPermission(userId: string, mediaId: string): Promise<boolean> {
  const [asset] = await db
    .select({ creditsCost: mediaAssets.creditsCost })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, mediaId), eq(mediaAssets.isActive, true)))
    .limit(1)

  if (!asset) return false
  if (asset.creditsCost === 0) return true

  const [unlock] = await db
    .select({ id: mediaUnlocks.id })
    .from(mediaUnlocks)
    .where(and(eq(mediaUnlocks.userId, userId), eq(mediaUnlocks.mediaId, mediaId)))
    .limit(1)

  return Boolean(unlock)
}

/** 批量检查，返回 mediaId -> isUnlocked。一次 DB 往返处理最多 100 个 id */
export async function checkBatchMediaPermissions(
  userId: string,
  mediaIds: string[]
): Promise<Record<string, boolean>> {
  if (mediaIds.length === 0) return {}

  const [assets, unlocks] = await Promise.all([
    db
      .select({ id: mediaAssets.id, creditsCost: mediaAssets.creditsCost })
      .from(mediaAssets)
      .where(and(inArray(mediaAssets.id, mediaIds), eq(mediaAssets.isActive, true))),
    db
      .select({ mediaId: mediaUnlocks.mediaId })
      .from(mediaUnlocks)
      .where(and(eq(mediaUnlocks.userId, userId), inArray(mediaUnlocks.mediaId, mediaIds))),
  ])

  const freeIds = new Set(assets.filter((a) => a.creditsCost === 0).map((a) => a.id))
  const knownIds = new Set(assets.map((a) => a.id))
  const unlockedIds = new Set(unlocks.map((u) => u.mediaId))

  return Object.fromEntries(
    mediaIds.map((id) => [id, knownIds.has(id) && (freeIds.has(id) || unlockedIds.has(id))])
  )
}
