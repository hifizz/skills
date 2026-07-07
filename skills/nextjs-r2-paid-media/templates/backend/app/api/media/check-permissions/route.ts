import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { paidMediaConfig } from '@/lib/paid-media/config'
import { checkBatchMediaPermissions } from '@/lib/paid-media/permission-service'
import type { CheckPermissionsResponse } from '@/lib/paid-media/types'

const bodySchema = z.object({
  mediaIds: z.array(z.string().uuid()).min(1).max(100),
})

/**
 * POST /api/media/check-permissions — 批量查解锁状态
 *
 * 列表页挂载时调用一次，Provider 把结果进内存缓存；
 * 不要每个媒体卡片各发一个请求。
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await paidMediaConfig.getUserId(request.headers)
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'mediaIds must be 1-100 valid UUIDs' },
        { status: 400 }
      )
    }

    const permissions = await checkBatchMediaPermissions(userId, parsed.data.mediaIds)

    const response: CheckPermissionsResponse = { permissions }
    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    })
  } catch (error) {
    console.error('[paid-media] check-permissions error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
