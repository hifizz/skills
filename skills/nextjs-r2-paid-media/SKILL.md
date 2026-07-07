---
name: nextjs-r2-paid-media
description: 给 Next.js 项目一键装上「付费解锁媒体资源」系统：Cloudflare R2 私有桶存储 + 预签名 URL 限时访问 + 解锁记录/扣费事务 + blurhash/高斯模糊付费预览 + headless PaidMediaProvider（Provider 提供数据，展示组件由业务自己实现）。当用户想做付费图片/视频解锁、会员专属媒体、积分解锁内容、R2 私有资源签名访问、paywall 媒体、防盗链媒体分发，或提到 "付费媒体 / 解锁图片 / 解锁视频 / R2 presigned / 私有桶 / paid content / unlock media" 时使用。
license: MIT
compatibility: Next.js App Router（Node.js runtime）+ Drizzle ORM + Postgres + Cloudflare R2（任何 S3 兼容存储都可）。鉴权和计费系统不绑定，通过 adapter 注入。
metadata:
  author: zilin
  version: "1.0"
  source: 抽取自生产项目 softie-ai 的付费媒体系统（AI 角色付费图片/视频解锁）
---

把一套**生产验证过的付费媒体资源系统**装进任意 Next.js 项目。装完后：

- **媒体文件永远不暴露公开 URL**：R2 私有桶存储，解锁后才签发限时预签名 URL
- **未解锁也有内容可看**：blurhash / 高斯模糊缩略图做付费预览，激发解锁欲望
- **解锁 = 一次数据库事务**：扣费 + 交易记录 + 解锁记录原子完成，天然幂等
- **前端 Provider 模式**：`PaidMediaProvider` 只负责数据（权限、解锁、URL 生命周期），展示组件由业务自己写；附带一个参考实现 `PaidMediaCard` + demo 页面开箱看效果

计费系统不写死——解锁扣什么（积分/次数/会员校验/直接免费）由业务在一个 adapter 函数里定义。

## 架构一图流

```
                     ┌────────────────── Next.js (App Router) ──────────────────┐
浏览器                │                                                          │
┌────────────────┐   │  POST /api/media/check-permissions  ──┐                  │
│ PaidMediaProvider──▶│  POST /api/media/[id]/unlock          ├─▶ lib/paid-media │
│  (headless 数据层)│  │  POST /api/media/access（签发预签名URL）│    ├ schema.ts   │──▶ Postgres
│      │          │   │  GET  /api/media/[id]/content（代理流）─┘    ├ permission  │   media_assets
│      ▼          │   │  GET  /api/media/list                       ├ r2.ts       │   media_unlocks
│ usePaidMediaItem │  │                                             └ config.ts ◀─┼── 业务注入:
│      │          │   └──────────────────────┬───────────────────────────────────┘   getUserId()
│      ▼          │                          │ 预签名 GET (限时)                       charge()
│ 业务自己的展示组件 │◀──────── 直连 R2 ────────▼
│ (或 PaidMediaCard)│                  Cloudflare R2 私有桶（原始媒体）
└────────────────┘                    Cloudflare R2 公开域名（仅模糊缩略图）
```

关键设计（详见 `architecture.md`）：

1. **私有桶 + 预签名 URL 是默认访问策略**，浏览器直连 R2，天然支持视频 Range/流式播放，服务器零带宽成本；`content` 代理路由是备选策略（需要每请求鉴权/隐藏 R2 时用）。
2. **锁定状态下真实 URL 永远不下发**。客户端只拿到 `{ id, mediaType, creditsCost, blurhash, width, height }`；预览靠 blurhash 或公开域名下的高斯模糊缩略图。
3. **解锁事务 + 唯一索引幂等**：`unique(userId, mediaId)` + 事务内「查已解锁 → 扣费 → 写解锁记录」，重复点击/重放不会重复扣费。
4. **URL 生命周期由 Provider 管理**：预签名 URL 有 TTL，Provider 在过期前自动刷新（带缓冲时间），业务组件永远拿到可用的 `url`。
5. **计费/鉴权全部走 adapter**（`config.ts`）：`getUserId(headers)` 接你的 auth；`charge(tx, ...)` 接你的积分/会员/订单系统，跑在解锁事务内。

