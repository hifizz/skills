---
name: chrome-web-store-review
description: 对 Chrome 扩展（Manifest V3）在提交 Chrome Web Store 审核前做一次可重复的上线前自查，覆盖单一用途、权限逐项理由、远程代码/MV3 红线、数据使用声明、商店素材、商标合规，产出一份带 ✅/⚠️/❌/❓ 判定的 Markdown 自查报告。Use when the user wants to check whether a browser extension can pass Chrome Web Store / CWS review before submitting, or asks for a "扩展过审 / 提审自查 / CWS review / Web Store 审核" report.
license: MIT
compatibility: 适用于 Manifest V3 扩展（WXT / CRXJS / Plasmo / 原生均可）。只读核查，不改业务代码。
metadata:
  author: zilin
  version: "1.0"
  basis: "Chrome Web Store Program Policies + Manifest V3 技术红线（截至 2026-06）"
---

对 **Manifest V3 浏览器扩展**做一次提交 **Chrome Web Store（CWS）审核**前的上线前自查，产出一份与 `report-template.md` 同构的 Markdown 报告。

CWS 审的是**扩展的技术与政策合规**：单一用途、权限是否名副其实、有没有远程代码、数据怎么用、商店信息是否真实不误导。和支付商户审核（见 `creem-merchant-review`）是**两道独立关卡**——这份只管扩展本体与商店上架。

---

## 何时使用

- 用户准备把扩展提交 CWS，问"能不能过审 / 帮我查一遍 / 出个提审自查报告"。
- manifest 权限、content script 注入面、远程资源加载、商店文案有改动，想提交前复核。

## 前置

1. 定位 **manifest 真源**：WXT 看 `wxt.config.ts`；CRXJS/Plasmo 或原生看 `manifest.json` / `src/manifest.ts`。同时找到生产构建产物（`.output/<browser>-mv3/manifest.json` 等）。
2. 定位**商店素材**：listing 文案、截图、图标源（常在 `docs/` 或 `assets/` / `public/`）。
3. **只读核查**：本 skill 不改业务代码。修复留给后续单独提交。

---

## 执行步骤

### Step 1 — 并行取证

按核查域**并行**派 2~3 路 `Explore` 子代理（一次消息多个 tool call，确保并发）：

- **远程代码 / MV3 技术红线（最高优先级）**：全仓库搜 `eval(`、`new Function(`、字符串形式 `setTimeout/setInterval`、动态注入 `<script src>`、`document.createElement('script')`、远程 `import()`、`chrome.scripting.executeScript` 注入远程内容、从 CDN/外部 URL fetch 后执行；查 manifest 的 `content_security_policy`（有无 `unsafe-eval`/`unsafe-inline`/外部 script-src）、`externally_connectable`、`web_accessible_resources`；列出运行时所有外部请求域（含 iframe/CDN）。
- **权限 + 单一用途 + 数据流**：列出 `permissions`/`optional_permissions`/`host_permissions`/content_scripts 的 matches，每项映射到具体功能；name/description 是否单一清晰；数据存哪（本地 / 上传服务器 / 第三方）。
- **商店素材 + 商标合规**：扩展名（≤75）、短描述（≤132）、详述、截图（1280×800 或 640×400，≥1 张）、128×128 图标、促销贴片；有无关键词堆砌；第三方商标是否仅作"支持平台"+ not-affiliated 免责声明。

每个子代理：**逐条给文件路径 + 代码/文案摘录**，按 ✅/⚠️/❌ 自评，**只读不改**。

### Step 2 — 亲自复核被标记项（关键，远程代码是生死线）

子代理常**夸大严重度**（动辄"CRITICAL / 必拒"）并把 dev 产物当生产。提交前的报告必须自己把可疑点钉死：

- **远程代码分清两种**（这是最易误判处）：
  - **扩展包上下文执行远程代码** = 真违规：扩展页/背景/content script 里 `eval`、加载 CDN `<script>`、动态注入并执行远程 JS、`executeScript` 远程串。
  - **远程 iframe 指向一个 https 网页** = **灰区，非自动违规**：该页不在扩展包内、在其自身 web origin 执行，严格不算"扩展执行远程代码"。但仍可能因"核心功能靠远程实现"被审核员要求整改，且常伴隐私/可用性问题——标 ⚠️ 而非 ❌，讲清取舍。
  - **CDN 引入的 JS/CSS**（即便宿主是自有域的远程页）= 供应链 + 可用性（CDN 可能被墙）+ 隐私风险，建议本地化/自托管。
- **WAR iframe 的拦截原因别搞错**：宿主页 CSP `frame-src` **不**拦 `web_accessible_resources` 的 `chrome-extension://` iframe（扩展资源对页面 CSP 豁免）；真正能挡的是 **COEP（`Cross-Origin-Embedder-Policy: require-corp`）**。评估"远程改本地"可行性时按 COEP 判，不要被旧注释里"CSP 挡 chrome-extension://"误导。
- **dev vs 生产构建**：`host_permissions`、注入域名看**生产构建分支**，别直接读 `.output/` 的 dev manifest 下结论。
- **content script `matches` 是否随构建收敛**：host 收敛 ≠ matches 收敛，后者常硬编码，亲自打开对应 `*.content.ts` 确认；注入但未在隐私政策声明的域 = ⚠️/❌。
- **混淆 vs 压缩**：CWS 禁 obfuscation，允许 minify（terser mangle）。确认构建只 minify。

### Step 3 — 判定与评分

读 `checklist.md`（九节完整清单），逐条用统一图例：

- ✅ **已就绪** / ⚠️ **需关注或需补** / ❌ **违规** / ❓ **代码层无法核实（需人工）**。

### Step 4 — 产出报告

按 `report-template.md` 生成，写入 `docs/chrome-web-store-review-report.md`（日期取上下文 currentDate）。报告必须含：

1. **总体结论**：有没有"必拒红线"先说；代码侧待办 + 商店素材待补 + 人工项分开。
2. **逐项核查表**：九节，每行带图例 + 证据（文件路径）。**权限逐项理由表**要可直接粘进 CWS「Privacy practices」标签页。
3. **数据使用声明指引**：基于实际数据流，列应勾选的数据类型 + Limited Use 三项认证，并提醒与隐私政策逐字一致（**CWS 数据类扩展最高频打回点**）。
4. **提交前清单**：P0（必拒）/ P1（强烈建议）/ 商店素材 / 人工项。

报告语气**诚实克制**：不堆"通过概率 X%"；远程 iframe 这类灰区如实标 ⚠️ 并解释为何"该修但非必拒"。

### Step 5 — 收尾

中文汇报：报告路径 + 一句话结论（有无必拒红线）+ 待办清单。主动提出可代为修复代码侧 P0/P1。

---

## CWS 高频打回点速记

1. **权限名不副实**：申请了找不到对应功能的权限 → 删或被拒。能用 `activeTab` / optional 就别用广 host。
2. **数据声明 ↔ 隐私政策不一致**：Privacy practices 勾选的数据类型/用途与隐私政策对不上。
3. **远程代码**：扩展包内执行远程 JS（CDN/eval/动态注入）。
4. **单一用途超纲**：description 像"全能工具"。
5. **商标误导**：让人误以为是 ChatGPT/Google 等官方出品（缺 not-affiliated 声明）。
6. **素材缺失**：无 128×128 图标、无截图。

## 输出要求

- **中文**面向用户；代码、路径、API、manifest 字段保持原文。
- 报告是**自查清单单**，每条可打勾、可定位。
- 不臆造：核实不到的标 ❓ 并说明，绝不写成 ✅。
