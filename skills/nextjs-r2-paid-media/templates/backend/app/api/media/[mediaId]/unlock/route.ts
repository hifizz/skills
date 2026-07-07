import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { paidMediaConfig } from '@/lib/paid-media/config'
import { unlockMedia } from '@/lib/paid-media/unlock-service'

const paramsSchema = z.object({ mediaId: z.string().uuid() })

/**
 * POST /api/media/{mediaId}/unlock — 解锁媒体
 *
 * 事务内：查已解锁 → charge 扣费（config.ts 注入） → 写解锁记录。
 * 重复调用返回 alreadyUnlocked: true，不会重复扣费。
 */
export async function POST(
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

    const result = await unlockMedia(userId, parsed.data.mediaId)

    if (!result.success) {
      // 扣费被拒（余额不足等）返回 402，媒体不存在返回 404
      const status = result.error === 'Media not found or inactive' ? 404 : 402
      return NextResponse.json(result, { status })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[paid-media] unlock error:', error)
    return NextResponse.json({ error: 'Failed to unlock media' }, { status: 500 })
  }
}
