#!/usr/bin/env tsx
/**
 * 手动推送测试脚本 —— 验证整条链路是否打通
 *
 * 用法：
 *   tsx scripts/test-push.ts <userId>                          # 推默认测试消息到 notification 通道
 *   tsx scripts/test-push.ts <userId> badge-update '{"n":3}'   # 指定通道和 JSON 数据
 *
 * 预期：浏览器里已登录该 userId 的页面立即收到消息（看控制台或你的通知 UI）。
 */

// 注意：按你的项目结构调整 import 路径
import { pushToUser } from '../src/lib/push/publish';
import { presenceChecker } from '../src/lib/push/presence';
import { getSharedRedis } from '../src/lib/push/redis';

async function main() {
  const [userId, channel = 'notification', json] = process.argv.slice(2);

  if (!userId) {
    console.error('用法: tsx scripts/test-push.ts <userId> [channel] [jsonData]');
    process.exit(1);
  }

  const data = json
    ? JSON.parse(json)
    : { title: '测试推送', body: `来自 test-push.ts 的消息 @ ${new Date().toISOString()}` };

  const online = await presenceChecker.isUserOnline(userId);
  console.log(`用户 ${userId} 在线状态: ${online ? '✅ 在线' : '❌ 离线（消息会进兜底逻辑）'}`);

  await pushToUser(userId, channel, data);
  console.log(`✅ 已发布到通道 "${channel}":`, data);

  await getSharedRedis().quit();
}

main().catch((err) => {
  console.error('❌ 推送失败:', err);
  process.exit(1);
});
