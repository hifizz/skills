import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db' // ← 换成你项目的 Drizzle db 实例导出
import { paidMediaConfig } from '@/lib/paid-media/config'
import { checkSingleMediaPermission } from '@/lib/paid-media/permission-service'
import { presignDownload } from '@/lib/paid-media/r2'
import { mediaAssets } from '@/lib/paid-media/schema'
import type { MediaAccessResponse } from '@/lib/paid-media/types'

const bodySchema = z.object({ mediaId: z.string().uuid() })

/**
 * POST /api/media/access — 策略 A：签发限时预签名 URL（默认访问策略）
 *
 * 鉴权 → 权限检查 → 签名。字节不经过服务器，浏览器直连 R2。
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await paidMediaConfig.getUserId(request.headers)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Valid mediaId is required' }, { status: 400 })
    }
    const { mediaId } = parsed.data

    const unlocked = await checkSingleMediaPermission(userId, mediaId)
    if (!unlocked) {
      return NextResponse.json(
        { error: 'Media not unlocked. Unlock it first.' },
        { status: 403 }
      )
    }

    const [asset] = await db
      .select({ r2Key: mediaAssets.r2Key })
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, mediaId), eq(mediaAssets.isActive, true)))
      .limit(1)

    if (!asset) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 })
    }

    const { url, expiresAt } = await presignDownload(asset.r2Key)

    const response: MediaAccessResponse = { success: true, mediaId, url, expiresAt }
    return NextResponse.json(response)
  } catch (error) {
    console.error('[paid-media] access error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
