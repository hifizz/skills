<div align="center">

# 🧩 hifizz / skills

**zilin（[@hifizz](https://github.com/hifizz)）的个人 Agent Skills 库**

日常开发中真实在用的能力，沉淀成可安装、可分享的 skill。

[![skills.sh](https://skills.sh/b/hifizz/skills)](https://skills.sh/hifizz/skills)
[![Agent Skills](https://img.shields.io/badge/standard-agentskills.io-6E56CF)](https://agentskills.io)
[![Blog](https://img.shields.io/badge/blog-zilin.im-0A0A0A)](https://zilin.im)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

[安装](#-安装) · [Skills 索引](#-skills-索引) · [工作原理](#-工作原理) · [关于](#-关于)

</div>

---

## ✨ 这是什么

一个 **monorepo 形式的 skill 集合**。这里的每个 skill 都不是 demo，而是我在真实开发里反复用到、抽象沉淀下来的能力——股票投研、Cloudflare / Vercel 部署、React / Vue 组件、构建工程化……

遵循 [agentskills.io](https://agentskills.io) 开放标准，可被 Claude Code、Cursor、Codex、OpenCode 等 50+ agent 自动发现与安装。每个 skill 的来龙去脉会写在博客里：<https://zilin.im>。

## 📦 安装

```bash
# 安装全部 skill
npx skills add hifizz/skills

# 只装某一个
npx skills add hifizz/skills --skill <skill-name>
```

装完即用——skill 会被你的 agent 自动发现，无需手动注册命令。关闭匿名遥测加 `DISABLE_TELEMETRY=1`。

## 📚 Skills 索引

> 🚧 持续更新中。每个 skill 一张竖表（手机上不横向滚动），点 skill 名进源码，「博客」行是它的来龙去脉。

### 📈 股票 / 投研

_即将上线，敬请期待。_

### ☁️ Cloudflare / Vercel / 部署

| | |
| --- | --- |
| **Skill** | [nextjs-cloudflare-image-loader](./skills/nextjs-cloudflare-image-loader) |
| 说明 | 用 Cloudflare Image Transformations（R2 + /cdn-cgi/image）替代 Vercel 图片优化：10 行 custom loader 保留 next/image 全部能力、egress 降为 $0，含计费变体控制与全套坑位 checklist |
| 博客 | [文章](./blog/nextjs-cloudflare-image-loader.md) |
| 安装 | `npx skills add hifizz/skills --skill nextjs-cloudflare-image-loader` |

### ⚛️ 前端 / React / Vue

| | |
| --- | --- |
| **Skill** | [nextjs-sse-push](./skills/nextjs-sse-push) |
| 说明 | 给 Next.js 一键装上「服务端主动推送」系统：SSE 长连接 + Redis Pub/Sub 跨实例广播 + BullMQ 延迟/定时任务 + 零依赖 React Hooks，以通道为核心、数据结构业务自定义 |
| 博客 | [文章](./blog/nextjs-sse-push.md) |
| 安装 | `npx skills add hifizz/skills --skill nextjs-sse-push` |

| | |
| --- | --- |
| **Skill** | [nextjs-r2-paid-media](./skills/nextjs-r2-paid-media) |
| 说明 | 给 Next.js 一键装上「付费解锁媒体资源」系统：Cloudflare R2 私有桶 + 预签名 URL 限时访问 + 解锁扣费事务 + blurhash/高斯模糊付费预览 + headless PaidMediaProvider，计费/鉴权走 adapter、展示组件业务自定义 |
| 博客 | [文章](./blog/nextjs-r2-paid-media.md) |
| 安装 | `npx skills add hifizz/skills --skill nextjs-r2-paid-media` |

| | |
| --- | --- |
| **Skill** | [mobile-fullscreen-height](./skills/mobile-fullscreen-height) |
| 说明 | 移动端 100vh「超高」/ 底部遮挡 / 滚动跳动的全屏高度适配，两个方案按场景选：营销/内容型用纯 CSS **svh**（稳定不抖、零 JS）；IM/应用型用**兼容性版本**（特性检测混合渐进增强，dvh + JS polyfill 兜底老设备与国内 WebView），含固定壳子 + 安全区 + 一键复制 Prompt |
| 博客 | [文章](./blog/mobile-fullscreen-height.md) |
| 安装 | `npx skills add hifizz/skills --skill mobile-fullscreen-height` |

| | |
| --- | --- |
| **Skill** | [floating-popup-position](./skills/floating-popup-position) |
| 说明 | 选区浮层（划词工具条 / AI 解释卡）定位算法：在 ContainerRect 内围绕 SelectedRect 按 右→下→左→上 择位，交叉轴居中越界滑动、永不被裁切；四边都放不下时取遮挡选区面积最小的兜底位。零依赖纯函数，[交互 Demo](https://playground.zilin.im/floating-popup) |
| 博客 | _待补_ |
| 安装 | `npx skills add hifizz/skills --skill floating-popup-position` |

### 🛠️ 构建工具 / 工程化

_即将上线，敬请期待。_

### 🚀 发布 / 上架 / 合规

| | |
| --- | --- |
| **Skill** | [creem-merchant-review](./skills/creem-merchant-review) |
| 说明 | 「扩展 + 官网 + 订阅」形态提交 Creem（MoR 支付商户）审核前的上线前自查，产出带 ✅/⚠️/❌/❓ 判定的报告 |
| 博客 | _待补_ |
| 安装 | `npx skills add hifizz/skills --skill creem-merchant-review` |

| | |
| --- | --- |
| **Skill** | [chrome-web-store-review](./skills/chrome-web-store-review) |
| 说明 | Manifest V3 扩展提交 Chrome Web Store 审核前的自查（单一用途 / 权限理由 / 远程代码红线 / 数据声明 / 商店素材），产出判定报告 |
| 博客 | _待补_ |
| 安装 | `npx skills add hifizz/skills --skill chrome-web-store-review` |

### 🖥️ 系统 / 效率

| | |
| --- | --- |
| **Skill** | [disk-scan](./skills/disk-scan) |
| 说明 | 只读扫描 macOS 磁盘占用，拆解储存面板里笼统的 "System Data" 分类（Docker / Xcode 缓存 / 包管理器缓存 / App 数据 / 容器沙箱等），产出按大小排序的汇总表，绝不删除或修改文件 |
| 博客 | _待补_ |
| 安装 | `npx skills add hifizz/skills --skill disk-scan` |

## 🧠 工作原理

- **一个含 `SKILL.md` 的文件夹 = 一个可独立安装的 skill。** 整个 repo 是一个 skill 集合。
- **Skill ≠ slash command。** Agent 会读取每个 skill 的 `description`，在合适场景**自动调用**（progressive disclosure），不需要你手敲 `/xxx`。
- **跨 agent 通用。** 遵循 agentskills.io 标准，一次编写，多家 agent 可用。
- **版本可追踪。** CLI 按 git tree SHA 检测内容变更，`npx skills update` 能跟上更新。

## 🙋 关于

我是 **zilin（[@hifizz](https://github.com/hifizz)）**，前端工程师，常驻北京。

- 🌐 博客：<https://zilin.im>
- 🐦 新 skill 与文章会同步发到 Twitter/X
- 💡 觉得某个 skill 有用，欢迎 star / 安装

## 📄 License

[MIT](./LICENSE) © zilin
