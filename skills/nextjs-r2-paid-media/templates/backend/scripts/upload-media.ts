/**
 * 运营灌数据脚本：上传本地文件到 R2 私有桶 + 登记 media_assets + 生成付费预览。
 *
 * 用法：
 *   pnpm tsx scripts/upload-media.ts ./photo.jpg --cost 10
 *   pnpm tsx scripts/upload-media.ts ./clip.mp4 --cost 30 --poster ./clip-frame.jpg
 *
 * 额外依赖（仅脚本用，不进应用 bundle）：
 *   pnpm add -D sharp blurhash tsx
 *
 * 做四件事：
 *   1. 原始文件 → R2 私有桶 images/{id}.ext 或 videos/{id}.ext
 *   2. 用 sharp 算 blurhash（视频用 --poster 提供的封面帧）
 *   3. 生成高斯模糊缩略图 → R2 media-thumbnails-blur/{id}.jpg（可走公开域名）
 *   4. 插入 media_assets 记录
 */
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { encode } from 'blurhash'
import sharp from 'sharp'
import { db } from '@/lib/db' // ← 换成你项目的 Drizzle db 实例导出
import { buildObjectKey, putObject } from '@/lib/paid-media/r2'
import { mediaAssets } from '@/lib/paid-media/schema'

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif'])
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov'])

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
}

async function computeBlurhash(imageBuffer: Buffer): Promise<{ blurhash: string; width: number; height: number }> {
  const { data, info } = await sharp(imageBuffer)
    .raw()
    .ensureAlpha()
    .resize(32, 32, { fit: 'inside' })
    .toBuffer({ resolveWithObject: true })
  const meta = await sharp(imageBuffer).metadata()
  return {
    blurhash: encode(new Uint8ClampedArray(data), info.width, info.height, 4, 4),
    width: meta.width ?? 0,
    height: meta.height ?? 0,
  }
}

/** 高斯模糊缩略图：先缩到极小抹掉细节，再放大回可展示尺寸 —— 看得出轮廓、看不清内容 */
async function makeBlurThumbnail(imageBuffer: Buffer): Promise<Buffer> {
  return sharp(imageBuffer)
    .resize(48, 48, { fit: 'inside' })
    .blur(2)
    .resize(480, 480, { fit: 'inside', kernel: 'cubic' })
    .jpeg({ quality: 60 })
    .toBuffer()
}

async function main() {
  const [, , filePath, ...rest] = process.argv
  if (!filePath) {
    console.error('Usage: tsx scripts/upload-media.ts <file> [--cost N] [--poster <image>]')
    process.exit(1)
  }

  const costIdx = rest.indexOf('--cost')
  const posterIdx = rest.indexOf('--poster')
  const cost = costIdx >= 0 ? Number(rest[costIdx + 1]) : 0
  const posterPath = posterIdx >= 0 ? rest[posterIdx + 1] : null

  const ext = path.extname(filePath).toLowerCase()
  const mediaType = IMAGE_EXTS.has(ext) ? ('IMAGE' as const) : VIDEO_EXTS.has(ext) ? ('VIDEO' as const) : null
  if (!mediaType) throw new Error(`Unsupported extension: ${ext}`)
  const mimeType = MIME_BY_EXT[ext]

  const fileBuffer = await readFile(filePath)
  const assetId = randomUUID()
  const filename = path.basename(filePath)
  const r2Key = buildObjectKey(assetId, mediaType, filename)

  // 1. 原始文件进私有桶
  await putObject(r2Key, new Uint8Array(fileBuffer), mimeType)
  console.log(`✔ uploaded ${r2Key} (${(fileBuffer.length / 1024).toFixed(0)} KB)`)

  // 2/3. 预览素材：图片用本体，视频用 --poster 封面帧
  let blurhash: string | null = null
  let width: number | undefined
  let height: number | undefined
  const previewSource = mediaType === 'IMAGE' ? fileBuffer : posterPath ? await readFile(posterPath) : null

  if (previewSource) {
    const bh = await computeBlurhash(previewSource)
    blurhash = bh.blurhash
    width = bh.width
    height = bh.height

    const thumb = await makeBlurThumbnail(previewSource)
    await putObject(`media-thumbnails-blur/${assetId}.jpg`, new Uint8Array(thumb), 'image/jpeg')
    console.log(`✔ blur thumbnail media-thumbnails-blur/${assetId}.jpg`)
  } else {
    console.warn('⚠ 视频未提供 --poster，跳过 blurhash / 模糊缩略图（锁定态将只有纯色占位）')
  }

  // 4. 登记资产
  await db.insert(mediaAssets).values({
    id: assetId,
    filename,
    r2Key,
    mediaType,
    mimeType,
    metadata: { fileSize: fileBuffer.length, width, height },
    blurhash,
    creditsCost: Number.isFinite(cost) ? cost : 0,
    isActive: true,
  })

  console.log(`✔ media_assets 登记完成\n  id: ${assetId}\n  cost: ${cost}\n  访问: 打开 /paid-media-demo 查看`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
