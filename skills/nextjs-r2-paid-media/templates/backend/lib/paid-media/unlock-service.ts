import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db' // ← 换成你项目的 Drizzle db 实例导出
import { paidMediaConfig } from './config'
import { mediaAssets, mediaUnlocks } from './schema'
import type { UnlockResponse } from './types'

/**
 * 解锁一个媒体：事务内「查已解锁 → charge 扣费 → 写解锁记录」。
 *
 * 幂等性三层保证：
 * 1. 事务外快速路径：已解锁直接返回成功
 * 2. 事务内再查一次（防并发窗口）
 * 3. unique(userId, mediaId) 索引兜底
 */
export async function unlockMedia(userId: string, mediaId: string): Promise<UnlockResponse> {
  const [asset] = await db
    .select({
      id: mediaAssets.id,
      creditsCost: mediaAssets.creditsCost,
      filename: mediaAssets.filename,
    })
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, mediaId), eq(mediaAssets.isActive, true)))
    .limit(1)

  if (!asset) {
    return { success: false, error: 'Media not found or inactive' }
  }

  // 快速路径：已解锁（或免费）直接成功，客户端重试/重放安全
  const [existing] = await db
    .select({ id: mediaUnlocks.id })
    .from(mediaUnlocks)
    .where(and(eq(mediaUnlocks.userId, userId), eq(mediaUnlocks.mediaId, mediaId)))
    .limit(1)

  if (existing || asset.creditsCost === 0) {
    return { success: true, alreadyUnlocked: true, creditsCost: asset.creditsCost }
  }

  try {
    const result = await db.transaction(async (tx) => {
      // 并发窗口内可能已被另一个请求解锁，事务内再查一次
      const [raced] = await tx
        .select({ id: mediaUnlocks.id })
        .from(mediaUnlocks)
        .where(and(eq(mediaUnlocks.userId, userId), eq(mediaUnlocks.mediaId, mediaId)))
        .limit(1)
      if (raced) {
        return { alreadyUnlocked: true as const }
      }

      // 业务扣费（积分/会员校验/订单确认……），失败即回滚
      const charge = await paidMediaConfig.charge(tx, {
        userId,
        mediaId,
        cost: asset.creditsCost,
        description: `Unlock media: ${asset.filename}`,
      })
      if (!charge.ok) {
        throw new ChargeRejectedError(charge.reason)
      }

      await tx.insert(mediaUnlocks).values({
        userId,
        mediaId,
        creditsCost: asset.creditsCost,
        chargeRef: charge.chargeRef ?? null,
      })

      return { alreadyUnlocked: false as const, chargeInfo: charge.info }
    })

    return {
      success: true,
      alreadyUnlocked: result.alreadyUnlocked,
      creditsCost: asset.creditsCost,
      chargeInfo: 'chargeInfo' in result ? result.chargeInfo : undefined,
    }
  } catch (error) {
    if (error instanceof ChargeRejectedError) {
      return { success: false, error: error.message }
    }
    // unique 索引冲突 = 并发解锁竞态输了，等价于已解锁
    if (isUniqueViolation(error)) {
      return { success: true, alreadyUnlocked: true, creditsCost: asset.creditsCost }
    }
    throw error
  }
}

class ChargeRejectedError extends Error {}

function isUniqueViolation(error: unknown): boolean {
  // Postgres unique_violation = 23505（node-postgres / postgres.js 都会带 code）
  return Boolean(
    error &&
      typeof error === 'object' &&
      ('code' in error && (error as { code?: string }).code === '23505')
  )
}
