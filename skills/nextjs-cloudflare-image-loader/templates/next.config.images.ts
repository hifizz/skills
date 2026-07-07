import type { NextConfig } from 'next'

/**
 * 合并进你的 next.config.ts 的 images 配置段。
 *
 * deviceSizes/imageSizes 是「计费变体网格」：srcset 只会从这些档位取值，
 * 档位数 × 源图数 ≈ 每月 unique transformations 用量。默认值有 15 档，
 * 这里收紧到 10 档；按你的真实断点继续删，每删一档 = 全站省 1/N 的转换量。
 */
const nextConfig: NextConfig = {
  images: {
    loader: 'custom',
    loaderFile: './image-loader.ts',

    // <Image sizes="..."> 匹配的全宽断点（viewport 宽度类图片）
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],

    // 固定尺寸图片（头像、缩略图）的档位
    imageSizes: [64, 96, 128, 256, 384],

    // 提醒：custom loader 下 remotePatterns 不再起约束作用（不经过 /_next/image），
    // 第三方域名的安全边界由 image-loader.ts 里的 TRANSFORM_HOST 判断承担。
  },
}

export default nextConfig
