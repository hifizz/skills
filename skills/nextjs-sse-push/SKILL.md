---
name: nextjs-sse-push
description: 给 Next.js 项目一键装上"服务端主动推送到前端"的实时系统：SSE 长连接 + Redis Pub/Sub 跨实例广播 + BullMQ 延迟/定时任务 + 零依赖 React Hooks 订阅。以「通道」为核心，业务数据结构完全自定义。当用户想在 Next.js 里做实时通知、服务端主动推消息、站内信、未读角标实时更新、延迟/定时推送，或提到 "SSE / EventSource / server push / 主动推送 / 实时通知 / BullMQ 推送 / realtime notification" 时使用。
license: MIT
compatibility: Next.js App Router（Node.js runtime）。需要 Redis 和支持长连接的部署环境（Docker / Fly.io / Railway / 自托管 Node）。Vercel Serverless 有函数时长上限，SSE 会被周期性掐断（客户端会自动重连，但不推荐作为主部署环境）。
metadata:
  author: zilin
  version: "1.0"
  source: 抽取自生产项目 softie-ai 的主动消息系统（AI 角色定时/延迟推送）
---

把一套**生产验证过的服务端主动推送系统**装进任意 Next.js 项目。装完后：

- **服务端任何地方**一行代码推送：`await pushToUser(userId, 'notification', { ... })`
- **延迟 / 定时推送**：`await queueClient.schedule('delayed-push', { payload, delay, jobId })`
- **前端任何组件**一行 Hook 订阅：`usePushChannel<T>('notification', (data) => ...)`

数据结构不写死 —— 系统只认「通道名」，`data` 的类型由业务自己定义。用户只需要再写一个展示通知的 React 组件即可。

## 架构一图流

```
Next.js 进程（可多实例）                     独立 Worker 进程
┌──────────────────────────────┐          ┌─────────────────────┐
│ app/api/push/sse/route.ts    │          │ scripts/            │
│   └─ sseManager（连接池/心跳）  │          │   start-worker.ts   │
│        ▲ subscribe            │          │   └─ TaskWorker     │
│ pushToUser() ─┐               │          │       └─ Handlers ──┼─ pushToUser()
└───────────────┼──────────────┘          └──────────┬──────────┘
                │ publish                            │ publish
                ▼                                    ▼
        ┌──────────────────────────────────────────────┐
        │ Redis：Pub/Sub 频道 + BullMQ 队列 + presence   │
        └──────────────────────────────────────────────┘

浏览器：EventSource ──▶ PushClient（重连/心跳/通道分发）──▶ usePushChannel(channel, handler)
```

关键设计（详见 `architecture.md`）：

1. **推送永远走 Redis Pub/Sub**，不直接操作连接池 → 任意进程（API 路由、Server Action、BullMQ Worker、脚本）都能推，多实例部署天然支持。
2. **presence 在 Redis**（`sse:presence:{userId}` Set + TTL 心跳续期）→ Worker 进程也能判断用户是否在线，离线时走 `onOfflineMessage` 兜底（接 OneSignal/FCM/邮件）。
3. **BullMQ Worker 独立进程**，与 Next.js 通过队列解耦 → 延迟任务不受 Web 进程重启影响；`jobId` 幂等防重复调度。
4. **前端零依赖**（不需要 zustand/redux），`PushClient` 单例 + `useSyncExternalStore`。

## 安装步骤（按顺序执行）

### Step 1 — 复制模板文件

模板在本 skill 的 `templates/` 下，按下表复制到目标项目（`src/` 前缀按项目实际结构调整）：

| 模板路径 | 目标路径 | 说明 |
| --- | --- | --- |
| `templates/backend/lib/push/**` | `src/lib/push/**` | 后端全部：types / redis / presence / sse-manager / publish / tasks |
| `templates/backend/app/api/push/sse/route.ts` | `src/app/api/push/sse/route.ts` | SSE 端点 |
| `templates/backend/scripts/*.ts` | `scripts/*.ts` | Worker 启动 + 测试脚本 |
| `templates/frontend/lib/push-client/connection.ts` | `src/lib/push-client/connection.ts` | 浏览器端连接管理 |
| `templates/frontend/hooks/use-push.ts` | `src/hooks/use-push.ts` | React Hooks |
| `templates/frontend/components/push-notifications-example.tsx` | 可选 | 验证链路用的最小示例组件 |

复制后检查 import 路径：模板用 `@/lib/...` 别名，scripts 里用相对路径 `../src/lib/...`，按目标项目的 tsconfig paths 和目录结构调整。

### Step 2 — 安装依赖

