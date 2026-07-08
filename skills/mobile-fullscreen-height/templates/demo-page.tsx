'use client';

import React, { useState, useMemo } from 'react';
import {
  ViewportStrategyProvider,
  useViewportStrategy,
} from '@/app/mobile-fullscreen/hooks/use-mobile-viewport';
import { PROMPT_TEXT } from './PROMPT';

// Icons
const HomeIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);
const SearchIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);
const UserIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

// [新增] 这是一个独立的组件，用于检测并显示当前所采用的布局方案。
const StrategyInfo = () => {
  const { supportsDvh } = useViewportStrategy();

  const label = useMemo(() => {
    if (supportsDvh === null) return '布局方案检测中...';
    if (supportsDvh) return '原生 CSS `dvh` 方案 (性能最佳)';
    return 'JavaScript Polyfill `--app-height` 方案 (兼容性最佳)';
  }, [supportsDvh]);

  return (
    <div className="bg-white dark:bg-neutral-900 p-6 rounded-lg shadow ">
      <h3 className="font-bold mb-1">当前布局方案:</h3>
      <p>{label}</p>
    </div>
  );
};

const CopyPromptButton = () => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(PROMPT_TEXT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="bg-white dark:bg-neutral-900 p-6 rounded-lg shadow">
      <h3 className="font-bold mb-2">如何复用此方案？</h3>
      <p className=" mb-4 text-sm">
        点击下方按钮复制 Prompt，发送给 LLM (如 ChatGPT,
        Claude)，让它帮你快速集成这个移动端高度解决方案。
      </p>
      <button
        onClick={handleCopy}
        className={`w-full py-2 px-4 rounded-md transition-colors flex items-center justify-center gap-2 ${
          copied
            ? 'bg-green-100 text-green-700'
            : 'bg-neutral-600 text-white hover:bg-neutral-700 active:bg-neutral-800'
        }`}
      >
        {copied ? (
          <>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            已复制 Prompt
          </>
        ) : (
          <>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
            </svg>
            一键复制 Prompt 去 Vibe Coding
          </>
        )}
      </button>
    </div>
  );
};

// Header Component (Single Responsibility: Displaying the header)
const Header = () => {
  return (
    <header className="bg-white dark:bg-neutral-900 shadow-md w-full p-4 flex items-center justify-center z-10">
      <h1 className="text-xl font-bold text-gray-800 dark:text-gray-50">
        移动应用标题
      </h1>
    </header>
  );
};

// Footer Component (Single Responsibility: Displaying the footer navigation)

type FooterNavItemConfig = {
  href: string;
  label: string;
  Icon: React.ComponentType;
  isActive?: boolean;
};

const footerNavItems: FooterNavItemConfig[] = [
  { href: '#home', label: '首页', Icon: HomeIcon, isActive: true },
  { href: '#search', label: '发现', Icon: SearchIcon },
  { href: '#profile', label: '我的', Icon: UserIcon },
];

const FooterNavItem = ({
  href,
  label,
  Icon,
  isActive,
}: FooterNavItemConfig) => (
  <a
    href={href}
    className={`flex flex-col items-center ${
      isActive ? 'text-neutral-600 dark:text-neutral-100' : 'text-neutral-600 dark:text-neutral-400'
    } hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors`}
  >
    <Icon />
    <span className="text-xs mt-1">{label}</span>
  </a>
);

const Footer = () => {
  return (
    <footer className="bg-white dark:bg-neutral-900 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] w-full p-2 z-10">
      <nav className="flex justify-around items-center">
        {footerNavItems.map((item) => (
          <FooterNavItem key={item.href} {...item} />
        ))}
      </nav>
    </footer>
  );
};

// Main Scrollable Content (Single Responsibility: Displaying page content)
const PageContent = () => {
  return (
    <div className="p-4 space-y-4">
      <div className="bg-white dark:bg-neutral-900 p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-2">欢迎！</h2>
        <p className="">
          向下滚动以查看更多内容。此布局可以完美适配移动设备，并解决了 iOS
          浏览器滚动时底部工具栏高度变化带来的页面跳动问题。
        </p>
      </div>

      {/* 在这里新增了用于展示当前方案的组件 */}
      <StrategyInfo />
      <CopyPromptButton />

      {Array.from({ length: 20 }).map((_, index) => (
        <div
          key={index}
          className="bg-white dark:bg-neutral-900 p-4 rounded-lg shadow animate-pulse"
        >
          <div className="h-4 bg-gray-200 dark:bg-neutral-700 rounded w-3/4 mb-2"></div>
          <div className="h-4 bg-gray-200 dark:bg-neutral-700 rounded w-1/2"></div>
        </div>
      ))}
      <div className="bg-white dark:bg-neutral-800 p-6 rounded-lg shadow mt-4 text-center">
        <p className=" font-semibold">内容到底啦！</p>
      </div>
    </div>
  );
};

// Layout Component (Single Responsibility: Defining the page grid structure)
const MobileLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <>
      <style>{`
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
      `}</style>

      <div className="h-dynamic-screen bg-gray-100 dark:bg-black grid grid-rows-[auto_1fr_auto] font-sans">
        <Header />

        <main className="overflow-y-auto">{children}</main>

        <Footer />
      </div>
    </>
  );
};

// App Component: The entry point that assembles the layout and content.
export default function App() {
  return (
    <ViewportStrategyProvider>
      <MobileLayout>
        <PageContent />
      </MobileLayout>
    </ViewportStrategyProvider>
  );
}
