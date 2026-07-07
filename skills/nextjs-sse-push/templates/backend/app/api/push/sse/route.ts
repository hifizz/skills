/**
 * SSE 连接端点
 * GET /api/push/sse
 *
 * 前端 EventSource 连这里。鉴权后把连接交给 sseManager 托管。
 */

import type { NextRequest } from 'next/server';
import { sseManager } from '@/lib/push/sse-manager';

// SSE 是长连接，必须跑在 Node.js runtime 且不能被静态化
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * ⚠️ TODO: 替换成你项目的鉴权逻辑，返回当前登录用户的 userId。
 *
 * 注意：EventSource 不支持自定义 Header，鉴权只能靠 Cookie（同源自动携带，
 * 跨域需要 withCredentials: true）或 URL query token。
 *
 * @example next-auth:   const session = await auth(); return session?.user?.id ?? null;
 * @example better-auth: const session = await auth.api.getSession({ headers: await headers() }); return session?.user.id ?? null;
 * @example clerk:       const { userId } = await auth(); return userId;
 */
async function getAuthenticatedUserId(
  _request: NextRequest,
): Promise<string | null> {
  throw new Error('getAuthenticatedUserId 未实现：请接入你项目的鉴权');
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      return new Response('Unauthorized', { status: 401 });
    }

    // 如果需要「用户一上线就触发某些延迟任务」（如登录欢迎推送），
    // 在这里调用 queueClient.schedule(...)，用 jobId 防止重复调度。

    return sseManager.createConnection(userId, request);
  } catch (error) {
    console.error('[push:sse] 连接建立失败:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
