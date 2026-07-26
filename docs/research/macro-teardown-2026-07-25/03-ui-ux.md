# Macro (macro.com) — Frontend / Design System / UX Craft Teardown
### + a concrete UI Upgrade Kit for the MLE ROB Dashboard

**Analysis date:** 2026-07-25
**Target analysed:** `/private/tmp/claude-501/-Users-robertacheson-Projects-MyLocalEverything/1eb0b710-ce17-40e9-ac89-e0bbf3de6054/scratchpad/macro` — Macro v2.5.0, AGPLv3
**Compared against:** `/Users/robertacheson/Projects/MyLocalEverything/MLE ROB Dashboard` (canonical per `~/.claude/rules/canonical-repos.md`)
**Scope:** `apps/web/src`, `apps/web/tailwind-plugins`, `packages/lexical-core`, `packages/collaboration`

---

## 0. Headline: the framework mismatch, stated up front

**Macro's web app is SolidJS, not React.** Evidence: `apps/web/package.json:141` (`"solid-js": "^1.9.7"`), `apps/web/package.json:118` (`"@solidjs/router": "^0.15.3"`), and every component file uses `createSignal` / `createMemo` / `<Show>` / `<For>`.

That matters for the upgrade kit. It means:

- **Steal freely:** the CSS token architecture, the Tailwind v4 `@theme` block, the OKLCH ramp math, the `Layer` elevation model, the hotkey scope-tree *design*, the keyframes, the easing curves, the `data-modality` trick, the skeleton shimmer, the empty-state choreography. These are CSS + plain-TS and port to React 1:1.
- **Re-implement, don't copy:** the hotkey engine's Solid reactivity (`createSignal` for `activeScope`), the command menu components, `Layer` (Solid's `display: contents` + inline style works identically in React, but the file itself imports `solid-js`).
- **Not portable at all:** `@kobalte/core` (Solid's Radix equivalent — `apps/web/package.json:73`). Macro is **not** using Radix or shadcn. React's nearest equivalent is Radix UI primitives.

Also worth naming: Macro ships a **Tauri desktop app** (`apps/web/tauri/`, `apps/web/package.json:120-126`), which is why so much of the CSS is about safe-area insets, touch modality, and `overflow: hidden` on `html`.

---

## 1. Design system: the primitives

### 1.1 Where it lives

| Thing | Path |
|---|---|
| The entire token layer | `apps/web/src/index.css` (774 lines) |
| The one Tailwind JS plugin | `apps/web/tailwind-plugins/zIndex.ts` (26 lines) |
| Component library root | `apps/web/src/components/ui/` (3,716 lines, 30 components) |
| Barrel export | `apps/web/src/components/ui/index.ts` (69 lines) — imported everywhere as `@ui` |
| Theme engine | `apps/web/src/features/theme/` (19 files) |
| Elevation primitive | `apps/web/src/components/ui/components/Layer.tsx` (80 lines) |

**There is no `tailwind.config.js`.** Tailwind v4 (`apps/web/package.json:119` `"@tailwindcss/vite": "^4.2.4"`), CSS-first config. Everything is `@theme` / `@utility` / `@custom-variant` inside `index.css`.

### 1.2 Not Radix. Not shadcn. Kobalte + custom.

- `@kobalte/core: ^0.13.11` (`apps/web/package.json:73`) — SolidJS headless primitives, the Solid port of Radix. Used for `Button` (`components/ui/components/Button.tsx:6`), `Tooltip` (`Tooltip.tsx:3`), `Dialog`, `Dropdown`.
- `@corvu/dialog` + `@corvu/drawer` (`package.json:59-60`) for drawers.
- `@floating-ui/dom: ^1.7.4` (`package.json:64`) for positioning.
- `tailwind-merge: ^3.4.0` (`package.json:147`) — but **`clsx` is re-implemented locally** rather than installed. `components/ui/utils/classname.ts:5-38` contains a hand-rolled `clsx` with the comment *"Local `clsx`-compatible types + implementation (so we don't depend on the external `clsx` package being installed)."*
- Icons: `@phosphor-icons/core` (`package.json:100`) as SVG components via `vite-plugin-solid-svg`.

### 1.3 The color system — this is the most stealable thing in the repo

Macro does **not** ship hex colors. It ships **three 5-step OKLCH ramps**, each decomposed into separately-animatable `L`, `C`, `H` custom properties registered with `@property`.

`apps/web/src/index.css:9-32` — the registered properties (excerpt):

```css
@property --a0l { syntax: "<number>"; inherits: true; initial-value:   0.88; }
@property --a0c { syntax: "<number>"; inherits: true; initial-value:   0.20; }
@property --a0h { syntax: "<angle>";  inherits: true; initial-value: 145deg; }
/* … a1–a4, b0–b4, c0–c4, 45 properties total … */
@property --b0l { syntax: "<number>"; inherits: true; initial-value:      0; }
@property --c0l { syntax: "<number>"; inherits: true; initial-value:      1; }
```

`index.css:88-104` — the ramps assembled:

```css
/* accent - active, hover states, high chroma */
--a0: oklch(var(--a0l) var(--a0c) var(--a0h));
/* … a1..a4 … */

/* base - background colors, borders */
--b0: oklch(var(--b0l) var(--b0c) var(--b0h));
/* … b1..b4 … */

/* contrast, body & paragraph text, icon stroke & fill */
--c0: oklch(var(--c0l) var(--c0c) var(--c0h));
/* … c1..c4 … */
```

The semantic meaning of each rung is documented in `features/theme/signals/themeReactive.ts:6-21`:

```ts
a0: {…, description: 'accent color'},
a1: {…, description: 'accent color +40°'},
a2: {…, description: 'accent color +80°'},
a3: {…, description: 'accent color +120°'},
a4: {…, description: 'accent color +160°'},
b0: {…, description: 'background'},
b1: {…, description: 'background active'},
b2: {…, description: 'background hover'},
b3: {…, description: 'muted edge'},
b4: {…, description: 'edge'},
c0: {…, description: 'text'},
c1: {…, description: 'text muted'},
c2: {…, description: 'text extra muted'},
c3: {…, description: 'text disabled'},
c4: {…, description: 'text placeholder'},
```

**Fifteen tokens. That's the whole palette.** Every surface, border, and text color in a 100k+ LOC app resolves to one of fifteen ramp positions.

`index.css:107-152` — the Tailwind `@theme` block that names them. Note line 3: **it nukes Tailwind's default palette entirely.**

```css
@theme {
  /* Disable default tailwind color palette */
   --color-*: initial;

  /* Match the hairline borders: make the default `ring` a 0.5px ring. */
  --default-ring-width: 0.5px;

  --color-accent:          var(--a0);
  --color-accent-bg:       oklch(var(--a0) / 0.08);
  --color-accent-hover:    oklch(var(--a0) / 0.20);

  --color-surface:         var(--b0);
  --color-drop-shadow:     oklch(0.15 0 0 / 0.04);
  --color-overlay:         oklch(0 0 0 / 0.05);

  --color-edge-muted:      var(--b3);
  --color-edge:            var(--b4);
  --color-rail:            color-mix(in oklch, var(--b4) 90%, var(--c0));

  --color-ink:             var(--c0);
  --color-ink-muted:       var(--c1);
  --color-ink-extra-muted: var(--c2);
  --color-ink-disabled:    var(--c3);
  --color-ink-placeholder: var(--c4);

  --color-page:            var(--theme-page, var(--b0));
  --color-panel:           var(--theme-panel, var(--b0));
  --color-inset:           var(--theme-inset, var(--b0));
  --color-dialog:          var(--theme-dialog, var(--b0));
  --color-menu:            var(--theme-menu, var(--b0));
  --color-input:           var(--theme-input, var(--b0));
  --color-message:         var(--theme-message, color-mix(in oklch, var(--b1) 50%, var(--b2)));
  --color-hover:           var(--theme-hover, var(--b2));
  --color-active:          var(--theme-active, var(--b1));
  --color-button:          var(--theme-button, var(--b0));
  --color-chrome:          var(--theme-chrome, color-mix(in oklch, var(--color-menu) 85%, var(--color-active)));
}
```

The `var(--theme-panel, var(--b0))` pattern is the escape hatch: a theme can override one surface role, otherwise it falls through to the Layer system (§1.6).

**Status colors** (`index.css:158-175`) — derived, not hardcoded pairs. One hue, three roles:

```css
--color-failure:     oklch(0.637 0.237 25.331);
--color-failure-bg:  oklch(from var(--color-failure) l c h / 0.15);
--color-failure-ink: oklch(from var(--color-failure) var(--c1l) c h); /* scuffed */

--color-success:     oklch(0.696 0.17 162.48);
--color-success-bg:  oklch(from var(--color-success) l c h / 0.15);
--color-success-ink: oklch(from var(--color-success) var(--c1l) c h);

--color-alert:       oklch(0.769 0.188 70.08);
--color-alert-bg:    oklch(from var(--color-alert) l c h / 0.15);
--color-alert-ink:   oklch(from var(--color-alert) var(--c1l) c h);
```

`oklch(from X l c h / 0.15)` gives the background tint; `oklch(from X var(--c1l) c h)` re-lights the same hue to the *text* lightness rung so the label is always legible against the tint. **One declaration per status, three usable colors out.** This is the single highest-leverage trick in the file.

**Entity-type colors** (`index.css:177-192`) — 16 file-type hues, all rotations of the accent:

```css
--color-calendar:    oklch(from var(--a0) l c 100deg);
--color-contact:     oklch(from var(--a0) l c  94deg);
--color-canvas:      oklch(from var(--a0) l c  60deg);
--color-folder:      oklch(from var(--a0) l c 240deg);
--color-code:        oklch(from var(--a0) l c 180deg);
--color-pdf:         oklch(from var(--a0) l c  25deg);
/* … */
```

Change the theme's accent lightness/chroma and all 16 entity colors follow. They stay a family.

### 1.4 Typography

`index.css:196-201`:

```css
--font-sans: "Inter Variable", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
--font-serif: "Playfair Display Variable", ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;
--font-mono: "Roboto Mono Variable",  monospace;
--text-xxs: 0.625rem;
```

Only **one** size is added to Tailwind's default scale: `--text-xxs: 0.625rem` (10px), for hotkey chips.

Two typography details worth stealing outright:

`index.css:294-297` — body font features and `-apple-system-body`:
```css
html { font: -apple-system-body; overflow: hidden; }
body {
  @apply overflow-clip overscroll-none relative m-0 p-0 font-sans optical-auto;
  font-feature-settings: "dlig" 1, "calt" 1;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

`index.css:497-505` — optical sizing as a Tailwind utility:
```css
@utility optical-* {
  font-optical-sizing: none;
  font-variation-settings: "opsz" --value(integer);
}
@utility optical-auto {
  font-variation-settings: unset;
  font-optical-sizing: auto;
}
```

And a mobile type bump that only touches *reading* sizes (`index.css:614-621`):
```css
@media (max-width: 639px) {
  :root:where(html[data-touch-device="true"]) {
    --text-base: 1.0625rem;
    --text-xxs: 0.6875rem;
    --text-xs: 0.8125rem;
    --text-sm: 0.9375rem;
  }
}
```
Comment on line 613: *"Purposefully only changing the 'reading' sizes, not the heading sizes."*

### 1.5 Borders, radii, shadows

**Radii:** Macro uses Tailwind's stock scale unmodified. `rounded-sm` for message highlights, `rounded-md` for command rows (`CommandMenuPrimitives.tsx:207`), `rounded-xl` for the command shell (`CommandMenuPrimitives.tsx:121`), `rounded-lg` for settings inputs.

**Borders — hairlines, enforced globally.** `index.css:512-543` overrides Tailwind's 1px border utilities to 0.5px:

```css
/* Hairline borders app-wide. We override Tailwind's default 1px width utilities
   so every border renders at 0.5px, including single-side borders, without
   having to sprinkle a modifier on each element. Explicit widths (border-2,
   border-4, …) are intentionally left untouched. */
@utility border   { border-width: 0.5px; }
@utility border-x { border-inline-width: 0.5px; }
@utility border-y { border-block-width: 0.5px; }
@utility border-t { border-top-width: 0.5px; }
@utility border-r { border-right-width: 0.5px; }
@utility border-b { border-bottom-width: 0.5px; }
@utility border-l { border-left-width: 0.5px; }
@utility border-s { border-inline-start-width: 0.5px; }
@utility border-e { border-inline-end-width: 0.5px; }
```

Paired with `--default-ring-width: 0.5px` (`index.css:112`). This is why Macro reads as crisp rather than boxy: nothing is separated by a full pixel.

**Shadows — almost none.** The entire app has *one* shadow token (`index.css:232`):

```css
/* Soft drop shadow for floating menus/popovers (use the `shadow-menu` utility). */
--shadow-menu: 0 8px 24px -16px rgb(0 0 0 / 0.24), 0 2px 8px -6px rgb(0 0 0 / 0.18);
```

Note the aggressive negative spread (`-16px`, `-6px`) — the shadow barely extends past the element. Depth comes from lightness, not shadow (§1.6).

**z-index is generated from TypeScript**, not written by hand. `apps/web/tailwind-plugins/zIndex.ts`:

```ts
import plugin from 'tailwindcss/plugin';
import * as stackingContext from '../src/lib/core/constant/stackingContext';

const zIndexKeys = Object.keys(stackingContext).map((key) =>
  key.slice(1).replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
);
const zIndexValues = Object.fromEntries(
  zIndexKeys.map((key, index) => [key, Object.values(stackingContext)[index]])
);
export default plugin(function ({ addUtilities }) {
  const zIndexUtilities = Object.fromEntries(
    zIndexKeys.map((key) => [`.z-${key}`, { zIndex: zIndexValues[key].toString() }])
  );
  addUtilities(zIndexUtilities);
});
```

Plus a hand-declared ladder in `@theme` (`index.css:218-228`) with the reasoning inline:

```css
--z-index-modal-overlay: 100;
--z-index-modal:         110;
--z-index-modal-content: 120;
/* Dropdowns/popovers (`z-action-menu`). Above modal content so menus opened
   from inside a modal render on top of it, below tooltips. */
--z-index-action-menu:   150;
--z-index-tool-tip:      200;
/* Toasts sit above everything (incl. full-screen modals) so they stay visible. */
--z-index-toast-region:  250;
```

### 1.6 The `Layer` system — elevation via OKLCH lightness, not shadow

`apps/web/src/components/ui/components/Layer.tsx` (80 lines) is the piece that makes Macro's surfaces read as physical without a single `box-shadow`.

```tsx
export function Layer(props: LayerProps) {
  const sign = () => (isDefaultMobileLight() ? -1 : 1);
  const depth = () => ((props.depth ?? 0) / 5) * themeDepth() * sign();

  // As Layer depth increases, Borders should get lighter slower than surfaces.
  const BORDER_SCALAR = 0.4;

  return (
    <div
      data-layer-depth={props.depth}
      style={{
        display: 'contents',
        '--b0': `oklch(max(var(--b0l) + ${depth()}, ${nearBlackStepMin()}) var(--b0c) var(--b0h))`,
        '--b1': `oklch(calc(var(--b1l) + ${depth()}) var(--b1c) var(--b1h))`,
        '--b2': `oklch(calc(var(--b2l) + ${depth()}) var(--b2c) var(--b2h))`,
        '--b3': `oklch(calc(var(--b3l) + ${depth() * BORDER_SCALAR}) var(--b3c) var(--b3h))`,
        '--b4': `oklch(calc(var(--b4l) + ${depth() * BORDER_SCALAR}) var(--b4c) var(--b4h))`,
        '--c0': `oklch(calc(var(--c0l) + ${depth()}) var(--c0c) var(--c0h))`,
        /* …c1..c4, then all the --color-* semantic re-derivations… */
      }}
    >
      {props.children}
    </div>
  );
}
```

The mechanics:
- `depth` is `0..5`, normalised to `0..1`, multiplied by `themeDepth()` (0.15 in Macro Dark desktop, 0.06 in Macro Light — see `features/theme/constants.ts:29` and `:50`).
- `display: contents` means the wrapper **has no box** — it only re-scopes CSS variables. Zero layout cost, no extra div in the box model.
- Nesting composes: a `depth={2}` panel inside a `depth={1}` section is measurably lighter than both.
- `BORDER_SCALAR = 0.4` — borders brighten slower than surfaces, so edges don't wash out as you stack.

`Surface.tsx:44-56` wraps `Layer` with the actual box:

```tsx
if (!local.hideBorder) {
  base.border = `0.5px solid ${local.edgeColor ?? 'var(--b4)'}`;
}
if (local.active) {
  const ring = local.highlightColor ?? 'var(--b4)';
  base['box-shadow'] = `0 0 0 2px color-mix(in srgb, ${ring} 60%, transparent)`;
}
return (
  <Layer depth={local.depth ?? 0}>
    <div style={style()} class={cn('relative rounded-md overflow-clip min-h-0 size-full bg-(--b0)', local.class)} {...rest}>
```

### 1.7 Motion tokens

`index.css:205-213` — all animations declared as `@theme` tokens so they're usable as `animate-*` utilities:

```css
--animate-slide-in: slideIn 150ms cubic-bezier(0.16, 1, 0.3, 1);
--animate-menu-open: menu-open 120ms cubic-bezier(0.16, 1, 0.3, 1);
--animate-dialog-overlay-open: dialog-overlay-open 120ms ease-out;
--animate-dialog-content-open: dialog-content-open 160ms cubic-bezier(0.16, 1, 0.3, 1);
--animate-dialog-fullscreen-open: dialog-fullscreen-open 160ms cubic-bezier(0.16, 1, 0.3, 1);
--animate-typing-dot: typing-dot 1s infinite;
--animate-swipe-out: swipeOut 100ms ease-out;
--animate-indeterminate-bar: indeterminate-bar 1.1s ease-in-out infinite;
```

**`cubic-bezier(0.16, 1, 0.3, 1)` is the house curve** — "expo-out". Used for every entrance. Durations are 100–160ms. Nothing entering takes longer than 160ms.

The press feedback curve is different and deliberate (`index.css:270-275`):

```css
[data-press-pulse] {
  transition: transform 100ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
[data-press-pulse][data-pressed] {
  transform: scale(1.08);
  transition: transform 100ms ease-out;
}
```

`cubic-bezier(0.34, 1.56, 0.64, 1)` overshoots past 1 (that `1.56` control point) — a spring. It's used on the *release*, so buttons "pop back". Applied via `components/app/mobile/pressPulse.ts:17`.

There is also a hand-rolled easing library at `apps/web/src/lib/animate/` (13 files) exporting `elasticIn/Out/InOut`, `bounceIn/Out/InOut`, `backIn/Out/InOut`, `cubicIn/Out/InOut`, `sineIn/Out/InOut`, `quadIn/Out/InOut`, `linear`, plus `createTimeline` and `controller` (`lib/animate/index.ts:17-27`). `lib/animate/easings/cubic.ts`:

```ts
export const cubicOut: EasingFn = (t) => 1 - Math.pow(1 - t, 3);
export const cubicInOut: EasingFn = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
```

---

## 2. Keyboard-first architecture — the crown jewel

This is 2,844 lines in `apps/web/src/lib/core/hotkey/`:

| File | Lines | Role |
|---|---|---|
| `hotkeys.ts` | 845 | registration + the global keydown/keyup root |
| `utils.ts` | 669 | scope tree surgery, key normalization, pretty-printing |
| `types.ts` | 457 | the `ValidHotkey` template-literal type + command shape |
| `tokens.ts` | 346 | the global token registry (stable IDs for every command) |
| `constants.ts` | 195 | shift-punctuation + macOS Option-key reverse maps |
| `getCommands.ts` | 99 | walks the scope tree to build the palette's item list |
| `state.ts` | 64 | the scope tree, active scope, pressed keys, recency |

### 2.1 The scope tree

Hotkeys aren't global handlers with `if` guards. They live in a **tree of scopes that mirrors the DOM**, and lookup walks *up* the tree.

`state.ts:6-21` — the root:

```ts
const initialTree = new Map<string, ScopeNode>([
  ['global', { scopeId: 'global', type: 'dom', childScopeIds: [], hotkeyCommands: new Map(), unkeyedCommands: [], detached: true }],
]);
export const hotkeyScopeTree = initialTree;
export const [activeScope, setActiveScopeInner] = createSignal<string>('global');
```

`types.ts:240-264` — a node:

```ts
export type ScopeNodeBase = {
  scopeId: string;
  description?: string;
  parentScopeId?: string;
  childScopeIds: string[];
  // Map of hotkey -> array of commands (multiple handlers can be registered for the same hotkey)
  hotkeyCommands: Map<ValidHotkey, HotkeyCommand[]>;
  // A list of commands that don't have hotkeys.
  unkeyedCommands: HotkeyCommand[];
  // If true, this scope is detached from the DOM tree, it's parent is global.
  detached: boolean;
};
export type CommandScopeNode = {
  type: 'command';
  activationKeys?: ValidHotkey[];   // the keys that activate this command scope
  originalParentScopeId: string;
};
```

Two node types: `dom` scopes (bound to an element, activated by `focusin`) and **`command` scopes** — transient sub-modes activated by a leader key, Vim-style. `types.ts:121-133`:

```ts
/**
 * If true, pressing the hotkey will activate a command scope.
 * `registerHotkey` will return the scopeId of the created command scope.
 */
activateCommandScope?: boolean;
```

### 2.2 Scope activation is driven by focus, and self-repairing

`hotkeys.ts:441-533`. A component calls `useHotkeyDOMScope('mycomponent')`, gets back `[attachFn, scopeId]`, and attaches to a ref. `attachFn` stamps `data-hotkey-scope={scopeId}` on the element (`hotkeys.ts:522`) and listens for `focusin`.

The self-healing part (`hotkeys.ts:472-491`) — because Solid mounts children before parents in some cases, the tree gets rebuilt on first focus by walking real DOM ancestry:

```ts
// Runs up the DOM tree, repairing the scope tree parent/child relationship of
// each DOM scope parent found.
const repairScopeBranch = (scopeNode: ScopeNode, scopeDOM: Element) => {
  let currentScope = scopeNode;
  let currentDOM: Element | null | undefined = scopeDOM;
  while (currentScope.scopeId !== 'global' && currentDOM) {
    if (currentScope.detached) break;
    const parentScopeId = findClosestParentScopeId(currentDOM);
    const parentScope = hotkeyScopeTree.get(parentScopeId);
    if (!parentScope) break;
    parentScope.childScopeIds.push(currentScope.scopeId);
    if (currentScope.type === 'dom') currentScope.parentScopeId = parentScopeId;
    currentScope = parentScope;
    currentDOM = findClosestParentScopeElement(currentDOM);
  }
};
```

And `utils.ts:276-296` — Escape / focus-loss walks *up* to the nearest real DOM scope and focuses it:

```ts
export function activateClosestDOMScope() {
  let currentScope = hotkeyScopeTree.get(activeScope() ?? '');
  let activeScopeId = 'global';
  while (currentScope) {
    const scopeElement = currentScope.type === 'dom' ? getScopeElement(currentScope.scopeId) : null;
    if (scopeElement instanceof HTMLElement) {
      scopeElement.focus();
      activeScopeId = currentScope.scopeId;
      break;
    }
    if (!currentScope.parentScopeId) break;
    currentScope = hotkeyScopeTree.get(currentScope.parentScopeId);
  }
  setActiveScope(activeScopeId);
}
```

### 2.3 The keydown root

`hotkeys.ts:571-651`. One `keydown` + one `keyup` on `document`, both `{ capture: true }`.

```ts
export function useHotKeyRoot() {
  if (isTouchDevice()) return;

  const handleKeyDown = (e: KeyboardEvent) => {
    document.documentElement.dataset.modality = 'keyboard';
    const key = normalizeEventKeyPress(e);
    if (key === 'dead') return;
    if (!EVENT_MODIFIER_KEYS.has(key) && isBaseKeyboardValue(key)) {
      setPressedKeys((prev) => new Set([...prev, key]));
    }
    /* … modifier bookkeeping … */
    checkHotKeys(e);
  };
```

Three hard-won correctness details a naive implementation gets wrong:

1. **macOS eats keyup while Cmd is held** (`hotkeys.ts:602-613`):
```ts
} else if (mod === 'metaKey' && e[mod]) {
  // If command key is pressed, clear all non-modifier keys except for key pressed in this event.
  // This is a necessary, defensive step because the OS captures the key-up events when you press, e.g. 'cmd+z'
  setPressedKeys((prev) => new Set(Array.from(prev).filter((k) => k in HOTKEY_TO_EVENT_NAME_MAP || k === key)));
}
```
2. **Releasing any modifier clears everything** (`hotkeys.ts:621-635`) — *"the user may have triggered some browser or os shortcut … also addresses an underlying problem of modifiers sometimes getting bugged out."*
3. **Window blur clears the pressed set** (`hotkeys.ts:638-640`) — no phantom stuck keys after ⌘Tab.

And `constants.ts:50-140` handles the thing almost nobody handles: **macOS Option-key produces different characters.** A full reverse map from `å→a`, `∫→b`, `ç→c`, `∆→j`, `˚→k`, `π→p`, `Ω→z`, `¡→1`, `™→2`, plus Option+Shift variants. Without it, `opt+j` is unbindable on a Mac.

### 2.4 Lookup: walk up, priority-sort, first `true` wins

`hotkeys.ts:686-700`:

```ts
let scopeNode = scopeTree.get(currentScopeId);
while (scopeNode) {
  const commands = scopeNode.hotkeyCommands.get(pressedKeysString);
  if (commands && commands.length > 0) {
    const sortedCommands = [...commands].sort(
      (a, b) => (b.handlerPriority ?? 0) - (a.handlerPriority ?? 0)
    );
```

Priority ladder at `types.ts:4-8`: `DEFAULT 0 / LOW 1 / NORMAL 2 / HIGH 3 / CRITICAL 4`.

Handler contract (`types.ts:109-113`): *"If it returns true, the event will prevent default and stop propagation to parent scopes and registered handlers to same scope."* So returning `false` = "I didn't handle it, let the parent try."

There's also an **interceptor layer** that runs before lookup (`hotkeys.ts:668-681`) — used by Lexical so the editor can claim keys before the app does.

### 2.5 Type-safe hotkey strings

`types.ts:385-408`. The set of legal hotkeys is a template-literal union — a typo is a compile error:

```ts
export type ValidHotkey =
  | BaseKeyboardValue
  | 'ctrl' | 'opt' | 'shift' | 'cmd'
  | 'ctrl+opt' | 'ctrl+shift' | 'opt+shift' | 'opt+cmd' | 'shift+cmd'
  | `ctrl+${BaseKeyboardValue}`
  | `opt+${BaseKeyboardValue}`
  | `shift+${BaseKeyboardValue}`
  | `cmd+${BaseKeyboardValue}`
  | `opt+cmd+${BaseKeyboardValue}`
  | `shift+cmd+${BaseKeyboardValue}`
  | `ctrl+opt+shift+${BaseKeyboardValue}`
  | `opt+shift+cmd+${BaseKeyboardValue}`;
```

The comment above it (`types.ts:275`): *"Is this hideous, yes. But it ensures that you can't register invalid hotkeys."* Modifier order is enforced by the type: `ctrl, opt, shift, cmd` (`types.ts:86`).

### 2.6 Tokens — stable IDs so the UI can *ask* what a shortcut is

`tokens.ts` is a 346-line nested const object:

```ts
export const TOKENS = {
  soup: { openSearch: 'soup.openSearch', sort: 'soup.sort', filter: 'soup.filter', … },
  entity: {
    step:   { end: 'entity.step.end', start: 'entity.step.start' },
    select: { end: 'entity.select.end', start: 'entity.select.start' },
    jump:   { home: 'entity.jump.home', end: 'entity.jump.end' },
    open: 'entity.open',
    action: { markDone: 'entity.action.markDone', delete: 'entity.action.delete', rename: 'entity.action.rename', … },
  },
  …
}
```

This is what makes the UI self-documenting. `<Button hotkey={TOKENS.entity.action.markDone}>` renders a tooltip that shows the *currently registered* shortcut — rename the binding in one place and every label follows. `SplitHeader.tsx:264` and `:273` do exactly this with `TOKENS.entity.step.start` / `.end`.

`components/ui/components/Hotkey.tsx:8-26` renders it:

```ts
const modifierMap = {
  shift: IS_MAC ? '⇧' : 'Shift',
  ctrl:  IS_MAC ? '⌃' : 'Ctrl',
  meta:  IS_MAC ? '⌘' : 'Ctrl',
  cmd:   IS_MAC ? '⌘' : 'Ctrl',
  opt:   IS_MAC ? '⌥' : 'Alt',
} as const;

const symbolMap = {
  ARROWRIGHT: '→', ARROWLEFT: '←', ARROWDOWN: '↓', ARROWUP: '↑',
  BACKSPACE: '⌫', DELETE: '⌦', ENTER: '↵', SPACE: 'Space', ESCAPE: 'ESC',
};
```

Chip styling (`Hotkey.tsx:221`): `rounded-sm px-1.5 py-px text-xxs` + a per-theme border/fill pair from `hotkeyStyles` (`Hotkey.tsx:28-90`).

### 2.7 The command palette

`features/command/` — 2,837 lines across 9 files:

| File | Lines |
|---|---|
| `Launcher.tsx` | 847 |
| `CommandMenu.tsx` | 819 |
| `useCommandItems.ts` | 513 |
| `CommandItem.tsx` | 240 |
| `state.ts` | 210 |
| `FavoritesCommands.tsx` | 111 |

**The palette is not a hardcoded list. It's a projection of the scope tree at the moment you press ⌘K.** `getCommands.ts:39-84`:

```ts
export function getActiveCommandsFromScope(scopeId: string, displayOptions: sortAndFilterOptions = {}) {
  let currentScopeNode = hotkeyScopeTree.get(scopeId);
  const hotkeySet: Set<ValidHotkey> = new Set();
  const commands: CommandWithInfo[] = [];
  let scopeLevel = 0;
  while (currentScopeNode) {
    const allHotkeyCommands = Array.from(currentScopeNode?.hotkeyCommands.values() ?? []).flat();
    const scopeCommands = [...allHotkeyCommands, ...(currentScopeNode?.unkeyedCommands ?? [])]
      .filter(filterCommands(displayOptions))
      .map((command) => {
        const hotkeys = command.hotkeys ?? [];
        const isShadowed = hotkeys.some((hk) => hotkeySet.has(hk));
        hotkeys.forEach((hk) => hotkeySet.add(hk));
        return { ...command, scopeLevel, hotkeyIsShadowed: isShadowed };
      });
    commands.push(...scopeCommands);
    if (displayOptions.limitToCurrentScope) break;
    currentScopeNode = hotkeyScopeTree.get(currentScopeNode?.parentScopeId ?? '');
    scopeLevel++;
  }
  commands.sort((a, b) => {
    if (displayOptions.sortByScopeLevel) {
      if (a.scopeLevel !== b.scopeLevel) return a.scopeLevel - b.scopeLevel;
      return (b.displayPriority ?? 0) - (a.displayPriority ?? 0);
    }
    return (b.displayPriority ?? 0) - (a.displayPriority ?? 0);
  });
  return displayOptions.hideShadowedCommands ? commands.filter((c) => !c.hotkeyIsShadowed) : commands;
}
```

`scopeLevel` sorting means **the most contextual commands rank first**. `hotkeyIsShadowed` means if a nested scope rebinds `d`, the outer `d` is greyed/hidden rather than lying to you.

The filter (`getCommands.ts:86-99`):
```ts
return (
  (command.hotkeys || !displayOptions.hideCommandsWithoutHotkeys) &&
  (!command.condition || command.condition()) &&
  (displayOptions.ignoreInputFocused || !isEditableInput(activeElement() as HTMLElement) || command.runWithInputFocused) &&
  hideValue !== true
);
```
`condition` is a reactive accessor, so the palette live-updates as app state changes.

**Palette features worth naming:**
- **Virtualized** (`CommandMenu.tsx:47`, `import { type VirtualizerHandle, VList } from 'virtua/solid'`) with fixed row height: `VIRTUAL_ITEM_HEIGHT = 40 /* tailwind h-10 */`, `MAX_LIST_HEIGHT = 40*8 + 16` (`CommandMenu.tsx:74-78`).
- **Category leader keys** (`GlobalHotkeys.tsx:68-76`): inside the palette, `l`=All, `m`=Command, `a`=Agents, `f`=Files, `t`=Tasks, `c`=Channels, `p`=People.
- **Persisted recency** (`features/command/recency.ts`) — 21 lines, a `makePersisted` store of `commandId → timestamp`.
- **`onHighlight` / `onHighlightEnd`** (`types.ts:51-54`): *"Called when the command becomes the highlighted item… Use for side effects like live previews."* This is how hovering a theme in the palette live-previews it.
- **`proxiedHotkey`** (`types.ts:66-73`): a command appears in the palette with its shortcut, but the keystroke is owned by another system (Lexical). Solves the "editor shortcuts should be discoverable but not double-fire" problem.
- **Selection-aware** (`use-soup-view-hotkeys.ts:248-270`): `cmd+k` with rows selected opens in *entity action mode* — only commands that operate on a selection.

`CommandMenuPrimitives.tsx:35-115` — `createCommandListController<T>`, a clean, generic, framework-shaped roving-selection controller: `selectNext` / `selectPrevious` wrap modulo, `setSelectedIndexFromPointer` sets index *without* triggering scroll-into-view (so mouse hover doesn't fight the keyboard). Worth reading before you write your own.

### 2.8 The input-modality trick

`index.tsx:43-68` — three capture-phase listeners stamp the document:

```ts
// Track current input modality (keyboard / mouse / touch) on the document element.
// Used by hotkeys and other modality-aware behaviors.
// Use capture phase to ensure we catch events even if they're stopped by handlers
document.addEventListener('keydown',    () => { document.documentElement.dataset.modality = 'keyboard'; }, { capture: true });
document.addEventListener('mousedown',  () => { document.documentElement.dataset.modality = 'mouse'; },    { capture: true });
document.addEventListener('touchstart', () => { document.documentElement.dataset.modality = 'touch'; },    { capture: true, passive: true });
```

Read via `lib/core/mobile/inputModality.ts:6-9`. Consumed by `components/app/useNavigatedFromJK.ts:13` to decide whether the last navigation was keyboard-driven (and therefore whether to show a focus ring / auto-open a preview). Also `index.css:576-580` suppresses hover styling on touch:

```css
html:not([data-touch-device="true"]) [data-message]:hover { @apply bg-ink/5 rounded-sm; }
```

### 2.9 List navigation — the j/k pattern, and one exquisite detail

`use-soup-navigation-hotkeys.ts:259-319`:

```ts
registerHotkey({ hotkey: ['j'],         scopeId, description: 'Down', hotkeyToken: TOKENS.entity.step.end,   condition: canRunListNavigation, keyDownHandler: navigateDown, hide: true });
registerHotkey({ hotkey: ['arrowdown'], scopeId, description: 'Down',                                                                        keyDownHandler: navigateDown, hide: true }).withGroup(group);
registerHotkey({ hotkey: ['k'],         scopeId, description: 'Up',   hotkeyToken: TOKENS.entity.step.start, condition: canRunListNavigation, keyDownHandler: navigateUp,   hide: true });
registerHotkey({ hotkey: ['arrowup'],   scopeId, description: 'Up',                                                                          keyDownHandler: navigateUp,   hide: true }).withGroup(group);
registerHotkey({ hotkey: ['shift+arrowup',   'shift+k'], scopeId, description: 'Select up',   hotkeyToken: TOKENS.entity.select.start, keyDownHandler: () => handleNavigationSelection(-1), hide: true }).withGroup(group);
registerHotkey({ hotkey: ['shift+arrowdown', 'shift+j'], scopeId, description: 'Select down', hotkeyToken: TOKENS.entity.select.end,   keyDownHandler: () => handleNavigationSelection(1),  hide: true }).withGroup(group);
```

**The detail** — `use-soup-navigation-hotkeys.ts:62-70`:

```ts
// Row focus moves instantly on every keypress; the (expensive) block swap in
// the Viewer trails the last press. mergeHistory keeps the Viewer's
// history at a single scanning entry while holding j/k.
const openInViewerDebounced = debounce((entity: EntityData) => {
  openEntityInSplitFromUnifiedList(entity, { splitHandle, mergeHistory: true, referredFrom: navigationReferredFrom() });
}, 150);
onCleanup(() => openInViewerDebounced.clear());
```

Two update speeds: **selection is instant, the expensive preview is debounced 150ms.** Hold `j` and you scan a list at full speed with zero jank; stop, and the detail pane fills in. And `mergeHistory: true` collapses the whole scan into one back-button entry. This is the actual mechanism behind "fastest interface."

Scroll follows via the virtualizer, not `scrollIntoView` (`use-soup-navigation-hotkeys.ts:41-48`):
```ts
virtualizerHandle()?.scrollToIndex(index, { align: 'nearest' });
```

`createHotkeyGroup()` (`hotkeys.ts:394`) + `.withGroup(group)` gives bulk teardown: `types.ts:222-230` — `add`, `addDisposer`, `dispose`. No leaked listeners on unmount.

---

## 3. Speed tricks

### 3.1 Virtualization — `virta`, not TanStack

`apps/web/package.json:153`: `"virtua": "0.48.8"` (pinned exact). Also `@tanstack/solid-virtual` is present (`package.json:114`) but `virtua` is what the hot paths use.

`features/next-soup/soup-view/soup-view.tsx:132-133`:
```ts
import { Virtualizer, type VirtualizerHandle } from 'virtua/solid';
import type { CacheSnapshot } from 'virtua/unstable_core';
```

**Scroll position and measurement cache are persisted per list** so returning to a list restores exactly where you were, without re-measuring (`soup-view.tsx:1170-1174`):

```ts
const virtualHandle = virtualizerHandle();
… {
  virtualCache: virtualHandle?.cache,
  scrollOffset: virtualHandle?.scrollOffset,
}
```
and replayed at `soup-view.tsx:1318`: `cache={readListEntryState()?.virtualCache}`.

That's the difference between "scroll restoration" and *state* restoration — no flash, no re-layout.

### 3.2 Optimistic updates with undo/redo built into the mutation

`features/next-soup/actions/make-mark-done-action.ts` is the reference pattern. `useUndoableMutation` (`@queries/undo`) extends TanStack's mutation with `undoFn`/`redoFn`/`undoLabel`/`onPushed`:

```ts
const mutation = useUndoableMutation<void, Error, MarkDoneVariables, MarkEntitiesDoneContext>(() => ({
  hotkeyGroup,
  onMutate: (variables) => applyEntitiesDoneOptimistic({ … }),   // returns a context with rollback/applyUndone/reapply
  mutationFn: (variables) => executeMarkEntitiesDone({ … }),
  onError: (_err, _variables, context) => {
    context?.rollback();
    toast.failure('Failed to mark as done');
  },
  undoFn: async (variables, context) => {
    context?.applyUndone();
    try { await executeMarkEntitiesUndone({ … }); }
    catch (err) { context?.reapply(); throw err; }
  },
  redoFn: async (variables, context) => {
    context?.reapply();
    try { await executeMarkEntitiesDone({ … }); }
    catch (err) { context?.applyUndone(); throw err; }
  },
  undoLabel: 'Mark Done',
```

The context object exposes **four** verbs — `rollback`, `applyUndone`, `reapply` — so optimistic failure, user-undo, and undo-failure are three distinct paths, not one `catch`. Undo is also **hotkey-group scoped** (`hotkeyGroup` on line 2): *"undo entries pushed by this action are dropped from the undo stack when the group is disposed"* (`make-mark-done-action.ts:49-50`). Navigate away and stale undos evaporate.

The toast carries the undo action (`make-mark-done-action.ts:153-166`):
```ts
toastId = toast.success(message, {
  actions: [{ label: 'Undo', icon: ArrowCounterClockwise, onClick: () => handle.undo({ onError: () => toast.failure('Failed to undo') }) }],
  duration: 3_000, stack: true, hideOnMobile: true,
});
```

And **focus is part of the undo contract** (`make-mark-done-action.ts:168-176`) — undoing restores the row focus *and* navigates the viewer back. Keyboard state is treated as application state.

Selection/navigation is resolved *before* the mutation fires (`make-mark-done-action.ts:229-250`): it computes `adjacentRow(1) ?? adjacentRow(-1)` skipping already-marked rows, so the cursor lands somewhere sensible the instant you press the key.

### 3.3 Prefetching

`features/channel/Channel/create-channel-find-bar.ts:131-176`:
```ts
// `prefetchQuery` is a no-op when the cached entry is fresh (staleTime is …)
queryClient.prefetchQuery(…)
// replies to the same parent thread share one prefetch.
queryClient.prefetchInfiniteQuery(…)
```

Plus a **block-level preload intent protocol**: every block type declares a `preload` handler (`features/block-md/definition.ts:34-36`, `block-pdf/definition.ts:34-36`, `block-image/definition.ts:31-33`, `block-video/definition.ts:64-66`, `block-chat/definition.ts:32-34`, `block-canvas/definition.ts:29`, `block-automation/definition.ts:14-16`, `block-unknown/definition.ts:21-23`):
```ts
if (intent === 'preload') { … type: 'preload' … }
```
Hovering or arrowing near a file triggers `preload`, so opening it is instant.

### 3.4 Skeletons

Not `animate-pulse`. A **sweeping gradient** (`index.css:319-341`):

```css
@keyframes skeleton-shimmer { 100% { transform: translateX(100%); } }
.skeleton-shimmer { position: relative; overflow: hidden; }
.skeleton-shimmer::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, oklch(from var(--color-ink) l c h / 0.08), transparent);
  animation: skeleton-shimmer 1.4s infinite;
}
```

The highlight is derived from `--color-ink` so it works in any theme, light or dark, without a second rule.

Skeletons mirror the real layout, they aren't grey blobs — `features/block-pr/component/PrSkeletons.tsx:28-48`:
```tsx
export function PrTitleSkeleton()    { return <SkeletonBar class="h-8 w-full max-w-xl" />; }
export function PrMetadataSkeleton() { return <div…><SkeletonBar class="h-6 w-20" /><SkeletonBar class="h-6 w-28" /><SkeletonBar class="h-6 w-36" /><SkeletonBar class="h-6 w-24" /></div>; }
export function PrDescriptionSkeleton() { return <div…><SkeletonBar class="h-2 w-full max-w-lg" /><SkeletonBar class="h-2 w-full max-w-md" /><SkeletonBar class="h-2 w-2/3 max-w-sm" /></div>; }
```
Varying widths, matching heights, ragged right edge — it reads as text.

### 3.5 Suspense + error boundaries, paired per section

`features/home/home-section-boundary.tsx:87-113` — one component that wraps every home section in **both** an `ErrorBoundary` and a `Suspense`, so one failing section never blanks the page:

```tsx
export function HomeSectionBoundary(props: HomeSectionBoundaryProps) {
  return (
    <ErrorBoundary fallback={(error, reset) => <HomeSectionError error={…} reset={reset} title={props.title} />}>
      <Suspense fallback={props.fallback === undefined ? <HomeSectionFallback /> : props.fallback}>
        {props.children}
      </Suspense>
    </ErrorBoundary>
  );
}
```

The error state (`home-section-boundary.tsx:26-72`) has a warning glyph in a `bg-failure/10` circle, a plain-language line — *"We couldn't load this section. Try again, or view details if the issue continues."* — a **Try again** button wired to `reset`, and a **Show details** toggle that reveals `props.error.message`. Full recovery affordance, no stack trace by default.

### 3.6 Other speed/perf choices

- `index.css:299-306`: `overflow: hidden` on `html`, `overflow-clip overscroll-none` on `body`, `height: 100dvh`. App-shell, not document.
- `index.css:313-315`: `:where(*) { scrollbar-width: none; }` — scrollbars hidden globally, with `solid-custom-scrollbars` (`package.json:139`) where one is wanted.
- `index.css:308-311`: `user-select: none` by default, re-enabled only on `input, textarea, select, p *, [contenteditable], .md *`. Desktop-app feel; kills accidental text selection during drag.
- `index.css:660-665`: Kobalte popovers are hidden until floating-UI has positioned them — *"Without this, the card briefly appears at top:0 left:0 on first open."*
- `index.css:507-510`: `@utility cursor-pointer { cursor: default; }` and `a { cursor: default; }` — "Big hammer fix for cursor pointer." Native-app convention: no hand cursor.

---

## 4. Layout: the multi-pane shell

`apps/web/src/components/app/split-layout/` — 10,591 lines across 30 files.

| File | Lines | Role |
|---|---|---|
| `layoutManager.ts` | 1,970 | the split tree, focus, history, events |
| `tests/layoutManager.test.ts` | 1,278 | (it's tested) |
| `componentRegistry.tsx` | 594 | what content can live in a split |
| `components/SplitHeader.tsx` | 583 | per-pane header/tab bar |
| `components/SplitPanel.tsx` | 398 | one pane |
| `SplitLayout.tsx` | 185 | the container |
| `layoutUrlSync.ts` | 200 | layout ⇄ URL |
| `splitFocusTracker.ts` | 215 | which pane is "active" |
| `previewPersistence.ts` | 143 | preview-pair restore |
| `registerSplitHotkeys.ts` | 127 | pane hotkeys |
| `mobile/createMobileSwipeLayout.ts` | 223 | panes → swipe stack on mobile |

The resizing engine is separate and generic: `apps/web/src/lib/core/component/Resize/Resize.tsx` + `solver.ts`. API:

```tsx
<Resize.Zone direction="horizontal" gutter={8} minSize={100}>
  <Resize.Panel id="panel1" minSize={150}>Content 1</Resize.Panel>
  <Resize.Panel id="panel2" minSize={200}>Content 2</Resize.Panel>
</Resize.Zone>

// Access hide/show functionality via context
const ctx = useContext(ResizeZoneContext);
ctx.hide('panel1'); // Temporarily hide panel1, others flow around it
ctx.show('panel1');
```
(`Resize.tsx:55-68`)

Key design decisions:
- **The solver is axis-agnostic** (`Resize.tsx:83-89`): *"shares are dimensionless, so it only needs the current axis to store; reactivity lives on `ctx.direction`."* One solver serves horizontal and vertical splits.
- Panels **register themselves** into the solver (`Resize.tsx:92-97`) and inherit the zone's `minSize` unless they override.
- Layout is a `createMemo` over `solver.solve()` producing `{ id, offset, size }` (`Resize.tsx:114-121`) — panels are absolutely positioned from computed offsets, so a resize is one recompute, not a flex reflow cascade.
- **Hidden ≠ unmounted** (`Resize.tsx:123-125`, `ctx.hide/show/isHidden`) — hiding a pane keeps its state.
- Zone size comes from `createElementSize` (`@solid-primitives/resize-observer`), i.e. ResizeObserver, not window resize events.

The layout **round-trips through the URL** (`layoutUrlSync.ts`, `previewPersistence.ts` — `PREVIEW_QUERY_PARAM`), so a two-pane arrangement is a shareable link, and `SplitLayout.tsx:52-57` restores it on mount.

On mobile the same tree renders as a swipe stack instead of side-by-side (`mobile/createMobileSwipeLayout.ts`, `mobile/MobileSplitContainer.tsx`, `mobile/createMobileSwipeBackGesture.ts`, `mobile/createMobileForwardAnimation.ts`) — `SplitLayout.tsx:71-74`:
```ts
const mobileSwipeLayout: MobileSwipeLayout | undefined =
  isNativeMobilePlatform() ? createMobileSwipeLayout(splitManager) : undefined;
```

---

## 5. The editor: Lexical + Loro CRDT

Versions: `lexical: 0.45.0` with 12 `@lexical/*` packages pinned to the same version (`apps/web/package.json:75-86`), `loro-crdt: 1.13.3` (`package.json:132`), plus the workspace packages `@macro-inc/lexical-core`, `@macro-inc/collaboration`, `@loro-mirror/core` (`package.json:87-90`).

Sizes: `packages/lexical-core` — 89 files, **14,650 lines**. `packages/collaboration` — 60 files, **12,170 lines**. `packages/loro-mirror` — 20 files, **6,345 lines**.

### 5.1 How much of `lexical-core` is generic vs Macro-specific?

**It is 100% free of framework and Macro-package coupling, but ~58% of its content encodes Macro product concepts.**

The non-coupling is verified, not assumed:
- `grep -rn "@macro-inc" packages/lexical-core --include="*.ts"` → **0 hits**. `packages/lexical-core/README.md` states the rule: *"All files in this package should ONLY import from lexical or from other files in this package."*
- `grep -rn "solid-js" packages/lexical-core --include="*.ts"` → **1 hit, and it's a comment**. `packages/lexical-core/decoratorRegistry.ts:71`:
  ```ts
  // Generic component type to be overridden by solid-js on the front end
  ```
  The rendering seam is a type-level registry with the component type left generic. A React host fills it with React components. **Nothing in the package imports a rendering framework.**

Content split (excluding 2,364 lines of tests):

| bucket | lines | share |
|---|---|---|
| Macro product-domain (mentions, doc cards, diffs, snapshots, watermarks, AI nodes) | ~7,100 | ~58% |
| Generic Lexical (media nodes, tables, XML codecs, KaTeX, Prism, the two plugins) | ~5,200 | ~42% |

Product-specific: 9 mention node types (2,076 lines — `DocumentMentionNode` 353, `ContactMentionNode` 310, `TagMentionNode` 249, `DateMentionNode` 232, `UserMentionNode` 221, `PullRequestMentionNode` 216, `ThemeMentionNode` 176, `GroupMentionNode` 167, `UnknownMentionNode` 152), `DocumentCardNode` 482, `SnapshotNode` 295, the diff family 534, `WatermarkNode` 234, `AwaitNode` 189, `CompletionNode` 84. Product strings leak into class names — `nodes/WatermarkNode.ts:132` `element.className = 'macro-watermark-node'`, `nodes/AwaitNode.ts:120` `elem.classList.add('macro-await-node')`, `nodes/HtmlRenderNode.ts:132` `'macro_html_render macro_html_render_adapt'` — and `node-list.ts:50-55` hardcodes the product's editor variants:
```ts
export type EditorType = 'plain-text' | 'markdown' | 'markdown-sync' | 'chat' | 'title';
```

Generic and liftable: `transformers/tables.ts` 417, `transformers/xml/*` (~680 — a reusable Lexical↔XML serializer), `utils/languageSupport.ts` 323 (Prism table), `EquationNode` 166 (KaTeX), `ImageNode`/`VideoNode`/`MediaNode` 834, `CustomCodeNode` 255.

The package also carries **dead dependencies** — `@ai-sdk/*` (four packages), `ai`, `zod`, `p-queue`, `random-js`, `envsafe` all appear in `package.json` and are imported **zero** times.

### 5.2 The crown jewel: two 600-line plugins with no product concepts

`packages/lexical-core/plugins/nodeIdPlugin.ts` (272) and `peerIdPlugin.ts` (328). Pure Lexical. They solve the hard problem any Lexical+CRDT integration hits: **durable node identity across the serialization boundary.**

`nodeIdPlugin.ts:28-31` maintains a bidirectional map:
```ts
export type NodeIdMappings = {
  idToNodeKeyMap: Map<string, NodeKey>;
  nodeKeyToIdMap: Map<NodeKey, string>;
};
```
and registers a node transform per class that assigns a nanoid, regenerates on collision, and GCs on `destroyed` (`:121-132`):
```ts
const createNodeTransform = () => (node: LexicalNode) => {
  const { idToNodeKeyMap, nodeKeyToIdMap } = props.mappings;
  let id = $assertId(node, idLength);
  if (idToNodeKeyMap.has(id) && idToNodeKeyMap.get(id) !== node.getKey()) {
    id = $regenId(node, idLength);          // collision → new id
  }
  const nodeKey = node.getKey();
  idToNodeKeyMap.set(id, nodeKey);
  nodeKeyToIdMap.set(nodeKey, id);
};
```
Paste handling (`:193-202`) intercepts `SELECTION_INSERT_CLIPBOARD_NODES_COMMAND` at `COMMAND_PRIORITY_CRITICAL` to invalidate ids on pasted subtrees — but deliberately returns `false` so `@lexical/table` and `@lexical/clipboard` still perform the insert.

`peerIdPlugin.ts:137-151` stamps each node with the Loro `peerId` that created it and toggles a `.local` CSS class, with a documented contract (`:22-28`):
```ts
export const LOCAL_STATUS_TAG = 'local-status';
// "Contract: updates carrying this tag MUST NOT mutate node content — collab
//  providers skip syncing them entirely..."
```

The package defines only **three commands** total: `INITIALIZE_DOCUMENT_IDS` (`nodeIdPlugin.ts:37`), `INITIALIZE_LOCAL_STATUS` (`peerIdPlugin.ts:120`), and the paste interception.

### 5.3 How Loro is actually wired to Lexical

Three layers — and **the top layer is not in a package**, it's in the Solid app:

```
Lexical editor
   │  registerUpdateListener            apps/web/.../MarkdownCollabProvider.tsx:400-418
   ▼
SerializedEditorState (ids injected by nodeIdPlugin)
   │  SyncEngine.syncStateToLoro        packages/collaboration/src/collab/engine.ts
   ▼
LoroManager.syncToLoro → Mirror.setState
   │  diffContainer / diffMovableList   packages/loro-mirror/src/core/diff.ts
   ▼
LoroDoc ──subscribeLocalUpdates──▶ WAL → BroadcastChannel → WebSocket(Bebop) → Rust sync-service
```

**It uses `registerUpdateListener`, not mutation listeners.** `MarkdownCollabProvider.tsx:400-410`:
```tsx
props.editor.registerUpdateListener(({ editorState, tags, mutatedNodes }) => {
  syncLexicalToLoro(editorState, mutatedNodes, tags);
  return false;
}),
```
`mutatedNodes` is used purely as a "did anything change?" gate (`:386-395`). Mutation listeners exist only in `nodeIdPlugin`/`peerIdPlugin` for identity bookkeeping.

**Echo-loop prevention is four independent layers** — this is the part most implementations get wrong:

1. **Lexical update tags** (`MarkdownCollabProvider.tsx:367-379`):
```tsx
// State updates tagged with 'FROM_LORO' are from the syncToLexical function
// and should not be synced to the loroManager. This would cause an infinite loop.
if (tags.has(FROM_LORO_TAG) || tags.has(COLLABORATION_TAG) ||
    tags.has(LOCAL_STATUS_TAG) || tags.has(CODE_HIGHLIGHT_IDS_TAG)) { return false; }
```
2. **`SyncDirection` filter** (`collaboration/src/collab/engine.ts:245-253`):
```ts
if (stateUpdate.metadata.direction === SyncDirection.TO_LORO) return;   // our own write
```
3. **Loro commit `origin`** (`loro-mirror/src/core/mirror.ts:566, 372-376, 458-460`):
```ts
this.doc.commit({ origin: 'to-loro' });          // every Mirror→Loro write is stamped
…
private handleLoroEvent = (event: LoroEventBatch) => {
  if (this.syncing) return;
  if (event.origin === 'to-loro') return;        // drop own echo
```
4. **An `async-mutex` `syncLock`** serializing inbound imports, outbound syncs, and reset (`engine.ts:70, 195, 221, 250, 297`).

**The diff model is two diffs at different levels.** Outbound, `loro-mirror` computes a `Change[]` against last-known state and applies per-container with one commit (`mirror.ts:110-126, 534-567`). List reconciliation uses **longest-increasing-subsequence** to emit a minimal set of `move` ops on a `LoroMovableList` (`diff.ts:47, 288, 355-364`):
```
/** LIS of the old indices that are in the common items
 * All move operations should only be performed on items that are not in the LIS. */
```
Inbound is *not* incremental — `doc.toJSON()` snapshotted into an immer `produce` (`mirror.ts:378-389`).

Then a second, keyed tree reconciler maps JSON back onto Lexical: `apps/web/src/lib/core/component/LexicalMarkdown/collaboration/reconcile.ts` (287 lines) — deletes, cross-parent moves, `updateFromJSON` patches, inserts, all keyed by the `nodeIdPlugin` ids (`:216-285`). Cursor survival is handled by clearing selection, reconciling, then restoring from a stable `LoroCursor` in a `queueMicrotask` (`MarkdownCollabProvider.tsx:143-213`).

The Loro schema for a document (`packages/lexical-core/markdown-loro-schema.ts`, 34 lines) is recursive: each node is a `LoroMap` with `$` metadata (incl. `id`), a `LoroText` for CRDT text merging, and `children` as a **keyed** `LoroMovableList` — the key function is what feeds the LIS.

Candid hack worth knowing about, `markdown-loro-snapshot.ts:6-14` (duplicated at `manager.ts:223-227`):
```ts
// HACK: hack to get around async nature of mirror sync, which we have no control over.
async function awaitMirrorSync() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }
```

And a perf smell: `mapping.ts:105-145` resolves Lexical node → Loro container by **linear scan over every container id**, on every selection change.

### 5.4 What `collaboration` owns — and what it doesn't

`private: true` (`packages/collaboration/package.json`). Workspace-only.

| concern | owned | where |
|---|---|---|
| Loro doc lifecycle, version vectors | ✅ | `src/collab/manager.ts` (597) |
| Sync orchestration, anti-entropy | ✅ | `src/collab/engine.ts` (471) |
| Awareness / presence | ✅ | `src/collab/awareness.ts` (279) — Loro `EphemeralStore`, 10s TTL |
| WebSocket transport | ✅ | `src/websocket/**` (~5,700, ~2,700 of it tests) |
| Wire protocol | ✅ | `src/sync-service/` — Bebop codegen `schema.ts` (1,997) |
| Offline durability | ✅ | `src/collab/wal.ts` (385, IndexedDB WAL, 1-week TTL) + `snapshot-store.ts` (130) |
| Cross-tab gossip | ✅ | `src/collab/chatter.ts` (51, BroadcastChannel) |
| **Cursor rendering / Lexical mapping** | ❌ | app: `cursor.ts` (393), `remote-cursor.tsx` (364) |
| **Undo/redo across CRDT** | ❌ | app: `undo.ts` (454) |

Undo is **Loro's `UndoManager`, not Lexical's `HistoryPlugin`** (`.../collaboration/undo.ts:20, 216, 361-362`) — per-peer CRDT-aware undo, bridged into `UNDO_COMMAND`/`REDO_COMMAND`/`CAN_UNDO_COMMAND`. Durability: snapshot every 5s, WAL pruned only *after* the snapshot save succeeds (`engine.ts:264-294`) — *"we prune only after the save succeeds so that we can always recover fully."*

AI peers are a protocol-level concept (`src/collab/ai-peer.ts`): peer ids from a reserved block `999_999_999_999_999_000n` + 1000, so an AI editor is recognisable from its peer id alone, no lookup.

### 5.5 `loro-mirror` — the genuinely reusable one

`packages/loro-mirror/package.json`: `name: "@loro-mirror/core"`, **MIT**, real dual CJS/ESM build with `prepack`, `files: ["src","dist"]`, one runtime dep (`immer`), one peer dep (`loro-crdt`). A vendored copy of the upstream OSS project (`THIRD_PARTY_LICENSES.md`).

A generic Loro ⇄ plain-JS-object mirror with a typed schema DSL:
```ts
const todoSchema = schema({
  todos: schema.LoroList(schema.LoroMap({
    id: schema.String({ required: true }),
    text: schema.String({ required: true }),
    completed: schema.Boolean({ defaultValue: false }),
  })),
});
const store = createStore({ doc, schema: todoSchema, initialState: { todos: [] } });
```
Zero framework imports. ~2,700 lines of tests against ~3,200 of source.

### 5.6 Portability verdict

| package | React-liftable? | effort |
|---|---|---|
| `loro-mirror` | ✅ as-is | none — already a standalone MIT npm package |
| `lexical-core` | ✅ | **low** — add a build step (it ships raw `.ts` via `main: index.ts`), drop the 6 unused deps, delete/replace the ~58% product nodes. `nodeIdPlugin`/`peerIdPlugin` are drop-in. |
| `collaboration` — `websocket/core`+`platform`, `SyncEngine`, `LoroManager`, WAL, snapshots | ✅ | low — these classes are callback-based (`onRunningChange`, `onStateChange(cb): () => void`); Solid is quarantined in `websocket/solid/` (184 lines) and a 33-line `createSyncEngine` factory |
| `collaboration` — `Awareness`, `LiveSyncSource` | ⚠️ | medium — `Accessor<T>` and `@solid-primitives/event-bus` `Listen<T>` are baked into the **exported types** (`awareness.ts:52-56`, `source.ts:70-84`) |
| the actual Lexical↔Loro glue | 🔨 | **doesn't live in a package.** ~2,200 lines of Solid components in `apps/web`. Only `reconcile.ts` + `mapping.ts` (433 lines) have no Solid imports and port unchanged. |

**Bottom line: the CRDT stack and the Lexical identity plugins are portable; the glue that actually connects Lexical to Loro is the Solid-coupled part, and it's in `apps/web`, not `packages/`.**

None of this is on MLE's critical path today — MLE has no rich-text editing and no multiplayer requirement. File it as: *if MLE ever needs collaborative notes on a deal record, `loro-mirror` + `nodeIdPlugin` + `peerIdPlugin` is a ~900-line head start, and the four-layer echo-prevention pattern is the design to copy.*

Peripheral stack facts from the app side: `initializeLexical()` runs at boot (`index.tsx:32`); CodeMirror 6 is a *separate* editor for code blocks (`package.json:61-68`); Quill is still present as legacy (`package.json:135`); `pdfjs-dist` is a fork (`github:macro-inc/pdf.js#v2.16.52-web`). And the hotkey system's Lexical escape hatch — the interceptor (`hotkeys.ts:668-681`) plus `proxiedHotkey` (`types.ts:66-73`, *"letting the real handler, e.g. Lexical, process the key"* while still listing the command in the palette) — is the cleanest solution I've seen to "rich editor inside a keyboard-first app."

---

## 6. Dark / light theming

Macro does not have "a dark mode." It has a **theme engine** where light and dark are two saved presets, and the mechanism is the OKLCH ramp from §1.3.

**Themes are 15 `{l, c, h}` triples plus a depth scalar.** `features/theme/constants.ts:28-46`:

```ts
const MACRO_DARK = {
  depth: 0.15,
  tokens: {
    a0: { l: 0.75, c: 0.20, h:  59 },  a1: { l: 0.75, c: 0.20, h:  99 },
    a2: { l: 0.75, c: 0.20, h: 139 },  a3: { l: 0.75, c: 0.20, h: 179 },
    a4: { l: 0.75, c: 0.20, h: 219 },
    b0: { l: 0.14, c: 0.00, h:  59 },  b1: { l: 0.20, c: 0.00, h:  59 },
    b2: { l: 0.23, c: 0.00, h:  59 },  b3: { l: 0.25, c: 0.00, h:  59 },
    b4: { l: 0.28, c: 0.00, h:  59 },
    c0: { l: 0.95, c: 0.00, h:  59 },  c1: { l: 0.83, c: 0.00, h:  59 },
    c2: { l: 0.75, c: 0.00, h:  59 },  c3: { l: 0.63, c: 0.00, h:  59 },
    c4: { l: 0.55, c: 0.00, h:  59 },
  },
};
```

`features/theme/constants.ts:48-80` — `MACRO_LIGHT` is the *same hues*, L inverted (`b0: 1.00 … b4: 0.91`, `c0: 0.14 … c4: 0.75`), `depth: 0.06`, plus explicit `overrides` for `menu`/`panel`/`dialog` so floating surfaces stay pure white instead of following the Layer maths.

**Application: 45 individual `style.setProperty` calls, each guarded by a diff.** `features/theme/signals/themeReactive.ts:78-125`:

```ts
createEffect(on(ALL_THEME_SIGNALS, () => {
  jamTransition();
  if(themeReactive.a0.l[0]() !== previousTheme.a0.l){ document.documentElement.style.setProperty('--a0l', `${themeReactive.a0.l[0]()}`); previousTheme.a0.l = themeReactive.a0.l[0]() }
  if(themeReactive.a0.h[0]() !== previousTheme.a0.h){ document.documentElement.style.setProperty('--a0h', `${themeReactive.a0.h[0]()}deg`); previousTheme.a0.h = themeReactive.a0.h[0]() }
  /* … 43 more … */
  syncThemeLightAttribute();
}, { defer: true }));
```

Because the L/C/H components are separately registered `@property` values, you can drag a hue slider and **the whole app rotates hue smoothly**, live, with no re-render — the browser interpolates the registered custom property. That's the payoff for the `@property` boilerplate.

**Light/dark is derived, not declared** (`themeReactive.ts:72-75`):
```ts
function syncThemeLightAttribute(): void {
  document.documentElement.dataset.themeLight =
    themeReactive.b0.l[0]() > themeReactive.c0.l[0]() ? 'true' : 'false';
}
```
If the background is lighter than the text, it's a light theme. A custom theme automatically gets the right variant behaviour.

That attribute drives two custom variants (`index.css:255-256`):
```css
@custom-variant light-mode (&:where(html[data-theme-light="true"] *));
@custom-variant dark-mode  (&:where(html[data-theme-light="false"] *));
```
Used sparingly — e.g. `index.css:264` where light mode needs a real shadow that dark mode doesn't:
```css
@utility island {
  @apply bg-chrome text-ink ring dark-mode:ring-edge light-mode:ring-panel light-mode:shadow-[0_4px_20px_8px_oklch(0.15_0_0/0.07)];
}
```

OS following: `themeSignals.ts:74-95` — `themeMode` is `'light' | 'dark' | 'system'`, persisted; `systemMode` tracks `window.matchMedia('(prefers-color-scheme: dark)')` with a live listener; `themeUtils.ts:147` resolves `themeMode() === 'system' ? systemMode() : themeMode()`.

There is also a full **theme editor UI** (`features/theme/components/` — `ThemeEditor`, `ThemeEditorBasic`, `ThemeEditorAdvanced`, `ColorPickerPopover`, `ColorSwatch`, `ThemeChips`, `ThemeCrud`) with validation and migrations (`themeValidation.ts` + tests, `themeMigrations.ts`). Users author themes.

---

## 7. Micro-interactions worth copying

**7.1 The entrance vocabulary** (`index.css:343-393`). Four keyframes, all subtle, all ≤160ms:

```css
@keyframes menu-open {
  from { opacity: 0; transform: translateY(-2px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0)    scale(1);    }
}
@keyframes dialog-content-open {
  from { opacity: 0; transform: translateY(4px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0)   scale(1);    }
}
@keyframes dialog-fullscreen-open {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0);   }
}
@keyframes dialog-overlay-open { from { opacity: 0; } to { opacity: 1; } }
```
Menus scale from 0.96 and drop 2px; dialogs scale from 0.98 and rise 4px. **Menus come down, dialogs come up.**

**7.2 Transform-origin from the popper** (`index.css:462-465`):
```css
@utility menu-open-animation {
  transform-origin: var(--kb-popper-content-transform-origin, top center);
  animation: var(--animate-menu-open);
  @media (prefers-reduced-motion: reduce) { animation: none; }
}
```
The menu scales out of the corner nearest its trigger, wherever floating-UI put it. Every animation utility carries its own `prefers-reduced-motion` guard (`index.css:466-468`, `:474-476`, `:483-485`, `:492-494`) — it's baked into the utility, not bolted on at the end.

**7.3 The empty-state 3D rise** (`index.css:750-773`) — the single most characterful moment in the app:

```css
/* Empty-state illustration entrance: a one-shot 3D rise that tilts the
   graphic up into place from its base. The illustration's internal layers
   stagger-fade on their own (see the <style> inside each SVG). Plays once
   when the empty state mounts. */
.empty-state-graphic {
  animation: empty-state-rise 600ms cubic-bezier(0.16, 1, 0.3, 1) both;
  transform-origin: center bottom;
}
@keyframes empty-state-rise {
  from { transform: perspective(620px) rotateX(15deg) translateY(9px) scale(0.97); }
  to   { transform: perspective(620px) rotateX(0deg)  translateY(0)   scale(1);    }
}
@media (prefers-reduced-motion: reduce) { .empty-state-graphic { animation: none; } }
```

And there are **17 bespoke empty-state SVGs** in `src/lib/design/`: `empty-state-inbox-zero.svg`, `empty-state-no-search-match.svg`, `empty-state-no-filter-match.svg`, `empty-state-no-access.svg`, `empty-state-doc/folder/calls/tasks/email/companies/channels/automations/ai/inbox-tray.svg`, plus 10 `arcanum-*.svg`. Each carries an internal `<style>` that stagger-fades its own layers.

`EmptyStatePanel.tsx:49-56` — the layout note is the craft:
```tsx
{/* A FIXED top spacer (not content-proportional) so the title lands on
    the same baseline for every empty state, regardless of what's below
    it. The graphic box has a fixed height too, so the title's vertical
    position is constant; the bottom grows to fill. */}
<div aria-hidden="true" class="shrink-0 basis-[28%] mobile:basis-[8%]" />
```
Every empty state in the app puts its title on the same baseline.

**7.4 Press pulse with overshoot** — §1.7 above. `scale(1.08)` on press, spring back over 100ms.

**7.5 Long-press highlight** (`index.css:585-600`):
```css
@keyframes long-press-message-highlight {
  from { background-color: oklch(from var(--color-active) l c h / 0%); border-radius: var(--radius-sm); }
  to   { background-color: oklch(from var(--color-active) l c h);      border-radius: var(--radius-sm); }
}
.channel-message-long-press-highlight [data-swipe-content] { animation: long-press-message-highlight 400ms ease-in both; }
```
The highlight **fills in over the long-press duration** — the animation *is* the progress indicator. `ease-in` so it feels like it's building.

**7.6 Indeterminate progress that overshoots the container** (`index.css:390-393`):
```css
@keyframes indeterminate-bar { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }
```
`350%`, not `100%` — the bar exits fast and the gap between cycles reads as momentum.

**7.7 Toast slide + swipe-out** (`index.css:343-351`):
```css
@keyframes slideIn  { from { transform: translateX(calc(100% + 16px)); } to { transform: translateX(0); } }
@keyframes swipeOut { from { transform: translateX(var(--kb-toast-swipe-end-x)); } to { transform: translateX(calc(100% + 16px)); } }
```
`swipeOut` starts from wherever the user's finger left it (`--kb-toast-swipe-end-x`), so the dismissal continues the gesture instead of snapping.

**7.8 Hairline dividers inset from the row padding** (`index.css:589-616` region, `@utility settings-row-dividers`):
```css
@utility settings-row-dividers {
  & > *:not(:last-child) {
    position: relative;
    &::after {
      content: "";
      position: absolute;
      inset-inline: calc(var(--spacing) * 6);   /* matches the row's px-6 */
      bottom: 0;
      height: 1px;
      background-color: color-mix(in oklab, var(--color-ink-muted) 5%, transparent);
      pointer-events: none;
    }
  }
}
```
The divider stops where the content stops — 5% ink, not a border color. There is a `settings-row-divider` singular variant *specifically for virtualized lists* where `:not(:last-child)` can't work.

**7.9 A shared label-column width so sub-panels align** (`index.css:234-238`):
```css
/* Shared label column width for side-panel two-column grids so labels line
   up across sub-panels (Details, Properties, ...). Consumers should use
   `grid-cols-[var(--sidepanel-label-width,auto)_1fr]`. */
--sidepanel-label-width: 5.5rem;
```

**7.10 Mobile accessory region entrance** (`index.css:637-647`) — enter-only, losers unmount immediately:
```css
[data-float-region='accessory'] > * { animation: float-region-in 150ms ease-out; }
@keyframes float-region-in { from { opacity: 0; transform: translateY(0.5rem); } }
```

---

## 8. Where MLE stands — honest assessment

MLE's current state, verified in the canonical repo:

**What's genuinely good and should not be touched:**
- `components/inline/fields.tsx` (369 lines) is the best-engineered file in the codebase. The header comment states the standard (L3-6) and the code delivers it: `useSyncedState` (L52-60) does optimistic mirroring correctly, during render, citing the React docs; every field rolls back on failure (`L111`, `L180`, `L228`, `L269`, `L334`); there's a no-op guard so an unchanged blur never fires a request (`L106`). This is Attio-grade.
- The amber save pulse (`app/globals.css:168-175`) is a real, distinctive micro-interaction — Macro has nothing better.
- `prefers-reduced-motion` is honored (`globals.css:205-207`).
- The **prose** in error and empty states is a genuine competitive asset: *"Move not saved — {name} is back in {stage}"* (`DealsBoard.tsx:79-83`), *"Couldn't load the SLA feed just now — the pipeline board still has everything"* (`NeedsActionPanel.tsx:69-71`).
- `DealsBoard.tsx:49-53` — hiding empty stages until a drag starts, then revealing all 12 as slim 160px targets (`:121` `${slim ? "w-40" : "w-64"} … transition-[width]`) is a better idea than anything in Macro's kanban.
- `SearchBar.tsx:38-61` — 180ms debounce with a monotonic sequence guard (`if (seq.current !== mine) return;`) and `onMouseDown={(e) => e.preventDefault()}` on results (`:130`) so the input keeps focus.

**Where it falls short — the honest list:**

1. **Four design tokens.** `app/globals.css:8-13` is the entire `@theme inline` block: `--color-background`, `--color-foreground`, `--font-sans`, `--font-mono`. Macro has fifteen ramp positions plus ~30 semantic names. Everything in MLE is a raw Tailwind palette utility, so there is no way to change the app's look without a find-and-replace across 4,914 lines.
2. **`rounded-xl border border-white/10` appears 38 times.** `bg-white/5` 50 times. `px-3 py-2` 45 times. `rounded-full border` (the de-facto badge) 25 times. There is no Card, Button, Badge, Input, Dialog, Table, or Tooltip component — only `inline/fields.tsx`.
3. **Five independent hand-rolled chip palettes**: `statusBadge` (PeopleTable.tsx:17-21) copy-pasted verbatim into `CompaniesTable.tsx:9-13`; `chipStyle` (`esign/DocumentsSection.tsx:44-52`); `GRADE_STYLES` (`DealsBoard.tsx:16-22`, the only one using `ring-` instead of `border-`); `sevStyle` (`ThingsToAddress.tsx:34-38`). `Stat` is implemented twice with different markup (`app/page.tsx:13` uses `rounded-xl border-white/10 bg-white/5 p-4`; `ops/PanelsView.tsx:57` uses `rounded-lg border-white/5 bg-black/20 px-3 py-2`).
4. **Zero keyboard layer.** Exhaustive grep for `onKeyDown|keydown|metaKey|ctrlKey|cmdk|hotkey|shortcut` across `components/`, `app/`, `lib/` returns **9 hits, all local handlers on focused inputs**. Zero `document.addEventListener("keydown", …)`. No ⌘K, no `/`, no `j`/`k`, no `?`. The only modifier-key usage in the entire codebase is `fields.tsx:350` (`Cmd+Enter` to commit a textarea).
5. **Search exists on one page.** `SearchBar` is imported at `app/people/page.tsx:6` and rendered at `:41`. It is not in the layout, so it's unreachable from 8 of 9 nav destinations.
6. **No loading states at all.** No `loading.tsx`, `error.tsx`, or `not-found.tsx` anywhere under `app/`. Zero `<Suspense>`, zero skeletons, zero `animate-pulse`. Every page is `export const dynamic = "force-dynamic"` (15 pages) with a server-side await and no boundary — so navigation is: click → old page freezes → new page appears whole. The complete loading vocabulary is six lowercase text strings and one 14px CSS spinner (`SearchBar.tsx:116-118`).
7. **No `duration-*` or `ease-*` anywhere in JSX.** 31 bare `transition` shorthands at Tailwind's default 150ms, 1 `transition-colors`, 1 `transition-[width]`. All intentional timing lives in `globals.css`.
8. **Nav has no active state.** `app/layout.tsx:52-60` renders all 9 links identically regardless of route. `RepSubNav.tsx:29-31` is the only nav in the app that knows where you are.
9. **No virtualization, no pagination.** `PeopleTable.tsx:191` — `{sorted.map((p) => {` over the full ledger. Fine at 41 people, a cliff at 4,100.
10. **No dark/light — the app is hardcoded dark.** `grep -ro 'dark:'` across `components` and `app` → 0 matches. Background is `#070b14` in `globals.css:4` and re-hardcoded as `bg-[#070b14]/90` in `layout.tsx:40`.
11. **No tooltip component**, so multi-line explanatory content ships through the native `title` attribute — `DealsBoard.tsx:216` (`title={breakdownTitle(score)}`, a `\n`-joined score breakdown), `PeopleTable.tsx:246, 282, 310`, `PersonEditor.tsx:83`. The scoring breakdown Rob would show a client renders as a grey OS tooltip after a 1-second delay.
12. **The `"saving"` state is computed and never rendered.** `fields.tsx:11` defines it, `:19` sets it, and `pulseClass` (`:43-47`) maps only `saved` and `error`. A slow PATCH shows nothing at all.
13. **`router.refresh()` fires on every field save** (`fields.tsx:30`) — a full RSC round-trip and re-render of the whole ledger to persist one cell.
14. **`~6 duplicated fetch-in-useEffect blocks**, each with its own `cancelled` flag and `useState<T | null>` (`NeedsActionPanel`, `ThingsToAddress`, `ActivityTimeline`, `DedupQueue`, `esign/DocumentsSection`, `DevChat`). No dedup, no cache, no retry.
15. **Largest type in the app is `text-2xl`.** `text-xs` 182 uses, `text-sm` 113, then arbitrary `text-[11px]` (43) and `text-[10px]` (21). There is no typographic hierarchy above "page title."

---

## 9. THE UI UPGRADE KIT — 10 changes, ranked by impact ÷ effort

Effort: **S** ≈ under an hour · **M** ≈ a half-day · **L** ≈ 1–3 days.
Impact: 1–5, where 5 = "Rob notices before he reads a word."

| # | Change | Effort | Impact | Ratio |
|---|---|---|---|---|
| 1 | Token layer: 15-step OKLCH ramp + semantic names | **S** | **5** | ★★★★★ |
| 2 | Hairline borders + one shadow token + motion tokens | **S** | **4** | ★★★★★ |
| 3 | Derived status colors → kill all 5 chip palettes | **S** | **4** | ★★★★☆ |
| 4 | Loading: `loading.tsx` + shimmer skeletons | **S/M** | **4** | ★★★★☆ |
| 5 | Active nav state + `⌘K`-visible search in the shell | **S** | **4** | ★★★★☆ |
| 6 | `saving` state + inline `<Tooltip>` primitive | **S/M** | **3** | ★★★☆☆ |
| 7 | Global hotkey registry + `⌘K` command palette | **L** | **5** | ★★★☆☆ |
| 8 | `j`/`k` row navigation + focus ring + debounced preview | **M** | **4** | ★★★☆☆ |
| 9 | `<Layer>` elevation + primitives (`Card`/`Badge`/`Button`) | **M** | **3** | ★★★☆☆ |
| 10 | Light mode (free once #1 lands) | **S/M** | **3** | ★★★☆☆ |

---

### #1 — Token layer: 15-step OKLCH ramp + semantic names
**Effort S · Impact 5**

**(a) What Macro does.** Fifteen OKLCH tokens in three ramps (`apps/web/src/index.css:9-32` for the `@property` registrations, `:88-104` for assembly, `:107-152` for the `@theme` semantic names). `--color-*: initial` nukes Tailwind's default palette so nothing can leak in.

**(b) What MLE does now.** `app/globals.css:8-13` — four entries. Every color is a literal: `slate-500` ×136, `white/…` ×270, `amber-400` ×53, `sky-400` ×46.

**(c) The concrete change.** Replace lines 3–19 of `app/globals.css`. **The values below are computed to land exactly on MLE's current colors** — `b0` is `#070b14` to the byte, `c1` is `#e2e8f0`, `c2`/`c3`/`c4` are `slate-400`/`500`/`600` exactly. Nothing shifts visually; you just gain the ability to change everything at once.

```css
@import "tailwindcss";

/* Registered so L/C/H can be animated independently (theme hue drag, live preview). */
@property --b0l { syntax: "<number>"; inherits: true; initial-value: 0.150; }
@property --b0c { syntax: "<number>"; inherits: true; initial-value: 0.021; }
@property --bh  { syntax: "<angle>";  inherits: true; initial-value: 264.3deg; }
@property --a0l { syntax: "<number>"; inherits: true; initial-value: 0.837; }
@property --a0c { syntax: "<number>"; inherits: true; initial-value: 0.164; }
@property --a0h { syntax: "<angle>";  inherits: true; initial-value: 84.4deg; }

:root {
  /* ── base ramp: surfaces & edges (hue 264.3 = MLE's #070b14 slate-blue) ── */
  --b0: oklch(0.150 0.021 264.3);  /* page          #070b14  (unchanged) */
  --b1: oklch(0.190 0.024 264.3);  /* active/panel  #0e141f  (≈ today's #0b1120) */
  --b2: oklch(0.225 0.026 264.3);  /* hover         #161c28  (≈ bg-white/5 over b0) */
  --b3: oklch(0.255 0.028 264.3);  /* edge-muted    #1c2331  (≈ border-white/10) */
  --b4: oklch(0.310 0.030 264.3);  /* edge          #293040  (≈ border-white/15) */

  /* ── ink ramp: text (lands exactly on today's slate values) ── */
  --c0: oklch(0.985 0.004 255.5);  /* ink             #f8fafd */
  --c1: oklch(0.929 0.013 255.5);  /* ink-muted       #e2e8f0  == slate-200 */
  --c2: oklch(0.711 0.035 256.8);  /* ink-extra-muted #94a3b8  == slate-400 */
  --c3: oklch(0.554 0.041 257.4);  /* ink-disabled    #64748b  == slate-500 */
  --c4: oklch(0.446 0.037 257.3);  /* ink-placeholder #475569  == slate-600 */

  /* ── accent ramp: amber-400 + 40° rotations, for charts / verticals / tags ── */
  --a0: oklch(0.837 0.164  84.4);  /* #fbbf24  amber-400 — the lit-node brand */
  --a1: oklch(0.820 0.160 124.4);  /* #a8cf4f */
  --a2: oklch(0.800 0.160 164.4);  /* #2edda3 */
  --a3: oklch(0.800 0.160 204.4);  /* #00daed */
  --a4: oklch(0.800 0.160 244.4);  /* #53c7ff */
}

@theme {
  /* Kill Tailwind's default palette so a stray `text-gray-500` can't creep in. */
  --color-*: initial;
  --default-ring-width: 0.5px;

  /* surfaces */
  --color-page:    var(--b0);
  --color-surface: var(--b0);
  --color-panel:   var(--b1);
  --color-active:  var(--b1);
  --color-hover:   var(--b2);

  /* edges */
  --color-edge-muted: var(--b3);
  --color-edge:       var(--b4);

  /* ink */
  --color-ink:             var(--c0);
  --color-ink-muted:       var(--c1);
  --color-ink-extra-muted: var(--c2);
  --color-ink-disabled:    var(--c3);
  --color-ink-placeholder: var(--c4);

  /* accent */
  --color-accent:       var(--a0);
  --color-accent-bg:    oklch(from var(--a0) l c h / 0.12);
  --color-accent-hover: oklch(from var(--a0) l c h / 0.22);

  /* MLE's four status hues (see #3 for the derived bg/ink) */
  --color-lit:     oklch(0.837 0.164  84.4);  /* #fbbf24 amber  — lit / brand / saved */
  --color-info:    oklch(0.754 0.139 232.7);  /* #38bdf8 sky    — links, derived numbers */
  --color-success: oklch(0.773 0.154 163.2);  /* #34d399 emerald— signed & paid */
  --color-failure: oklch(0.711 0.166  22.2);  /* #f87171 red    — destructive & error */

  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --text-xxs: 0.625rem;   /* 10px — replaces the 21 uses of text-[10px] */
}

body {
  background: var(--color-page);
  color: var(--color-ink);
  font-family: var(--font-sans), system-ui, sans-serif;
  font-feature-settings: "dlig" 1, "calt" 1;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

Then migrate with sed, in this order (each is mechanical and safe):
```
bg-white/5      → bg-hover        (50)
border-white/10 → border-edge-muted (73)
text-slate-200  → text-ink-muted  (56)
text-slate-400  → text-ink-extra-muted (75)
text-slate-500  → text-ink-disabled (136)
text-slate-600  → text-ink-placeholder (64)
text-[10px]     → text-xxs        (21)
```
Also drop the hardcoded `bg-[#070b14]/90` at `app/layout.tsx:40` → `bg-page/90`.

---

### #2 — Hairline borders, one shadow token, motion tokens
**Effort S · Impact 4**

**(a) Macro.** Global 0.5px border override (`index.css:512-543`), a single `--shadow-menu` with aggressive negative spread (`index.css:232`), and eight `--animate-*` tokens all on `cubic-bezier(0.16, 1, 0.3, 1)` at 100–160ms (`index.css:205-213`).

**(b) MLE.** Full 1px borders everywhere (`border-white/10` ×73). Four shadow utilities in 4,914 lines. Zero `duration-*`, zero `ease-*` in JSX — 31 bare `transition`s at Tailwind's 150ms default.

**(c) The change.** Append to `app/globals.css`:

```css
/* Hairline borders app-wide — the single cheapest "expensive software" cue.
   Explicit widths (border-2, border-4) are intentionally untouched. */
@utility border   { border-width: 0.5px; }
@utility border-x { border-inline-width: 0.5px; }
@utility border-y { border-block-width: 0.5px; }
@utility border-t { border-top-width: 0.5px; }
@utility border-r { border-right-width: 0.5px; }
@utility border-b { border-bottom-width: 0.5px; }
@utility border-l { border-left-width: 0.5px; }

/* Dividers inset to match row padding — the line stops where the content stops. */
@utility row-dividers {
  & > *:not(:last-child) {
    position: relative;
    &::after {
      content: "";
      position: absolute;
      inset-inline: calc(var(--spacing) * 3);   /* matches px-3 */
      bottom: 0;
      height: 1px;
      background-color: color-mix(in oklab, var(--color-ink-muted) 5%, transparent);
      pointer-events: none;
    }
  }
}
```

And in the `@theme` block:

```css
  /* ── motion ─────────────────────────────────────────────────────────── */
  /* House curve: expo-out. Every entrance uses it. Nothing exceeds 160ms. */
  --ease-out-expo:   cubic-bezier(0.16, 1, 0.3, 1);
  --ease-spring:     cubic-bezier(0.34, 1.56, 0.64, 1);  /* overshoots — press feedback only */
  --duration-fast:   100ms;
  --duration-base:   130ms;   /* MLE already uses 130ms in the inline kit — now it's a token */
  --duration-slow:   160ms;

  --animate-menu-open:   menu-open   120ms cubic-bezier(0.16, 1, 0.3, 1);
  --animate-dialog-open: dialog-open 160ms cubic-bezier(0.16, 1, 0.3, 1);
  --animate-slide-in:    slide-in    150ms cubic-bezier(0.16, 1, 0.3, 1);
  --animate-shimmer:     shimmer     1.4s  infinite;

  /* ── elevation: one token, aggressive negative spread ────────────────── */
  --shadow-menu: 0 8px 24px -16px rgb(0 0 0 / 0.40), 0 2px 8px -6px rgb(0 0 0 / 0.30);
```

```css
@keyframes menu-open {
  from { opacity: 0; transform: translateY(-2px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0)    scale(1);    }
}
@keyframes dialog-open {
  from { opacity: 0; transform: translateY(4px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0)   scale(1);    }
}
@keyframes slide-in {
  from { transform: translateX(calc(100% + 16px)); }
  to   { transform: translateX(0); }
}

/* Press feedback with overshoot — apply data-press-pulse to any button. */
[data-press-pulse] { transition: transform 100ms cubic-bezier(0.34, 1.56, 0.64, 1); }
[data-press-pulse]:active { transform: scale(0.97); transition: transform 100ms ease-out; }

@media (prefers-reduced-motion: reduce) {
  [data-press-pulse],
  .animate-menu-open, .animate-dialog-open, .animate-slide-in { animation: none; transition: none; }
}
```

Then a repo-wide replace: bare `transition` → `transition duration-[130ms] ease-[cubic-bezier(0.16,1,0.3,1)]` on the ~31 sites. Or simpler, one line in `@theme`: `--default-transition-duration: 130ms; --default-transition-timing-function: cubic-bezier(0.16,1,0.3,1);` — Tailwind v4 honors both, and every bare `transition` in the app inherits the house curve for free. **That one-liner is the highest impact-per-character change in this document.**

---

### #3 — Derived status colors: kill all five chip palettes
**Effort S · Impact 4**

**(a) Macro.** `index.css:158-175` — one hue per status, three usable colors out, via `oklch(from … )` relative color syntax. The `-ink` variant re-lights the same hue to the text-lightness rung so labels are always legible on the tint.

**(b) MLE.** Five independent maps: `PeopleTable.tsx:17-21` and `CompaniesTable.tsx:9-13` (verbatim duplicates), `esign/DocumentsSection.tsx:44-52`, `DealsBoard.tsx:16-22` (uses `ring-`, the others use `border-`), `ThingsToAddress.tsx:34-38`.

**(c) The change.** In `@theme`:

```css
  /* Each status: one hue in, three colors out. Tint at 15%, label re-lit to the
     ink-muted lightness rung so it's always readable on its own tint. */
  --color-lit:         oklch(0.837 0.164  84.4);
  --color-lit-bg:      oklch(from var(--color-lit) l c h / 0.15);
  --color-lit-ink:     oklch(from var(--color-lit) 0.88 c h);

  --color-info:        oklch(0.754 0.139 232.7);
  --color-info-bg:     oklch(from var(--color-info) l c h / 0.15);
  --color-info-ink:    oklch(from var(--color-info) 0.88 c h);

  --color-success:     oklch(0.773 0.154 163.2);
  --color-success-bg:  oklch(from var(--color-success) l c h / 0.15);
  --color-success-ink: oklch(from var(--color-success) 0.88 c h);

  --color-failure:     oklch(0.711 0.166  22.2);
  --color-failure-bg:  oklch(from var(--color-failure) l c h / 0.15);
  --color-failure-ink: oklch(from var(--color-failure) 0.88 c h);

  --color-warm:        oklch(0.750 0.150  55.0);   /* between amber and rose */
  --color-warm-bg:     oklch(from var(--color-warm) l c h / 0.15);
  --color-warm-ink:    oklch(from var(--color-warm) 0.88 c h);
```

New file `components/ui/Badge.tsx` — one component replacing five maps:

```tsx
const TONES = {
  lit:     "bg-lit-bg     text-lit-ink     ring-lit/30",
  warm:    "bg-warm-bg    text-warm-ink    ring-warm/30",
  unlit:   "bg-hover      text-ink-disabled ring-edge/40",
  info:    "bg-info-bg    text-info-ink    ring-info/30",
  success: "bg-success-bg text-success-ink ring-success/30",
  failure: "bg-failure-bg text-failure-ink ring-failure/30",
} as const;

export function Badge({ tone = "unlit", children, title }: {
  tone?: keyof typeof TONES; children: React.ReactNode; title?: string;
}) {
  return (
    <span title={title}
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${TONES[tone]}`}>
      {children}
    </span>
  );
}
```

Delete `statusBadge` from `PeopleTable.tsx:17-21` and `CompaniesTable.tsx:9-13`, `chipStyle` from `esign/DocumentsSection.tsx:44-52`, `GRADE_STYLES` from `DealsBoard.tsx:16-22`, `sevStyle` from `ThingsToAddress.tsx:34-38`. Deal grades A–F map to `success/info/lit/warm/failure`.

---

### #4 — Loading states: route boundaries + shimmer skeletons
**Effort S/M · Impact 4**

**(a) Macro.** `.skeleton-shimmer` (`index.css:319-341`) with a theme-derived gradient; layout-mirroring skeletons (`features/block-pr/component/PrSkeletons.tsx:28-48`); `HomeSectionBoundary` pairing Suspense + ErrorBoundary per section (`features/home/home-section-boundary.tsx:87-113`).

**(b) MLE.** No `loading.tsx` / `error.tsx` / `not-found.tsx` under `app/` at all. Zero Suspense, zero skeletons. All 15 pages are `force-dynamic` with a server-side await and no boundary — clicking a nav link freezes the current page until the next one is fully rendered. The entire loading vocabulary: six lowercase text strings and one 14px spinner (`SearchBar.tsx:116-118`).

**(c) The change.** Add to `globals.css`:

```css
@keyframes shimmer { 100% { transform: translateX(100%); } }
.skeleton {
  position: relative;
  overflow: hidden;
  border-radius: 6px;
  background: color-mix(in oklab, var(--color-ink) 6%, transparent);
}
.skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent,
              oklch(from var(--color-ink) l c h / 0.08), transparent);
  animation: shimmer 1.4s infinite;
}
@media (prefers-reduced-motion: reduce) { .skeleton::after { animation: none; } }
```

New `components/ui/TableSkeleton.tsx` — mirror the real ledger, ragged widths:

```tsx
export function TableSkeleton({ rows = 12 }: { rows?: number }) {
  const w = ["w-24","w-40","w-28","w-32","w-20","w-36"];
  return (
    <div className="overflow-hidden rounded-xl border border-edge-muted">
      <div className="flex gap-3 border-b border-edge-muted bg-hover px-3 py-2.5">
        {w.map((c,i) => <div key={i} className={`skeleton h-3 ${c}`} />)}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3 border-b border-edge-muted/50 px-3 py-2.5 last:border-0">
          {w.map((c,i) => <div key={i} className={`skeleton h-3.5 ${c}`} />)}
        </div>
      ))}
    </div>
  );
}
```

Then `app/people/loading.tsx`, `app/companies/loading.tsx`, `app/deals/loading.tsx`, `app/ops/loading.tsx` — each 4 lines. Next's App Router wires them to the route segment automatically; you get an instant paint on every navigation with zero component changes.

Add `app/error.tsx` modeled on `home-section-boundary.tsx:26-72`: warning glyph in a `bg-failure-bg` circle, a plain-language sentence in MLE's existing voice, a **Try again** button on `reset`, and a **Show details** toggle for `error.message`.

---

### #5 — Active nav state + search in the shell with a visible ⌘K
**Effort S · Impact 4**

**(a) Macro.** `Hotkey.tsx:8-26` renders shortcuts as `⌘K` chips (`rounded-sm px-1.5 py-px text-xxs`) driven by the token registry, so every control advertises its keyboard route. `CommandMenuHotkeyHint` (`CommandMenuPrimitives.tsx:233-248`) puts them in the palette footer.

**(b) MLE.** `app/layout.tsx:52-60` — nine identical links, no active state. `RepSubNav.tsx:29-31` is the only nav in the app that uses `usePathname()`. `SearchBar` lives only on `app/people/page.tsx:41`; it is invisible from every other route and unreachable by keyboard.

**(c) The change.** Convert the nav to a client component with `usePathname()` and lift `SearchBar` into `layout.tsx`:

```tsx
// components/NavLinks.tsx  — "use client"
const active = pathname === n.href || (n.href !== "/" && pathname.startsWith(n.href));
className={[
  "relative shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 transition",
  active
    ? "bg-hover text-ink after:absolute after:inset-x-3 after:-bottom-[13px] after:h-px after:bg-accent"
    : "text-ink-muted hover:bg-hover hover:text-ink",
].join(" ")}
```
The `after:` pseudo-element draws a 1px amber underline flush with the header's bottom border — the "lit node" idiom applied to navigation.

Add a `Kbd` primitive (steal `Hotkey.tsx:8-26` verbatim):

```tsx
// components/ui/Kbd.tsx
const MOD = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
const map: Record<string,string> = {
  cmd: MOD ? "⌘" : "Ctrl", shift: "⇧", opt: MOD ? "⌥" : "Alt", ctrl: "⌃",
  enter: "↵", escape: "ESC", backspace: "⌫", up: "↑", down: "↓", left: "←", right: "→",
};
export function Kbd({ keys }: { keys: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-sm border border-edge-muted px-1.5 py-px text-xxs text-ink-extra-muted">
      {keys.split("+").map((k, i) => <span key={i}>{map[k] ?? k.toUpperCase()}</span>)}
    </span>
  );
}
```

Then in the search input's right gutter (replacing `pr-8`): `<Kbd keys="cmd+k" />`. This is what makes an app *look* keyboard-first before it *is* keyboard-first — and it ships in an hour, before change #7.

---

### #6 — Render the `saving` state; add a real Tooltip
**Effort S/M · Impact 3**

**(a) Macro.** `Tooltip.tsx` (157 lines) built on Kobalte + floating-UI, showing label **and** hotkey, with a MutationObserver that closes the tooltip if the trigger unmounts (`Tooltip.tsx:61-86`) — the fix for "ghost tooltip after the row disappears."

**(b) MLE.** `fields.tsx:11` defines `"saving"`, `:19` sets it, and `pulseClass` (`:43-47`) ignores it — a slow PATCH shows nothing. And there is no Tooltip, so the deal-score breakdown Rob would show a client (`DealsBoard.tsx:24-28`, `\n`-joined into `title=`) renders as a grey OS tooltip after a 1-second delay. Same for `PeopleTable.tsx:246, 282, 310` and `PersonEditor.tsx:83`.

**(c) The change.**

Saving state — add to `globals.css` and to `pulseClass`:
```css
/* In-flight: a slow, quiet amber breath. Distinct from the 900ms saved pulse. */
@keyframes inline-saving { 0%,100% { background: rgba(251,191,36,0.05); } 50% { background: rgba(251,191,36,0.13); } }
.inline-pulse-saving { animation: inline-saving 1.1s ease-in-out infinite; border-radius: 5px; }
@media (prefers-reduced-motion: reduce) { .inline-pulse-saving { animation: none; } }
```
```ts
function pulseClass(state: SaveState) {
  if (state === "saving") return "inline-pulse-saving";   // ← add
  if (state === "saved")  return "inline-pulse-saved";
  if (state === "error")  return "inline-pulse-error";
  return "";
}
```
One line in `fields.tsx:43-47`. Also: the error pulse is currently silent (a red ring for 2s, value snaps back, no explanation). Add the failure reason as a tooltip on the field — MLE's voice already does this well everywhere else.

Tooltip — `@radix-ui/react-tooltip` is the React answer (Radix is the closest thing to Kobalte). ~2kb gz. Style it with the new tokens:
```
bg-panel text-ink border border-edge shadow-menu rounded-md px-2 py-1 text-xs
data-[state=delayed-open]:animate-menu-open
```
Set `delayDuration={200}` (native `title` is ~1000ms — the delay alone is why the current tooltips feel cheap). Then convert the four `title=` sites; the deal-grade breakdown becomes a real multi-line panel Rob can screenshot.

---

### #7 — Global hotkey registry + ⌘K command palette
**Effort L · Impact 5**

**(a) Macro.** `lib/core/hotkey/` (2,844 lines) — the scope tree (§2.1), the DOM-focus-driven activation (§2.2), the keydown root with macOS Cmd/Option handling (§2.3), the token registry (§2.6), and `getCommands.ts:39-84` projecting the tree into the palette. Palette itself: `features/command/` (2,837 lines), virtualized at `h-10` rows.

**(b) MLE.** Nothing. 9 local `onKeyDown` handlers, zero document listeners, one modifier-key usage (`fields.tsx:350`).

**(c) The concrete change.** Do **not** port 2,844 lines. Port the *shape* — a scope stack (not a tree), which covers 95% of a CRM's needs at 10% of the code. ~200 lines:

```tsx
// lib/hotkeys.tsx  — "use client"
type Cmd = {
  id: string;                    // stable token: "people.new", "deal.advance"
  keys?: string;                 // "cmd+k" | "j" | "shift+j"
  label: string;
  group: string;                 // palette section
  run: () => void;
  when?: () => boolean;          // reactive availability
  runInInput?: boolean;          // default false
  priority?: number;             // palette ordering
};

