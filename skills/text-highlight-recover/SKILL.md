---
name: text-highlight-recover
description: 网页文本高亮 / 划词批注的「模糊恢复」——保存的是文本锚点（引用文本 exact + 前后上下文 prefix/suffix + 字符偏移 position），而不是 DOM 路径 / XPath / nth-child。页面重渲染、空白重排、正文被小幅编辑之后，用三层降级 position→exact→fuzzy 把高亮重新定位回来：fuzzy 用「首尾自由 gap」的编辑距离做近似子串匹配，容忍错字与增删词并给出相似度分数，低于阈值判定丢失。零依赖单文件、纯 TS，含 Range↔偏移与无损 <span> 高亮绘制。当用户提到 高亮/划词/批注恢复、highlight 重新定位、restore highlight after re-render、text anchor / text fragment、DOM 变了高亮丢了、模糊匹配找回选区、W3C Web Annotation TextQuoteSelector 时使用。
license: MIT
compatibility: 纯 TypeScript。上半段（locateOffsets / fuzzySubstring）无 DOM 依赖，可跑在 Node / Worker；下半段用标准 Range / TreeWalker / DOM API，React / Vue / Svelte / 原生均可，不依赖任何库。
metadata:
  author: zilin
  version: "1.0"
  source: 抽象自 chat-aside 浏览器插件的 Mark & Note 高亮恢复，并补上真正的 fuzzy 兜底；交互 Demo 见 playground.zilin.im/highlight-recovery
---

在网页里保存一段高亮，最朴素的做法是记下它的 DOM 位置（XPath / nth-child / 节点 id）。
但只要页面**重新渲染、内容异步补齐、被编辑过一个字**，这些结构线索就全废了——高亮要么错位，要么消失。

正确的做法是**存文本、不存结构**：把「选了哪段文字 + 它前后长什么样 + 大概在第几个字符」记下来，
恢复时拿这些线索去当前页面里**重新搜**。文字没动就秒中；文字被改过，就模糊地找最像的一段。

本 skill 把这套「文本锚点 + 分层恢复」抽象成一个零依赖单文件。

## 锚点模型

对齐 W3C Web Annotation，一条锚点两个线索：

```ts
interface TextAnchor {
  quote: { exact: string; prefix: string; suffix: string } // 稳态线索：引用文本 + 前后各 32 字上下文
  position?: { start: number; end: number }                // 加速线索：容器 textContent 里的字符偏移
}
```

坐标系是**容器 textContent**（所有文本节点顺序拼接），所以高亮跨 `<b>`/`<code>`/换行都不影响定位——
这正是它比 DOM 路径稳的原因。

## 恢复算法（三层降级，越靠后越模糊）

1. **position** —— 直接取记录的偏移，校验该处文本归一化后仍等于引用文本。页面没变时一击命中，O(1)。
2. **exact** —— 全文 `indexOf` 精确搜索引用文本；多处命中时用 `prefix`/`suffix` 上下文吻合度 + 偏移就近打分消歧。应对「整体平移」（前面插了内容，偏移全变但文字没变）。
3. **fuzzy** —— 精确搜不到（有词被改/增/删）时，做**近似子串匹配**：用带「首尾自由 gap」的编辑距离 DP，把 pattern 对齐到文本里最相似的一段，容忍替换/插入/删除，任意长度都行；命中给相似度分数 `1 - 编辑距离/pattern 长度`，低于 `fuzzyThreshold`（默认 0.7）判定丢失。匹配跑在**空白归一化**后的文本上（对空白重排免疫），再映射回原文偏移。

## 用法

`templates/text-anchor.ts` → 拷进项目（如 `utils/text-anchor.ts`）。

```ts
import { describeRange, locateAnchor, paintRange, clearHighlights } from "./text-anchor";

const root = document.querySelector("#article")!;          // 高亮的坐标系容器

// 1) 保存：从用户选区生成锚点，序列化存起来
const anchor = describeRange(root, getSelection()!.getRangeAt(0));
if (anchor) localStorage.setItem(id, JSON.stringify(anchor));

// 2) 恢复：页面（可能已漂移）加载后找回来重绘
const hit = locateAnchor(root, anchor);                    // 三层降级
if (hit) {
  paintRange(hit.range, id);                               // 无损 <span> 高亮
  console.log(hit.strategy, hit.score);                    // 'position'|'exact'|'fuzzy' + 分数
} else {
  // 内容改动过大，判定丢失
}

// 3) 移除
clearHighlights(root, id);   // 单条；不传 id 清全部
```

纯定位（不碰 DOM）可只用 `locateOffsets(text, anchor)` / `fuzzySubstring(text, pattern)`，
适合服务端 / Worker 里「给纯文本 + 锚点求偏移」。

## 注意事项

- **坐标系容器要稳定**：`root` 选一个语义稳定、只含正文的元素（如文章区），别把导航/侧栏/角色标签
  也圈进去——它们的文字会混进 textContent，污染偏移与搜索。
- **框架重渲染会抹掉手绘 `<span>`**：React/Vue 重渲染 `root` 子树时会重设 innerHTML，把 `paintRange`
  插的 span 清掉。对策：把高亮容器用 `React.memo` / `v-once` 等隔离，只在数据变化时重渲染，然后在
  「提交后」的副作用里重新 `clearHighlights` + 重绘；**不要在 render/setState updater 里画**。
- **偏移是加速线索、不是真相**：只有 position 校验通过才用它；校验失败一定回落到 exact/fuzzy，
  别直接信 `position` 去 `slice`。
- **fuzzyThreshold 按内容调**：正文类可松（0.6–0.7 容忍编辑），代码/精确引用类调紧（0.85+）避免误配。
  分数会随命中一起返回，可在 UI 上暴露给用户（「近似匹配」标记）。
- **性能**：fuzzy 的 DP 是 O(n·m)，只在 exact 失败时兜底跑一次；n 是容器文本长度、m 是引用文本长度。
  超长文档（数万字）建议先按段落/消息切分成多个 `root`，把搜索范围收窄。
- **何时不用它**：只想跨会话分享一个只读定位、且能接受偶尔失效时，浏览器原生
  [Text Fragments](https://developer.mozilla.org/docs/Web/URI/Fragment/Text_fragments)（`#:~:text=`）
  更省事；需要富标注、协同、跨端同步时再上这套可持久化锚点。

## 模板文件

| 模板 | 目标位置 | 说明 |
| --- | --- | --- |
| `templates/text-anchor.ts` | `utils/text-anchor.ts`（任意） | 单文件：纯字符串三层定位（locateOffsets/fuzzySubstring）+ DOM 胶水（describeRange/locateAnchor/paintRange/clearHighlights），含注释与用法 |

交互 Demo（划词存高亮 + 5 种「页面漂移」实时看命中策略与分数）：<https://playground.zilin.im/highlight-recovery>
