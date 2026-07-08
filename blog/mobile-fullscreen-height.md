# 我做了一个 skill：mobile-fullscreen-height —— 移动端 100vh 全屏适配，两个方案按场景选

> **推文草稿（Twitter/X）**
> 移动端 `100vh` 遮底部、滚动跳动这个老坑，我沉淀成了一个 Agent Skill 🧩
> 不搞一把梭：营销/内容型用纯 CSS `svh`（稳定不抖、零 JS）；IM/应用型用兼容性版本（特性检测 + `dvh` + JS polyfill 兜底老设备和国内 WebView）。
> `npx skills add hifizz/skills --skill mobile-fullscreen-height`
> 背后的取舍 👉 https://zilin.im

## 这是什么（技能本身）

`mobile-fullscreen-height` 解决一个做过移动端 Web 的人都踩过的坑：`height: 100vh` 在手机上是**骗你的**——它算的是「地址栏收起时」的最大高度，于是地址栏一展开，你的底部 TabBar / 提交按钮就被浏览器工具栏盖住了。

它不给你一把梭的答案，而是**分场景两个方案**：

| 场景 | 方案 | 为什么 |
| --- | --- | --- |
| 营销 / 内容型 | **svh（纯 CSS）** | 零 JS、最简单；`svh` 稳定不抖、底部永不遮挡 |
| IM / 应用型 | **兼容性版本（已验证）** | JS 检测 + `dvh` 跟随工具栏/键盘 + polyfill 兜底老设备 / 国内 WebView |

一句话：**内容型用 svh，IM/应用型用兼容性版本。**

装完你会拿到：两个方案的 CSS（`.h-svh-screen` / `.h-dynamic-screen`）、兼容性版本的核心 Hook（`ViewportStrategyProvider` + 检测 + Polyfill）、固定壳子 + 安全区样式、一个能实时显示当前命中方案的 Demo，以及一段可丢给 LLM 的「一键复制 Prompt」。

```bash
npx skills add hifizz/skills --skill mobile-fullscreen-height
```

## 为什么做它（原因 / 过程）

这套东西我在 [playground.zilin.im](https://playground.zilin.im) 里做出来、真机验证过。整理成 skill 时最大的收获，是想清楚了「svh 还是 dvh」不该有唯一答案，而要按场景分：

- **营销 / 内容型**页面基本不涉及键盘、结构简单，要的是「稳」——`svh`（地址栏展开时的最小高度）稳定、滚动不 reflow、底部永不遮挡，纯 CSS 就够，一行 JS 都不用写。
- **IM / 应用型**要覆盖老设备和内核落后的国内 WebView（微信/QQ/UC），JS 检测兜底就是底线；而且这类应用有键盘、工具栏交互，`dvh`（动态跟随）比 svh 更贴合。这正是我一直在用、验证过的「混合渐进增强」方案：现代设备走 dvh、0 JS 开销，旧设备才降级 polyfill。

我也做过一版「一律 svh」和一版把键盘处理做得很重的方案，后来砍了——**过度工程和一把梭都不对，按场景选才是对的**。skill 里就把两条路摆清楚，配一张场景对照表，让人照着挑。

## 什么时候用它（适用场景）

- **落地页 / 活动页 / 文章页**要一屏铺满、底部不留白 → svh。
- **聊天 / 后台 / 带输入框的 H5 App**，要覆盖长尾设备和微信生态 → 兼容性版本。
- **踩了 `100vh` 遮挡 / 跳动的坑**、纠结 svh 还是 dvh → 直接照场景对照表选。
- **Vibe Coding**：复制 skill 里的 Prompt 丢给 Claude / Cursor 集成。

它省掉的，是每次做移动端全屏都要重新纠结一遍「要不要 JS、svh 还是 dvh」的那半天。

---
*本文同步于 [zilin.im](https://zilin.im)，skill 源码见 [hifizz/skills](https://github.com/hifizz/skills)。*
