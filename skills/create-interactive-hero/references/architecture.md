# Architecture & copy-paste skeletons

Stack assumed: **React + framer-motion + Tailwind** (the reference used Next.js + Tailwind v4 +
shadcn tokens + lucide). Adapt the syntax if your stack differs; the shapes are what matter.

File layout that scaled well:

```
hero-demo/
  demo-types.ts        // DemoState + INITIAL_STATE + makeResetPatch + SceneContext + shared enums
  demo-data.ts         // all the fake content (chats, messages, urls, artifact data)
  scenes.ts            // CHAPTERS: ordered, self-seeding, cancellable async scenes
  use-demo-sequence.ts // the engine hook: owns state, runs/loops/jumps scenes, exposes handlers
  cursor-layer.tsx     // simulated pointer, measures data-cursor-target
  chapter-stepper.tsx  // numbered steps + real-timed progress + jump
  browser-mockup.tsx   // shell: traffic lights, address bar, tab strip, cursor layer
  <panes & leaf components>.tsx  // faithful ports of the real product UI
  hero-demo.tsx        // top-level: wires the hook to the mockup + stepper
```

## 1. State + scene context (demo-types.ts)

```ts
export interface DemoState {
  // one field per visible thing. Examples:
  activeTab: "chat" | "search" | "note" | "profile";
  botMessages: { role: "user" | "assistant"; content: string }[];
  isStreaming: boolean;
  cursor: { target: string | null; clicking: boolean };
  publish: { open: boolean; phase: "idle" | "publishing" | "success"; url: string | null };
  tabs: { id: string; title: string; url: string; kind: "chat" | "published" }[];
  activeTabId: string;
  // …add fields freely; new fields never change scene signatures
}

export const INITIAL_STATE: DemoState = { /* a complete, static, "finished" first paint */ };

// Applied at the very start of the first chapter each loop.
export function makeResetPatch(): Partial<DemoState> { /* empty/clean baseline */ return { /* … */ }; }

export interface SceneContext {
  patch: (p: Partial<DemoState>) => void;
  get: () => DemoState;
  setAssistant: (content: string) => void;          // update last streaming message
  wait: (ms: number) => Promise<void>;              // resolves early if cancelled
  stream: (full: string, onUpdate: (s: string) => void, charsPerTick?: number, tickMs?: number) => Promise<void>;
  cancelled: () => boolean;
}
export type Scene = (ctx: SceneContext) => Promise<void>;
export interface Chapter { id: string; label: string; durationMs: number; run: Scene }
```

## 2. Scenes are self-seeding & cancellable (scenes.ts)

```ts
// Baseline every chapter can start from — lets any chapter be JUMPED to, not just played in order.
const baseline = (): Partial<DemoState> => ({ activeTab: "chat", /* …the state "after setup" … */ });

const moveCursor = (ctx: SceneContext, target: string) => ctx.patch({ cursor: { target, clicking: false } });
const clickCursor = async (ctx: SceneContext) => {
  const target = ctx.get().cursor.target;
  ctx.patch({ cursor: { target, clicking: true } });
  await ctx.wait(240);
  ctx.patch({ cursor: { target, clicking: false } });
};

const sceneSearch: Scene = async (ctx) => {
  ctx.patch({ ...baseline(), activeTab: "search" });   // self-seed
  await ctx.wait(500); if (ctx.cancelled()) return;
  moveCursor(ctx, "search-input");
  await ctx.wait(650);
  await ctx.stream("query text", (v) => ctx.patch({ searchQuery: v }), 1, 70);
  if (ctx.cancelled()) return;
  moveCursor(ctx, "search-result");
  await ctx.wait(700);
  await clickCursor(ctx);
  // …open something, wait, clean up…
};

export const CHAPTERS: Chapter[] = [
  { id: "capture", label: "Capture & sync", durationMs: 11500, run: sceneCapture },
  { id: "search",  label: "Instant search", durationMs: 6800,  run: sceneSearch },
  // append new scenes here → stepper grows automatically
];
```

## 3. The engine hook (use-demo-sequence.ts)

Key ideas: single `patch`, a `stateRef` for `get()`, an effect that runs the loop with a private
`cancelled` flag + timer list, **real duration measurement**, and manual handlers that `pause()`
(which also snaps to a clean idle state) + a `jumpTo`/`togglePlay`.