const scopes: { id: string; cmds: Map<string, Cmd> }[] = [{ id: "global", cmds: new Map() }];

function norm(e: KeyboardEvent) {
  const p: string[] = [];
  if (e.ctrlKey) p.push("ctrl");
  if (e.altKey) p.push("opt");
  if (e.shiftKey) p.push("shift");
  if (e.metaKey) p.push("cmd");
  const k = e.key.toLowerCase();
  p.push(k === " " ? "space" : k);
  return p.join("+");
}

// Mount ONCE, in app/layout.tsx.
export function HotkeyRoot() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      document.documentElement.dataset.modality = "keyboard";   // ← Macro's trick, free
      const combo = norm(e);
      const inInput = /^(input|textarea|select)$/i.test((e.target as HTMLElement)?.tagName)
                      || (e.target as HTMLElement)?.isContentEditable;
      // innermost scope first, walk outward — this is the whole idea
      for (let i = scopes.length - 1; i >= 0; i--) {
        const cmd = scopes[i].cmds.get(combo);
        if (!cmd) continue;
        if (inInput && !cmd.runInInput) continue;
        if (cmd.when && !cmd.when()) continue;
        e.preventDefault(); e.stopPropagation();
        cmd.run();
        return;
      }
    };
    const onMouse = () => { document.documentElement.dataset.modality = "mouse"; };
    document.addEventListener("keydown", onKey, { capture: true });
    document.addEventListener("mousedown", onMouse, { capture: true });
    window.addEventListener("blur", () => {/* clear any held-key state */});
    return () => {
      document.removeEventListener("keydown", onKey, { capture: true });
      document.removeEventListener("mousedown", onMouse, { capture: true });
    };
  }, []);
  return null;
}

