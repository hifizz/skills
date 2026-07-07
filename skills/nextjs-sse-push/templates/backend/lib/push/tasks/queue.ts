/**
 * QueueClient —— 队列的「生产者」端，跑在 Next.js 进程里
 *
 * 职责：只往 Redis 队列里加任务，不执行任务。
 * 任务的执行在独立的 Worker 进程（scripts/start-worker.ts）。
 * 两个进程通过 Redis 队列解耦，Next.js 重启/扩缩容不影响任务执行。
 *
 * @example
 * import { queueClient } from '@/lib/push/tasks/queue';
 *
 * await queueClient.schedule('delayed-push', {
 *   payload: { userId, channel: 'notification', data: { title: '嗨' } },
 *   delay: 60_000,                        // 1 分钟后执行
 *   jobId: `notify-${userId}-${date}`,    // 防重复调度
 * });
 */

import { Queue, type Job } from 'bullmq';
import { createBullMQRedis } from '../redis';
import { DEFAULT_QUEUE_NAME, type ScheduleOptions } from './types';

export class QueueClient {
  private queue: Queue;

  constructor(queueName: string = DEFAULT_QUEUE_NAME) {
    this.queue = new Queue(queueName, { connection: createBullMQRedis() });
  }

  async schedule<T = unknown>(
    taskName: string,
    options: ScheduleOptions<T>,
  ): Promise<Job> {
    const { payload, delay, jobId, removeOnComplete, removeOnFail } = options;

    return await this.queue.add(taskName, payload, {
      delay,
      jobId,
      attempts: 3,
      backoff: { type: 'fixed', delay: 5000 },
      removeOnComplete: removeOnComplete ?? false,
      removeOnFail: removeOnFail ?? false,
    });
  }

  /** 取消一个已调度但未执行的任务（不存在时静默返回） */
  async removeJob(jobId: string): Promise<void> {
    const job = await this.queue.getJob(jobId);
    if (job) {
      await job.remove();
    }
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}

// globalThis 缓存，防止 dev 热重载重复建连
const globalForQueue = globalThis as unknown as { __queueClient?: QueueClient };

export const queueClient = globalForQueue.__queueClient ?? new QueueClient();

if (process.env.NODE_ENV !== 'production') {
  globalForQueue.__queueClient = queueClient;
}
