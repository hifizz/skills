#!/usr/bin/env bash
#
# encode.sh — 把录屏 / 视频转成"网页可直接嵌入"的资源，一份脚本适配多种需求。
#
# 三种输出，按场景选：
#   mp4  (默认) H.264 视频。文字密集的 UI 录屏首选：同尺寸下比 GIF 清晰得多、
#              体积小约 10 倍。输出无音轨、faststart(首帧秒开)、yuv420p(浏览器通吃)。
#              页面里当 GIF 用(自动循环、静音、无控件)：
#                <video src="/x.mp4" autoPlay loop muted playsInline preload="metadata" />
#   webm (VP9)  比 H.264 再小 ~30%，现代浏览器通吃。可与 mp4 一起做 <source> 兜底。
#   gif        仅在必须 GIF 的场景用(部分 README 渲染、某些社媒不自动播放 <video>)。
#              两遍调色板(palettegen/paletteuse)出图，比裸转清晰得多，但体积仍远大于视频。
#
# 用法:
#   ./encode.sh <输入> [输出] [选项]
#
#   ./encode.sh rec.mov                      # → rec.mp4，默认 1920/CRF22/30fps
#   ./encode.sh rec.mov demo.mp4 --width 1280 --crf 26
#   ./encode.sh rec.mov demo.webm            # 由扩展名推断格式(webm)
#   ./encode.sh rec.mov demo.gif --width 800 --fps 15
#   ./encode.sh rec.mov clip.mp4 --ss 00:00:03 --t 6   # 从第 3s 起截 6s
#   ./encode.sh rec.mov demo.mp4 --crop 2400:1600:100:80  # 先裁剪再缩放
#   ./encode.sh rec.mov demo.mp4 --poster              # 顺带导出首帧 demo.jpg 做 <video poster>
#
# 选项(都可选，给了合理默认):
#   --format mp4|webm|gif  不给则按输出扩展名推断，再兜底 mp4
#   --width  N   默认 1920  等比缩放，高度自动补偶数。文字清晰度主要靠它。
#   --crf/--quality N       mp4/webm 画质，越小越清晰但越大(18≈视觉无损,23≈默认,28≈偏糊)
#                           mp4 默认 22，webm 默认 32(VP9 的 CRF 数值区间更高)
#   --fps    N   默认 30    gif 建议 12~15 压体积
#   --ss     T   起点，秒或 HH:MM:SS，如 3 / 00:00:03
#   --t      D   截取时长(配合 --ss)
#   --crop W:H:X:Y          裁剪，在缩放前应用
#   --colors N   仅 gif，调色板颜色数，默认 128(越大越清晰越大)
#   --poster [FILE]         另存一帧 JPG 作为 <video poster>，默认 <输出名>.jpg，取 --ss 处那帧
#
# 体积/清晰度参考(2620x1998 的 14.7s UI 录屏, mp4)：
#   1280 / CRF26 → ~430KB   1600 / 22 → ~700KB   1920 / 22 → ~850KB(很清晰)
# 预算够就优先加 --width 而非降 CRF —— 文字锐度对分辨率比对码率更敏感。
#
# 依赖: ffmpeg (brew install ffmpeg)

set -euo pipefail

print_help() { sed -n '2,/^set -euo/p' "$0" | sed 's/^# \{0,1\}//; /^set -euo/d'; }

if [[ $# -lt 1 || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  print_help
  exit 0
fi

SRC="$1"; shift
OUT=""
FORMAT=""
WIDTH=1920
CRF=""
FPS=30
SS=""
DUR=""
CROP=""
COLORS=128
POSTER=""            # 空=不导出；"AUTO"=默认名；否则=指定路径

# 第一个非 -- 参数视作输出路径
if [[ $# -gt 0 && "${1:0:1}" != "-" ]]; then OUT="$1"; shift; fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --format)          FORMAT="$2"; shift 2;;
    --width)           WIDTH="$2"; shift 2;;
    --crf|--quality)   CRF="$2"; shift 2;;
    --fps)             FPS="$2"; shift 2;;
    --ss)              SS="$2"; shift 2;;
    --t|--duration)    DUR="$2"; shift 2;;
    --crop)            CROP="$2"; shift 2;;
    --colors)          COLORS="$2"; shift 2;;
    --poster)          # 可选带值：--poster foo.jpg 或裸 --poster
                       if [[ $# -gt 1 && "${2:0:1}" != "-" ]]; then POSTER="$2"; shift 2; else POSTER="AUTO"; shift; fi;;
    -h|--help)         print_help; exit 0;;
    *) echo "✗ 未知选项: $1" >&2; exit 1;;
  esac
