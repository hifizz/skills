/**
 * Redis 连接工厂
 *
 * 三种用途，三种拿法（不要混用）：
 * - getSharedRedis()       普通命令（publish / presence 查询），全进程共享一条连接
 * - createSubscriberRedis() Pub/Sub 订阅专用。ioredis 进入 subscribe 模式后
 *                           不能再执行普通命令，必须独占一条连接
 * - createBullMQRedis()     BullMQ 专用，硬性要求 maxRetriesPerRequest: null
 *
 * 环境变量：优先 REDIS_URL（支持 rediss:// TLS，如 Upstash），
 * 否则回退 REDIS_HOST / REDIS_PORT / REDIS_PASSWORD / REDIS_DB。
 */

import Redis, { type RedisOptions } from 'ioredis';

function baseOptions(): RedisOptions {
  const retryStrategy = (times: number): number | null => {
    if (times > 5) {
      console.error('[push:redis] 重连次数超过限制，停止重试');
      return null;
    }
    return Math.min(times * 1000, 3000);
  };

  if (process.env.REDIS_URL) {
    const url = new URL(process.env.REDIS_URL);
    const isTLS = url.protocol === 'rediss:';

    return {
      host: url.hostname,
      port: parseInt(url.port) || (isTLS ? 6380 : 6379),
      password: url.password || process.env.REDIS_PASSWORD,
      db:
        parseInt(url.pathname.slice(1)) ||
        parseInt(process.env.REDIS_DB || '0'),
      ...(isTLS && { tls: { rejectUnauthorized: true } }),
      retryStrategy,
    };
  }

  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    retryStrategy,
  };
}

/** Pub/Sub 订阅专用连接（每个 SSEManager 实例一条） */
export function createSubscriberRedis(): Redis {
  return new Redis({
    ...baseOptions(),
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
  });
}

/** BullMQ 专用连接（Queue / Worker 共用一条即可） */
export function createBullMQRedis(): Redis {
  return new Redis({
    ...baseOptions(),
    enableReadyCheck: true,
    // BullMQ 的硬性要求，缺了会直接报错
    maxRetriesPerRequest: null,
  });
}

// 用 globalThis 缓存，防止 Next.js dev 热重载时重复建连
const globalForRedis = globalThis as unknown as { __pushSharedRedis?: Redis };

/** 共享连接：publish、presence 等普通命令都走这条 */
export function getSharedRedis(): Redis {
  if (
    !globalForRedis.__pushSharedRedis ||
    globalForRedis.__pushSharedRedis.status === 'end'
  ) {
    const client = new Redis({
      ...baseOptions(),
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });
    client.on('error', (err) =>
      console.error('[push:redis] 连接错误:', err.message),
    );
    globalForRedis.__pushSharedRedis = client;
  }
  return globalForRedis.__pushSharedRedis;
}