```ts
export function useDemoSequence({ active }: { active: boolean }) {
  const [state, setState] = useState(INITIAL_STATE);
  const stateRef = useRef(state); stateRef.current = state;
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused); pausedRef.current = paused;
  const [activeIndex, setActiveIndex] = useState(0);
  const [runId, setRunId] = useState(0);
  const startIndexRef = useRef(0);
  const measuredRef = useRef<number[]>([]);          // real per-chapter durations

  const patch = useCallback((p: Partial<DemoState>) =>
    setState((prev) => { const next = { ...prev, ...p }; stateRef.current = next; return next; }), []);

  const getChapterDuration = useCallback(
    (i: number) => measuredRef.current[i] ?? CHAPTERS[i]?.durationMs ?? 8000, []);

  const jumpTo = useCallback((i: number) => {
    startIndexRef.current = i; setActiveIndex(i); setPaused(false); setRunId((n) => n + 1);
  }, []);

  // pause() also resets the chatbot/overlays to a clean, complete idle frame — never blank.
  const pause = useCallback(() => { setPaused(true); patch(CLEAN_IDLE_PATCH); }, [patch]);

  const togglePlay = useCallback(() => { pausedRef.current ? jumpTo(0) : stopAndReset(); }, [jumpTo]);

  useEffect(() => {
    if (!active || paused) return;
    let cancelled = false; const timers: any[] = [];
    const wait = (ms: number) => new Promise<void>((r) => timers.push(setTimeout(r, ms)));
    const stream = (full, onUpdate, cpt = 2, tick = 24) => new Promise<void>((resolve) => {
      let i = 0; const id = setInterval(() => {
        if (cancelled) { clearInterval(id); resolve(); return; }
        i = Math.min(full.length, i + cpt); onUpdate(full.slice(0, i));
        if (i >= full.length) { clearInterval(id); resolve(); }
      }, tick); timers.push(id);
    });
    const ctx: SceneContext = { patch, get: () => stateRef.current, setAssistant, wait, stream, cancelled: () => cancelled };

    (async function play() {
      let i = startIndexRef.current;
      while (!cancelled) {
        const chapter = CHAPTERS[i]; if (!chapter) break;
        setActiveIndex(i);
        const t0 = performance.now();
        await chapter.run(ctx);
        if (cancelled) return;
        await wait(700);                                   // gap between chapters
        measuredRef.current[i] = performance.now() - t0;   // remember real duration
        i = (i + 1) % CHAPTERS.length;
      }
    })();

    return () => { cancelled = true; timers.forEach((t) => { clearTimeout(t); clearInterval(t); }); };
  }, [active, paused, runId, patch]);

  // manual handlers wrap pause() then apply their change; expose state + activeIndex + jumpTo + togglePlay + getChapterDuration.
}
```

Manual-handler rule: every user handler calls `pause()` first, then patches its own change — and
sets a **complete** overlay/tab/chat state so nothing is left half-open.

## 4. Cursor layer (cursor-layer.tsx)

```tsx
export function CursorLayer({ containerRef, cursor }: { containerRef: RefObject<HTMLElement|null>; cursor: CursorState }) {
  const [pos, setPos] = useState({ x: 64, y: 96 });
  const visible = cursor.target !== null;
  useEffect(() => {
    const c = containerRef.current; if (!c || !cursor.target) return;
    let raf = 0, tries = 0;
    const measure = () => {
      const el = c.querySelector(`[data-cursor-target="${cursor.target}"]`);
      if (!el) { if (tries++ < 12) raf = requestAnimationFrame(measure); return; }
      const cr = c.getBoundingClientRect(), r = el.getBoundingClientRect();
      setPos({ x: r.left - cr.left + r.width / 2, y: r.top - cr.top + r.height / 2 });
    };
    measure(); return () => cancelAnimationFrame(raf);
  }, [cursor.target, containerRef]);
  // render trailing dots (softer springs) + an SVG arrow, animate {x,y,opacity} via framer.
}
```

Mount it at the **outermost** mockup node (`<CursorLayer containerRef={mockupRef} …/>`) so it can
measure targets in the toolbar and every pane. Tag targets: `data-cursor-target="search-input"`,
`"sel-start"`, `"sel-end"`, `"dialog-publish"`, `"floating-ball"`, etc.

## 5. Chapter stepper (chapter-stepper.tsx)

```tsx
// numbered circles, story-style segment fill per chapter, click-to-jump.
{chapters.map((c, i) => {
  const status = i < activeIndex ? "done" : i === activeIndex ? "active" : "upcoming";
  return (
    <button key={c.id} onClick={() => onJump(i)} className="flex flex-col items-center gap-1.5">
      <span className={circleClass(status)}>{i + 1}</span>
      <span className="h-1 w-7 overflow-hidden rounded-full bg-neutral-800">
        {status === "done" && <span className="block h-full w-full bg-emerald-400/80" />}
        {status === "active" && (
          <motion.span key={`${i}-${playing}`} initial={{ width: "0%" }}
            animate={{ width: playing ? "100%" : "30%" }}
            transition={{ duration: playing ? getDuration(i) / 1000 : 0.3, ease: "linear" }} />
        )}
      </span>
    </button>
  );
})}
```

## 6. Verification loop (playwright, headless)

```js
// launch with executablePath to the sandbox chromium; DON'T `playwright install`.
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
page.on("pageerror", (e) => errs.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !/ERR_TUNNEL|Failed to load resource/.test(m.text())) errs.push(m.text()); });
await page.goto(url); await page.locator(".hero-demo-root").scrollIntoViewIfNeeded();
// Jump to a chapter via the stepper, then WAIT FOR A TARGET STRING/ELEMENT, then screenshot:
await page.getByRole("button", { name: /Publish/ }).click();
await page.getByText("Most popular").waitFor({ timeout: 30000 });
await page.locator(".hero-demo-root").screenshot({ path: "state.png" });
// assert errs.length === 0
```

Read every screenshot and fix until each state is indistinguishable from the real product.
