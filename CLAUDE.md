# CLAUDE.md

本仓库是 **zilin（@hifizz）的个人 Agent Skills 库**，仓库句柄 `hifizz/skills`，博客 <https://zilin.im>。

这份文件是给在本仓库工作的 Claude Code 的操作指南。开始动手前请通读。

## 这个仓库是什么

一个 **monorepo（单仓库）形式的个人 skills 集合**，同时承担三个目标，三者缺一不可：

1. **个人品牌**：所有 skill 聚合在 `hifizz/skills` 这一个可辨识的句柄下，安装量、排行榜、徽章都集中在这里。不要拆成多个 repo——会把品牌和安装数打散。
2. **真实在用的技术沉淀**：这里的每个 skill 都是 zilin 日常开发中真实使用的能力，不是 demo。沉淀一个能力 = 新增一个 skill 文件夹。
3. **内容驱动的推广**：**每新增一个 skill，必须配套产出一篇博客 + 一条 Twitter/X 推文**（见下文「新增 skill 的完整流程」）。这是硬性约定，不是可选项。

## 核心概念（不要搞错）

- **一个含 `SKILL.md` 的文件夹 = 一个可独立安装的 skill。** 一个 repo = 一个 skill 集合。
- 不要把所有能力塞进一个巨型 skill；也不要为了「整体性」合并多个领域。
- **Agent Skills 不是 slash command。** Skill 是 agent 根据 `description` **自动调用**的（progressive disclosure）；`/xxx` 命令是 Claude Code 另一套独立原语（`.claude/commands/`），与本仓库无关。所以我们做的是「多个可被自动发现的 skill」，不是「注册多个 slash command」。
- 遵循 **agentskills.io 开放标准**。适配了它，skills.sh / SkillsMD / claudemarketplaces 等目录站基本都能自动收录，无需逐站适配。

## 仓库结构

```
hifizz/skills/
├── CLAUDE.md                      # 本文件
├── README.md                      # 分类索引 + 安装量徽章 + 安装示例（每次新增 skill 必须同步更新）
├── skills/                        # 所有正式 skill 平铺在这里，不要套深层分类目录
│   ├── <skill-name>/
│   │   └── SKILL.md
│   └── .experimental/             # 半成品 / 不想过早暴露的 skill
│       └── <wip-skill>/SKILL.md
├── blog/                          # 每个 skill 对应一篇推广博客
│   └── <skill-name>.md
└── templates/
    ├── SKILL.template.md          # 新 skill 模板
    └── blog.template.md           # 推广博客模板
```

**结构硬约束（CLI 扫描机制决定，必须遵守）：**

- skill 必须**平铺在 `skills/` 下**，每个一个文件夹。CLI 在固定位置找 skill（根目录、`skills/`、`skills/.experimental/`、`skills/.system/` 等）；`skills/` 一旦命中就**不会**再递归子目录，所以**不要建 `skills/react/...` 这种深层分类目录**，深层嵌套会扫不到。
- 分类不靠目录，靠两件事：
  1. **命名约定** `<领域>-<动作>`，让名字自带分类，例如 `stock-deep-research`、`cloudflare-workers-deploy`、`react-component-author`、`vue-component-author`、`vercel-deploy`。`name` 近似全局标识，前缀化也能避免和别人撞名。
  2. **README 分类索引**：按领域分组，每组列出 skill + 安装命令。
- 半成品两种藏法：放进 `skills/.experimental/`，或在 frontmatter 写 `metadata.internal: true`（默认发现不到，需 `INSTALL_INTERNAL_SKILLS=1` 才可见可装）。

## SKILL.md 规范

每个 `SKILL.md` 必须有 YAML frontmatter，`name` 和 `description` 为必填：

```yaml
---
name: cloudflare-workers-deploy
description: 用于把 Cloudflare Workers 项目部署到生产。当用户提到部署 worker、wrangler deploy、Cloudflare 边缘函数上线时触发。
---
```

- **`description` 是成败关键**：它决定 agent 在什么场景自动拉起这个 skill。必须写清楚「**什么时候用 / 触发词是什么**」，而不是泛泛介绍功能。
- 跨 agent 兼容性不是全功能对齐：基础 skill 各 agent 都支持，但 `allowed-tools`、`context: fork`、hooks 等是部分 agent 专属（如 `context: fork` 目前仅 Claude Code 支持）。**想让 skill 尽量通用，就把这些高级字段留到确实需要时再加。**
- 版本：正常打 tag、发 release 即可。CLI 靠比对 git tree SHA 检测真实内容变更，别人 `npx skills update` 能跟上。

## 新增一个 skill 的完整流程

这是本仓库的核心工作流。每次新增 skill 都要走完整条链路，**博客和推文不能省**：

1. **起模板**：`npx skills init <skill-name>`，或复制 `templates/SKILL.template.md` 到 `skills/<skill-name>/SKILL.md`。skill 名用 `<领域>-<动作>` 约定。
2. **写 SKILL.md**：重点打磨 `description`（触发场景 + 触发词）。skill 必须是 zilin 真实在用的能力。
3. **本地验证**：
   - `npx skills add ./skills/<skill-name> --list` —— 确认 CLI 能正确发现该 skill（只列出不安装）。
   - 如可用，`gh skill publish --dry-run` 校验 frontmatter 是否合规。
4. **写推广博客**：复制 `templates/blog.template.md` 到 `blog/<skill-name>.md`，内容覆盖三块：
   - **技能本身**：它做什么、怎么用、安装命令。
   - **创建的原因 / 过程**：为什么沉淀这个能力、遇到的问题、怎么抽象成 skill。
   - **适用场景**：什么时候该用它、解决了什么真实痛点。
5. **写 Twitter/X 推文**：一条简短推文（建议放在博客顶部或单独记录），带博客链接 + 安装命令 `npx skills add hifizz/skills --skill <skill-name>`。
6. **更新 README**：把新 skill 加进分类索引，附安装命令。
7. **提交**：commit 信息清晰描述新增的 skill；按需打 tag / 发 release。

> 验收标准：一个 skill 算「完成」当且仅当 —— `skills/<name>/SKILL.md` 通过本地 `--list` 校验、`blog/<name>.md` 三块内容齐全、推文已写、README 索引已更新。缺任意一项都不算完成。

## 安装命令速查

- 装全部：`npx skills add hifizz/skills`
- 装指定：`npx skills add hifizz/skills --skill <skill-name>`
- 列出不装（验证用）：`npx skills add ./skills/<skill-name> --list`
- 关遥测：`DISABLE_TELEMETRY=1`

## 发布到 skills.sh 的真相

**没有提交/审核流程。** skills.sh 是 Vercel Labs 维护的目录站，背后是开源 CLI `npx skills`（`vercel-labs/skills`）。排行榜靠 CLI 的匿名安装遥测排名。只要：仓库公开 + SKILL.md 合法（frontmatter 有 `name`、`description`）+ 有人跑过一次 `npx skills add hifizz/skills`，就会进索引并按安装量排名。

README 顶部挂安装量徽章做品牌：
```markdown
[![skills.sh](https://skills.sh/b/hifizz/skills)](https://skills.sh/hifizz/skills)
```

## 约定与口味

- 仓库内文档默认用中文（README 面向公众可中英结合）。
- commit 信息聚焦「新增/修改了哪个 skill、为什么」。
- 不要擅自创建 PR，除非 zilin 明确要求。
