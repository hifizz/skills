'use client'

import { useState } from 'react'
// 不想引 blurhash 依赖：删掉下面这行 + BlurhashLayer，锁定态只剩模糊缩略图/纯色底
import { Blurhash } from 'react-blurhash'
import type { PaidMediaItem } from '@/lib/paid-media/types'
import { usePaidMediaItem } from '@/providers/paid-media-provider'

/**
 * PaidMediaCard —— 参考展示组件。
 *
 * 这是「Provider 提供数据、展示由业务实现」里的那个“业务实现”样例：
 * 全部数据来自 usePaidMediaItem，UI 只用 Tailwind，没有其他依赖。
 * 你可以直接用它，更推荐照着它写自己的组件。
 *
 * 锁定态预览两层：
 *   1. blurhash（下发即有，零请求）—— 需要 react-blurhash；不想装就删掉那段，只剩模糊图
 *   2. 高斯模糊缩略图（公开域名 media-thumbnails-blur/{id}.jpg）onLoad 后淡入盖住 blurhash
 */
export function PaidMediaCard({ item }: { item: PaidMediaItem }) {
  const media = usePaidMediaItem(item)

  const aspectRatio =
    item.width && item.height ? `${item.width} / ${item.height}` : '1 / 1'

  return (
    <div
      className="relative overflow-hidden rounded-xl bg-neutral-900"
      style={{ aspectRatio, maxWidth: 360 }}
    >
      {media.status === 'ready' ? (
        item.mediaType === 'VIDEO' ? (
          <video
            src={media.url!}
            controls
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
            // 预签名 URL 极端情况下失效（本地时钟漂移等）→ 强制重签
            onError={() => void media.refresh()}
          />
        ) : (
          <img
            src={media.url!}
            alt=""
            className="h-full w-full object-cover"
            onError={() => void media.refresh()}
          />
        )
      ) : (
        <LockedView item={item} media={media} />
      )}
    </div>
  )
}

function LockedView({
  item,
  media,
}: {
  item: PaidMediaItem
  media: ReturnType<typeof usePaidMediaItem>
}) {
  const [blurLoaded, setBlurLoaded] = useState(false)
  const blurThumbUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL
    ? `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL}/media-thumbnails-blur/${item.id}.jpg`
    : null

  const busy = media.status === 'unlocking' || media.status === 'fetching-url'

  return (
    <div className="absolute inset-0">
      {/* 层1：blurhash。不用 react-blurhash 的话，删掉这段留纯色底即可 */}
      {item.blurhash && !blurLoaded && <BlurhashLayer hash={item.blurhash} />}

      {/* 层2：高斯模糊缩略图，加载成功后盖住 blurhash */}
      {blurThumbUrl && (
        <img
          src={blurThumbUrl}
          alt=""
          aria-hidden
          className={`absolute inset-0 h-full w-full object-cover blur-md transition-opacity duration-300 ${
            blurLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={() => setBlurLoaded(true)}
        />
      )}

      {/* 解锁交互层 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/30">
        <button
          type="button"
          onClick={() => void media.unlock()}
          disabled={busy}
          className="rounded-full bg-gradient-to-b from-pink-500 to-purple-600 px-5 py-2 text-sm font-medium text-white shadow-lg transition hover:to-purple-700 disabled:opacity-60"
        >
          {media.status === 'unlocking'
            ? 'Unlocking…'
            : media.status === 'fetching-url'
              ? 'Loading…'
              : item.creditsCost > 0
                ? `Unlock for ${item.creditsCost} credits`
                : 'Unlock'}
        </button>

        {media.error && (
          <p className="max-w-[80%] text-center text-xs text-red-300">{media.error}</p>
        )}
      </div>
    </div>
  )
}

/** blurhash 渲染层。依赖 react-blurhash（pnpm add react-blurhash blurhash） */
function BlurhashLayer({ hash }: { hash: string }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <Blurhash hash={hash} width="100%" height="100%" resolutionX={32} resolutionY={32} punch={1} />
    </div>
  )
}
