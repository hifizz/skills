/**
 * TaskWorker —— 队列的「消费者」端，跑在独立进程里
 *
 * 职责：
 * - 从 Redis 队列取任务，按 job.name 分发到注册的 Handler
 * - 管理重试 / 失败回调 / 优雅关闭
 * - 可选：注册 Repeatable Jobs（cron 定时任务，如每日定点推送）
 *
 * 不要在 Next.js 进程里实例化它 —— 用 scripts/start-worker.ts 独立启动。
 */

import { Worker, Queue, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { createBullMQRedis } from '../redis';
import { DEFAULT_QUEUE_NAME, type ITaskHandler } from './types';

export interface RepeatableJobConfig {
  /** 对应 Handler 的 name */
  name: string;
  /** cron 表达式，如 '25 * * * *'（每小时第 25 分） */
  pattern: string;
  jobId?: string;
  payload?: unknown;
}

export interface TaskWorkerOptions {
  queueName?: string;
  /** 并发数：I/O 密集型任务 10 左右，CPU 密集型降到 2-5 */
  concurrency?: number;
  /** cron 定时任务列表 */
  repeatable?: RepeatableJobConfig[];
}

export class TaskWorker {
  private worker: Worker;
  private handlers = new Map<string, ITaskHandler>();
  private connection: Redis;
  private schedulerQueue: Queue | null = null;
  private readonly queueName: string;

  constructor(
    handlers: ITaskHandler[],
    options: TaskWorkerOptions = {},
  ) {
    this.queueName = options.queueName ?? DEFAULT_QUEUE_NAME;
    handlers.forEach((h) => this.handlers.set(h.name, h));

    this.connection = createBullMQRedis();
    this.worker = new Worker(this.queueName, this.processJob, {
      connection: this.connection,
      concurrency: options.concurrency ?? 10,
    });

    this.registerListeners();
    console.log(
      `[push:worker] 已启动，队列=${this.queueName}，handlers=[${[...this.handlers.keys()].join(', ')}]`,
    );

    if (options.repeatable?.length) {
      void this.setupRepeatableJobs(options.repeatable);
    }
  }

  private processJob = async (job: Job): Promise<void> => {
    const handler = this.handlers.get(job.name);
    if (!handler) {
      throw new Error(`No handler registered for task: ${job.name}`);
    }
    await handler.handle(job);
  };

  private registerListeners(): void {
    this.worker.on('completed', (job: Job, result: unknown) => {
      console.log(`[push:worker] ✅ ${job.name} 完成 (id=${job.id})`);
      this.handlers.get(job.name)?.onCompleted?.(job, result);
    });

    this.worker.on('failed', (job: Job | undefined, error: Error) => {
      console.error(
        `[push:worker] ❌ ${job?.name ?? 'unknown'} 失败 (id=${job?.id}):`,
        error.message,
      );
      if (job) {
        this.handlers.get(job.name)?.onFailed?.(job, error);
      }
    });

    this.worker.on('error', (error: Error) => {
      console.error('[push:worker] Worker 错误:', error.message);
    });

    this.worker.on('stalled', (jobId: string) => {
      console.warn(`[push:worker] ⏱️ 任务停滞: ${jobId}`);
    });
  }

  /**
   * 注册 cron 定时任务。
   * 先删后加：配置（pattern）变更时清掉旧的定时配置，防止僵尸任务。
   */
  private async setupRepeatableJobs(
    jobs: RepeatableJobConfig[],
  ): Promise<void> {
    try {
      this.schedulerQueue = new Queue(this.queueName, {
        connection: createBullMQRedis(),
      });

      const existing = await this.schedulerQueue.getRepeatableJobs();

      for (const config of jobs) {
        for (const old of existing.filter((j) => j.name === config.name)) {
          await this.schedulerQueue.removeRepeatableByKey(old.key);
        }

        await this.schedulerQueue.add(config.name, config.payload ?? {}, {
          repeat: { pattern: config.pattern },
          jobId: config.jobId ?? `${config.name}-repeatable`,
          removeOnComplete: true,
          removeOnFail: false,
        });

        console.log(
          `[push:worker] 🕐 定时任务已注册: ${config.name} (${config.pattern})`,
        );
      }
    } catch (err) {
      console.error('[push:worker] 定时任务注册失败:', err);
    }
  }

  /** 优雅关闭：等当前任务跑完，再关 Redis 连接（不关会导致进程退不出去） */
  async close(): Promise<void> {
    await this.worker.close();

    if (this.schedulerQueue) {
      await this.schedulerQueue.close();
    }

    try {
      await this.connection.quit();
    } catch {
      this.connection.disconnect();
    }
    console.log('[push:worker] 已关闭');
  }
}