// Page/component-level: push a scope on mount, pop on unmount.
export function useHotkeyScope(id: string, cmds: Cmd[]) { /* push/pop + register */ }
```

Then the palette. **Do not hand-roll it** — `cmdk` (pacocoursey, ~5kb, the library behind Linear's and Vercel's palettes) gives you the filtering, the roving selection, and the a11y. Feed it `listActiveCommands()` from the scope stack, sorted innermost-scope-first exactly as `getCommands.ts:71-79` does. Style with the new tokens:

```
Overlay:  fixed inset-0 bg-black/50 backdrop-blur-sm animate-[dialog-open_160ms_cubic-bezier(0.16,1,0.3,1)]
Panel:    w-[min(640px,92vw)] rounded-xl border border-edge bg-panel shadow-menu overflow-hidden
Input:    h-12 w-full bg-transparent px-4 text-sm text-ink placeholder:text-ink-placeholder outline-none border-b border-edge-muted
Row:      flex h-10 items-center gap-2 rounded-md px-2 text-sm  ·  selected: bg-active text-ink
Footer:   flex h-9 items-center gap-4 border-t border-edge-muted px-4 text-xxs text-ink-extra-muted
```
`h-10` rows (40px) match Macro's `VIRTUAL_ITEM_HEIGHT = 40` exactly (`CommandMenu.tsx:74`), and 8 visible rows + 16px padding = 336px max height (`:76`).

Copy three things from Macro that most palettes miss:
1. **Persisted recency** — `recency.ts` is 21 lines: `localStorage` map of `commandId → Date.now()`, sort ties by it.
2. **`when()` conditions** evaluated at open time (`getCommands.ts:88-97`) — the palette only ever shows commands that will actually work right now.
3. **Selection-aware mode** (`use-soup-view-hotkeys.ts:255-266`) — ⌘K with rows checked in `PeopleTable` opens showing *only* bulk actions, with the count in the placeholder. MLE already has the selection state (`PeopleTable.tsx:134-149`); this is the natural upgrade path away from `window.confirm()` (`PeopleTable.tsx:78`).

Starter command set: `cmd+k` palette · `/` focus search · `g p` people, `g c` companies, `g d` deals (leader-key sequences) · `n` new person · `escape` clear selection · `?` shortcut sheet.

---

### #8 — `j`/`k` row navigation with a focus ring and debounced preview
**Effort M · Impact 4**

**(a) Macro.** `use-soup-navigation-hotkeys.ts:259-319` registers `j`/`k` **and** `arrowdown`/`arrowup` **and** `shift+j`/`shift+k` for range selection, all with tokens. Scroll follows via `virtualizerHandle()?.scrollToIndex(index, { align: 'nearest' })` (`:41-48`). And the detail that makes it feel instant — `:62-70`:

```ts
// Row focus moves instantly on every keypress; the (expensive) block swap in
// the Viewer trails the last press.
const openInViewerDebounced = debounce((entity) => { … }, 150);
```

**(b) MLE.** `PeopleTable.tsx:195` — `<tr className="group transition hover:bg-white/[0.04]">`. Hover-only. No focus concept, no roving tabindex, no keyboard row selection. Selection exists (`checked` Set, `:199-203`) but is mouse-only. Sort headers (`sortBtn`, `:120-128`) are buttons but direction isn't even toggleable.

**(c) The change.** Add a `focusIdx` state to `PeopleTable`, register the scope, and give the row a focus treatment distinct from hover:

```tsx
useHotkeyScope("people-table", [
  { id: "row.down", keys: "j",         label: "Down",       group: "Navigate", run: () => move(1)  },
  { id: "row.down", keys: "arrowdown", label: "Down",       group: "Navigate", run: () => move(1)  },
  { id: "row.up",   keys: "k",         label: "Up",         group: "Navigate", run: () => move(-1) },
  { id: "row.up",   keys: "arrowup",   label: "Up",         group: "Navigate", run: () => move(-1) },
  { id: "row.sel",  keys: "shift+j",   label: "Select down",group: "Select",   run: () => range(1) },
  { id: "row.sel",  keys: "shift+k",   label: "Select up",  group: "Select",   run: () => range(-1)},
  { id: "row.open", keys: "enter",     label: "Open record",group: "Navigate", run: openFocused    },
  { id: "row.mark", keys: "x",         label: "Toggle select", group: "Select", run: toggleFocused },
]);
```

```tsx
<tr
  key={p.id}
  ref={focused ? focusRef : undefined}
  data-focused={focused || undefined}
  className="group transition
             hover:bg-hover/60
             data-[focused]:bg-active
             data-[focused]:shadow-[inset_2px_0_0_0_var(--color-accent)]"
