/**
 * 任务系统类型定义
 */

import type { Job, KeepJobs } from 'bullmq';

/** 默认队列名，需要多队列（如按优先级拆分）时自行扩展 */
export const DEFAULT_QUEUE_NAME = process.env.PUSH_QUEUE_NAME || 'push-tasks';

/**
 * 任务处理器接口。每种任务实现一个 Handler，注册到 Worker。
 * T 是任务负载（payload）的类型。
 */
export interface ITaskHandler<T = unknown> {
  /** 处理器名称，调度时的 taskName 必须与它完全一致 */
  name: string;
  /** 核心处理逻辑：查数据、生成内容、调用 pushToUser 等 */
  handle(job: Job<T>): Promise<void>;
  /** [可选] 任务最终失败（重试耗尽）时的回调 */
  onFailed?(job: Job<T> | undefined, error: Error): void;
  /** [可选] 任务完成时的回调 */
  onCompleted?(job: Job<T>, result: unknown): void;
}

/** 任务调度选项 */
export interface ScheduleOptions<T> {
  payload: T;
  /** 延迟执行的毫秒数 */
  delay?: number;
  /**
   * 自定义任务 ID。相同 jobId 的任务在完成前不会重复入队，
   * 是防止重复调度的关键手段（如 `welcome-${userId}-${date}`）
   */
  jobId?: string;
  /** 完成后是否自动删除（传 { age: 秒数 } 可保留一段时间便于排查） */
  removeOnComplete?: boolean | KeepJobs;
  /** 失败后是否自动删除 */
  removeOnFail?: boolean | KeepJobs;
}
