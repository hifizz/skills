# 我做了一个 skill：nextjs-cloudflare-image-loader

> **推文草稿（Twitter/X）**
> Vercel 图片优化账单太贵？我把「Next.js + Cloudflare R2 图片优化」的正确姿势沉淀成了一个 Agent Skill 🧩
> 10 行 custom loader 保留 next/image 全部能力，图片 egress 直接降到 $0
> 还纠正一个反直觉事实：Cloudflare 转换单价其实比 Vercel 贵 10 倍，赢的是流量费
> `npx skills add hifizz/skills --skill nextjs-cloudflare-image-loader`
> 背后的故事 👉 https://zilin.im/blog/nextjs-cloudflare-image-loader

## 这是什么（技能本身）

一个把 Next.js 图片优化从 Vercel 切到 **Cloudflare Image Transformations（R2 + `/cdn-cgi/image`）** 的 skill。核心交付就两个文件：

- `image-loader.ts`——10 行的 next/image custom loader，产出 `https://media.example.com/cdn-cgi/image/width=828,quality=75,format=auto/...` 形式的 URL，`<Image>` 组件照常用，srcset / lazy / priority / CLS 防抖全部保留
- `next.config` 的 `images` 配置段——`deviceSizes`/`imageSizes` 收紧成「计费变体网格」

但代码不是重点，重点是 skill 里沉淀的判断：

- **Cloudflare 侧的前提 checklist**（zone 要手动 Enable Transformations、`pub-*.r2.dev` 不支持、跨 zone 要开 resize from any origin）——每一条漏掉都是一个「为什么 404」的下午
- **计费模型算对地方**：计费单位是「源图 × 参数组合」，官方例子 2,000 张图 × 5 尺寸 = 10,000 次计费转换。所以 URL 里只放 width/quality/format 不是代码洁癖，是账单控制
- **一个安全警告**：不要用 `/cdn-cgi/image/blur=50/` 做付费墙模糊图——删掉 URL 里的转换段就是原图

安装：

```bash
npx skills add hifizz/skills --skill nextjs-cloudflare-image-loader
```

## 为什么做它（原因 / 过程）

起因是生产项目 softie-ai 的一次成本优化：Vercel 的 Image Optimization 对图片密集型产品来说太贵，于是迁到了 R2 + Cloudflare Transformations。但当时的实现走了弯路——`images: { unoptimized: true }` 关掉 next/image，再手写一个约 200 行的 `<OptimizedImage>` 组件自己拼 URL、自己造 srcset、自己搞 lazy loading。能跑，但等于用 200 行自研代码替代了官方 10 行 loader 能白拿的东西，而且手拼参数把 height/fit/gravity 全塞进了 URL，每个参数组合都是一次计费转换，变体基数完全失控。

后来专门调研了一轮「正确姿势」，有三个发现值得沉淀：

1. **官方机制就是 custom loader**，Cloudflare 文档里有标准 snippet，生态里甚至没有一个「事实标准」的 npm 包——因为 loader 只有 10 行，大家都直接抄官方的。所以这个 skill 的价值不在代码，在于把散落在文档、社区帖子、定价页里的坑位集中到一处。
2. **「Cloudflare 便宜」的原因和直觉相反**。对比 2025+ 双方定价：Cloudflare 转换单价 $0.50/1K，Vercel 只要 $0.05/1K——贵 10 倍！真正的差距在 egress：Cloudflare 图片流量 $0，Vercel 走 Fast Data Transfer 约 $0.15/GB。媒体站成本大头是持续的字节分发而非一次性转换，所以总账 Cloudflare 赢。账要算对地方，不然收紧错了变量。
3. **custom loader 会绕过 `remotePatterns`**。白名单不再生效，安全边界要在 loader 里自己判域名——这个坑几乎没有文章提。

## 什么时候用它（适用场景）

- **Vercel 图片优化账单失控**：图片密集型产品（相册、电商、内容站）从 Vercel 优化迁出，这是最直接的场景。
- **图片本来就在 R2**：配一个自定义域名 + 开 Transformations，10 分钟接上。
- **和付费媒体系统搭配**：我的另一个 skill `nextjs-r2-paid-media`（R2 付费解锁媒体）的公开缩略图展示层，正好用这个 loader 做响应式优化，两个 skill 互链。

不适用的场景 skill 里也写明了：部署在 Cloudflare Workers 上直接用 OpenNext 的 images binding（连 loader 都不用写）；想要框架无关方案用 @unpic/react。

---
*本文同步于 [zilin.im](https://zilin.im)，skill 源码见 [hifizz/skills](https://github.com/hifizz/skills)。*