>
```

An **inset 2px amber left bar** rather than a ring — it reads as "cursor" not "selected," so it stacks cleanly with the existing checkbox selection, and it's the same amber as the brand dot in `layout.tsx:43`.

Scroll follow (no virtualizer needed at MLE's scale):
```ts
useEffect(() => { focusRef.current?.scrollIntoView({ block: "nearest" }); }, [focusIdx]);
```

**And steal the debounce insight even without a preview pane** — MLE's `router.refresh()` on every inline save (`fields.tsx:30`) is the same class of problem: cheap thing instant, expensive thing trailing. Debounce the refresh by 400ms and coalesce; the optimistic value from `useSyncedState` (`fields.tsx:52-60`) already covers the gap, so nothing regresses visually and you drop N round-trips to 1 when Rob tabs through a record.

Guard the focus ring on modality (`index.css` §2.8 trick, now free from change #7):
```css
tr[data-focused] { box-shadow: none; }
html[data-modality="keyboard"] tr[data-focused] { box-shadow: inset 2px 0 0 0 var(--color-accent); }
```
The cursor only appears once Rob touches the keyboard. Mouse users never see it.

---

### #9 — `<Layer>` elevation + the missing primitives
**Effort M · Impact 3**

**(a) Macro.** `Layer.tsx` — `display: contents` + re-scoped CSS variables, `depth` 0–5, `BORDER_SCALAR = 0.4`. `Surface.tsx` wraps it with the 0.5px border and the optional 2px active ring. `Button.tsx` has 7 variants × 8 sizes, all built from the same tokens.

**(b) MLE.** `rounded-xl border border-white/10` ×38, `bg-white/5` ×50, `px-3 py-2` ×45, `rounded-full border` ×25. `Card` exists but is file-private at `ops/PanelsView.tsx:35-53`. `Stat` is implemented twice with different markup (`app/page.tsx:13` vs `ops/PanelsView.tsx:57`). Everything else hand-rolls.

**(c) The change.** `<Layer>` ports to React almost verbatim — `display: contents` and CSS variable scoping are framework-agnostic:

```tsx
// components/ui/Layer.tsx
const DEPTH_SCALE = 0.15;   // Macro Dark desktop uses exactly this (constants.ts:29)
const BORDER_SCALAR = 0.4;  // borders brighten slower than surfaces (Layer.tsx:22)

