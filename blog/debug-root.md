# 我做了一个 skill：debug-root —— 调试先找根因，再决定怎么修

> **推文草稿（Twitter/X）**
> 把日常调试的统一入口沉淀成了 `debug-root`：先只读确认根因，再按风险选择直接修复或先确认方案，避免小问题流程过重、复杂问题又改得太快 🧩
> `npx skills add hifizz/skills --skill debug-root`
> 背后的方法 👉 https://zilin.im

## 这是什么（技能本身）

`debug-root` 是代码调试的默认入口。它先确认预期与现象，沿实际调用链寻找根因，再判断问题是否满足“范围明确、根因单一、修复唯一、风险低”的条件。

满足条件时走快速修复；否则先提交根因证据、边界、最小方案和验证方法，等待确认后再实施。它统一了 `debug-simple` 与 `debug-hard` 的分流标准，也可以独立使用。

```bash
npx skills add hifizz/skills --skill debug-root
```

## 为什么做它（原因 / 过程）

实际使用中，agent 不该要求用户先判断一个 bug 是简单还是复杂。只按改动行数分类也不可靠：一行权限修改可能高风险，跨文件恢复既有模式却可能路径唯一。

所以我把“先找根因，再按不确定性和影响分流”抽成统一入口。简单问题不增加无谓确认；根因、方案或边界不清时，也不会未经确认直接修改。

## 什么时候用它（适用场景）

- 出现 bug、回归、测试失败或行为异常，但尚未判断复杂度。
- 希望 agent 先验证根因，而不是围绕报错表面打补丁。
- 想让低风险修复保持高效，同时为高风险修改保留确认点。

如果已经明确要使用某条流程，也可以直接调用 `debug-simple` 或 `debug-hard`。

---
*本文同步于 [zilin.im](https://zilin.im)，skill 源码见 [hifizz/skills](https://github.com/hifizz/skills)。*
