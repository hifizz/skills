---
name: create-interactive-hero
description: Build a high-fidelity, auto-playing, interactive product demo for a marketing/landing-page hero — a device or browser mockup that scripts the product's REAL UI so visitors instantly feel the product. Use when someone asks to create an interactive hero, an interactive hero demo, a "try it live" showcase, an animated product walkthrough, a scripted UI demo, or a Codex-style playable hero. Not for static screenshots or generic marketing copy.
license: MIT
metadata:
  author: chat-aside
  version: "1.0"
---

Build a **high-fidelity, auto-playing, interactive demo** that replaces (or augments) a
marketing homepage hero, so a visitor understands the product in seconds by watching it
drive itself — and can take over and explore.

Copy-paste code skeletons live in `references/architecture.md` — read it before writing the engine.

> **Reference implementation (optional).** This skill was distilled from a working demo. If the
> current repo happens to contain one (search for a `hero-demo/` folder or a marketing hero
> component, e.g. `**/marketing/hero-demo/`), read it first and mirror its patterns. If not, this
> file plus `references/architecture.md` are self-contained — follow them directly.

## The one principle

**Fidelity comes from porting, not inventing.** Do not design a "demo-ish" UI from scratch.
Find the product's real components and replicate them exactly: the same icons (down to inline
SVG paths), the same Tailwind classes, the same design tokens, the same animations. A demo that
looks 90% like the product reads as fake; one that looks identical reads as the product.

## Workflow

### 0. Gather the source of truth (do this first, it dominates quality)

Before writing anything, study the REAL product UI and extract, verbatim:

- **Design tokens** — the theme CSS variables / Tailwind config the product uses (e.g. shadcn
  `--background/--card/--muted/--primary`, radius, shadows). Reuse them so colors match exactly.
  If the product ships a `.dark` token set, render the demo inside a `.dark` wrapper and reuse
  the SAME token classes (`bg-card`, `text-muted-foreground`, …) rather than hand-picking hexes.
- **Icons & logos** — copy the exact inline SVGs / icon components (provider logos, etc.). Do not
  substitute a lookalike icon library.
- **Component markup** — read the real components and mirror their class strings, spacing,
  border-radius, badges, empty states, and micro-copy (pull real strings from the product's i18n).
- **Signature animations** — the product's own keyframes (a sync-highlight flash, a selection
  color, a spinner). Port the keyframes into the site's global CSS, scoped to the demo root.

Dispatch a read-only explorer agent to produce a structured "visual reference" doc of the real
components, then port from it. Quote real class names in that doc.

### 1. Scaffold a componentized mockup

- A **device/browser shell** (traffic lights, address bar, tab strip) → **panes** → **leaf
  components**. Keep every piece a small, named component — you WILL add more scenes later.
- Reuse the product's theme tokens inside the shell. Scope any product-specific CSS
  (keyframes, custom utilities) under a single root class so it never leaks into the site.
- All dark-mode (or whatever the product's default is). Don't build a theme the product lacks.

### 2. Build the scene-based timeline engine (the core — see references/architecture.md)

This architecture is what let the reference demo grow from 4 to 7 scripted scenes painlessly.

- **Single state object** (`DemoState`) mutated by one `patch(partial)`. Every visual — active
  tab, streaming text, dialog phase, simulated cursor target, open tabs — is a field.
- **Scenes as an ordered array** of cancellable `async (ctx) => {}` functions. `ctx` gives
  `patch`, `get`, `wait(ms)`, `stream(text, onUpdate)`, and `cancelled()`. Each scene checks
  `cancelled()` after every `await` and returns early.
- **Each scene self-seeds its entry state** (patches the baseline it needs at the top) so it plays
  correctly in sequence AND when jumped to directly from the stepper.
- **Engine** runs scenes from a start index, loops, tracks `activeIndex`, and measures each
  scene's real wall-clock duration to feed an accurate progress bar (deterministic scenes → exact
  after the first loop).
