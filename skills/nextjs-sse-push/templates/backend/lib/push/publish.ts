/**
 * 推送入口 —— 业务代码唯一需要 import 的 API
 *
 * 任何进程都能调用：Next.js API 路由、Server Action、BullMQ Worker、独立脚本。
 * 消息经 Redis Pub/Sub 广播，由「持有该用户 SSE 连接的那个实例」负责投递，
 * 所以调用方完全不用关心部署了几个实例、用户连在哪。
 *
 * @example
 * // 在任何服务端代码里：
 * await pushToUser(userId, 'notification', { title: '新消息', body: '你有一条回复' });
 * await pushToUser(userId, 'badge-update', { unreadCount: 3 });
 */

import { randomUUID } from 'crypto';
import { getSharedRedis } from './redis';
import { SSE_REDIS_CHANNEL, type PushEnvelope } from './types';

export interface PushOptions {
  /** 自定义消息 ID（默认 randomUUID）。前端可用它做去重 */
  id?: string;
}

/** 向单个用户的某个通道推送数据。data 结构由业务自己定义 */
export async function pushToUser<T>(
  userId: string,
  channel: string,
  data: T,
  options: PushOptions = {},
): Promise<void> {
  const envelope: PushEnvelope = {
    userId,
    message: {
      id: options.id ?? randomUUID(),
      type: channel,
      data,
      timestamp: Date.now(),
    },
  };

  await getSharedRedis().publish(SSE_REDIS_CHANNEL, JSON.stringify(envelope));
}

/** 向多个用户广播同一条消息 */
export async function pushToUsers<T>(
  userIds: string[],
  channel: string,
  data: T,
): Promise<void> {
  await Promise.all(userIds.map((userId) => pushToUser(userId, channel, data)));
}