## 安装步骤（按顺序执行）

### Step 0 — 前置依赖

```bash
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner zod
pnpm add react-blurhash              # 参考组件 paid-media-card 的 blurhash 预览层用；自己写展示组件可不装
pnpm add -D sharp blurhash tsx       # 仅 scripts/upload-media.ts 灌数据脚本用
```

项目需已有：Drizzle ORM + Postgres、任意 auth（能从请求头拿到 userId 即可）。

### Step 1 — 复制模板文件

模板在本 skill 的 `templates/` 下，按下表复制到目标项目（`src/` 前缀按项目实际结构调整）：

| 模板路径 | 目标路径 | 说明 |
| --- | --- | --- |
| `templates/backend/lib/paid-media/*` | `src/lib/paid-media/*` | 核心：R2 客户端 / 表结构 / 权限服务 / adapter 配置 |
| `templates/backend/app/api/media/**` | `src/app/api/media/**` | 5 个 API 路由 |
| `templates/backend/scripts/upload-media.ts` | `scripts/upload-media.ts` | 本地文件上传 + 登记资产（含 blurhash/缩略图生成），用于灌数据 |
| `templates/frontend/providers/paid-media-provider.tsx` | `src/providers/paid-media-provider.tsx` | headless Provider + hooks（数据层） |
| `templates/frontend/components/paid-media-card.tsx` | `src/components/paid-media-card.tsx` | 参考展示组件（可直接用，也可只当范例） |
| `templates/frontend/app/paid-media-demo/page.tsx` | `src/app/paid-media-demo/page.tsx` | demo 页面，装完直接看效果 |

### Step 2 — 接入数据库 schema

`lib/paid-media/schema.ts` 定义了 `media_assets` 和 `media_unlocks` 两张表。把它们并入你的 Drizzle schema 入口（或直接在 `drizzle.config.ts` 的 schema 数组里加上这个文件），然后：

```bash
pnpm drizzle-kit push   # 或走你项目的 migration 流程
```

注意：`media_unlocks.userId` 的外键指向你项目的 users 表，复制后把 `references` 改成你的表；不想加外键也可以直接删掉 `references`，靠应用层保证。

### Step 3 — 配置 R2 与环境变量

1. Cloudflare 控制台创建 R2 桶（**保持私有，不开公开访问**）。
2. 可选：再建一个公开桶或给同桶配公开自定义域名，只放 `media-thumbnails-blur/` 前缀的模糊缩略图。
3. 生成 R2 API Token（Object Read & Write），写入 `.env.local`：

```bash
R2_ACCOUNT_ID=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET_NAME=paid-media
NEXT_PUBLIC_R2_PUBLIC_URL=https://media.example.com   # 可选：模糊缩略图公开域名
```

### Step 4 — 实现两个 adapter（唯一必须写代码的地方）

打开 `lib/paid-media/config.ts`，实现：

```ts
// 1) 从请求头解析当前用户（接你的 auth：better-auth / next-auth / clerk / 自研 JWT 都行）
getUserId: async (headers) => {
  const session = await auth.api.getSession({ headers })
  return session?.user?.id ?? null
},

// 2) 解锁时如何扣费（跑在解锁事务 tx 内；返回 ok:false 则整个事务回滚）
charge: async (tx, { userId, mediaId, cost }) => {
  // 例：积分制 —— 查余额、扣减、写交易流水
  // 例：会员制 —— 校验会员有效期，cost 忽略
  // 例：免费但要登录 —— 直接 return { ok: true }
  ...
},
```