- Adding a new interaction later = write one scene function and append it to the array. Nothing
  else changes; the stepper grows a circle automatically.

### 3. Simulate the user with a data-driven cursor

- A `CursorLayer` mounted over the WHOLE mockup (so it can reach the toolbar AND the panes)
  measures `[data-cursor-target="…"]` elements relative to its container and glides an SVG pointer
  there with a spring. Optional lagging "comet" trail dots.
- Scenes drive it declaratively: `patch({ cursor: { target: "search-input" } })`, then a
  `clickCursor()` helper flips a `clicking` flag for a ripple. Tag every clickable target the
  script touches with `data-cursor-target`.
- Compose real micro-interactions from state: streaming tokens, a left-to-right "drag-select"
  highlight, dialogs (publish/share) with idle→working→success phases, opening a new browser tab
  that renders the produced artifact, dropdown menus. Reuse the product's real dialog/menu styling.

### 4. Controls: chapter stepper + play/pause

- Replace the usual "hint" line with a **stepper**: numbered circles (one per scene), a
  story-style progress bar that advances per scene using the measured duration, current
  "N/total · label", and **click-to-jump**. Style it in the product's accent color.
- A **play/pause** affordance (e.g. in the mockup toolbar) that stops and resets to the original
  idle state, then restarts. Reflect play/pause state in the icon; add a hover tooltip.

### 5. Make it robust and polite

- **Autoplay only when in viewport** (IntersectionObserver) and pause when scrolled away.
- **Any manual interaction pauses autoplay** and snaps to a clean idle state (e.g. show the
  finished conversation, close overlays) — never leave a blank or half-streamed frame.
- Respect `prefers-reduced-motion` unless the product owner explicitly wants default-play; if you
  default to playing, still keep a static, complete first paint for SSR / no-JS.
- **Self-host assets** (avatars, logos) under `public/`; never hotlink a third-party CDN. Flag the
  licensing of any borrowed asset — a lib's MIT code does not license its demo images.
- Cancel every timer/interval on unmount and on scene cancellation; unique React keys everywhere.

### 6. Verify visually, not just by compiling

- `typecheck` + production `build` after each chunk.
- Drive the running dev server with headless Chromium (Playwright) and **screenshot each key
  state** — wait for a target element/text to appear rather than sleeping a fixed time, so you
  catch the exact frame. Read the screenshots and iterate until each state is faithful.
- Also assert **zero console errors** (filter out sandbox/network noise) — this is how you catch
  hydration and DOM-nesting bugs the type checker misses.

## Gotchas learned the hard way

- **`<div>` inside `<p>`** — a bubble/popover rendered inside a rendered-markdown `<p>` throws a
  hydration error. Make such overlays `<span>` (with `display:flex`) — they're phrasing content.
- **Cursor can't reach a target** if the layer's measurement container doesn't contain it. Mount
  the cursor layer at the outermost mockup element so toolbar + panes are all reachable.
- **Duplicate React keys** when two snippets/records derive the same key — derive keys from a
  stable parent id + index, not from content.
- **Scenes that depend on prior scenes' state** break when jumped to — always self-seed.
- **Progress bar drift** — don't guess durations; measure the real elapsed time and reuse it.
- **`.dark` tokens don't resolve** if the demo isn't inside a `.dark` (or the product's theme)
  ancestor. Wrap the demo root.

## Deliverable checklist

- [ ] Mockup + panes are faithful to the real components (ported tokens, icons, class strings).
- [ ] Scene engine: single state, cancellable self-seeding scenes, loop, jump, real-timed progress.
- [ ] Simulated cursor drives at least: type, select/drag, click-through-a-dialog.
- [ ] Chapter stepper (jumpable) + play/pause + reset.
- [ ] In-view autoplay, pause-on-interaction, reduced-motion handled, assets self-hosted.
- [ ] typecheck + build green; each state screenshot-verified; zero console errors.
