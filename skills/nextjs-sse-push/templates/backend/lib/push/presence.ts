/**
 * 在线状态管理（跨进程）
 *
 * 用 Redis Set 记录「每个用户当前连在哪些实例上」：
 *   key:   sse:presence:{userId}
 *   value: Set<workerId>
 *   TTL:   由 SSE 心跳定期续期，实例崩溃后自动过期，不会留下僵尸在线状态
 *
 * 这样 BullMQ Worker（独立进程，没有任何 SSE 连接）也能判断用户是否在线，
 * 从而决定走 SSE 实时推送还是离线推送兜底（Push Notification / 邮件等）。
 */

import { getSharedRedis } from './redis';

const KEY_PREFIX = 'sse:presence:';

export class PresenceManager {
  constructor(
    private readonly workerId: string,
    private readonly ttlSeconds: number,
  ) {}

  private key(userId: string): string {
    return `${KEY_PREFIX}${userId}`;
  }

  async register(userId: string): Promise<void> {
    const redis = getSharedRedis();
    await redis.sadd(this.key(userId), this.workerId);
    await redis.expire(this.key(userId), this.ttlSeconds);
  }

  async unregister(userId: string): Promise<void> {
    const redis = getSharedRedis();
    await redis.srem(this.key(userId), this.workerId);
    const remaining = await redis.scard(this.key(userId));
    if (remaining === 0) {
      await redis.del(this.key(userId));
    }
  }

  /** 心跳时调用，防止 TTL 过期导致误判离线 */
  async refreshTTL(userId: string): Promise<void> {
    await getSharedRedis().expire(this.key(userId), this.ttlSeconds);
  }

  /** 用户是否在任意实例上在线 */
  async isUserOnline(userId: string): Promise<boolean> {
    const count = await getSharedRedis().scard(this.key(userId));
    return count > 0;
  }
}

/**
 * 只读查询器：任意进程（尤其是 BullMQ Worker）用它判断用户是否在线，
 * 不需要 workerId。
 */
export const presenceChecker = {
  async isUserOnline(userId: string): Promise<boolean> {
    const count = await getSharedRedis().scard(`${KEY_PREFIX}${userId}`);
    return count > 0;
  },
};