export function Layer({ depth = 0, children }: { depth?: 0|1|2|3|4|5; children: React.ReactNode }) {
  const d = (depth / 5) * DEPTH_SCALE;
  const b = d * BORDER_SCALAR;
  return (
    <div style={{
      display: "contents",
      ["--b0" as string]: `oklch(calc(0.150 + ${d}) 0.021 264.3)`,
      "--b1": `oklch(calc(0.190 + ${d}) 0.024 264.3)`,
      "--b2": `oklch(calc(0.225 + ${d}) 0.026 264.3)`,
      "--b3": `oklch(calc(0.255 + ${b}) 0.028 264.3)`,
      "--b4": `oklch(calc(0.310 + ${b}) 0.030 264.3)`,
    }}>{children}</div>
  );
}
```

Then three primitives that delete ~150 lines of duplication:

```tsx
// components/ui/Card.tsx  — replaces 38 hand-typed instances
export function Card({ depth = 1, className = "", children }: …) {
  return (
    <Layer depth={depth}>
      <div className={`rounded-xl border border-edge-muted bg-panel p-4 ${className}`}>{children}</div>
    </Layer>
  );
}

// components/ui/Stat.tsx  — replaces the two divergent Stat implementations
export function Stat({ label, value, tone }: …) {
  return (
    <Card depth={1} className="p-4">
      <div className="text-xxs uppercase tracking-wide text-ink-extra-muted">{label}</div>
      <div className={`mt-1 tabular text-2xl font-semibold ${tone ? `text-${tone}` : "text-ink"}`}>{value}</div>
    </Card>
  );
}

