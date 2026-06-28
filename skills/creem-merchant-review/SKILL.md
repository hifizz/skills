---
name: creem-merchant-review
description: 对「Chrome 扩展 + 官网 + 订阅计费」形态的产品，在提交 Creem（MoR 支付商户）审核前做一次可重复的上线前自查，产出一份带 ✅/⚠️/❌/❓ 判定的 Markdown 自查报告。Use when the user wants to check whether an extension+website product can pass Creem / payment-merchant / MoR review before submitting, or asks for a "过审自查 / 商户审核 / Creem review" report.
license: MIT
compatibility: 适用于 monorepo 内「扩展（WXT/MV3 或同类）+ 官网（Next.js 等）+ Creem 订阅」的产品形态。只读核查，不改业务代码。
metadata:
  author: zilin
  version: "1.0"
  basis: "Creem 官方 Account Reviews 文档 + Merchant Terms（截至 2026-06）"
---

对「Chrome 扩展 + Official Website + 订阅计费」形态的产品，做一次提交 **Creem（Merchant of Record）商户审核**前的上线前自查。

Creem 是 MoR，它要替商户对终端用户兜底退款和拒付，所以审核的不是"产品好不好"，而是**"这个商户和产品可不可信、出事能不能找到你、用户能不能自助解决问题"**。本 skill 把官方口径固化成可重复运行的核查流程，产出一份与 `report-template.md` 同构的 Markdown 报告。

> ⚠️ Creem 官方**没有**提供"审核 skill"，只有文档（Account Reviews / Merchant Terms）。本 skill 是把那份口径工程化，便于每次提交前一键复核。
> Chrome Web Store 的扩展政策审核是**另一道关卡**，本 skill 不覆盖；如需，另起一份扩展商店自查。

---

## 何时使用

- 用户准备把"扩展+官网+订阅"产品提交 Creem，问"能不能过审 / 帮我自查一遍 / 出个商户审核报告"。
- 计费、法律页、定价、取消订阅入口有改动，想在提交前复核。

## 前置

1. 用 git status / 目录结构确认两个产品面：**官网目录**（如 `website/`，Next.js 等）与**扩展配置**（WXT 看 `wxt.config.ts`，其它看 `manifest.json` + 入口目录）。
2. 确认计费用的是 **Creem**（搜 `creem`、`CREEM_`、`@creem`）。若是别的 MoR（Paddle/Lemon 等），清单大体通用，但取消订阅/门户的实现细节需相应调整。
3. **只读核查**：本 skill 不改业务代码。修复留给后续单独提交。

---

## 执行步骤

### Step 1 — 并行取证

按核查域**并行**派 3 路 `Explore` 子代理（一次消息里多个 tool call，确保并发），分别覆盖：

- **官网 + 法律页**：落地页是否无登录墙、30 秒看懂卖什么；`/privacy`、`/terms`、退款政策是否存在且可访问；footer 是否含隐私/条款/客服入口；品牌名是否与扩展一致。
- **定价 + 取消订阅 + 计费集成**：定价（价/周期/币种）是否清晰；取消订阅是否**真实可达**（Creem Customer Portal 跳转 or Cancel API），服务端如何判定 customerId；试用/退款条件；entitlement 模型与商品数。
- **扩展权限 + 数据流**：`permissions`/`host_permissions` 是否最小化、有无 `<all_urls>`/`cookies`/`tabs` 等宽权限；content script 注入域名清单；数据存哪（本地 / 云同步 / 分享上传 / 第三方 API）；扩展 UI 内是否有客服邮箱与账户/取消入口。

每个子代理要求：**逐条给文件路径 + 代码/文案摘录**，按 ✅/⚠️/❌ 自评，**只读不改**。

### Step 2 — 亲自复核被标记项（关键，别偷懒）

子代理常给**过于乐观**的总评（"9/10 / 85%+"）和把 dev 产物误判成生产配置。提交前的报告必须自己把可疑点钉死：

- **dev vs 生产构建别混淆**：`host_permissions`、注入域名要看**生产构建目标**（如按 `NODE_ENV` 或自定义 `*_BUILD_TARGET` 环境变量切换的分支），不要直接读 `.output/` 里的 dev manifest 下结论。
- **content script `matches` 是否真随构建目标收敛**：`host_permissions` 收敛了，不代表 content script 的 `matches` 收敛——后者常被**硬编码**。亲自打开对应 `*.content.ts` 确认。任何注入但**未在隐私政策声明**的域名 = ⚠️/❌ 不一致。
- **取消订阅是不是占位**：打开按钮 → RPC 端点 → Creem SDK 调用整条链路确认是真实现，不是 TODO。
- **客服邮箱"两处都要有"**：grep 扩展端源码（`entrypoints/` / `src/`，搜 `mailto`/`support@`/`contact`），确认**扩展 UI 内**也能找到，而不只是官网。

### Step 3 — 判定与评分

读 `checklist.md`（八节完整清单），逐条用统一图例判定：

- ✅ **已就绪** — 代码/文案中已落地且实现真实。
- ⚠️ **有但不到位** — 存在但藏得深、文案缺位、或位置不当。
- ❌ **缺失/冲突** — 没有，或与声明矛盾（高频打回点）。
- ❓ **代码层无法核实** — 需用户人工确认（产品是否 live、CWS 数据声明一致性、KYC 主体、邮箱可收件）。

### Step 4 — 产出报告

按 `report-template.md` 生成报告，写入 `docs/creem-merchant-review-report.md`（日期取上下文 currentDate）。报告必须包含：

1. **总体结论**：底子如何 + **会卡审核的真实缺口**先点名（P0）。
2. **逐项核查表**：八节，每行带状态图例 + 证据（文件路径）。
3. **提交前必须修的**：按 P0/P1 排序，每条给出具体落点文件与改法。
4. **需人工确认项**：把所有 ❓ 单列，提醒用户线下核对。

报告语气要**诚实克制**：不堆"通过概率 X%"的虚高结论；区分"代码已验证"与"需人工确认"；缺口就直说会被哪条清单点名。

### Step 5 — 收尾

向用户中文汇报：报告路径 + 一句话结论 + P0 清单。主动提出可代为修复 P0（小改动）。

---

## 输出要求

- **中文**面向用户；代码、路径、API 名保持原文。
- 报告是**自查清单单**形态，不是散文；每条可打勾、可定位。
- 不臆造：核实不到的项一律标 ❓ 并说明，绝不写成 ✅。
