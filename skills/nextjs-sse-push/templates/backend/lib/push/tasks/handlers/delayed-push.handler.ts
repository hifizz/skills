/**
 * 示例 Handler：延迟推送一条消息给用户
 *
 * 这是最通用的形态 —— payload 里直接带上通道和数据。
 * 业务侧照这个样子写自己的 Handler（比如先调 LLM 生成内容再推送、
 * 先查库判断用户状态再决定推不推），然后注册进 scripts/start-worker.ts。
 */

import type { ITaskHandler } from '../types';
import { pushToUser } from '../../publish';
import { presenceChecker } from '../../presence';

export interface DelayedPushPayload {
  userId: string;
  channel: string;
  data: unknown;
  /** 仅当用户在线时才推送（默认 false：离线也发布，走 onOfflineMessage 兜底） */
  onlineOnly?: boolean;
}

export const delayedPushHandler: ITaskHandler<DelayedPushPayload> = {
  name: 'delayed-push',

  async handle(job) {
    const { userId, channel, data, onlineOnly } = job.data;

    if (onlineOnly && !(await presenceChecker.isUserOnline(userId))) {
      console.log(`[delayed-push] 用户 ${userId} 离线，跳过`);
      return;
    }

    await pushToUser(userId, channel, data);
  },

  onFailed(job, error) {
    console.error(
      `[delayed-push] 最终失败 userId=${job?.data.userId}:`,
      error.message,
    );
  },
};
