---
name: mobile-fullscreen-height
description: 移动端全屏视口高度适配。解决 iOS Safari / Android Chrome / 国内 WebView 地址栏、工具栏动态伸缩导致 100vh「超高」、底部 TabBar/按钮被遮挡、滚动跳动的问题。给两个按场景选的方案：营销/内容型用纯 CSS svh；IM/应用型用「特性检测混合渐进增强」（JS 检测 + dvh + polyfill，覆盖老设备）。当用户提到 100vh 在手机上不对 / iOS 底部按钮被遮住 / 全屏布局高度跳动 / dvh svh 怎么选 / --app-height polyfill / 移动端 app shell 全屏高度 / 移动端全屏适配时使用。
license: MIT
compatibility: 方案一(svh)纯 CSS，框架无关。方案二的 Hook 为 React / Next.js（App / Pages Router 均可，"use client"），依赖 lodash（get / throttle）。
metadata:
  author: zilin
  version: "3.0"
  source: 沉淀自 playground.zilin.im，方案二(兼容性版本)已生产验证；方案一(svh)见 Demo /mobile-fullscreen-svh
---

移动端「全屏一屏」布局的老坑：`height: 100vh` 在 iOS Safari / Android Chrome 上算的是**地址栏收起时**的最大高度，地址栏一展开，底部 TabBar / 按钮就被工具栏盖住；全量用 JS 监听 `resize` 改高度又会在滑动时抖动。

## 两个方案，按场景选

| 场景 | 用哪个 | 为什么 |
| --- | --- | --- |
| **营销 / 内容型**（落地页、文章、活动页，几乎不涉及键盘） | **方案一：svh（纯 CSS）** | 零 JS、最简单；`svh` 稳定不抖、底部永不遮挡 |
| **IM / 应用型**（聊天、后台、带输入框的 App，要覆盖老设备 / 国内 WebView） | **方案二：兼容性版本（已验证）** | JS 检测 + `dvh` 跟随工具栏/键盘动态变化 + polyfill 兜底老设备 |

一句话：**内容型用 svh，IM/应用型用兼容性版本。**

## 方案一：svh（营销 / 内容型）

纯 CSS，零依赖。模板 `templates/globals.css` 里的 `.h-svh-screen`：

```css
.h-svh-screen {
  height: 100vh;   /* 兜底，必须写在前 */
  height: 100svh;  /* 现代浏览器：稳定的小视口高度 */
}
```

Tailwind v3.4+ / v4 已内置 `h-svh`，直接 `className="h-svh"` 即可。对照 Demo：`/mobile-fullscreen-svh`（可实时切 svh/dvh/lvh 真机对比）。

## 方案二：兼容性版本（IM / 应用型，已生产验证）

基于特性检测的混合渐进增强：现代设备走 `dvh`（0 JS 开销），旧设备自动降级 JS Polyfill 写 `--app-height` 兜底。

```
应用初始化 → 支持 height:100dvh ?
  ├─ Yes（现代设备）→ CSS 直接 100dvh，JS 静默、0 开销
  └─ No （旧设备）  → JS 监听 resize → 写 --app-height → height:var(--app-height)
```

### 集成步骤

1. **根布局包 Provider**（`templates/use-mobile-viewport.tsx` → `hooks/`）：
   ```tsx
   import { ViewportStrategyProvider } from "@/hooks/use-mobile-viewport";
   // <body><ViewportStrategyProvider>{children}</ViewportStrategyProvider></body>
   ```
2. **CSS 三级回退**（`templates/globals.css` 的 `.h-dynamic-screen`）：
   ```css
   .h-dynamic-screen { height: var(--app-height, 100vh); }
   @supports (height: 100dvh) { .h-dynamic-screen { height: 100dvh; } }
   ```
3. **页面应用**：`<div className="h-dynamic-screen app-shell">…</div>`，用 `grid-rows-[auto_1fr_auto]` 让头尾固定、中间 `main` 内部滚动。

## 通用配套（两个方案都建议）

- **固定壳子 + 内部滚动**：外层 `overflow:hidden`，只让 `main` 滚（模板 `.app-shell` 已含）——顶层文档不滚，iOS 地址栏就不会来回收起。
- **刘海屏**：`viewport-fit:cover` + 给头尾加 `env(safe-area-inset-*)`（模板已含）。
- **橡皮筋**：`html,body { overscroll-behavior: none }`（模板已含）。
- **软键盘**（IM 常见）：viewport meta 加 `interactive-widget=resizes-content`，让键盘挤压布局而非遮挡输入框。

Next.js `app/layout.tsx`：
```ts
export const viewport: Viewport = {
  width: "device-width", initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content", // IM/带输入框时加
};
```

## 模板文件

| 模板 | 用于 | 说明 |
| --- | --- | --- |
| `templates/globals.css` | 两个方案 | svh / 兼容性版本 CSS + 固定壳子 + 安全区 |
| `templates/use-mobile-viewport.tsx` | 方案二 | 特性检测 + Provider + Polyfill 核心 Hook |
| `templates/demo-page.tsx` | 参考 | 完整 Demo：app shell + 当前方案实时检测 + 一键复制 Prompt |
| `templates/PROMPT.ts` | Vibe Coding | 结构化 prompt 文案，Demo 复制按钮写入剪贴板用 |

## 注意事项

- **选错场景**：营销页上兼容性版本（多几十行 JS）是浪费；IM 只用纯 svh 则少了老设备兜底与键盘跟随。按上表选。
- **方案二 `supportsDvh` 初始为 `null`（检测中）**：只有明确检测出 `false` 才 Polyfill，避免现代设备多余写入。
- **上线前真机验收**：至少一台 iOS（含刘海机）、一台 Android，IM 场景再测主力 WebView（如微信）。
- **依赖**：方案二 Hook 用到 lodash 的 `get` / `throttle`。

相关：布局壳子做好后若要服务端主动推数据，见 [[nextjs-sse-push]]；付费内容页的全屏预览遮罩见 [[nextjs-r2-paid-media]]。
