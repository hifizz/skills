/**
 * SSE 推送客户端（浏览器端，零依赖）
 *
 * 职责：
 * - 管理 EventSource 连接生命周期（连接 / 断开 / 自动重连 / 心跳超时检测）
 * - 按「通道」分发消息给订阅者，不理解任何业务数据
 * - 页面可见性变化时自动恢复连接；暴露 pause/resume 给 WebView 壳层
 *
 * 不依赖任何状态库。React 侧通过 hooks/use-push.ts 使用。
 */

export type PushStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface PushMessage<T = unknown> {
  id: string;
  /** 通道名（服务端 SSE 帧的 event 字段） */
  type: string;
  data: T;
  timestamp: number;
}

type ChannelHandler = (message: PushMessage) => void;

export interface PushClientOptions {
  /** SSE 端点，默认 '/api/push/sse' */
  url?: string;
  /** 跨域时携带 Cookie，默认 true */
  withCredentials?: boolean;
  /** 重连间隔（毫秒），默认 3000 */
  reconnectInterval?: number;
  /** 最大重连次数，默认 10；耗尽后停在 error 态，页面回到可见时会再试 */
  maxReconnectAttempts?: number;
  /** 心跳超时（毫秒），默认 60000。超时说明连接已死，强制重连 */
  heartbeatTimeout?: number;
  /** 追加 query 参数（如时区、客户端版本） */
  buildQuery?: () => Record<string, string>;
}

/** 内置事件，PushClient 自己消费，不分发给业务订阅者 */
const BUILTIN_EVENTS = ['connected', 'heartbeat'] as const;

export class PushClient {
  private options: Required<Omit<PushClientOptions, 'buildQuery'>> &
    Pick<PushClientOptions, 'buildQuery'>;

  private es: EventSource | null = null;
  private status: PushStatus = 'disconnected';
  /** connect() 之后为 true —— 表示业务期望保持连接（重连、可见性恢复的前提） */
  private started = false;
  private pausedByHost = false;
  private reconnectAttempts = 0;
  private lastHeartbeat = 0;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  private handlers = new Map<string, Set<ChannelHandler>>();
  /** 当前 EventSource 上已绑定监听的通道（EventSource 必须显式 addEventListener 每种 event） */
  private boundChannels = new Set<string>();
  private statusListeners = new Set<() => void>();
  private visibilityBound = false;

  constructor(options: PushClientOptions = {}) {
    this.options = {
      url: options.url ?? '/api/push/sse',
      withCredentials: options.withCredentials ?? true,
      reconnectInterval: options.reconnectInterval ?? 3000,
      maxReconnectAttempts: options.maxReconnectAttempts ?? 10,
      heartbeatTimeout: options.heartbeatTimeout ?? 60_000,
      buildQuery: options.buildQuery,
    };
  }

  // ------------------------------------------------------------------
  // 公开 API
  // ------------------------------------------------------------------

  /** 建立连接（幂等，可重复调用） */
  connect(): void {
    if (typeof window === 'undefined') return; // SSR 安全
    this.started = true;
    this.pausedByHost = false;

    if (this.status === 'connected' || this.status === 'connecting') return;

    this.bindVisibilityOnce();
    this.reconnectAttempts = 0;
    this.open();
  }

  /** 彻底断开（不再自动重连），页面卸载或登出时调用 */
  disconnect(): void {
    this.started = false;
    this.teardown();
    this.setStatus('disconnected');
  }

  /** 暂停连接但保留订阅（WebView 壳层进后台时调用） */
  pause(): void {
    if (!this.started || this.pausedByHost) return;
    this.pausedByHost = true;
    this.teardown();
    this.setStatus('disconnected');
  }

  /** 恢复连接（WebView 壳层回前台时调用） */
  resume(): void {
    if (!this.started || !this.pausedByHost) return;
    this.pausedByHost = false;
    this.reconnectAttempts = 0;
    this.open();
  }

  /**
   * 订阅一个通道。返回取消订阅函数。
   * 同一通道可多处订阅（如多个组件各自关心 'notification'）。
   */
  subscribe(channel: string, handler: ChannelHandler): () => void {
    let set = this.handlers.get(channel);
    if (!set) {
      set = new Set();
      this.handlers.set(channel, set);
    }
    set.add(handler);

    // 连接已建立时，为新通道即时补绑监听
    if (this.es && !this.boundChannels.has(channel)) {
      this.bindChannel(this.es, channel);
    }

    return () => {
      set!.delete(handler);
      if (set!.size === 0) this.handlers.delete(channel);
    };
  }

  // useSyncExternalStore 需要稳定引用，用箭头函数字段
  getStatus = (): PushStatus => this.status;

