import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

/**
 * Cloudflare R2 存储层（S3 兼容 API）。仅服务端使用，凭证不出服务器。
 *
 * 环境变量：R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME
 */

// ==================== 可调常量 ====================

/** 下载用预签名 URL 有效期（秒）。防盗链敏感内容可调短到 300 */
export const DOWNLOAD_URL_TTL_SECONDS = 30 * 60

/** 上传用预签名 URL 有效期（秒） */
export const UPLOAD_URL_TTL_SECONDS = 15 * 60

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
export const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB

// ==================== 客户端 ====================

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME
  )
}

declare global {
  // eslint-disable-next-line no-var
  var __paidMediaR2Client: S3Client | undefined
}

export function getR2Client(): S3Client {
  if (globalThis.__paidMediaR2Client) return globalThis.__paidMediaR2Client

  if (!isR2Configured()) {
    throw new Error(
      'R2 not configured. Required env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME'
    )
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    // aws-sdk v3.729+ 默认的 flexible checksums 与 R2 不兼容（presigned 场景会
    // SignatureDoesNotMatch），必须显式降级为 WHEN_REQUIRED。升级 SDK 时不要删。
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })

  // dev 热重载复用；生产每实例一份也无妨
  if (process.env.NODE_ENV !== 'production') globalThis.__paidMediaR2Client = client
  return client
}

const bucket = () => process.env.R2_BUCKET_NAME!

// ==================== key 生成与校验 ====================

/**
 * 对象 key 白名单校验，防止 presign 接口被当成任意路径写入器。
 * 按需扩展 pattern，但保持白名单思路。
 */
export function isValidObjectKey(key: string): boolean {
  const allowedPatterns = [
    /^images\/[a-zA-Z0-9-_]+\.(jpg|jpeg|png|webp|gif)$/i,
    /^videos\/[a-zA-Z0-9-_]+\.(mp4|webm|mov)$/i,
    /^media-thumbnails-blur\/[a-zA-Z0-9-_]+\.(jpg|jpeg|png|webp)$/i,
  ]
  return allowedPatterns.some((p) => p.test(key))
}

/** 由资产 id 生成标准存储 key：images/{id}.jpg / videos/{id}.mp4 */
export function buildObjectKey(assetId: string, mediaType: 'IMAGE' | 'VIDEO', filename: string): string {
  const extension = filename.split('.').pop()?.toLowerCase() || (mediaType === 'IMAGE' ? 'jpg' : 'mp4')
  const folder = mediaType === 'IMAGE' ? 'images' : 'videos'
  const key = `${folder}/${assetId}.${extension}`
  if (!isValidObjectKey(key)) {
    throw new Error(`Invalid object key: ${key}`)
  }
  return key
}

// ==================== 预签名 ====================

/** 签发限时下载 URL（解锁校验通过后调用）。浏览器直连 R2，原生支持 Range/视频流 */
export async function presignDownload(
  key: string,
  ttlSeconds: number = DOWNLOAD_URL_TTL_SECONDS
): Promise<{ url: string; expiresAt: string }> {
  const url = await getSignedUrl(
    getR2Client(),
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
    { expiresIn: ttlSeconds }
  )
  return { url, expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString() }
}

/** 签发浏览器直传用的 PUT 链接；ContentType 参与签名，客户端篡改即 403 */
export async function presignUpload(
  key: string,
  contentType: string
): Promise<{ uploadUrl: string; key: string }> {
  if (!isValidObjectKey(key)) {
    throw new Error(`Invalid object key: ${key}`)
  }
  const uploadUrl = await getSignedUrl(
    getR2Client(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS, signableHeaders: new Set(['content-type']) }
  )
  return { uploadUrl, key }
}

// ==================== 直接操作（服务端凭证） ====================

/** 服务端直传（运营灌数据 / 脚本用） */
export async function putObject(key: string, body: Uint8Array, contentType: string): Promise<void> {
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: body.byteLength,
    })
  )
}

/** 确认对象存在（上传完成回调校验用），返回大小；不存在返回 null */
export async function headObject(key: string): Promise<{ size: number } | null> {
  try {
    const res = await getR2Client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }))
    return { size: res.ContentLength ?? 0 }
  } catch {
    return null
  }
}

export async function deleteObject(key: string): Promise<void> {
  await getR2Client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }))
}
