# 付费媒体系统架构详解

本文档解释这套系统的设计决定和取舍。模板代码见 `templates/`，安装步骤见 `SKILL.md`。

> 本方案（v1，预签名 URL）在 Cloudflare 生态里存在一个演进版：**Worker 媒体网关**，
> 消除 URL 续签状态机和画廊页 N+1，支持秒级撤销，见 `design-v2-worker-gateway.md`。
> v1 适合 MVP / 单部署单元 / 非 Cloudflare 存储；确定押注 Cloudflare 且进入增长期后建议迁 v2。

## 1. 数据模型

```
media_assets                          media_unlocks
┌─────────────────────────┐          ┌──────────────────────────┐
│ id (uuid, pk)           │◀────┐    │ id (uuid, pk)            │
│ filename                │     └────│ mediaId (fk)             │
│ r2Key      ← 私有桶 key  │          │ userId  (fk → 你的users) │
│ mediaType  IMAGE/VIDEO  │          │ creditsCost ← 成交价快照  │
│ mimeType                │          │ chargeRef   ← 计费凭据    │
│ metadata (jsonb)        │          │ unlockedAt               │
│ blurhash                │          │ unique(userId, mediaId)  │
│ creditsCost (0=免费)     │          └──────────────────────────┘
│ isActive   ← 软删/下架   │
└─────────────────────────┘
```

设计要点：

- **`r2Key` 与 `id` 分离**。资产 id 是对外标识（进 URL、进日志），R2 key 是存储细节，可以换桶、换路径而不影响业务数据。
- **`creditsCost` 在解锁记录里存快照**。资产以后调价，历史解锁记录仍然反映当时的成交价——对账需要。
- **`chargeRef` 是 text 字段**，存 adapter 返回的任意计费凭据（积分流水 id / Stripe payment intent / 会员校验标记），系统本身不理解它，只负责存。
- **`unique(userId, mediaId)`** 是幂等的最后防线：即使应用层检查漏了并发请求，数据库也会拒绝第二条解锁记录。
- **`metadata` 用 jsonb**：width/height/duration/fileSize 等展示用字段进 JSON，不参与查询；`mediaType`/`isActive` 这类要过滤的字段独立成列并建索引。

## 2. 访问策略：预签名 URL（默认） vs 服务器代理（备选）

系统同时提供两条访问路径，按需选择：

### 策略 A：预签名 URL（`POST /api/media/access`，默认）

```
浏览器 → Next.js（鉴权+权限检查+签名，~10ms） → 返回限时 URL
浏览器 → R2 直连下载/流播放（字节不经过你的服务器）
```

优点：
- 服务器零带宽成本，Serverless（Vercel）友好；
- 视频 Range 请求由 R2 原生处理，拖进度条、预加载都顺畅；
- 浏览器可以正常缓存（在 TTL 内）。

代价：
- URL 在 TTL 内是「持有即可访问」，无法在单次请求粒度上撤销；
- URL 会暴露 R2 的域名（`<account>.r2.cloudflarestorage.com`）。

### 策略 B：服务器代理（`GET /api/media/{id}/content`）

```
浏览器 → Next.js（每次请求都鉴权+权限检查） → 服务端 fetch R2 → 流式回传
```

优点：每一个字节都经过权限检查，可即时撤销；URL 稳定（`/api/media/{id}/content`），前端不用管过期。
代价：双倍带宽（R2→服务器→浏览器）、吃函数执行时长、视频 Range 需要手动透传（模板已实现 `Range`/`Content-Range` 转发）。

**建议**：图片、短视频用策略 A；单价极高、需要秒级撤销权限的内容用策略 B。前端切换只需把 `media.url` 换成 `/api/media/{id}/content`。

## 3. URL 生命周期：TTL + 自动续签

预签名 URL 默认 30 分钟有效。Provider 内部：

```
fetchAccess(mediaId)
  → 存 { url, expiresAt }
  → setTimeout(在 expiresAt - REFRESH_BUFFER(5min) 时自动重新签发)
  → 组件始终从 context 读到未过期的 url
```

两个细节：

