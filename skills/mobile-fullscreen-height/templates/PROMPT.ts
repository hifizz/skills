export const PROMPT_TEXT = `
# 1\. Context & Problem (背景与痛点)
这是一段解决【React Next.js 移动端/移动端 Web 开发】领域的【全屏视口高度适配】解决方案。 问题产生的主要原因是：【移动端浏览器（特别是 iOS Safari）的地址栏和工具栏会随滚动动态伸缩，导致原生 \`100vh\` 计算的高度往往超出实际可视区域，从而遮挡底部内容或导致滚动体验不佳】。

# 2\. Our Solution (解决方案核心)
我们采用了一种【基于特性检测的渐进增强 (Hybrid Progressive Enhancement)】方案。 核心逻辑是利用 \`window.CSS.supports\` 进行环境检测：
*   **对于现代设备 (支持 dvh)**：直接使用 CSS 的 \`100dvh\` 单位，**完全不运行** JS Resize 监听逻辑，以达到极致性能（0 JS 开销）。
*   **对于旧设备 (不支持 dvh)**：自动降级为 JS Polyfill 模式，监听 \`resize\` 事件，计算 \`window.innerHeight\` 并将其写入 CSS 变量 \`--app-height\`，同时配合防抖 (throttle) 优化性能。
（若是营销 / 内容型页面、不涉及键盘交互，可把下面 CSS 里的 \`100dvh\` 换成 \`100svh\`，获得更稳定、滚动不抖的高度。）


# 3\. Reference Implementation (源码参考)

请阅读下面我们已经验证过的生产环境代码，并以此为蓝本生成代码。

## 【Hook 代码参考】

*源文件：\`use-mobile-viewport.tsx\`*

\`\`\`typescript
"use client";

import React, {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
} from "react";
import { get, throttle } from "lodash";

export type ViewportStrategy = {
  supportsDvh: boolean | null;
};

const INITIAL_VIEWPORT_STRATEGY: ViewportStrategy = {
  supportsDvh: null,
};

const ViewportStrategyContext = createContext<ViewportStrategy | null>(null);

const detectViewportStrategy = (): ViewportStrategy => {
  if (typeof window === "undefined") {
    return {
      supportsDvh: false,
    };
  }

  const cssSupports = get(
    window,
    ["CSS", "supports"],
    null
  ) as ((property: string, value: string) => boolean) | null;

  const supportsDvh =
    typeof cssSupports === "function" ? cssSupports("height", "100dvh") : false;

  return {
    supportsDvh,
  };
};

const scheduleMicrotask = (callback: () => void) => {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(callback);
    return;
  }

  Promise.resolve().then(callback);
};

const useProvideViewportStrategy = (): ViewportStrategy => {
  const [strategy, setStrategy] = useState<ViewportStrategy>(INITIAL_VIEWPORT_STRATEGY);

  useLayoutEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const commitStrategy = throttle(() => {
      setStrategy(detectViewportStrategy());
    }, 200);

    scheduleMicrotask(commitStrategy);

    window.addEventListener("resize", commitStrategy);
    window.addEventListener("orientationchange", commitStrategy);

    return () => {
      window.removeEventListener("resize", commitStrategy);
      window.removeEventListener("orientationchange", commitStrategy);
      commitStrategy.cancel();
    };
  }, []);

  return strategy;
};

const useViewportHeightPolyfill = (shouldApplyPolyfill: boolean) => {
  useLayoutEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    if (!shouldApplyPolyfill) {
      document.documentElement.style.removeProperty("--app-height");
      return;
    }

    const setAppHeight = () => {
      const appHeight = \`\${window.innerHeight}px\`;
      document.documentElement.style.setProperty("--app-height", appHeight);
    };

    const syncAppHeight = throttle(setAppHeight, 100);

    setAppHeight();
    window.addEventListener("resize", syncAppHeight);
    window.addEventListener("orientationchange", syncAppHeight);

    return () => {
      syncAppHeight.cancel();
      window.removeEventListener("resize", syncAppHeight);
      window.removeEventListener("orientationchange", syncAppHeight);
    };
  }, [shouldApplyPolyfill]);
};

export const ViewportStrategyProvider = ({ children }: { children: React.ReactNode }) => {
  const strategy = useProvideViewportStrategy();
  const shouldApplyPolyfill = strategy.supportsDvh === false;
  useViewportHeightPolyfill(shouldApplyPolyfill);

  return (
    <ViewportStrategyContext.Provider value={strategy}>
      {children}
    </ViewportStrategyContext.Provider>
  );
};

export const useViewportStrategy = () => {
  const context = useContext(ViewportStrategyContext);
  if (!context) {
    throw new Error(
      "useViewportStrategy 必须在 ViewportStrategyProvider 中使用"
    );
  }
  return context;
};
\`\`\`

## 【CSS 代码参考】

*说明：这是实现渐进增强的关键样式，请保留逻辑*

\`\`\`css
.h-dynamic-screen {
  /* 降级方案：由JS Hook提供值。100vh是JS失效时的备用 */
  height: var(--app-height, 100vh);
}

@supports (height: 100dvh) {
  /* 现代浏览器优先使用此方案，JS Hook会检测到并自动跳过执行 */
  .h-dynamic-screen {
    height: 100dvh;
  }
}
\`\`\`

## 【Div/容器代码参考】

*源文件：\`page.tsx\` 中的 Layout 组件*

\`\`\`typescript
// Layout Component (Single Responsibility: Defining the page grid structure)
const MobileLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <>
      {/* CSS 样式通常放在全局文件中，这里为了演示放在了 style 标签里 */}
      <style>{ \`
        .h-dynamic-screen {
          height: var(--app-height, 100vh);
        }
        @supports (height: 100dvh) {
          .h-dynamic-screen {
            height: 100dvh;
          }
        }
      \`}</style>

      {/* grid-rows-[auto_1fr_auto] 确保了 Header/Footer 高度自适应，中间区域自动填满 */}
      <div className="h-dynamic-screen bg-gray-100 grid grid-rows-[auto_1fr_auto] font-sans">
        <Header />

        <main className="overflow-y-auto">{children}</main>

        <Footer />
      </div>
    </>
  );
};
\`\`\`
`
