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

> 🚧 持续更新中。每条附独立安装命令，点 skill 名进源码，「博客」列是它的来龙去脉。

### 📈 股票 / 投研
| Skill | 说明 | 博客 | 安装 |
| --- | --- | --- | --- |
| _即将上线_ | | | |

### ☁️ Cloudflare / Vercel / 部署
| Skill | 说明 | 博客 | 安装 |
| --- | --- | --- | --- |
| _即将上线_ | | | |

### ⚛️ 前端 / React / Vue
| Skill | 说明 | 博客 | 安装 |
| --- | --- | --- | --- |
| _即将上线_ | | | |

### 🛠️ 构建工具 / 工程化
| Skill | 说明 | 博客 | 安装 |
| --- | --- | --- | --- |
| _即将上线_ | | | |

### 🚀 发布 / 上架 / 合规
| Skill | 说明 | 博客 | 安装 |
| --- | --- | --- | --- |
| [creem-merchant-review](./skills/creem-merchant-review) | 「扩展 + 官网 + 订阅」形态提交 Creem（MoR 支付商户）审核前的上线前自查，产出带 ✅/⚠️/❌/❓ 判定的报告 | _待补_ | `npx skills add hifizz/skills --skill creem-merchant-review` |
| [chrome-web-store-review](./skills/chrome-web-store-review) | Manifest V3 扩展提交 Chrome Web Store 审核前的自查（单一用途 / 权限理由 / 远程代码红线 / 数据声明 / 商店素材），产出判定报告 | _待补_ | `npx skills add hifizz/skills --skill chrome-web-store-review` |

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
