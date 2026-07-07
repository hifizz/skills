/**
 * SSE 连接管理器（服务端核心）
 *
 * 架构：
 * - 每个 Node 实例在内存里维护自己的连接池（userId -> ConnectionInfo[]）
 * - 通过 Redis Pub/Sub 接收推送：任意进程 publish，所有实例都收到，
 *   但只有「持有该用户连接的实例」会真正写入 SSE 流 → 天然支持多实例水平扩展
 * - 心跳保活（同时续期 Redis presence TTL）+ 定时清理死连接
 * - 每用户连接数上限（多标签页场景），超限踢掉最旧的
 * - 实例内离线消息队列：用户短暂断线重连（回到同一实例）时补发
 * - 用户全局离线时触发 onOfflineMessage 兜底回调（接 Push Notification / 邮件等）
 */

import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { createSubscriberRedis } from './redis';
import { PresenceManager, presenceChecker } from './presence';
import {
  SSE_REDIS_CHANNEL,
  SSE_BUILTIN_EVENTS,
  type PushEnvelope,
  type SSEMessage,
} from './types';

export interface SSEManagerOptions {
  /** 心跳间隔（毫秒），默认 30s */
  heartbeatInterval?: number;
  /** 每用户最大并发连接数（多标签页），默认 5，超限关最旧的 */
  maxConnectionsPerUser?: number;
  /** 实例内离线消息队列上限，默认 50 */
  maxOfflineMessages?: number;
  /** 死连接清理间隔（毫秒），默认 60s */
  cleanupInterval?: number;
  /** Redis presence TTL（秒），默认 7200，由心跳续期 */
  presenceTTLSeconds?: number;
  /**
   * 用户全局离线（所有实例都没有他的连接）时的兜底回调。
   * 典型用法：转发到离线推送通道（OneSignal / FCM / 邮件）。
   *
   * ⚠️ 多实例注意：每个实例都会收到 Pub/Sub 消息并各自判断，
   * 本管理器已用 presence 判断「全局离线」，但多个实例可能同时触发本回调。
   * 如需全局只发一次，请在回调内用分布式锁（如 SET NX + message.id）去重。
   */
  onOfflineMessage?: (
    userId: string,
    message: SSEMessage,
  ) => void | Promise<void>;
}

interface ConnectionInfo {
  id: string;
  userId: string;
  controller: ReadableStreamDefaultController;
  createdAt: number;
  lastHeartbeat: number;
  heartbeatTimer?: NodeJS.Timeout;
  isActive: boolean;
  isClosed?: boolean;
}

export class SSEManager {
  private connections = new Map<string, ConnectionInfo[]>();
  private offlineQueue = new Map<string, SSEMessage[]>();
  private encoder = new TextEncoder();
  private redisSubscriber?: Redis;
  private cleanupTimer?: NodeJS.Timeout;
  private presence: PresenceManager;
  private workerId = process.env.WORKER_ID || `${process.pid}`;

  private readonly config: Required<
    Omit<SSEManagerOptions, 'onOfflineMessage'>
  > &
    Pick<SSEManagerOptions, 'onOfflineMessage'>;

  constructor(options: SSEManagerOptions = {}) {
    this.config = {
      heartbeatInterval: options.heartbeatInterval ?? 30_000,
      maxConnectionsPerUser: options.maxConnectionsPerUser ?? 5,
      maxOfflineMessages: options.maxOfflineMessages ?? 50,
      cleanupInterval: options.cleanupInterval ?? 60_000,
      presenceTTLSeconds:
        options.presenceTTLSeconds ??
        parseInt(process.env.SSE_PRESENCE_TTL || '7200'),
      onOfflineMessage: options.onOfflineMessage,
    };

    this.presence = new PresenceManager(
      this.workerId,
      this.config.presenceTTLSeconds,
    );
    this.startCleanupTimer();
    void this.initRedisSubscription();
  }

