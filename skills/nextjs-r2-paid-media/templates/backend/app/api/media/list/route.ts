import { NextRequest, NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db' // ← 换成你项目的 Drizzle db 实例导出
import { paidMediaConfig } from '@/lib/paid-media/config'
import { checkBatchMediaPermissions } from '@/lib/paid-media/permission-service'
import { mediaAssets } from '@/lib/paid-media/schema'
import type { PaidMediaItem } from '@/lib/paid-media/types'

/**
 * GET /api/media/list — 媒体列表（demo 页在用；正式业务通常有自己的列表接口）
 *
 * 序列化边界：只下发 PaidMediaItem 字段，r2Key / 真实 URL 在这一层被杜绝，
 * 而不是靠前端「不显示」。你自己的列表接口也务必遵守这条。
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await paidMediaConfig.getUserId(request.headers)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const assets = await db
      .select({
        id: mediaAssets.id,
        mediaType: mediaAssets.mediaType,
        creditsCost: mediaAssets.creditsCost,
        blurhash: mediaAssets.blurhash,
        metadata: mediaAssets.metadata,
      })
      .from(mediaAssets)
      .where(eq(mediaAssets.isActive, true))
      .orderBy(desc(mediaAssets.createdAt))
      .limit(50)

    const permissions = await checkBatchMediaPermissions(
      userId,
      assets.map((a) => a.id)
    )

    const items: PaidMediaItem[] = assets.map((a) => ({
      id: a.id,
      mediaType: a.mediaType,
      creditsCost: a.creditsCost,
      blurhash: a.blurhash,
      width: a.metadata?.width,
      height: a.metadata?.height,
      duration: a.metadata?.duration,
      isUnlocked: permissions[a.id] ?? false,
    }))

    return NextResponse.json({ items })
  } catch (error) {
    console.error('[paid-media] list error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
