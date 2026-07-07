# 我做了一个 skill：nextjs-r2-paid-media

> **推文草稿（Twitter/X）**
> 刚把「Next.js + Cloudflare R2 的付费媒体解锁系统」沉淀成了一个 Agent Skill 🧩
> 私有桶 + 预签名 URL + 解锁扣费事务 + 模糊预览，前端 Provider 模式、UI 由业务自定义
> `npx skills add hifizz/skills --skill nextjs-r2-paid-media`
> 背后的故事 👉 https://zilin.im/blog/nextjs-r2-paid-media

## 这是什么（技能本身）

一个把「付费解锁媒体资源」整套系统装进任意 Next.js 项目的 skill。装完你得到：

- **存储层**：Cloudflare R2 私有桶，媒体文件永远没有公开 URL。解锁后服务端签发限时预签名 URL，浏览器直连 R2，视频 Range/拖进度条原生支持，服务器零带宽成本。
- **数据层**：`media_assets` + `media_unlocks` 两张 Drizzle 表。解锁 = 一次事务（查重 → 扣费 → 写记录），`unique(userId, mediaId)` 兜底幂等，重复点击不会重复扣钱。
- **付费预览**：锁定态下发 blurhash + 公开域名的高斯模糊缩略图——看得出轮廓、看不清内容，这是刺激付费的关键一层。
- **前端 Provider 模式**：`PaidMediaProvider` 是纯数据层（权限缓存、解锁、URL 自动续签），不渲染任何 UI。业务组件用 `usePaidMediaItem(item)` 拿到 `{ status, url, unlock }` 后想怎么画怎么画。附带一个参考组件 `PaidMediaCard` 和 `/paid-media-demo` 页面，装完灌一条数据就能看到「模糊 → 点解锁 → 出图」的完整效果。
- **计费不绑定**：解锁时扣什么，由你在 `config.ts` 的 `charge(tx, ctx)` 里定义——积分、会员校验、Stripe 按次、免费但要登录，都是十几行代码的事，而且跑在解锁事务内，失败自动回滚。

安装：

```bash
npx skills add hifizz/skills --skill nextjs-r2-paid-media
```

然后照着 SKILL.md 的 5 步走：复制模板 → 并 schema → 配 R2 → 实现两个 adapter → 跑 demo。

## 为什么做它（原因 / 过程）

这套东西源自我的生产项目 softie-ai——AI 陪伴应用里的角色付费图片/视频解锁。当时从零搭，踩了不少坑：

- **aws-sdk v3.729+ 的 flexible checksums 和 R2 不兼容**，预签名请求直接 `SignatureDoesNotMatch`，这个坑在两个项目里各踩了一次，排查半天才定位到要 `requestChecksumCalculation: 'WHEN_REQUIRED'`。
- **blurhash 单层预览转化不行**。blurhash 只有色块氛围，用户不知道锁着的是什么；后来加了「高斯模糊缩略图」这一层（放公开域名，先 blurhash 再淡入模糊图），付费欲望肉眼可见地上来了。
- **解锁的幂等性**。用户会连点、网络会重试，第一版没做好出现过重复扣费。最终形态是三层防御：事务外快速路径 + 事务内复查 + 数据库唯一索引兜底。
- **预签名 URL 的续签时机**。等 URL 过期再刷新，正在播放的视频会 403 断流；必须提前一个缓冲期（5 分钟）换新 URL。

第二次要在新项目里做同样的东西时，我意识到该抽 skill 了。抽的时候做了两个关键取舍：

1. **计费和鉴权全部 adapter 化**。原实现和 sparks 积分系统、better-auth 深度耦合；skill 版把接缝收敛到 `config.ts` 的两个函数，系统本身不认识你的用户表和钱。
2. **前端 headless 化**。原实现的解锁 UI 和业务视觉绑死；skill 版把数据层抽成 Provider + hook，展示组件降级为「参考实现」。这是我越来越信的一个模式：**沉淀的是数据流和状态机，不是像素**。

## 什么时候用它（适用场景）

- **付费内容站**：写真/摄影集、教程视频、素材站——任何「预览免费、原图/原片付费」的形态。
- **应用内虚拟消费**：积分解锁、会员专属媒体（charge adapter 里换成会员校验即可）。
- **单纯的防盗链私有媒体**：把 cost 设 0，它就是一套「登录才能看、URL 限时失效」的私有媒体分发系统。