// components/ui/Button.tsx — Macro's variant×size matrix, trimmed to what MLE uses
const VARIANTS = {
  ghost:   "bg-transparent text-ink-muted hover:bg-hover hover:text-ink active:bg-active",
  base:    "bg-transparent text-ink-muted border border-edge-muted hover:bg-hover hover:text-ink active:bg-active",
  cta:     "bg-accent text-page border border-transparent hover:bg-accent/90 active:bg-accent/80",
  danger:  "bg-transparent text-failure border border-failure/50 hover:bg-failure/10 active:bg-failure/20",
  success: "bg-success-bg text-success-ink hover:bg-success/25",
} as const;
const SIZES = { sm: "h-6 px-2 text-xs gap-1", md: "h-8 px-3 text-sm gap-1.5", lg: "h-10 px-4 text-base gap-2" } as const;
```
Every variant carries `disabled:opacity-30` (Macro's value) and `data-press-pulse` from change #2.

Depth guidance, matching Macro's usage: page = 0, section cards = 1, nested panels inside a card = 2, popovers/menus = 3, dialogs = 4. Because the depths compose, a stat card inside a section inside the page is visibly, correctly lighter — with no shadows and no extra DOM boxes.

---

### #10 — Light mode
**Effort S/M · Impact 3**

**(a) Macro.** `MACRO_LIGHT` (`constants.ts:48-80`) is the same hues with L inverted and `depth: 0.06`. Light/dark is *derived* from `b0.l > c0.l` (`themeReactive.ts:72-75`), driving `html[data-theme-light]`, which drives two `@custom-variant`s (`index.css:255-256`). OS following via `matchMedia` (`themeSignals.ts:84-95`).

**(b) MLE.** Zero `dark:` occurrences. `#070b14` is hardcoded in `globals.css:4` *and* `layout.tsx:40`. There is no theme concept at all.

