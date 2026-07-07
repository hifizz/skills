'use client';

/**
 * 示例组件：订阅 'notification' 通道并展示收到的消息
 *
 * ⚠️ 这只是最小可运行示例，验证链路用。
 * 真实项目请换成你自己的 UI（toast / 通知铃铛 / 未读红点等），
 * 数据结构（下面的 NotificationData）也按业务需要自行定义。
 */

import { useState } from 'react';
import { usePushConnection, usePushChannel } from '@/hooks/use-push';

interface NotificationData {
  title: string;
  body?: string;
}

export function PushNotificationsExample() {
  const status = usePushConnection();
  const [items, setItems] = useState<
    Array<NotificationData & { id: string }>
  >([]);

  usePushChannel<NotificationData>('notification', (data, message) => {
    setItems((prev) => [{ ...data, id: message.id }, ...prev].slice(0, 20));
  });

  return (
    <div style={{ fontFamily: 'monospace', fontSize: 13 }}>
      <p>
        SSE 连接状态：<strong>{status}</strong>
      </p>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <strong>{item.title}</strong>
            {item.body ? ` — ${item.body}` : null}
          </li>
        ))}
      </ul>
      {items.length === 0 && (
        <p style={{ color: '#888' }}>
          等待推送… 可以用 `tsx scripts/test-push.ts &lt;userId&gt;` 测试
        </p>
      )}
    </div>
  );
}