  /**
   * 创建 SSE 连接，直接作为 Route Handler 的返回值
   */
  createConnection(userId: string, _request: Request): Response {
    const connectionId = randomUUID();

    // 连接数超限：关掉最旧的
    const existing = this.connections.get(userId) || [];
    if (existing.length >= this.config.maxConnectionsPerUser) {
      this.closeConnection(userId, existing[0].id);
    }

    const stream = new ReadableStream({
      start: (controller) => {
        const connection: ConnectionInfo = {
          id: connectionId,
          userId,
          controller,
          createdAt: Date.now(),
          lastHeartbeat: Date.now(),
          isActive: true,
        };

        const pool = this.connections.get(userId) || [];
        pool.push(connection);
        this.connections.set(userId, pool);

        // 注册跨进程在线状态
        this.presence.register(userId).catch((err) => {
          console.warn('[push:sse] presence 注册失败:', err?.message);
        });

        // 首条消息：连接确认
        this.writeToConnection(connection, {
          id: randomUUID(),
          type: SSE_BUILTIN_EVENTS.CONNECTED,
          data: { connectionId, timestamp: new Date().toISOString() },
          timestamp: Date.now(),
        });

        // 补发实例内堆积的离线消息
        this.deliverOfflineMessages(userId);

        this.startHeartbeat(connection);
        console.log(`[push:sse] 连接建立 userId=${userId} conn=${connectionId}`);
      },

      cancel: () => {
        this.closeConnection(userId, connectionId);
        console.log(`[push:sse] 连接取消 userId=${userId} conn=${connectionId}`);
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        // 反向代理（nginx）下防缓冲
        'X-Accel-Buffering': 'no',
      },
    });
  }

  closeConnection(userId: string, connectionId?: string): void {
    const pool = this.connections.get(userId) || [];

    if (connectionId) {
      const index = pool.findIndex((c) => c.id === connectionId);
      if (index !== -1) {
        this.cleanupConnection(pool[index]);
        pool.splice(index, 1);
        if (pool.length === 0) {
          this.connections.delete(userId);
          void this.presence.unregister(userId).catch(() => {});
        }
      }
    } else {
      pool.forEach((c) => this.cleanupConnection(c));
      this.connections.delete(userId);
      void this.presence.unregister(userId).catch(() => {});
    }
  }

  /** 本实例上该用户是否在线（跨实例判断请用 presenceChecker） */
  isUserOnlineLocally(userId: string): boolean {
    return (this.connections.get(userId) || []).some((c) => c.isActive);
  }

  async shutdown(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    if (this.redisSubscriber) {
      try {
        await this.redisSubscriber.unsubscribe(SSE_REDIS_CHANNEL);
        await this.redisSubscriber.quit();
      } catch {
        this.redisSubscriber.disconnect();
      }
      this.redisSubscriber = undefined;
    }

    for (const userId of Array.from(this.connections.keys())) {
      this.closeConnection(userId);
    }
    console.log('[push:sse] SSEManager 已关闭');
  }

  // ------------------------------------------------------------------
  // Redis Pub/Sub
  // ------------------------------------------------------------------

  private async initRedisSubscription(): Promise<void> {
    try {
      this.redisSubscriber = createSubscriberRedis();

      this.redisSubscriber.on('error', (err) => {
        console.error('[push:sse] Redis 订阅错误:', err.message);
      });

      await this.redisSubscriber.subscribe(SSE_REDIS_CHANNEL);
      this.redisSubscriber.on('message', (channel, raw) => {
        if (channel === SSE_REDIS_CHANNEL) {
          this.handleRedisMessage(raw);
        }
      });

      console.log(`[push:sse] 已订阅 Redis 频道: ${SSE_REDIS_CHANNEL}`);
    } catch (err) {
      console.error('[push:sse] Redis 订阅初始化失败:', err);
    }
  }

  private handleRedisMessage(raw: string): void {
    try {
      const envelope = JSON.parse(raw) as PushEnvelope;
      if (!envelope.userId || !envelope.message) {
        console.warn('[push:sse] 消息缺少 userId 或 message，忽略:', raw);
        return;
      }
      void this.deliverToUser(envelope.userId, envelope.message);
    } catch (err) {
      console.error('[push:sse] Redis 消息解析失败:', err, raw);
    }
  }

  // ------------------------------------------------------------------
  // 投递
  // ------------------------------------------------------------------

  private async deliverToUser(
    userId: string,
    message: SSEMessage,
  ): Promise<boolean> {
    const pool = this.connections.get(userId) || [];

    // 本实例没有该用户的连接
    if (pool.length === 0) {
      // 其他实例可能持有连接（它们也收到了同一条 Pub/Sub 消息），
      // 只有「全局离线」才需要兜底
      const onlineElsewhere = await presenceChecker
        .isUserOnline(userId)
        .catch(() => false);

      if (!onlineElsewhere) {
        this.enqueueOffline(userId, message);
        if (this.config.onOfflineMessage) {
          try {
            await this.config.onOfflineMessage(userId, message);
          } catch (err) {
            console.error('[push:sse] onOfflineMessage 回调失败:', err);
          }
        }
      }
      return false;
    }

    let success = false;
    for (const connection of pool) {
      if (this.writeToConnection(connection, message)) {
        success = true;
      }
    }
    return success;
  }

