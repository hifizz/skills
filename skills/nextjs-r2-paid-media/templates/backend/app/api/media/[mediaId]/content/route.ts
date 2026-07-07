import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db' // ← 换成你项目的 Drizzle db 实例导出
import { paidMediaConfig } from '@/lib/paid-media/config'
import { checkSingleMediaPermission } from '@/lib/paid-media/permission-service'
import { presignDownload } from '@/lib/paid-media/r2'
import { mediaAssets } from '@/lib/paid-media/schema'

const paramsSchema = z.object({ mediaId: z.string().uuid() })

/**
 * GET /api/media/{mediaId}/content — 策略 B：服务器代理流（备选访问策略）
 *
 * 每个字节都经过权限检查，可即时撤销；代价是双倍带宽 + 吃函数时长。
 * 单价极高、需要秒级撤销权限的内容才用它；一般场景用 /api/media/access（策略 A）。
 *
 * 前端用法：<img src={`/api/media/${id}/content`} /> 或 <video src=...>，
 * URL 稳定不过期，无需 Provider 管理生命周期。
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const userId = await paidMediaConfig.getUserId(request.headers)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = paramsSchema.safeParse(await params)
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
      .select({
        r2Key: mediaAssets.r2Key,
        mimeType: mediaAssets.mimeType,
        filename: mediaAssets.filename,
      })
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, mediaId), eq(mediaAssets.isActive, true)))
      .limit(1)

    if (!asset) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 })
    }

    // 服务端内部签一个短时 URL 去取字节（凭证不出服务器，也无需公开桶）
    const { url } = await presignDownload(asset.r2Key, 60)

    // 透传 Range 头，视频拖进度条依赖它
    const upstreamHeaders: HeadersInit = {}
    const range = request.headers.get('Range')
    if (range) upstreamHeaders['Range'] = range

    const upstream = await fetch(url, { headers: upstreamHeaders })
    if (!upstream.ok && upstream.status !== 206) {
      console.error('[paid-media] R2 fetch failed:', upstream.status)
      return NextResponse.json({ error: 'Failed to fetch media from storage' }, { status: 502 })
    }

    const headers = new Headers({
      'Content-Type': asset.mimeType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
    })
    // 非 ASCII 文件名要用 RFC 5987 编码
    headers.set(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(asset.filename)}`
    )
    for (const h of ['Content-Length', 'Content-Range'] as const) {
      const v = upstream.headers.get(h)
      if (v) headers.set(h, v)
    }

    return new Response(upstream.body, { status: upstream.status, headers })
  } catch (error) {
    console.error('[paid-media] content proxy error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
