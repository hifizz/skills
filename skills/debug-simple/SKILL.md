---
name: debug-simple
description: Use for narrow, low-risk code defects with clear expected behavior and a single repair path. Use for isolated regressions, typos, incorrect local conditions, and fixes that follow an existing pattern. Escalate to debug-hard when scope, root cause, behavior, or solution choice is uncertain. 适用于范围明确、风险低且修复路径唯一的代码问题。
---

# 快速调试

仅在以下条件全部成立时使用：

- 用户目标和预期行为明确。
- 可确认单一、局部的根因。
- 修复路径唯一并遵循现有模式。
- 不改变接口、数据模型、依赖、权限、架构或产品决策。
- 不需要用户补充选择。
- 有明确的验证方式。

任一条件不成立，说明原因并改用 `debug-hard`。不要继续实施。

## 流程

1. 用一句话复述问题和工作理解。
2. 使用只读检查确认根因。
3. 用一句话说明根因、修改位置和验证方式。
4. 直接实现并验证。

将用户的“修复”请求视为第 3 步的实施授权，但仅限满足全部低风险条件的情况。

## 边界

- 不得顺手重构、换方案、扩大范围或修改无关文件。
- 若出现多个合理方案、根因不确定或需要产品决策，停止实施并改用 `debug-hard`。
- 用户明确要求“先诊断”“先确认方案”或“不要修改”时，改用 `debug-hard`。
- 仅在用户明确要求时提交、推送或部署。
