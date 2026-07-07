import type { db } from '@/lib/db' // ← 换成你项目的 Drizzle db 实例导出

/**
 * 付费媒体系统与业务系统的唯一接缝。装完模板后只需要改这个文件。
 *
 * - getUserId：接你的 auth（better-auth / next-auth / clerk / 自研 JWT 都行）
 * - charge：解锁时怎么扣费，跑在解锁事务内
 */

/** Drizzle 事务句柄类型（跟随你项目的 db 实例推导） */
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

export interface ChargeContext {
  userId: string
  mediaId: string
  /** 该媒体的解锁价格（media_assets.creditsCost） */
  cost: number
  description: string
}

export type ChargeResult =
  | {
      ok: true
      /** 计费凭据（积分流水 id / payment intent id 等），会存进 media_unlocks.chargeRef */
      chargeRef?: string
      /** 透传给前端的信息（如剩余余额），出现在 unlock 响应的 chargeInfo 里 */
      info?: Record<string, unknown>
    }
  | {
      ok: false
      /** 返回给前端的错误信息，如 "Insufficient balance" */
      reason: string
    }

export interface PaidMediaConfig {
  getUserId: (headers: Headers) => Promise<string | null>
  charge: (tx: DbTransaction, ctx: ChargeContext) => Promise<ChargeResult>
}

export const paidMediaConfig: PaidMediaConfig = {
  /**
   * 从请求头解析当前用户 id。返回 null → 接口一律 401。
   *
   * better-auth 示例：
   *   const session = await auth.api.getSession({ headers })
   *   return session?.user?.id ?? null
   */
  getUserId: async (_headers) => {
    throw new Error('paidMediaConfig.getUserId not implemented — 接入你的 auth')
  },

  /**
   * 解锁扣费。返回 { ok: false } 或抛错 → 整个解锁事务回滚。
   * 余额扣减 / 流水插入必须用传入的 tx，不要用全局 db。
   *
   * 积分制示例：
   *   const [user] = await tx.select().from(users).where(eq(users.id, ctx.userId)).for('update')
   *   if ((user?.creditsBalance ?? 0) < ctx.cost) return { ok: false, reason: 'Insufficient balance' }
   *   await tx.update(users)
   *     .set({ creditsBalance: user.creditsBalance - ctx.cost })
   *     .where(eq(users.id, ctx.userId))
   *   const [txn] = await tx.insert(creditTransactions).values({
   *     userId: ctx.userId, type: 'MEDIA_UNLOCK', amount: -ctx.cost,
   *     description: ctx.description, relatedId: ctx.mediaId,
   *   }).returning({ id: creditTransactions.id })
   *   return { ok: true, chargeRef: txn.id, info: { remaining: user.creditsBalance - ctx.cost } }
   *
   * 会员制示例：校验会员有效期，有效则 return { ok: true }，忽略 cost。
   * 免费但要登录：直接 return { ok: true }。
   */
  charge: async (_tx, _ctx) => {
    throw new Error('paidMediaConfig.charge not implemented — 接入你的计费系统')
  },
}
