"use client";

import React, {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
} from "react";
import { get, throttle } from "lodash";

export type ViewportStrategy = {
  /** 是否支持动态视口高度单位 (dvh) */
  supportsDvh: boolean | null;
};

const INITIAL_VIEWPORT_STRATEGY: ViewportStrategy = {
  supportsDvh: null,
};

const ViewportStrategyContext = createContext<ViewportStrategy | null>(null);

/**
 * 检测当前环境是否支持 CSS 的 dvh 单位
 *
 * @returns {ViewportStrategy} 返回包含检测结果的策略对象
 */
const detectViewportStrategy = (): ViewportStrategy => {
  // 服务端渲染时，无法检测，默认为不支持
  if (typeof window === "undefined") {
    return {
      supportsDvh: false,
    };
  }

  // 安全地获取 CSS.supports 方法
  const cssSupports = get(
    window,
    ["CSS", "supports"],
    null
  ) as ((property: string, value: string) => boolean) | null;

  // 检测浏览器是否支持 dvh 单位
  const supportsDvh =
    typeof cssSupports === "function" ? cssSupports("height", "100dvh") : false;

  return {
    supportsDvh,
  };
};

/**
 * 调度一个微任务，用于在当前渲染周期结束后立即执行状态更新
 * 优先使用 queueMicrotask，降级使用 Promise
 */
const scheduleMicrotask = (callback: () => void) => {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(callback);
    return;
  }

  Promise.resolve().then(callback);
};

/**
 * 核心 Hook：提供视口策略的状态管理
 * 负责监听窗口大小变化和方向变化，重新检测策略
 */
const useProvideViewportStrategy = (): ViewportStrategy => {
  const [strategy, setStrategy] = useState<ViewportStrategy>(INITIAL_VIEWPORT_STRATEGY);

  useLayoutEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    // 使用 throttle 节流，避免 resize 事件触发过于频繁
    const commitStrategy = throttle(() => {
      setStrategy(detectViewportStrategy());
    }, 200);

    // 初始检测
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

/**
 * Polyfill Hook：当不支持 dvh 时，应用 JS 补丁
 * 通过设置 CSS 变量 --app-height 来模拟 100vh
 *
 * @param shouldApplyPolyfill 是否应该应用 Polyfill
 */
const useViewportHeightPolyfill = (shouldApplyPolyfill: boolean) => {
  useLayoutEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    // 如果不需要 Polyfill（即支持 dvh），则移除 CSS 变量
    if (!shouldApplyPolyfill) {
      document.documentElement.style.removeProperty("--app-height");
      return;
    }

    const setAppHeight = () => {
      // 获取当前的内部高度（不受地址栏显隐影响的真实可视高度）
      const appHeight = `${window.innerHeight}px`;
      document.documentElement.style.setProperty("--app-height", appHeight);
    };

    // 节流更新，减少重排重绘
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

/**
 * Provider 组件：全局注入视口策略
 * 1. 初始化策略检测
 * 2. 自动根据策略应用或移除 Polyfill
 * 3. 向下传递当前的策略状态
 */
export const ViewportStrategyProvider = ({ children }: { children: React.ReactNode }) => {
  const strategy = useProvideViewportStrategy();
  // 当明确检测出不支持 dvh 时，才应用 Polyfill（null 表示还在检测中，不应用）
  const shouldApplyPolyfill = strategy.supportsDvh === false;

  useViewportHeightPolyfill(shouldApplyPolyfill);

  return (
    <ViewportStrategyContext.Provider value={strategy}>
      {children}
    </ViewportStrategyContext.Provider>
  );
};

/**
 * Consumer Hook：在组件中获取当前的视口策略
 * 必须在 ViewportStrategyProvider 内部使用
 */
export const useViewportStrategy = () => {
  const context = useContext(ViewportStrategyContext);
  if (!context) {
    throw new Error(
      "useViewportStrategy 必须在 ViewportStrategyProvider 中使用"
    );
  }
  return context;
};
