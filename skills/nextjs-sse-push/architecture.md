# 架构参考：Next.js SSE 主动推送系统

> 本文档解释设计决策，供二次开发时参考。安装步骤见 `SKILL.md`。

## 消息流全链路

```
业务代码 pushToUser(userId, channel, data)
  → Redis PUBLISH sse:push  {"userId":"u1","message":{"id":"...","type":"notification","data":{...},"timestamp":...}}
    → 所有 Next.js 实例的 sseManager 都收到（各自持有一条订阅连接）
      → 实例检查内存连接池里有没有 u1 的连接
         ├─ 有  → 写入 SSE 流：id:/event:/data: 帧 → 浏览器 EventSource
         │        → PushClient.dispatch(channel) → usePushChannel 的 handler
         └─ 没有 → 查 Redis presence：u1 在别的实例上在线吗？
                    ├─ 在线   → 什么都不做（那个实例会投递）
                    └─ 全局离线 → 进本实例离线队列 + 触发 onOfflineMessage 兜底
```

## 为什么这样设计

### 1. 推送与连接解耦：一切经过 Redis Pub/Sub

`pushToUser` 不直接找连接池，而是 publish 到 Redis 频道。收益：

- **任意进程可推**：API 路由、Server Action、BullMQ Worker（独立进程，根本摸不到连接池）、运维脚本，调用方式完全一致。
- **多实例天然支持**：负载均衡下用户连在哪个实例无所谓，消息广播给所有实例，持有连接的那个负责投递。
- **代价**：每条消息所有实例都要反序列化一次。中小规模（万级并发连接以下）完全可接受。

### 2. Presence：跨进程的在线状态

内存连接池只回答"用户是否连在**本实例**"。Worker 进程要决定"走 SSE 还是走离线推送"，需要全局视图：

- `sse:presence:{userId}` = Redis Set，成员是 workerId（实例标识）
- 连接建立时 `SADD`，全部断开时 `SREM`/`DEL`
- **TTL 由服务端心跳续期**（默认 7200s）：实例崩溃没机会清理时，key 自动过期，不会永远"假在线"

### 3. BullMQ：Web 进程与任务执行分离

- **QueueClient**（Next.js 进程）只入队；**TaskWorker**（独立进程）只消费。Next.js 部署重启不影响已排队的延迟任务。
- **幂等靠 jobId**：`schedule` 相同 jobId 的任务在完成前不会重复入队。业务上用确定性 ID（`${事件}-${userId}-${日期}-${序号}`）防止重复触发。
- **重试**：默认 `attempts: 3` + 5s 固定退避；最终失败走 Handler 的 `onFailed`。
- **cron**：Repeatable Jobs 先删后加，防止改了 pattern 后旧配置变僵尸任务。典型模式：一个 dispatcher 定时任务扫描目标用户，再为每个用户 schedule 具体推送任务（扇出）。

### 4. SSE 而不是 WebSocket

- 单向"服务端→客户端"场景 SSE 足够，HTTP 语义（经过所有代理/CDN 更容易）、自动重连是协议内置的。
- 客户端上行走普通 HTTP API 即可。
- 限制：EventSource 不能自定义 Header（鉴权走 Cookie）；浏览器对同域 HTTP/1.1 有 6 连接上限（HTTP/2 无此问题）。

### 5. 心跳的双重作用

服务端每 30s 发 `event: heartbeat`：

1. **保活**：防止代理/负载均衡器掐掉空闲连接
2. **客户端死连接检测**：EventSource 在某些网络切换场景不触发 error，客户端 60s 没收到心跳就强制重连
3. **续期 presence TTL**（服务端侧）

### 6. 前端：单例 PushClient + 通道订阅

原实现用 zustand store + 中心化 orchestrator（一个大 switch 分发所有消息类型）。抽象成 skill 时改为：

- **零依赖**：`PushClient` 是纯 TS 类，React 通过 `useSyncExternalStore` 读状态 —— 不强迫目标项目引入状态库。
- **订阅制替代中心分发**：`usePushChannel('badge-update', ...)` 谁关心谁订阅，新增消息类型不需要改中心枢纽。
- **EventSource 的坑**：自定义 event 必须显式 `addEventListener`。PushClient 在建立连接时为所有已订阅通道绑定监听，连接建立后新订阅的通道即时补绑。
- **重连策略**：指数固定间隔（3s）× 最多 10 次；耗尽后停在 error 态，但页面 `visibilitychange` 回到可见会重置计数再试 —— 这覆盖了"锁屏半小时回来"的场景。

## 与原项目（softie-ai）的差异

抽离时做了以下泛化，如需对照原实现：

| 原项目 | 本模板 | 原因 |
| --- | --- | --- |
| `standard-sse-manager.ts` 内嵌 OneSignal 离线推送 + RedisLock 去重 | `onOfflineMessage` 回调，去重留给业务 | 离线推送渠道是业务选择 |
| `useConnectionStore`（zustand）+ `useRealtimeOrchestrator`（中心 switch 分发） | `PushClient` 类 + `usePushChannel` 订阅制 | 去掉 zustand 依赖；新增通道不改中心代码 |
| 消息类型常量枚举（`SSE_MESSAGE_TYPES`） | 通道名自由字符串 | 数据结构不写死是本 skill 的目标 |
| Android WebView 生命周期事件监听（appForeground/appBackground） | `pause()/resume()` 公开方法 | 壳层桥接方式各项目不同，暴露原语即可 |
| logger / performanceMonitor / errorHandler / Sentry | console | 可观测性栈是项目级选择，接入点都在 |
| 多队列枚举 QueueName | 单队列 + 可配 queueName | 单队列起步够用 |

## 容量与运维备注

- 单 Node 实例几千个 SSE 并发连接没有压力（每连接一个 heartbeat interval，内存占用小）；再往上先做水平扩容 —— 架构已支持。
- 实例内离线队列只覆盖"断线后重连回同一实例"的场景，不是可靠投递。需要可靠收件箱语义时，把消息落库，前端连上后先拉历史再听增量。
- 监控建议：连接数（每实例）、Pub/Sub 消息速率、BullMQ 队列深度 / 失败数、心跳失败计数。
