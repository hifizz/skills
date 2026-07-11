---
name: floating-popup-position
description: 选区浮层（划词工具条 / AI 解释卡 / 评论气泡）的定位算法：在指定矩形范围（通常是 viewport）内，popup 围绕选区按 右→下→左→上 择位，保持安全边距与呼吸间距、永不被裁切；四边都放不下时退化为「遮挡选区面积最小」的位置。零依赖纯函数，~170 行，不引入 @floating-ui。当用户提到 划词工具条放哪 / 选区气泡定位 / popup 超出屏幕被裁切 / tooltip 贴边 clamp / anchored popup 翻转 / 浮层遮住选中内容 时使用。
license: MIT
compatibility: 纯 TypeScript 函数，无 DOM / 框架依赖，React / Vue / Svelte / 原生均可。输入接受 DOMRect 或普通 {left,top,width,height} 对象。
metadata:
  author: zilin
  version: "1.0"
  source: 抽象自 chat-aside 浏览器插件的选区气泡，交互 Demo 见 playground.zilin.im/floating-popup
---

任何「围绕一段选中内容弹出的浮层」都要回答同一个问题：**放哪里？**
划词工具条、AI 解释卡、批注气泡都是这个问题的实例。难点不在「放右边」，而在约束同时成立：

- 不能超出可视范围被裁切（popup 很大、选区贴边时最容易翻车）；
- 与选区要留呼吸间距（gap），与容器边缘要留安全边距（safePadding）；
- 四个方向都放不下时要**优雅退化**，而不是随便盖住用户刚选中的内容。

本 skill 把它抽象成三个矩形的纯几何关系：

> 在 **ContainerRect**（通常是 viewport）内，**FloatingPopup** 围绕 **SelectedRect**
> （多行选区取 bounding rect）择位。

## 算法（一遍看懂）

1. **择位顺序**：右 → 下 → 左 → 上，第一个能「干净放下」的方向即采用（顺序可配）。
2. **交叉轴居中 + 滑动**：候选位在交叉轴上对选区居中；越界时沿交叉轴滑动（clamp 进安全区），
   **不算失败**——这是它比「四方向硬翻转」体验好的关键。
3. **硬约束**：popup 永不越出 container 内缩 safePadding 后的安全区，不会被裁切
   （popup 比安全区还大时贴左上角，属于无解情形）。
4. **兜底**：四边都放不下时，把各方向候选 clamp 进安全区，选**遮挡选区面积最小**的那个——
   宁可盖住别处，尽量露出用户刚选中的内容。

## 用法

`templates/position.ts` → 拷入项目任意位置（如 `utils/position.ts`）。

```ts
import { computePopupPosition } from "./position";

// 典型场景：选区气泡，container = viewport
const rect = window.getSelection()!.getRangeAt(0).getBoundingClientRect();
const { left, top, side, fallback } = computePopupPosition(
  rect,                                  // anchor：选区包围盒（DOMRect 即可）
  { width: 240, height: 44 },            // popup 实测尺寸（ResizeObserver 拿）
  { left: 0, top: 0, width: innerWidth, height: innerHeight },
  { safePadding: 12, gap: 4 },           // 可选，默认即这两个值
);
// => position: fixed; left/top 直接可用
// side（"right"|"bottom"|"left"|"top"）与 fallback 供进出场动画方向、调试用
```

container 换成任意元素的 rect（如滚动面板、编辑器区域），即可把浮层约束在该区域内。
调试 / 可视化用 `explainPopupPosition`，额外返回四个方向候选的坐标与可行性。

## 注意事项

- **popup 尺寸要实测**：内容驱动的浮层用 ResizeObserver 量 offsetWidth/Height 再算位置，
  首帧可先渲染在屏外（left:-9999 + visibility:hidden），量到尺寸后落位，避免闪跳。
- **跟随时机**：viewport 场景监听 `selectionchange` + `scroll`(capture) + `resize` 重算；
  选区在 viewport 坐标系里会随滚动移动，浮层可能实时翻向（这是预期行为）。
- **坐标系一致**：anchor 与 container 必须同坐标系。viewport 坐标（getBoundingClientRect）
  配 `position: fixed`；若用绝对定位容器，先把两者换算到该容器的局部坐标。
- **祖先 transform 会破坏 fixed**：浮层挂在带 transform/filter 的祖先下时 fixed 会失效，
  必要时 portal 到 body。
- **何时不用它**：需要箭头指示、middleware 生态、虚拟元素跟随（右键菜单）等复杂能力时，
  直接上 @floating-ui/dom；本 skill 的定位是「一个文件解决 90% 的选区浮层场景」的零依赖方案。

## 模板文件

| 模板 | 目标位置 | 说明 |
| --- | --- | --- |
| `templates/position.ts` | `utils/position.ts`（任意） | 完整模型：computePopupPosition + explainPopupPosition，含注释 |

交互 Demo（可拖沙箱 + 真实文本选择）：<https://playground.zilin.im/floating-popup>
