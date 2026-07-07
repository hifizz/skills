'use client';

/**
 * SSE 推送 React Hooks
 *
 * 用法：
 * 1. 在应用根部（登录后的 layout / providers）调用一次 usePushConnection()
 * 2. 任何组件里用 usePushChannel 订阅业务通道，数据结构自己定义
 *
 * @example
 * function Providers({ children }) {
 *   usePushConnection();
 *   return children;
 * }
 *
 * function NotificationBell() {
 *   const [items, setItems] = useState<MyNotification[]>([]);
 *   usePushChannel<MyNotification>('notification', (data) => {
 *     setItems((prev) => [data, ...prev]);
 *   });
 *   return <Badge count={items.length} />;
 * }
 */

import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  getPushClient,
  type PushMessage,
  type PushStatus,
} from '@/lib/push-client/connection';

/**
 * 建立并维持 SSE 连接，返回实时连接状态。
 * 在应用根部（确定用户已登录后）调用一次。
 */
export function usePushConnection(): PushStatus {
  const client = getPushClient();

  useEffect(() => {
    client.connect();
    // 不在 cleanup 里 disconnect：
    // - React StrictMode 会双调 effect，disconnect 会造成无谓的断连重连
    // - 根组件卸载即页面关闭，beforeunload 已兜底
    // 登出等需要主动断开的场景，显式调 getPushClient().disconnect()
  }, [client]);

  return useSyncExternalStore(
    client.subscribeStatus,
    client.getStatus,
    () => 'disconnected' as PushStatus,
  );
}

/**
 * 订阅一个推送通道。data 的类型由业务自己声明。
 * handler 不需要 memo —— 内部用 ref 保持最新引用，不会引起重订阅。
 */
export function usePushChannel<T = unknown>(
  channel: string,
  handler: (data: T, message: PushMessage<T>) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const client = getPushClient();
    return client.subscribe(channel, (message) => {
      handlerRef.current(message.data as T, message as PushMessage<T>);
    });
  }, [channel]);
}