  private writeToConnection(
    connection: ConnectionInfo,
    message: SSEMessage,
  ): boolean {
    if (!connection.isActive || connection.isClosed) {
      return false;
    }

    try {
      connection.controller.enqueue(
        this.encoder.encode(this.formatSSEFrame(message)),
      );
      connection.lastHeartbeat = Date.now();
      return true;
    } catch (err) {
      // Controller is already closed 属正常断线，静默标记即可
      connection.isActive = false;
      if (
        err instanceof Error &&
        err.message.includes('Controller is already closed')
      ) {
        connection.isClosed = true;
      } else {
        console.error(`[push:sse] 写入失败 conn=${connection.id}:`, err);
      }
      return false;
    }
  }

  private formatSSEFrame(message: SSEMessage): string {
    let frame = `id: ${message.id}\n`;
    frame += `event: ${message.type}\n`;
    frame += `data: ${JSON.stringify(message.data)}\n`;
    if (message.retry) {
      frame += `retry: ${message.retry}\n`;
    }
    return frame + '\n';
  }

  // ------------------------------------------------------------------
  // 心跳 & 离线队列 & 清理
  // ------------------------------------------------------------------

  private startHeartbeat(connection: ConnectionInfo): void {
    connection.heartbeatTimer = setInterval(() => {
      if (!connection.isActive) {
        if (connection.heartbeatTimer) clearInterval(connection.heartbeatTimer);
        return;
      }

      this.writeToConnection(connection, {
        id: randomUUID(),
        type: SSE_BUILTIN_EVENTS.HEARTBEAT,
        data: { timestamp: new Date().toISOString() },
        timestamp: Date.now(),
      });

      // 续期 presence TTL，防止误判离线
      void this.presence.refreshTTL(connection.userId).catch(() => {});
    }, this.config.heartbeatInterval);
  }

  private enqueueOffline(userId: string, message: SSEMessage): void {
    const queue = this.offlineQueue.get(userId) || [];
    if (queue.length >= this.config.maxOfflineMessages) {
      queue.shift();
    }
    queue.push(message);
    this.offlineQueue.set(userId, queue);
  }

  private deliverOfflineMessages(userId: string): void {
    const queue = this.offlineQueue.get(userId);
    if (!queue || queue.length === 0) return;

    queue.forEach((message) => void this.deliverToUser(userId, message));
    this.offlineQueue.delete(userId);
    console.log(`[push:sse] 补发 ${queue.length} 条离线消息 userId=${userId}`);
  }

  private cleanupConnection(connection: ConnectionInfo): void {
    if (!connection.isActive || connection.isClosed) return;

    connection.isActive = false;
    if (connection.heartbeatTimer) {
      clearInterval(connection.heartbeatTimer);
      connection.heartbeatTimer = undefined;
    }

    try {
      connection.controller.close();
      connection.isClosed = true;
    } catch {
      connection.isClosed = true;
    }
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      for (const [userId, pool] of this.connections.entries()) {
        const alive = pool.filter((c) => {
          if (!c.isActive || c.isClosed) {
            this.cleanupConnection(c);
            return false;
          }
          return true;
        });

        if (alive.length === 0) {
          this.connections.delete(userId);
          void this.presence.unregister(userId).catch(() => {});
        } else if (alive.length !== pool.length) {
          this.connections.set(userId, alive);
        }
      }
    }, this.config.cleanupInterval);
  }
}

// ------------------------------------------------------------------
// 全局单例（globalThis 缓存，防止 dev 热重载重复创建 Redis 订阅）
// 如需配置 onOfflineMessage 等选项，改这里的构造参数
// ------------------------------------------------------------------

const globalForSSE = globalThis as unknown as { __sseManager?: SSEManager };

export const sseManager = globalForSSE.__sseManager ?? new SSEManager();

if (process.env.NODE_ENV !== 'production') {
  globalForSSE.__sseManager = sseManager;
}
