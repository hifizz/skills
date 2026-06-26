<div align="center">

# 🧩 hifizz / skills

**zilin（[@hifizz](https://github.com/hifizz)）的个人 Agent Skills 库**

把日常开发中真实在用的能力，一步步沉淀成可安装、可分享的 skill。

[![skills.sh](https://skills.sh/b/hifizz/skills)](https://skills.sh/hifizz/skills)
[![Agent Skills](https://img.shields.io/badge/standard-agentskills.io-6E56CF)](https://agentskills.io)
[![Blog](https://img.shields.io/badge/blog-zilin.im-0A0A0A)](https://zilin.im)
[![License](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

[安装](#-安装) · [Skills 索引](#-skills-索引) · [工作原理](#-工作原理) · [新增 skill](#-新增一个-skill) · [关于](#-关于)

</div>

---

## ✨ 这是什么

一个 **monorepo 形式的个人 skill 集合**。这里的每个 skill 都不是 demo，而是我（前端，[@hifizz](https://github.com/hifizz)）在真实开发里反复用到、然后抽象沉淀下来的能力——股票投研、Cloudflare / Vercel 部署、React / Vue 组件、构建工程化……

它同时是我的 **个人技术沉淀** 和 **公开作品集**：所有 skill 聚合在 `hifizz/skills` 一个句柄下，遵循 [agentskills.io](https://agentskills.io) 开放标准，可被 Claude Code、Cursor、Codex、OpenCode 等 50+ agent 自动发现与安装。

> 每新增一个 skill，我都会配套写一篇博客讲清楚「它是什么 / 为什么做 / 何时用」。文章见 [`blog/`](./blog) 与 <https://zilin.im>。

## 📦 安装

```bash
# 安装全部 skill
npx skills add hifizz/skills

# 只装某一个
npx skills add hifizz/skills --skill <skill-name>
```

装完即用——skill 会被你的 agent 自动发现，无需手动注册命令。关闭匿名遥测加 `DISABLE_TELEMETRY=1`。

## 📚 Skills 索引

> 🚧 持续沉淀中。每条都附独立安装命令，点 skill 名进入源码，「博客」列是它的来龙去脉。

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

## 🧠 工作原理

- **一个含 `SKILL.md` 的文件夹 = 一个可独立安装的 skill。** 整个 repo 是一个 skill 集合。
- **Skill ≠ slash command。** Agent 会读取每个 skill 的 `description`，在合适场景**自动调用**（progressive disclosure），不需要你手敲 `/xxx`。
- **跨 agent 通用。** 遵循 agentskills.io 标准，一次编写，多家 agent 可用；高级字段（如 `context: fork`）按需再加。
- **版本可追踪。** CLI 按 git tree SHA 检测内容变更，`npx skills update` 能跟上更新。

## ➕ 新增一个 skill

每个 skill 走同一条链路（详见 [`CLAUDE.md`](./CLAUDE.md)）：

```
skills/<name>/SKILL.md   →   本地 --list 校验   →   blog/<name>.md 推广文   →   推文   →   README 索引一行
```

模板见 [`templates/`](./templates)。命名遵循 `<领域>-<动作>`（如 `cloudflare-workers-deploy`、`react-component-author`），让名字自带分类。

## 🙋 关于

我是 **zilin（[@hifizz](https://github.com/hifizz)）**，前端工程师，常驻北京。

- 🌐 博客：<https://zilin.im>
- 🐦 新 skill 与文章会同步发到 Twitter/X
- 💡 觉得某个 skill 有用，欢迎 star / 安装，安装量会反映在上方 skills.sh 徽章

## 📄 License

[MIT](./LICENSE) © zilin
