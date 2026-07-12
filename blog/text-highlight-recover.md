# 我做了一个 skill：text-highlight-recover —— 网页高亮的模糊恢复

> **推文草稿（Twitter/X）**
> 网页里保存一段高亮，怎么在页面重渲染 / 内容被编辑之后还能找回来？答案是：**存文本，不存 DOM 路径** 🧩
> 引用文本 + 前后上下文 + 字符偏移，恢复时三层降级 position → exact → fuzzy；模糊那层用编辑距离做近似子串匹配，容忍错字增删词、给相似度分数。零依赖单文件。
> `npx skills add hifizz/skills --skill text-highlight-recover`
> 交互 Demo + 背后的故事 👉 https://zilin.im

## 这是什么（技能本身）

`text-highlight-recover` 解决一个做过「划词批注 / 高亮收藏」的人都会撞上的问题：**高亮存下来了，怎么在页面变了之后还能贴回原处？**

最朴素的做法是记 DOM 位置——XPath、`nth-child`、节点 id。但只要页面**重新渲染、内容异步补齐、正文被编辑过一个字**，这些结构线索就全废：高亮要么错位，要么直接消失。

它的答案是**存文本、不存结构**。一条锚点两个线索，对齐 W3C Web Annotation：

```ts
interface TextAnchor {
  quote: { exact: string; prefix: string; suffix: string } // 引用文本 + 前后各 32 字上下文
  position?: { start: number; end: number }                // 容器 textContent 里的字符偏移
}
```

恢复时**三层降级，越靠后越模糊**：

1. **position** —— 直接取偏移，校验该处文字没变 → 页面没动时一击命中。
2. **exact** —— 全文精确搜引用文本，多处命中用 prefix/suffix 上下文消歧 → 应对「前面插了内容、偏移整体平移」。
3. **fuzzy** —— 精确搜不到（有词被改/增/删）时，用带「首尾自由 gap」的**编辑距离 DP** 找最相似的一段，容忍替换/插入/删除、任意长度，命中给相似度分数，低于阈值判定丢失。

坐标系是**容器 textContent**，所以高亮跨 `<b>`/`<code>`/换行都不影响定位——这正是它比 DOM 路径稳的根本原因。装完是一个零依赖单文件 `text-anchor.ts`，含 `describeRange`（存）/ `locateAnchor`（恢复）/ `paintRange`（无损 `<span>` 高亮）/ `clearHighlights`，上半段纯字符串逻辑还能单独跑在 Node / Worker。

```bash
npx skills add hifizz/skills --skill text-highlight-recover
```

## 为什么做它（原因 / 过程）

这套东西来自我的浏览器插件 [chat-aside](https://github.com/hifizz/chat-aside)（一个把 ChatGPT / Claude / Gemini 等对话保存到本地、支持「Mark & Note」划词批注的扩展）。

插件里最难缠的一段就是高亮恢复：AI 对话页几乎全是**流式渲染 + 前端框架重绘 + 用户随时重新生成**，DOM 一直在变。我最初也是按 messageId + 偏移去定位，结果频繁失效——消息重排、Markdown 重新渲染、甚至你把回答重新生成一遍，高亮就找不着了。

抽象成 skill 的过程中，我做了两件原插件没做透的事：

1. **把「纯定位」和「DOM 操作」彻底切开。** 原插件里 Range 计算和文本搜索是缠在一起的，难测。这次拆成两层：上半段 `locateOffsets` / `fuzzySubstring` 只吃字符串、吐偏移，能在 Node 里用 `node --experimental-strip-types` 直接跑单测；下半段才碰 Range / TreeWalker。写 Demo 时正是靠这层纯函数，先把 7 个 case（position / exact / 空白重排 / 改字 / 增词 / 删句 / 重复消歧）全测绿，再接 DOM。

2. **补上真正的 fuzzy 兜底。** 原插件的「恢复」其实只有 position + exact + prefix/suffix 消歧——文字**一旦被编辑就彻底 miss**。这次加了近似子串匹配：不是 32 位限制的 Bitap，而是「首尾自由 gap 的编辑距离 DP」，任意长度、增删替换都容忍，还顺带给出相似度分数，能在 UI 上标「近似匹配 77%」。匹配跑在空白归一化后的文本上，对 Markdown 重排那种「同样的字、不同的空白」免疫。

做 Demo（[playground.zilin.im/highlight-recovery](https://playground.zilin.im/highlight-recovery)）时还踩了个 React 特有的坑：手动 `paintRange` 插进去的 `<span>`，会被状态变化触发的重渲染重设 `innerHTML` 抹掉——表现为「定位明明成功、高亮却不显示」。对策是把高亮容器 `React.memo` 隔离，只在文档数据变化时重渲染，然后在提交后的副作用里重绘，绝不在 render / setState updater 里画。这条经验也写进了 SKILL 的注意事项——因为换成 Vue/Svelte 是同一类问题。

## 什么时候用它（适用场景）

- **划词批注 / 高亮收藏类产品**：笔记插件、阅读器、AI 对话存档，任何「选中一段文字、存下来、下次还要贴回去」的场景。
- **内容会漂移的页面**：SPA 重渲染、流式输出、异步补内容、用户可编辑正文——凡是 DOM 结构不稳、但文字大体还在的，这套锚点比 XPath 稳一个量级。
- **需要「找回来还要知道靠不靠谱」**：fuzzy 命中会带相似度分数，可以在 UI 上区分「精确恢复」和「近似匹配」，让用户心里有数。
- **不只是浏览器**：纯定位那层不碰 DOM，服务端 / Worker 里「给纯文本 + 锚点求偏移」也能直接用。

一句话：**只要你要把一段文字高亮持久化、并且页面会变，就用它，而不是记 DOM 路径。** 如果只想要一个只读的分享定位、能接受偶尔失效，浏览器原生的 Text Fragments（`#:~:text=`）更省事——但要富标注、协同、跨端同步，就需要这套可持久化、可模糊恢复的锚点。

---
*本文同步于 [zilin.im](https://zilin.im)，skill 源码见 [hifizz/skills](https://github.com/hifizz/skills)。*
