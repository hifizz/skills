# Chrome Web Store 过审自查表（Manifest V3 扩展）

> 整理依据：Chrome Web Store Program Policies + Manifest V3 技术红线（截至 2026-06）。具体以提交时 CWS 后台与官方政策为准。
> 与支付商户审核（creem-merchant-review）是两道独立关卡：这份只管扩展本体与商店上架。

判定图例：✅ 已就绪 / ⚠️ 需关注或需补 / ❌ 违规 / ❓ 代码层无法核实（需人工确认）

---

## 一、单一用途（Single Purpose）

- [ ] 扩展有单一、清晰、窄的用途，name/description 表述聚焦，无"全能工具"大杂烩
- [ ] 扩展名 ≤75 字符
- [ ] 短描述 ≤132 字符

## 二、权限逐项理由（Privacy practices 标签页要逐项填）

- [ ] 列出每个 `permissions`，逐一对应到具体功能
- [ ] 列出每个 `optional_permissions`（能 optional + 运行时请求的尽量 optional，是加分项）
- [ ] 列出每个 `host_permissions` 与对应用途
- [ ] 列出每条 content_scripts 的 matches 与注入理由
- [ ] 没有任何"找不到对应功能"的权限（有 = 删或被拒）

## 三、最小权限（Least Privilege）

- [ ] 无 `<all_urls>` host 权限（除非确有必要并能解释）
- [ ] 能用 `activeTab` 替代广 host 的地方已替代
- [ ] 无用不到的 `cookies` / `webRequest` / `tabs` 等敏感权限
- [ ] `web_accessible_resources` 的 matches 收窄到实际使用域（非 `<all_urls>`）

## 四、远程代码 / MV3 技术红线

- [ ] 无 `eval(` / `new Function(` / 字符串形式 `setTimeout`/`setInterval`
- [ ] 无动态注入并执行远程 `<script src>` / `createElement('script')`
- [ ] 无远程 `import()`、无"从外部 URL fetch 后执行"的代码
- [ ] `chrome.scripting.executeScript` 未注入远程内容（只注入本地打包代码）
- [ ] **扩展页/背景/content script 不加载任何 CDN 脚本**（mermaid/tailwind/analytics 等需本地打包）
- [ ] manifest `content_security_policy` 未放宽（无 `unsafe-eval`/`unsafe-inline`/外部 script-src）
- [ ] `externally_connectable` 配置合理（无则更好）
- [ ] `web_accessible_resources` 只暴露必要资源，不暴露敏感 JS/HTML
- [ ] content scripts 注入范围与隐私政策描述一致（注意 matches 是否随生产构建收敛）
- [ ] 远程 iframe（若有）：分清"扩展执行远程代码"（违规）vs"iframe 指向 https 网页"（灰区）；后者评估本地化时按 **COEP** 判可行性，非 CSP frame-src

## 五、代码混淆

- [ ] 无 obfuscation；只做 minify（terser mangle 属允许范围）

## 六、数据使用声明（Data Usage / Limited Use）—— 高频打回点

- [ ] Privacy practices 标签页按实际数据流勾选数据类型（如 PII/邮箱、个人通信/对话、网站内容…）
- [ ] 认证"不出售用户数据"
- [ ] 认证"仅用于单一用途、不挪作他用"
- [ ] 认证"不用于借贷/信用评估"
- [ ] 后台已填隐私政策链接
- [ ] **数据声明与隐私政策逐字一致**（字段、用途、是否端到端加密都对得上）

## 七、隐私政策

- [ ] 隐私政策可公开访问
- [ ] 覆盖采集/存储/上传/第三方共享，与扩展实际行为一致

## 八、商店 Listing 素材

- [ ] 扩展名 / 短描述 / 详细描述 已定稿
- [ ] 128×128 图标（必需）+ 16/32/48（manifest 引用）齐全
- [ ] 截图 ≥1 张（1280×800 或 640×400），含说明文案
- [ ] 促销贴片图 440×280 / 920×680（可选，有助曝光）
- [ ] 类目、语言已确定（CWS 后台手填）

## 九、商标 / 元数据合规

- [ ] name/description 无关键词堆砌
- [ ] 第三方商标仅作"支持平台"提及，未声称官方关系
- [ ] 含 not-affiliated 免责声明（描述里或扩展内）
- [ ] 名称/图标/描述与官网品牌一致（防套壳/钓鱼误判）

---

## 被打回怎么办

1. 看审核邮件标出的具体政策条款
2. 逐项修复，优先动：权限名副其实、数据声明一致、远程代码、单一用途
3. 在开发者后台重新提交，附修复说明
