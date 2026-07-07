# 我做了一个 skill：nextjs-sse-push

> **推文草稿（Twitter/X）**
> 把生产项目里那套「服务端主动推送到前端」的系统（SSE + Redis Pub/Sub + BullMQ）沉淀成了一个 Agent Skill 🧩
> 下一个 Next.js 项目一句话装好：后端 `pushToUser(userId, channel, data)`，前端 `usePushChannel(channel, handler)`，剩下的只需要写一个展示通知的组件。
> `npx skills add hifizz/skills --skill nextjs-sse-push`
> 背后的故事 👉 <博客链接>

## 这是什么（技能本身）

一套可以一键装进任意 Next.js 项目的**服务端主动推送系统**，包含前后端完整链路：

- **后端**：SSE 连接管理器（连接池 / 心跳 / 断线清理）+ Redis Pub/Sub 跨实例广播 + Presence 在线状态 + BullMQ 延迟/定时任务（独立 Worker 进程）
- **前端**：零依赖的 `PushClient`（自动重连 / 心跳超时检测 / 页面可见性恢复）+ 两个 React Hooks

装完之后的使用体验是三行代码：

```ts
// 服务端任何地方（API 路由 / Server Action / Worker / 脚本）
await pushToUser(userId, 'notification', { title: '新消息' });

// 延迟 1 分钟推送，jobId 幂等防重复
await queueClient.schedule('delayed-push', { payload: {...}, delay: 60_000, jobId });
```

```tsx
// 前端任意组件，数据结构自己定义
usePushChannel<{ title: string }>('notification', (data) => toast(data.title));
```

安装：`npx skills add hifizz/skills --skill nextjs-sse-push`

## 为什么做它（原因 / 过程）

我在 softie-ai（一个 AI 陪伴产品）里做了完整的主动消息系统：AI 角色会在用户登录后、每天固定时间点主动给用户发消息。这套东西从零搭起来踩了不少坑——EventSource 自定义事件不显式监听会静默丢消息、BullMQ 必须 `maxRetriesPerRequest: null`、ioredis 订阅连接不能复用、Next.js dev 热重载重复建连、Nginx 缓冲 SSE、多实例部署下消息路由和离线判断……

等到要做下一个项目时发现：这套能力是完全可复用的，但代码和业务缠在一起（OneSignal 推送、角色系统、zustand store、中心化消息分发器）。于是抽离时做了几个关键泛化：

1. **以「通道」为核心**：系统只认 channel 字符串，`data` 结构业务自定义 —— 原来的消息类型枚举、中心化 switch 分发全部去掉，改成订阅制。
2. **前端去 zustand 化**：连接管理是纯 TS 类，React 侧用 `useSyncExternalStore`，不强迫新项目引入状态库。
3. **业务耦合点变成扩展点**：离线推送变成 `onOfflineMessage` 回调，Android WebView 生命周期变成 `pause()/resume()` 原语。

skill 里除了可直接复制的模板代码，还有一份 `architecture.md` 把设计决策和踩坑记录都写清楚了——agent 装的时候知道怎么改，人读的时候知道为什么。

## 什么时候用它（适用场景）

- **站内通知 / 消息提醒**：服务端事件（评论、点赞、系统公告）实时推到在线用户
- **未读角标实时更新**：badge-update 通道推 unreadCount，前端红点即时刷新
- **延迟 / 定时触达**：用户注册 7 秒后发欢迎消息、每天 8:30 定时推送日报 —— BullMQ 延迟任务 + cron 全都有
- **任何"服务端想主动找前端说话"的场景**：AI 生成完成通知、长任务进度、多端同步信号

它解决的真实痛点：这类系统人人都需要、没人想再写一遍，而且第一遍一定会踩坑（EventSource、BullMQ、多实例、热重载四大坑区）。现在是一句话安装 + 一个鉴权函数 + 一个展示组件的事。

---
*本文同步于 [zilin.im](https://zilin.im)，skill 源码见 [hifizz/skills](https://github.com/hifizz/skills)。*