- **缓冲时间必须留**。如果等 URL 真过期了再刷新，正在播放的视频会在续签间隙 403 断流；提前 5 分钟换 URL，`<video>` 的 `src` 不变直到下次挂载，正在进行的 Range 请求用旧 URL 也仍在有效期内。
- **失败退避**。签发接口失败时用指数退避重试（模板里是 2s/5s/15s 三档），避免网络抖动时打爆接口。

## 4. 解锁事务

```ts
db.transaction(async (tx) => {
  // 1. 查是否已解锁（事务内查，防并发）
  // 2. adapter.charge(tx, ...)  ← 业务扣费，跑在同一事务
  // 3. insert media_unlocks     ← unique 索引兜底
})
```

- 已解锁的重复请求直接返回成功（`alreadyUnlocked: true`），客户端重试/重放安全。
- `charge` 返回 `{ ok: false }` 或抛错 → 整个事务回滚，不会出现「扣了钱没解锁」或「解锁了没扣钱」。
- `charge` 拿到的是事务句柄 `tx`，业务的余额扣减、流水插入都应该用它，而不是全局 `db`。

## 5. 付费预览：blurhash + 高斯模糊缩略图双层

锁定状态下客户端只有 `{ blurhash, width, height }`，没有任何真实 URL。预览分两层，生产验证的转化率结论是**两层都要**：

1. **blurhash**（~30 字符，存 DB，随列表接口下发）：首屏 0 请求即时渲染，但只有色块氛围，看不出内容轮廓。
2. **高斯模糊缩略图**（`media-thumbnails-blur/{id}.jpg`，放公开域名）：能看出「里面大概是什么」但看不清细节——这是刺激付费的关键。图片先显示 blurhash，模糊图 `onLoad` 后淡入替换。

模糊图在**上传时离线生成**（`scripts/upload-media.ts` 用 sharp：取图片本体或视频首帧 → resize 到 ~40px 宽 → 放大 → 高斯模糊 → 存公开前缀），千万不要运行时实时生成。缩略图本身已经不含有效信息，所以放公开桶是安全的。

## 6. adapter 边界：系统不认识你的用户和钱

系统对外只有两个注入点（`config.ts`）：

```ts
getUserId(headers: Headers): Promise<string | null>
// 系统唯一的鉴权入口。返回 null → 一律 401。

charge(tx, { userId, mediaId, cost, description }):
  Promise<{ ok: true; chargeRef?: string } | { ok: false; reason: string }>
// 系统唯一的计费入口。在解锁事务内被调用。
```

这带来的推论：

- users 表长什么样、积分存哪、会员怎么判断——系统一概不知道，所以任何 Next.js 项目都能接。
- 「免费但要登录」= `charge` 直接返回 `{ ok: true }`。
- 「先购买套餐再解锁」= `charge` 里查订单表。
- 想换 Stripe 按次付费：`charge` 里确认 payment intent 状态，把 intent id 存进 `chargeRef`。

## 7. R2 专属的坑（生产踩过）

1. **aws-sdk v3.729+ 的 flexible checksums 与 R2 不兼容**，presigned 场景直接 `SignatureDoesNotMatch`。必须：
   ```ts
   new S3Client({ ..., requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' })
   ```
2. **presignUpload 时 ContentType 要参与签名**（`signableHeaders: new Set(['content-type'])`），客户端篡改 MIME 类型即 403。
3. R2 的 S3 端点是 `https://<accountId>.r2.cloudflarestorage.com`，region 固定填 `auto`。
4. 浏览器直传（presigned PUT）需要给桶配 CORS 规则（AllowedMethods: PUT，AllowedOrigins: 你的站点）。
5. 上传路径要白名单校验（模板 `isValidObjectKey`），防止 presign 接口被当成任意路径写入器。

## 8. 性能清单

- 权限检查一律**批量**：列表页一次 `check-permissions`（≤100 个 id，`inArray` 单查询），不要每卡片一个请求。
- `media_unlocks` 上 `(userId, mediaId)` 唯一索引同时就是查询索引，权限检查是 index-only scan。
- 权限结果在 Provider 内存缓存 + 接口 `Cache-Control: private, max-age=300`。解锁成功后本地缓存直接置 true，不用回源。
- 列表接口（`/api/media/list`）永远不返回 r2Key/r2Url，序列化层面杜绝泄漏，而不是靠前端「不显示」。
