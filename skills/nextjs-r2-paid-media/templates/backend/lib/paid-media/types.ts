/**
 * 前后端共享的类型。前端 Provider 也 import 这个文件（只有类型，无服务端代码）。
 */

export type PaidMediaType = 'IMAGE' | 'VIDEO'

/**
 * 下发给客户端的媒体条目 —— 注意：永远不包含 r2Key 或任何真实 URL。
 * 锁定态客户端能看到的全部信息就是这些。
 */
export interface PaidMediaItem {
  id: string
  mediaType: PaidMediaType
  creditsCost: number
  blurhash?: string | null
  width?: number
  height?: number
  /** 视频时长（秒） */
  duration?: number
  /** 服务端已知的解锁状态（列表接口带出，Provider 以此初始化缓存） */
  isUnlocked?: boolean
}

/** POST /api/media/access 响应 */
export interface MediaAccessResponse {
  success: boolean
  mediaId: string
  /** 限时预签名 URL */
  url: string
  /** ISO 时间串，Provider 据此安排自动续签 */
  expiresAt: string
}

/** POST /api/media/check-permissions 响应 */
export interface CheckPermissionsResponse {
  /** mediaId -> 是否已解锁 */
  permissions: Record<string, boolean>
}

/** POST /api/media/[mediaId]/unlock 响应 */
export interface UnlockResponse {
  success: boolean
  alreadyUnlocked?: boolean
  creditsCost?: number
  /** 计费 adapter 透传的信息（如剩余余额），业务自定义 */
  chargeInfo?: Record<string, unknown>
  error?: string
}