```bash
pnpm add bullmq ioredis
pnpm add -D tsx concurrently
```

前端零额外依赖（只用 React 内置 API）。

### Step 3 — 接入鉴权（唯一必须写的后端代码）

打开 `src/app/api/push/sse/route.ts`，实现 `getAuthenticatedUserId()`。文件里给了 next-auth / better-auth / clerk 三种写法示例。注意 EventSource 不能带自定义 Header，鉴权只能靠 Cookie 或 URL query token。

### Step 4 — 环境变量与 package.json

`.env`：

```bash
REDIS_URL=redis://localhost:6379   # 或 rediss://（Upstash 等 TLS）
```

`package.json` scripts：

```jsonc
{
  "dev:worker": "tsx --watch scripts/start-worker.ts",
  "dev:all": "concurrently \"pnpm dev\" \"pnpm dev:worker\" --names \"web,worker\" --prefix-colors \"blue,magenta\"",
  "worker": "tsx scripts/start-worker.ts"
}
```

> 如果暂时不需要延迟/定时推送，可以跳过 Worker 相关部分（`lib/push/tasks/` + scripts），只用 `pushToUser` 即时推送 —— SSE 链路不依赖 BullMQ。

### Step 5 — 前端接线

在登录后的 layout / providers 里调用一次 `usePushConnection()`，然后业务组件里订阅通道：

```tsx
'use client';
import { usePushConnection, usePushChannel } from '@/hooks/use-push';

// 根组件调用一次
usePushConnection();

// 任意组件订阅，T 由业务定义
usePushChannel<{ title: string; body: string }>('notification', (data) => {
  toast(data.title, { description: data.body });
});
usePushChannel<{ unreadCount: number }>('badge-update', (data) => {
  setBadge(data.unreadCount);
});
```

### Step 6 — 验证链路

1. 启动 Redis（`docker run -p 6379:6379 redis` 或已有实例）
2. `pnpm dev:all`（或只 `pnpm dev`，如果没装 Worker）
3. 浏览器登录，打开挂了 `usePushConnection()` 的页面，Network 面板应看到 `/api/push/sse` 处于 pending（EventStream）
4. 终端推一条：`tsx scripts/test-push.ts <该用户的userId>` → 页面立即收到
5. 验证延迟任务：在任意服务端代码里 `queueClient.schedule('delayed-push', { payload: { userId, channel: 'notification', data: {...} }, delay: 5000 })`，5 秒后到达

## 常见坑（原项目踩过的）

- **EventSource 自定义事件必须显式监听**：服务端发 `event: xxx`，前端没 `addEventListener('xxx')` 消息会静默丢失。`PushClient` 已按订阅的通道自动绑定，但通道名前后端必须一致。
- **BullMQ 要求 `maxRetriesPerRequest: null`**，普通 Redis 客户端不要复用给 BullMQ；`redis.ts` 已区分三种连接工厂，别混用。
- **ioredis 进入 subscribe 模式后不能再发普通命令**，订阅必须独占连接（`createSubscriberRedis`）。
- **dev 热重载会重复创建连接/订阅**：所有单例（sseManager / sharedRedis / queueClient）都用 `globalThis` 缓存，新增单例时照做。
- **Nginx 等反代会缓冲 SSE**：响应头已带 `X-Accel-Buffering: no`；自建反代还需确认关闭 `proxy_buffering`。
- **Vercel 部署**：Serverless 函数有时长上限（默认 300s），SSE 连接会被周期性掐断，客户端会自动重连但体验有闪断；且多实例下 presence + Pub/Sub 仍正常工作。长连接体验要求高的话用 Docker/Fly.io/Railway。
- **防重复调度**：同一业务事件可能触发多次 schedule（如用户反复刷新页面），用确定性 `jobId`（如 `welcome-${userId}-${date}`）+ `removeOnComplete: { age: ... }` 保证幂等。
- **离线兜底的多实例去重**：`onOfflineMessage` 可能被多个实例同时触发，回调内需用分布式锁（`SET NX` + message.id）去重后再发 Push Notification。

## 扩展点

- **离线推送**：构造 `SSEManager` 时传 `onOfflineMessage`，接 OneSignal / FCM / 邮件。
- **cron 定时推送**：`TaskWorker` 的 `repeatable` 选项，如每日 8:30 触发 dispatcher 任务扫描目标用户再逐个 schedule。
- **多队列**：默认单队列 `push-tasks`，需要优先级隔离时给 `QueueClient` / `TaskWorker` 传不同 `queueName`。
- **WebView 壳层**：`getPushClient().pause()/resume()` 供原生 App 前后台切换时调用。