done

command -v ffmpeg >/dev/null 2>&1 || { echo "✗ 未找到 ffmpeg，请先 brew install ffmpeg" >&2; exit 1; }
[[ -f "$SRC" ]] || { echo "✗ 输入文件不存在: $SRC" >&2; exit 1; }

# 推断格式：显式 --format > 输出扩展名 > mp4
if [[ -z "$FORMAT" ]]; then
  if [[ -n "$OUT" ]]; then
    case "${OUT##*.}" in mp4|MP4) FORMAT=mp4;; webm|WEBM) FORMAT=webm;; gif|GIF) FORMAT=gif;; *) FORMAT=mp4;; esac
  else
    FORMAT=mp4
  fi
fi
[[ -n "$OUT" ]] || OUT="${SRC%.*}.${FORMAT}"

# 各格式的默认 CRF
if [[ -z "$CRF" ]]; then case "$FORMAT" in webm) CRF=32;; *) CRF=22;; esac; fi

# 组装视频滤镜链：crop → scale → fps
build_vf() {
  local extra="${1:-}"
  local chain=""
  [[ -n "$CROP" ]] && chain="crop=${CROP},"
  chain="${chain}scale=${WIDTH}:-2:flags=lanczos,fps=${FPS}"
  [[ -n "$extra" ]] && chain="${chain},${extra}"
  echo "$chain"
}

# 裁剪参数(fast seek，放在 -i 前)
SEEK=(); [[ -n "$SS" ]] && SEEK+=(-ss "$SS")
CLIP=(); [[ -n "$DUR" ]] && CLIP+=(-t "$DUR")

echo "→ [$FORMAT] $SRC → $OUT  (宽 ${WIDTH}px / ${FPS}fps${CRF:+ / CRF $CRF}${SS:+ / ss $SS}${DUR:+ / t $DUR})"

case "$FORMAT" in
  mp4)
    ffmpeg -y "${SEEK[@]+"${SEEK[@]}"}" -i "$SRC" "${CLIP[@]+"${CLIP[@]}"}" \
      -vf "$(build_vf)" \
      -c:v libx264 -profile:v high -crf "$CRF" -pix_fmt yuv420p \
      -an -movflags +faststart \
      "$OUT"
    ;;
  webm)
    ffmpeg -y "${SEEK[@]+"${SEEK[@]}"}" -i "$SRC" "${CLIP[@]+"${CLIP[@]}"}" \
      -vf "$(build_vf)" \
      -c:v libvpx-vp9 -crf "$CRF" -b:v 0 -pix_fmt yuv420p \
      -row-mt 1 -an \
      "$OUT"
    ;;
  gif)
    # 两遍：先生成调色板再套用，远比裸转清晰
    PALETTE="$(dirname "$OUT")/.palette-$$.png"
    trap 'rm -f "$PALETTE"' EXIT
    ffmpeg -y "${SEEK[@]+"${SEEK[@]}"}" -i "$SRC" "${CLIP[@]+"${CLIP[@]}"}" \
      -vf "$(build_vf "palettegen=max_colors=${COLORS}:stats_mode=diff")" \
      "$PALETTE"
    ffmpeg -y "${SEEK[@]+"${SEEK[@]}"}" -i "$SRC" "${CLIP[@]+"${CLIP[@]}"}" -i "$PALETTE" \
      -lavfi "$(build_vf)[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3" \
      "$OUT"
    ;;
  *) echo "✗ 不支持的格式: $FORMAT (仅 mp4|webm|gif)" >&2; exit 1;;
esac

echo "✓ 完成: $OUT ($(du -h "$OUT" | cut -f1))"

# 可选：导出 poster 静帧
if [[ -n "$POSTER" ]]; then
  [[ "$POSTER" == "AUTO" ]] && POSTER="${OUT%.*}.jpg"
  ffmpeg -y "${SEEK[@]+"${SEEK[@]}"}" -i "$SRC" -frames:v 1 \
    -vf "$(build_vf)" -q:v 3 "$POSTER" >/dev/null 2>&1
  echo "✓ 静帧: $POSTER ($(du -h "$POSTER" | cut -f1))"
fi