### Step 5 — 灌数据 + 看效果

```bash
# 上传一个本地视频/图片到 R2 并登记为付费资产（cost=10）
pnpm tsx scripts/upload-media.ts ./demo.mp4 --cost 10

pnpm dev
# 打开 http://localhost:3000/paid-media-demo
# 未解锁 → 模糊预览 + 解锁按钮；点击解锁 → 扣费 → 出图/出视频
```

## 前端用法（Provider 模式）

Provider 只提供数据，长什么样完全由业务决定：

```tsx
// 1. 挂 Provider（通常在 layout 或页面级）
<PaidMediaProvider>
  <Gallery items={items} />
</PaidMediaProvider>

// 2. 业务组件里用 hook 拿数据，自己渲染
function MyMediaCell({ item }: { item: PaidMediaItem }) {
  const media = usePaidMediaItem(item)
  // media.status: 'locked' | 'unlocking' | 'fetching-url' | 'ready' | 'error'
  // media.url: 解锁且签名有效时才非 null，过期前自动刷新
  // media.unlock(): 触发解锁（扣费），返回 Promise<boolean>

  if (media.status !== 'ready') {
    return <MyOwnLockedView blurhash={item.blurhash} cost={item.creditsCost} onUnlock={media.unlock} />
  }
  return item.mediaType === 'VIDEO'
    ? <video src={media.url!} controls />
    : <img src={media.url!} />
}
```

批量场景（列表页）：Provider 挂载后调用一次 `checkPermissions(ids)`，权限结果进缓存，所有 `usePaidMediaItem` 自动命中，不会每个卡片发一个请求。

不想自己写 UI 时，直接用参考组件：`<PaidMediaCard item={item} />`。

## 自定义点速查

| 想改什么 | 改哪里 |
| --- | --- |
| 扣费逻辑（积分/会员/免费） | `lib/paid-media/config.ts` 的 `charge` |
| 鉴权来源 | `lib/paid-media/config.ts` 的 `getUserId` |
| 预签名 URL 有效期 | `lib/paid-media/r2.ts` 的 `DOWNLOAD_URL_TTL_SECONDS` |
| 允许的文件类型/大小 | `lib/paid-media/r2.ts` 顶部常量 |
| 解锁 UI / 预览样式 | 自己写组件替换 `paid-media-card.tsx` |
| 访问策略换成服务器代理 | 前端把 `media.url` 换成 `/api/media/{id}/content`，见 `architecture.md` |

## 注意事项 / 常见坑

- **aws-sdk ≥ 3.729 必须显式关闭 flexible checksums**（`requestChecksumCalculation: 'WHEN_REQUIRED'`），否则对 R2 的预签名请求会 `SignatureDoesNotMatch`。模板已内置，升级 SDK 时别删。
- **R2 桶必须保持私有**。一旦开了公开访问，预签名就形同虚设。模糊缩略图走独立前缀/公开域名。
- 预签名 URL 是「拿到 URL 的人都能访问」，TTL 是唯一防线。默认 30 分钟，对防盗链敏感的内容调短（如 5 分钟），Provider 会自动续签。
- `upload-media.ts` 走服务端凭证直传，适合运营灌数据；如果要做「用户上传付费内容」，用 `r2.ts` 里的 `presignUpload` 另写路由，并在上传完成后回调校验（HEAD 对象确认存在再置 `isActive=true`）。
- Serverless 部署（Vercel）完全兼容：预签名策略下服务器只做签名不传字节；只有 `content` 代理路由会吃函数时长/带宽，视频场景慎用代理策略。
- 本 skill 是 v1（预签名 URL）方案，适合 MVP 快速落地。项目确定押注 Cloudflare、进入增长期后，建议按 `design-v2-worker-gateway.md` 演进为 Worker 媒体网关（URL 稳定不过期、秒级撤销、消除 N+1），解锁事务层和 Provider 对业务的契约不变。
