---
name: web-video-encode
description: 把录屏 / 视频用 ffmpeg 转成"网页可直接嵌入"的资源，一份脚本适配多种需求——H.264 MP4（文字密集 UI 录屏首选，比 GIF 清晰 10 倍、体积小 10 倍）、VP9 WebM（再小 30%）、或调色板优化的 GIF（仅在必须 GIF 的场景）；支持等比缩放控制文字清晰度、CRF 画质、帧率、裁剪 crop、按时间截取片段（--ss/--t）、导出 <video poster> 静帧。Use when asked to "把录屏转成网页视频 / demo 视频"、"录屏转 mp4 / webm / gif"、"压缩演示视频"、"UI 录屏放到官网 / README / 落地页"、"encode screen recording for web"、"convert mov to mp4 for website"、"make a demo gif"、"optimize video for web/landing page"。
license: MIT
compatibility: macOS / Linux（依赖 ffmpeg 与 libx264 / libvpx-vp9；`brew install ffmpeg` 即带全）。纯本地转码，不上传、不改动源文件。
metadata:
  author: zilin
  version: "1.0"
  source: 抽取自 chat-aside 官网 website/scripts/encode-demo-video.sh，泛化以适配多格式与多场景
---

把一段录屏 / 视频转成**能直接放进网页**的资源。核心判断：**文字密集的 UI 录屏优先用视频（MP4/WebM）而不是 GIF**——同尺寸下清晰得多、体积小约一个数量级；GIF 只留给"必须是 GIF"的少数场景。

## 什么时候用

- 把产品 demo / 功能演示的屏幕录制放到官网 Hero、落地页、README、博客里。
- 一段 `.mov` / `.mp4` 太大或太糊，想在"体积"和"文字锐度"之间调平衡。
- 需要同一素材出多种格式（MP4 主用 + WebM 兜底，或某处非要 GIF）。
- 想顺带截一段片段、裁掉多余边框、或导出首帧作为 `<video poster>` 占位图。

## 用法

脚本在本 skill 的 `scripts/encode.sh`。跑 `-h` 看完整帮助。

```bash
# 最常用：录屏 → 网页 MP4（默认 1920 宽 / CRF22 / 30fps）
bash ./scripts/encode.sh rec.mov

# 收紧体积：降宽度优先于降画质（文字锐度对分辨率更敏感）
bash ./scripts/encode.sh rec.mov demo.mp4 --width 1280 --crf 26

# 由输出扩展名推断格式
bash ./scripts/encode.sh rec.mov demo.webm          # VP9 WebM，更小
bash ./scripts/encode.sh rec.mov demo.gif --width 800 --fps 15

# 截片段 / 裁剪 / 导出 poster
bash ./scripts/encode.sh rec.mov clip.mp4 --ss 00:00:03 --t 6
bash ./scripts/encode.sh rec.mov demo.mp4 --crop 2400:1600:100:80
bash ./scripts/encode.sh rec.mov demo.mp4 --poster   # 顺带出 demo.jpg
```

**格式怎么选：**

| 场景 | 选 | 理由 |
| --- | --- | --- |
| UI / 文字密集的 demo 录屏（官网、落地页） | **mp4** | 清晰、体积小、浏览器通吃、可当 GIF 循环播放 |
| 想再压一档且只面向现代浏览器 | **webm** | VP9 比 H.264 再小 ~30%，可与 mp4 做 `<source>` 兜底 |
| README 渲染 / 某些社媒不自动播 `<video>` | **gif** | 唯一能内联动图的场景；已做两遍调色板优化，但仍远大于视频 |

**页面里当 GIF 用（自动循环、静音、无控件）：**

```html
<video src="/demo.mp4" autoPlay loop muted playsInline preload="metadata" poster="/demo.jpg" />
```

## 关键参数与调优

- `--width`（默认 1920）：**文字清晰度主要靠它**。预算够时优先加宽度，而不是降 CRF。等比缩放，高度自动补偶数。
- `--crf`（mp4 默认 22 / webm 默认 32）：画质，越小越清晰越大（18≈视觉无损，23≈默认，28≈偏糊）。注意 VP9 的 CRF 数值区间比 H.264 高，别拿 mp4 的数字直接套 webm。
- `--fps`（默认 30）：GIF 建议 12~15 压体积。
- `--ss` / `--t`：起点（秒或 `HH:MM:SS`）与时长，用于只导出一段。
- `--crop W:H:X:Y`：在缩放前裁掉窗口边框 / 多余留白。
- `--colors`（仅 gif，默认 128）：调色板颜色数，越大越清晰越大。
- `--poster [FILE]`：另存一帧 JPG 作 `<video poster>`，默认 `<输出名>.jpg`，取 `--ss` 处那帧。

体积/清晰度参考（2620x1998 的 14.7s UI 录屏，mp4）：`1280/CRF26 → ~430KB`、`1600/22 → ~700KB`、`1920/22 → ~850KB(很清晰)`。

## 注意事项

- 依赖 `ffmpeg`（含 libx264 / libvpx-vp9）：`brew install ffmpeg`。缺失时脚本会提示并退出。
- MP4/WebM 一律**去掉音轨**（`-an`），并 `yuv420p` + faststart，确保浏览器自动播放 + 首帧秒开。
- `--ss` 用的是快速关键帧定位（放在 `-i` 前），对 demo 足够；若要逐帧精确起点，可自行改成解码后 seek。
- 纯本地转码，不上传、不修改源文件；输出默认与输入同名换扩展名，注意别覆盖已有文件。