**(c) The change.** **This is nearly free once #1 lands** — it's 15 numbers. Add to `globals.css`:

```css
:root[data-theme="light"] {
  --b0: oklch(0.995 0.002 264.3);  /* #fdfdff */
  --b1: oklch(0.975 0.004 264.3);  /* #f5f7f9 */
  --b2: oklch(0.960 0.006 264.3);  /* #f0f2f6 */
  --b3: oklch(0.930 0.008 264.3);  /* #e5e8ed */
  --b4: oklch(0.890 0.010 264.3);  /* #d7dbe2 */

  --c0: oklch(0.220 0.030 257);    /* #111b28 */
  --c1: oklch(0.400 0.030 257);    /* #3d4858 */
  --c2: oklch(0.545 0.035 257);    /* #637185 */
  --c3: oklch(0.650 0.030 257);    /* #8490a2 */
  --c4: oklch(0.730 0.025 257);    /* #9ea9b8 */

  /* Amber at L=0.837 is unreadable on white — drop it to 0.68 (#c68d00). */
  --a0: oklch(0.680 0.160 84.4);
}
@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) { /* …same block… */ }
}
```

Two follow-ups, both one-liners:
- `app/layout.tsx:38` — the `.starfield` background is dark-only. Gate it: `dark-mode:starfield`, or invert the gradient dots to `rgba(0,0,0,0.06)` in light.
- `app/layout.tsx:40` — `bg-[#070b14]/90` → `bg-page/90`.
- Change #9's `Layer` needs the sign flipped in light mode (Macro does exactly this at `Layer.tsx:15-17`): in light themes, "elevated" means *darker*, so use `DEPTH_SCALE = -0.06`.

