---
name: debug-root
description: Use as the default entry point for debugging, bug fixing, regressions, failing tests, and unexpected code behavior. Diagnose the root cause, then choose a direct low-risk fix or a confirmation-first workflow based on uncertainty and impact. 当用户要求排查、调试或修复代码问题时使用。
---

# 根因调试

先确认根因，再决定走快速修复还是受控修复。不要根据改动行数判断难度。

## 1. 确认问题

用一句话复述预期行为、实际行为和范围。信息不足且会改变实现时，只问一个关键问题。

## 2. 只读诊断

读取实际实现、调用链、错误和测试，必要时做无写入复现。将根因表达为被破坏的通用不变量，不要只给当前样例打补丁。

## 3. 选择流程

仅当以下条件全部成立时直接修复：

- 预期行为明确，根因单一且局部。
- 修复路径唯一，并遵循现有模式。
- 不改变接口、数据模型、依赖、权限、架构或产品决策。
- 有明确验证方式，且用户没有要求先看方案。

此时简短说明根因、修改位置和验证方式，然后实施最小修复并验证。这对应 `debug-simple`。

任一条件不成立时，先给出：

1. 根因及证据。
2. 保持不变的机制和边界。
3. 最小修改方案。
4. 影响范围和验证方法。

等待用户确认准确方案后再实施。这对应 `debug-hard`。

## 边界

- 诊断期间不编辑文件、不安装依赖、不生成文件。
- 不顺手重构、换架构、扩大范围或修改无关文件。
- 参考实现是证据，不是迁移授权。
- 用户的质疑是继续诊断的输入，不是修改授权。
- 实施中出现新的关键选择时，停止并回到方案确认。
- 仅在用户明确要求时提交、推送或部署。
