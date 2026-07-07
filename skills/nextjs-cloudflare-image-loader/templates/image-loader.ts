import type { ImageLoaderProps } from 'next/image'

/**
 * Cloudflare Image Transformations 的 next/image custom loader。
 *
 * 产出 URL 形如：
 *   https://media.example.com/cdn-cgi/image/width=828,quality=75,format=auto/images/xxx.jpg
 *
 * 设计约束（不要随手改）：
 * - 只放 width / quality / format 三个参数。计费单位是「源图 × 参数组合」，
 *   参数越多变体基数越大；height/fit/gravity 用 CSS（object-fit/object-position）解决。
 * - format=auto 由 Cloudflare 按 Accept 头自动出 AVIF/WebP，不要写死格式。
 * - dev 直接回原图：本地没有 /cdn-cgi/image 端点，而且不该烧生产转换额度。
 */

/** 图片自定义域名（同 Cloudflare zone、已开 Transformations），不带尾斜杠 */
const TRANSFORM_HOST = process.env.NEXT_PUBLIC_IMAGE_TRANSFORM_HOST

const DEFAULT_QUALITY = 75

export default function cloudflareImageLoader({ src, width, quality }: ImageLoaderProps): string {
  if (process.env.NODE_ENV === 'development') {
    return src
  }

  const params = `width=${width},quality=${quality ?? DEFAULT_QUALITY},format=auto`

  // 绝对 URL：只转换自己媒体域名下的图。
  // custom loader 会绕过 next/image 的 remotePatterns 白名单，这里的域名判断
  // 就是安全边界——第三方图片原样返回，不经过我们的转换额度。
  if (src.startsWith('http://') || src.startsWith('https://')) {
    if (TRANSFORM_HOST && src.startsWith(`${TRANSFORM_HOST}/`)) {
      const path = src.slice(TRANSFORM_HOST.length + 1)
      return `${TRANSFORM_HOST}/cdn-cgi/image/${params}/${path}`
    }
    return src
  }

  // 相对路径（public/ 下的本地资源）：走媒体域名转换的前提是应用域名
  // 本身也在开了 Transformations 的 Cloudflare zone 上；是的话用相对形式。
  // 应用部署在 Vercel/Fly 等非 Cloudflare 域名时，本地小资源直接原样返回即可。
  const normalized = src.startsWith('/') ? src.slice(1) : src
  return `/cdn-cgi/image/${params}/${normalized}`
}