Even if Rob never ships light mode to users, doing this **proves the token layer is real** — if light mode works, no hardcoded color survived the migration. It's the test, not just a feature.

---

## 10. What NOT to copy from Macro

Being honest about the other direction:

- **`@utility cursor-pointer { cursor: default; }`** (`index.css:507-510`) and `a { cursor: default; }`. Correct for a Tauri desktop app; wrong for a web CRM Rob opens in a browser tab. Keep the hand cursor.
- **`user-select: none` by default** (`index.css:308-311`). MLE users copy phone numbers, deal amounts, and names out of tables constantly. Don't.
- **`overflow: hidden` on `html` + `height: 100dvh`** (`index.css:294-306`). App-shell model. MLE's pages scroll naturally and should keep doing so.
- **Hidden scrollbars globally** (`index.css:313-315`). In a dense data table, the scrollbar is the only affordance telling you there's more. Macro can hide it because `j`/`k` is the primary mechanism; MLE isn't there yet.
- **The 45-line `if`-chain in `themeReactive.ts:78-125`.** The *idea* (diff-guarded `setProperty`) is right; the implementation is copy-paste. A loop over a token array does the same job in six lines.
- **`console.log('## CMD K - soup view')`** at `use-soup-view-hotkeys.ts:255`. Shipped debug logging.
- Macro's own `/* scuffed */` markers (`index.css:127`, `:163`, `:194`; `Button.tsx:78`, `:127`) flag places the team knows are wrong. Don't inherit their debt.

---

## 11. Sequencing recommendation

Changes **1 → 2 → 3** are one afternoon and touch only `app/globals.css` plus a mechanical `sed`. They are non-destructive by construction (the token values were computed to land on MLE's current hexes exactly), and they unlock 4, 6, 9, and 10 as near-free follow-ons.

Change **5** ships the *appearance* of keyboard-first in an hour, which buys time for **7** (the real thing) to be done properly rather than rushed.

Change **7** is the only L. It is also the only change that would make someone say "this is faster than my CRM." Do it after 1–6 have made the surface worth navigating quickly.

---

## Appendix A — Every Macro file cited

**Design system**
`apps/web/src/index.css` · `apps/web/tailwind-plugins/zIndex.ts` · `apps/web/src/lib/core/constant/stackingContext.ts`
`apps/web/src/components/ui/index.ts` · `components/ui/utils/classname.ts` · `components/ui/components/Layer.tsx` · `Surface.tsx` · `Button.tsx` · `Tooltip.tsx` · `Panel.tsx` · `Dialog.tsx` · `Dropdown.tsx` · `Hotkey.tsx` · `CommandMenuPrimitives.tsx` · `EmptyStatePanel.tsx` · `Checkbox.tsx` · `SegmentedControl.tsx` · `ToggleSwitch.tsx` · `ButtonGroup.tsx` · `Avatar.tsx` · `Scroll.tsx` · `Stepper.tsx`

**Theming**
`features/theme/constants.ts` · `signals/themeReactive.ts` · `signals/themeSignals.ts` · `utils/themeUtils.ts` · `utils/colorUtil.ts` · `utils/themeValidation.ts` · `components/ThemeEditor.tsx` · `components/ColorPickerPopover.tsx`

**Keyboard**
`lib/core/hotkey/hotkeys.ts` · `utils.ts` · `types.ts` · `tokens.ts` · `constants.ts` · `state.ts` · `getCommands.ts`
`lib/core/mobile/inputModality.ts` · `lib/core/util/isEditableInput.ts` · `apps/web/src/index.tsx`
`components/app/GlobalHotkeys.tsx` · `components/app/useNavigatedFromJK.ts`

**Command palette**
`features/command/CommandMenu.tsx` · `Launcher.tsx` · `useCommandItems.ts` · `CommandItem.tsx` · `state.ts` · `recency.ts` · `types.ts` · `category-search-filters.ts`

**Speed / lists**
`features/next-soup/soup-view/soup-view.tsx` · `use-soup-navigation-hotkeys.ts` · `use-soup-view-hotkeys.ts`
`features/next-soup/actions/make-mark-done-action.ts` · `features/channel/Channel/create-channel-find-bar.ts`
`features/home/home-section-boundary.tsx` · `features/block-pr/component/PrSkeletons.tsx`
`features/block-md/definition.ts` · `block-pdf/definition.ts` · `block-image/definition.ts` · `block-video/definition.ts`

**Layout**
`components/app/split-layout/` (SplitLayout.tsx, layoutManager.ts, components/SplitPanel.tsx, components/SplitHeader.tsx, layoutUrlSync.ts, previewPersistence.ts, splitFocusTracker.ts, registerSplitHotkeys.ts, mobile/*)
`lib/core/component/Resize/Resize.tsx` · `Resize/solver.ts` · `Resize/types.ts`

**Motion**
`lib/animate/index.ts` · `easings/{cubic,back,bounce,elastic,quad,sine,linear}.ts` · `utils/timeline.ts` · `utils/controller.ts`
`components/app/mobile/pressPulse.ts` · `lib/design/empty-state-*.svg` (17 files)

**Editor / CRDT**
`packages/lexical-core/` — `package.json`, `README.md`, `node-list.ts`, `decoratorRegistry.ts`, `domFactoryRegistry.ts`, `constants.ts`, `markdown-loro-schema.ts`, `markdown-loro-snapshot.ts`, `plugins/nodeIdPlugin.ts`, `plugins/peerIdPlugin.ts`, `nodes/*` (32), `transformers/*` (19), `utils/parsers.ts`, `utils/languageSupport.ts`
`packages/collaboration/` — `package.json`, `README.md`, `src/collab/{manager,engine,awareness,wal,snapshot-store,chatter,source,ai-peer}.ts`, `src/websocket/**`, `src/sync-service/{schema,source,socket}.ts`
`packages/loro-mirror/` — `package.json`, `THIRD_PARTY_LICENSES.md`, `src/core/{mirror,diff,state,utils}.ts`, `src/schema/*`
`apps/web/src/features/block-md/component/MarkdownCollabProvider.tsx`
`apps/web/src/lib/core/component/LexicalMarkdown/collaboration/{reconcile,mapping,cursor,undo}.ts` · `remote-cursor.tsx` · `LexicalAwareness.ts`

## Appendix B — Every MLE file cited

`app/globals.css` · `app/layout.tsx` · `app/page.tsx` · `package.json` · `postcss.config.mjs`
`components/inline/fields.tsx` · `PeopleTable.tsx` · `CompaniesTable.tsx` · `DealsBoard.tsx` · `SearchBar.tsx` · `PersonEditor.tsx` · `RepSubNav.tsx` · `FallbackBanner.tsx` · `DevChat.tsx` · `NeedsActionPanel.tsx` · `ThingsToAddress.tsx` · `ActivityTimeline.tsx` · `DedupQueue.tsx` · `CsvButtons.tsx` · `EstimatePanel.tsx` · `ops/PanelsView.tsx` · `esign/DocumentsSection.tsx`
`app/{people,companies,deals,network,rep,ops,projects,training,sign}/**/page.tsx`
`app/sign/[token]/SignerClient.tsx` · `app/sign/[token]/PdfPreview.tsx`

---

*Report generated 2026-07-25. Macro v2.5.0 (AGPLv3) analysed at commit-state of the clone in the session scratchpad. All MLE paths verified against the canonical repo per `~/.claude/rules/canonical-repos.md`. All OKLCH values in §9 were computed from MLE's existing hex colors via sRGB→OKLab→OKLCH conversion and round-trip verified to reproduce the source hexes exactly.*
