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

---
*本文同步于 [zilin.im](https://zilin.im)，skill 源码见 [hifizz/skills](https://github.com/hifizz/skills)。*
