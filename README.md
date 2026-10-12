<div align="center">

# 🧩 hifizz / skills

**zilin（[@hifizz](https://github.com/hifizz)）的个人 Agent Skills 库**

日常开发中真实在用的能力，沉淀成可安装的 skill。

[![skills.sh](https://skills.sh/b/hifizz/skills)](https://skills.sh/hifizz/skills)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

</div>

---

## 📦 安装

```bash
# 安装全部
npx skills add hifizz/skills

# 只装一个
npx skills add hifizz/skills --skill <skill-name>
```

## 📚 Skills

### Next.js / Cloudflare

| Skill | 作用 |
| --- | --- |
| [nextjs-sse-push](./skills/nextjs-sse-push) | 服务端主动推送：SSE + Redis 跨实例广播 + BullMQ 定时任务 + React Hooks |
| [nextjs-r2-paid-media](./skills/nextjs-r2-paid-media) | 付费解锁图片 / 视频：R2 私有桶 + 限时签名 URL + 扣费 + 模糊预览 |
| [nextjs-cloudflare-image-loader](./skills/nextjs-cloudflare-image-loader) | 用 Cloudflare 图片转换替代 Vercel 图片优化，流量成本降为 0 |

### 前端体验

| Skill | 作用 |
| --- | --- |
| [mobile-fullscreen-height](./skills/mobile-fullscreen-height) | 修复移动端 100vh 超高、底部按钮被遮挡、滚动跳动 |
| [floating-popup-position](./skills/floating-popup-position) | 划词工具条等选区浮层的定位算法，永不被裁切 |
| [text-highlight-recover](./skills/text-highlight-recover) | 页面重渲染后，用文本锚点模糊找回网页高亮 |
| [create-interactive-hero](./skills/create-interactive-hero) | 营销首屏里的可交互产品 Demo，自动播放真实 UI |

### 调试

| Skill | 作用 |
| --- | --- |
| [debug-root](./skills/debug-root) | 调试总入口：先定根因，再按风险决定直接修或先确认 |
| [debug-simple](./skills/debug-simple) | 低风险、修复路径唯一的小 bug，快速定位并修复 |
| [debug-hard](./skills/debug-hard) | 复杂 / 高风险 bug：先诊断、确认方案，再受控修改 |

### 上架自查

| Skill | 作用 |
| --- | --- |
| [creem-merchant-review](./skills/creem-merchant-review) | 提交 Creem 支付商户审核前的上线自查报告 |
| [chrome-web-store-review](./skills/chrome-web-store-review) | 提交 Chrome Web Store 审核前的 MV3 扩展自查报告 |

### 效率 / 媒体

| Skill | 作用 |
| --- | --- |
| [disk-scan](./skills/disk-scan) | 只读拆解 macOS 的「System Data」，找出可清理的空间，不删文件 |
| [web-video-encode](./skills/web-video-encode) | 录屏转网页可嵌入的 MP4 / WebM / GIF，附 poster 静帧 |

## 📄 License

[MIT](./LICENSE) © zilin

---

<div align="center">

🌐 博客 [zilin.im](https://zilin.im) · 🐦 新 skill 与文章同步发布在 Twitter/X

</div>