  subscribeStatus = (listener: () => void): (() => void) => {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  };

  // ------------------------------------------------------------------
  // 内部实现
  // ------------------------------------------------------------------

  private open(): void {
    this.setStatus('connecting');

    let url = this.options.url;
    if (this.options.buildQuery) {
      const params = new URLSearchParams(this.options.buildQuery());
      url += (url.includes('?') ? '&' : '?') + params.toString();
    }

    const es = new EventSource(url, {
      withCredentials: this.options.withCredentials,
    });
    this.es = es;
    this.boundChannels.clear();

    es.onopen = () => {
      this.reconnectAttempts = 0;
      this.lastHeartbeat = Date.now();
      this.setStatus('connected');
      this.startHeartbeatWatch();
    };

    es.onerror = () => {
      this.teardown();

      if (!this.started || this.pausedByHost) return;

      if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
        console.error('[push] 达到最大重连次数，停止重连（页面回到可见时会再试）');
        this.setStatus('error');
        return;
      }

      this.reconnectAttempts++;
      this.setStatus('error');
      this.reconnectTimer = setTimeout(() => {
        this.open();
      }, this.options.reconnectInterval);
    };

    // 内置事件
    es.addEventListener('heartbeat', () => {
      this.lastHeartbeat = Date.now();
    });
    es.addEventListener('connected', () => {
      this.lastHeartbeat = Date.now();
    });

    // 业务通道：EventSource 要求为每个自定义 event 显式注册监听器，
    // 服务端发了 `event: xxx` 而这里没 addEventListener('xxx')，消息会静默丢失
    for (const channel of this.handlers.keys()) {
      this.bindChannel(es, channel);
    }

    // 无 event 字段的消息走默认 'message' 事件
    es.onmessage = (event) => {
      this.dispatch('message', event);
    };
  }

  private bindChannel(es: EventSource, channel: string): void {
    if ((BUILTIN_EVENTS as readonly string[]).includes(channel)) return;
    if (channel === 'message') return; // 由 onmessage 处理
    es.addEventListener(channel, (event) => {
      this.dispatch(channel, event as MessageEvent);
    });
    this.boundChannels.add(channel);
  }

  private dispatch(channel: string, event: MessageEvent): void {
    const set = this.handlers.get(channel);
    if (!set || set.size === 0) return;

    let message: PushMessage;
    try {
      message = {
        id: event.lastEventId || `${Date.now()}`,
        type: channel,
        data: JSON.parse(event.data),
        timestamp: Date.now(),
      };
    } catch (err) {
      console.error('[push] 消息解析失败:', err, event.data);
      return;
    }

    set.forEach((handler) => {
      try {
        handler(message);
      } catch (err) {
        console.error(`[push] 通道 "${channel}" 的 handler 抛错:`, err);
      }
    });
  }

  private startHeartbeatWatch(): void {
    this.stopHeartbeatWatch();
    this.heartbeatTimer = setInterval(() => {
      if (
        this.lastHeartbeat &&
        Date.now() - this.lastHeartbeat > this.options.heartbeatTimeout
      ) {
        console.warn('[push] 心跳超时，强制重连');
        // 直接触发重连流程
        this.teardown();
        if (this.started && !this.pausedByHost) {
          this.open();
        }
      }
    }, this.options.heartbeatTimeout / 2);
  }

  private stopHeartbeatWatch(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private teardown(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeatWatch();
    if (this.es) {
      this.es.close();
      this.es = null;
    }
    this.boundChannels.clear();
  }

  private setStatus(status: PushStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.statusListeners.forEach((l) => l());
  }

  private bindVisibilityOnce(): void {
    if (this.visibilityBound || typeof document === 'undefined') return;
    this.visibilityBound = true;

    document.addEventListener('visibilitychange', () => {
      if (
        document.visibilityState === 'visible' &&
        this.started &&
        !this.pausedByHost &&
        (this.status === 'disconnected' || this.status === 'error')
      ) {
        this.reconnectAttempts = 0;
        this.open();
      }
    });

    window.addEventListener('beforeunload', () => {
      this.disconnect();
    });
  }
}

/**
 * 全局单例。需要自定义配置时，在应用入口尽早调用 configurePushClient，
 * 或者不用单例、自己 new PushClient 再包一层 Context。
 */
let client: PushClient | null = null;
let clientOptions: PushClientOptions = {};

export function configurePushClient(options: PushClientOptions): void {
  clientOptions = options;
}

export function getPushClient(): PushClient {
  if (!client) {
    client = new PushClient(clientOptions);
  }
  return client;
}
