---
name: nextjs-cloudflare-image-loader
description: 用 Cloudflare Image Transformations（/cdn-cgi/image + R2/自有域名）替代 Vercel 图片优化，给 Next.js 配置 custom loader，保留 next/image 全部能力（srcset/lazy/priority/CLS 防抖）同时把图片流量成本降为零。当用户提到 Vercel 图片优化太贵、Image Optimization 超额、Cloudflare 图片裁剪/缩放、/cdn-cgi/image、R2 图片优化、custom image loader、图片 CDN 省钱，或想在 Cloudflare 上做响应式图片时使用。
license: MIT
compatibility: Next.js（App/Pages Router 均可）。图片域名必须是开启了 Transformations 的 Cloudflare zone 自定义域名（R2 绑自定义域名即可；pub-*.r2.dev 不支持）。部署平台不限（Vercel/Fly/Docker/Workers 都行）。
metadata:
  author: zilin
  version: "1.0"
  source: 调研沉淀自生产项目 softie-ai 的图片优化迁移（Vercel Image Optimization → R2 + Cloudflare Transformations）
---

把 Next.js 的图片优化从 Vercel（或自建 sharp）切到 **Cloudflare Image Transformations**：一个 10 行的 custom loader + 一段 next.config 配置。装完后：

- `<Image>` 组件**照常用**，srcset / lazy loading / priority / CLS 防抖全部保留——只是 URL 变成 `https://media.example.com/cdn-cgi/image/width=828,quality=75,format=auto/…`
- 图片字节从 Cloudflare 边缘出，**egress $0**（这才是省钱的大头，见下方计费模型）
- 变体基数被 `deviceSizes` 网格锁死，不会因为参数组合爆炸吃穿 5,000 免费转换额度

## 反模式先行：不要这样做

很多项目（包括本 skill 的来源项目最初版本）的做法是 `images: { unoptimized: true }` + 自写 `<OptimizedImage>` 组件手拼 `/cdn-cgi/image/` URL 和 srcset。**这是错的**：

1. 放弃了 next/image 的 lazy/priority/sizes/CLS 防抖，全部要手工重造（约 200 行组件替代 10 行 loader）
2. 手拼参数容易把 height/fit/gravity 全塞进 URL → 每个「源图 × 参数组合」是一次计费 unique transformation，变体基数失控
3. Cloudflare 官方机制就是 next/image custom loader，不要绕开它

## 安装步骤

### Step 1 — Cloudflare 侧前提（一次性，必须全过）

1. 图片所在域名是**你自己 zone 上的自定义域名**（R2 桶绑自定义域名即可）。`pub-*.r2.dev` 开发域名**不支持** transformations。
2. Dashboard → **Images → Transformations** → 对该 zone 点击 **Enable**。没开这一步，`/cdn-cgi/image/` 返回 404。
3. 如果 Next.js 应用域名和图片域名**不在同一个 zone**：开启该 zone 的 **"Resize images from any origin"**（否则跨 zone 引用被拒）。

### Step 2 — 复制模板

| 模板 | 目标位置 | 说明 |
| --- | --- | --- |
| `templates/image-loader.ts` | 项目根目录 `image-loader.ts` | loader 本体 |
| `templates/next.config.images.ts` | 合并进你的 `next.config.ts` | `images` 配置段 |

`.env.local` 加一行（图片自定义域名，不带尾斜杠）：

```bash
NEXT_PUBLIC_IMAGE_TRANSFORM_HOST=https://media.example.com
```

### Step 3 — 验证

```bash
pnpm dev    # dev 模式 loader 直接回原图（不烧转换额度），先确认页面正常
pnpm build && pnpm start
# 打开页面，检查 <img> 的 src/srcset 是否形如：
# https://media.example.com/cdn-cgi/image/width=828,quality=75,format=auto/images/xxx.jpg
# curl -I 该 URL，响应头应有 cf-resized: internal=ok/...
```

浏览器支持 AVIF/WebP 时 `format=auto` 会自动出对应格式（看响应的 `content-type`）。

## 计费模型（把账算对地方）

| | Cloudflare Transformations | Vercel（2025+ 新定价） |
| --- | --- | --- |
| 免费额度 | 5,000 unique transformations/月 | Hobby 5,000 transformations/月（**禁止商用**） |
| 转换单价 | $0.50 / 1K（需 Images 付费计划） | $0.05 / 1K（比 CF 便宜 10 倍）+ cache reads/writes |
| 图片流量 egress | **$0** | Fast Data Transfer ≈ $0.15/GB |
| 超额行为 | 新转换报 9422，不静默扣费 | 返回 402，不扣费 |

**关键认知：Cloudflare 的转换单价其实比 Vercel 贵 10 倍，真正省钱的是 egress = 0。** 媒体类站点成本大头是持续的字节分发而非一次性转换，所以总账 Cloudflare 赢；且 Vercel Hobby 禁商用，付费产品本来就要上 Pro。

**计费单位是「源图 × 参数组合」**（官方例子：2,000 张图 × 5 个尺寸 = 10,000 次计费转换），按自然月计。所以控制变体基数 = 控制账单：

- URL 里只放 `width` + `quality` + `format=auto`（loader 模板已固定），**不要**把 height/fit/gravity 塞进去
- `next.config` 收紧 `deviceSizes`/`imageSizes` 到真实需要的档位（模板给了推荐值）
- `quality` 全站统一（默认 75），不要 90+——q=95 输出体积翻倍，视觉收益≈0

## 常见坑

- **`/cdn-cgi/image/` 404**：zone 没 Enable transformations（Step 1.2），或域名是 `r2.dev`。
- **9422 错误**：免费额度（5,000/月）用完，当月新变体全挂。要么付费要么收紧 deviceSizes。
- **dev 环境烧额度**：loader 模板在 `NODE_ENV=development` 直接回原图，别删这个分支。
- **短参数**：`w/h/q/f/g` 是合法 alias；但 `trim=1` 不是合法语法（trim 要像素值组）。
- **remotePatterns 不生效**：custom loader 完全绕过 `/_next/image`，`images.remotePatterns` 白名单不再起约束作用；loader 模板改为「只转换自己媒体域名，第三方 URL 原样返回」来兜这个安全边界。
- **⚠️ 安全：不要用 URL 转换做付费墙模糊图**。`/cdn-cgi/image/blur=50/<源图>` 的源图必须公开可访问，任何人删掉 `/cdn-cgi/image/...` 段就拿到原图。付费内容的模糊预览必须离线生成（见 [[nextjs-r2-paid-media]] skill 的做法）或用 Worker 内 Images binding。

## 什么时候不用本 skill

- **Next.js 部署在 Cloudflare Workers（OpenNext adapter）**：直接在 `wrangler.jsonc` 配 `images.binding`，获得完整兼容 `/_next/image` 的内置优化器，连 loader 都不用写。
- **想要框架无关的图片组件**：用 [@unpic/react](https://unpic.pics/lib/)（支持 28 个 CDN，含 `cloudflare` / `cloudflare_images` 两个 provider）。
- 图片存在第三方（非自有 zone）且不能迁移：URL 转换够不着，考虑 Cloudflare Images 产品（`imagedelivery.net`，含存储）或维持 Vercel 优化。

注意区分两个 Cloudflare 产品：本 skill 用的是 **Image Transformations**（zone 上的 `/cdn-cgi/image`，配 R2/自有存储，按转换计费）；**Cloudflare Images**（`imagedelivery.net`）是含存储和预定义变体的另一个产品，R2 场景下前者才是对的。
