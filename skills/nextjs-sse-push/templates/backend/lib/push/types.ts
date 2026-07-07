/**
 * SSE 推送系统 —— 共享类型与常量
 *
 * 核心概念是「通道（channel）」：
 * - 后端 pushToUser(userId, channel, data) 往某个通道推数据
 * - 前端 usePushChannel(channel, handler) 订阅某个通道
 * - data 的结构完全由业务自己定义，本系统不关心
 */

/** Redis Pub/Sub 频道名（所有 Next.js 实例订阅同一个频道，实现跨实例广播） */
export const SSE_REDIS_CHANNEL = process.env.SSE_REDIS_CHANNEL || 'sse:push';

/** 内置事件类型（业务通道请自定义其他字符串，避开这两个） */
export const SSE_BUILTIN_EVENTS = {
  /** 连接建立成功，服务端下发的第一条消息 */
  CONNECTED: 'connected',
  /** 心跳，用于保活和客户端断线检测 */
  HEARTBEAT: 'heartbeat',
} as const;

/** 一条推送消息（对应一个 SSE 帧） */
export interface SSEMessage<T = unknown> {
  id: string;
  /** 通道名，写入 SSE 的 `event:` 字段。业务自由定义，如 'notification' / 'badge-update' */
  type: string;
  data: T;
  /** 可选：SSE retry 字段，指示客户端重连间隔（毫秒） */
  retry?: number;
  timestamp: number;
}

/** Redis Pub/Sub 上传输的信封格式 */
export interface PushEnvelope {
  userId: string;
  message: SSEMessage;
}
