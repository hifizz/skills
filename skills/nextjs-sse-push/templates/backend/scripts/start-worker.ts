#!/usr/bin/env tsx
/**
 * BullMQ Worker 启动脚本 —— 独立进程，不依赖 Next.js
 *
 * 开发：  tsx --watch scripts/start-worker.ts   （建议配 concurrently 和 next dev 一起跑）
 * 生产：  tsx scripts/start-worker.ts           （Docker/Fly.io/Railway 单独起一个进程）
 *
 * package.json 建议：
 *   "dev:worker": "tsx --watch scripts/start-worker.ts",
 *   "dev:all": "concurrently \"pnpm dev\" \"pnpm dev:worker\" --names \"web,worker\"",
 *   "worker": "tsx scripts/start-worker.ts"
 */

// 注意：按你的项目结构调整 import 路径（这里假设代码在 src/lib/push 下）
import { TaskWorker } from '../src/lib/push/tasks/worker';
import { delayedPushHandler } from '../src/lib/push/tasks/handlers/delayed-push.handler';

function validateEnvironment() {
  if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
    console.error('[Worker] ❌ 缺少 REDIS_URL（或 REDIS_HOST）环境变量');
    process.exit(1);
  }
}

async function main() {
  console.log('🚀 BullMQ Worker starting...');
  validateEnvironment();

  const worker = new TaskWorker(
    [
      delayedPushHandler,
      // 👇 在这里注册你的业务 Handler
    ],
    {
      concurrency: 10,
      // 👇 需要 cron 定时任务时在这里声明，如：
      // repeatable: [{ name: 'daily-digest-dispatch', pattern: '30 8 * * *' }],
    },
  );

  const gracefulShutdown = async (signal: string) => {
    console.log(`\n[Worker] 收到 ${signal}，开始优雅关闭...`);

    // 超时保护：10 秒关不掉就强杀，防止进程挂死
    const timeout = setTimeout(() => {
      console.error('[Worker] ⚠️ 关闭超时，强制退出');
      process.exit(1);
    }, 10_000);

    try {
      await worker.close();
      clearTimeout(timeout);
      process.exit(0);
    } catch (error) {
      console.error('[Worker] 关闭出错:', error);
      clearTimeout(timeout);
      process.exit(1);
    }
  };

  process.once('SIGTERM', () => void gracefulShutdown('SIGTERM'));
  process.once('SIGINT', () => void gracefulShutdown('SIGINT'));

  process.on('uncaughtException', (error) => {
    console.error('[Worker] 💥 Uncaught Exception:', error);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[Worker] 💥 Unhandled Rejection:', reason);
    process.exit(1);
  });

  console.log('[Worker] 🎉 就绪，等待任务...\n');
}

main().catch((error) => {
  console.error('[Worker] ❌ 启动失败:', error);
  process.exit(1);
});