它解决的真实痛点：这套系统看起来简单（"不就是签个 URL 吗"），实际上私有桶配置、签名兼容性、解锁幂等、URL 生命周期、预览转化设计，每一处都有坑。skill 把生产验证过的完整链路 + 全部坑位注释直接给你，新项目从两周的工作量变成一个下午。

## 设计自评：它做对了什么、弱在哪、什么时候该换方案

抽完 skill 之后我让自己（和 AI）以评审视角重新过了一遍这套设计。诚实的结论：**为 MVP 场景做得相当好（自评 7.5/10），但有两个结构性弱点，而且在 Cloudflare 生态里存在一个更「架构原生」的方案**。写出来，一是给用这个 skill 的人一个清醒的边界认知，二是好的设计文档本来就该包含"什么时候不要用我"。

### 做对了什么

- **信任边界画得准**。真实 URL 在权限校验前绝不出服务器，客户端锁定态只有 blurhash 和模糊图这种「无信息量的衍生物」——泄露面是零。很多同类实现死在「前端拿到 URL 只是不显示」上。
- **解锁事务是这套设计里最硬的部分**：扣费和解锁记录同事务、成交价存快照、`unique(userId, mediaId)` 兜底幂等。换任何存储方案，这一层都应该原样保留。
- **adapter 收口和 headless Provider** 让它可移植：计费、鉴权、UI 三个最易变的东西都不在核心里。
- **务实**：零额外基础设施，一个 Next.js repo + 一个桶就能跑，S3 兼容所以不锁死 R2。

### 两个结构性弱点

**1. 预签名 URL 把复杂度推给了客户端，而且有 N+1 问题。**
URL 会过期，于是 Provider 里长出了一整套续签定时器、缓冲期、退避重试的状态机——这些不是业务复杂度，是「URL 会死」这个技术选型的副作用。更实际的痛点：一个已解锁 50 张图的画廊页要发 50 次 `/access`。最起码的改进是 list 接口对已解锁项**批量随响应签好 URL**，把 N+1 消掉。

**2. TTL 是唯一防线，且防的是错误的东西。**
预签名 URL 是「持有即访问」，TTL 内转发给别人就能看；而真正的泄露风险其实是**内容本身**——用户解锁后右键另存、录屏，URL 防护再强也没用。这个设计对「防随手分享链接」够用，对「防内容二次传播」无解，后者只有水印或 DRM 能缓解。要认清威胁模型的边界在哪。

### 更好的方案：Worker 媒体网关

如果新系统确定押注 Cloudflare，正解是**用一个绑定 R2 bucket 的 Worker 做媒体网关**，代替预签名 URL：

| | 预签名 URL（skill 现方案） | Worker 网关 |
|---|---|---|
| URL 形态 | 会过期，客户端要续签 | **稳定**，前端 `<img src>` 即可 |
| 撤销权限 | 等 TTL 到期 | **每请求校验，秒级撤销** |
| 带宽成本 | 零（直连 R2） | **也是零**（Worker 内 R2 binding 不产生 egress 费） |
| 前端复杂度 | Provider 续签状态机 | 几乎消失 |
| 代价 | 无额外部署 | 多一个 Worker + 一个签名密钥要管 |

关键在于：skill 里「策略 B 代理」的所有好处（每请求鉴权、可撤销、藏 R2），Worker 网关都有，但没有它的带宽和函数时长代价——因为 Worker 读同区 R2 是免费的。预签名 URL 本质上是把 S3 时代的惯用法搬到了 Cloudflare 上。完整的 v2 设计（含 mermaid 架构图、token 设计、撤销策略、从 v1 的迁移路径）我写在了 skill 仓库里：[design-v2-worker-gateway.md](https://github.com/hifizz/skills/blob/main/skills/nextjs-r2-paid-media/design-v2-worker-gateway.md)。

另外，如果付费内容以长视频为主，直接用 Cloudflare Stream（签名 token、转码、自适应码率全内置），R2 + 裸 mp4 是它的手工版。

### 按阶段选型

- **MVP / 图片为主 / 想保持单 repo**：用 skill 现方案，补一刀批量签发。
- **增长期 / 押注 Cloudflare / 在意撤销与前端简洁**：上 Worker 网关（v2 设计）。
- **高单价视频**：Cloudflare Stream + 复用 skill 的解锁事务层（两者正交）。

这套 skill 里最有长期价值的其实不是存储方案，而是**解锁事务 + adapter 边界 + 「锁定态零信息下发」三条原则**——存储层从预签名换成 Worker 网关，它们一行都不用改。

---
*本文同步于 [zilin.im](https://zilin.im)，skill 源码见 [hifizz/skills](https://github.com/hifizz/skills)。*
