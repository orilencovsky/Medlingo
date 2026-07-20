# MedLingo — Interactive Anatomy Explorer (v1)

**Date:** 2026-07-20
**Status:** Approved design — ready for implementation plan
**Related:** [2026-07-19 anatomy tab](2026-07-19-anatomy-tab-design.md) (shipped, PR #10 — the
card-grid `/anatomy` tab, `anatomy_terms` / `anatomy_images` data layer, `/admin/anatomy`).
This spec is the deferred "interactive labeled body figure" that the anatomy-tab spec listed
under Out of scope ("revisit after the card-grid tab proves out").

## Purpose

An interactive, zoomable body figure on `/anatomy`: a whole-body illustration where hovering a
region highlights it, clicking a region either **zooms into a more detailed sub-scene** (body →
eye → iris / pupil / conjunctiva) or **opens that word's dictionary detail card**. It sits beside
the existing card-grid as a second, richer way to browse the same `topic='anatomy'` words.

## Decisions (locked during brainstorming)

- **Coexist, not replace:** the interactive figure is a second view on `/anatomy`, toggled against
  the card-grid ("Browse ⇄ Explore body"). The card-grid stays as the reliable fallback and covers
  words the figure doesn't map yet.
- **v1 coverage = one deep branch (pilot):** whole-body figure with top-level regions clickable,
  but only ONE branch built fully deep end to end — the **eye** (eye → conjunctiva / iris / pupil →
  dictionary card). Proves nested zoom + drill-down + card-open before scaling asset work.
- **Approach A — owned SVG scenes + a generic zoom-tree.** We own the SVG art; the engine renders
  any SVG that follows a `data-node` convention. This is the only approach that cleanly gives
  arbitrary-depth nesting and stays fully owned/offline.
- **Engine / content decoupling:** the interaction engine is generic code; the anatomical figures
  are pluggable content. The engine ships and is tested against committed **placeholder SVGs**;
  real art drops in later as a pure content change, no code touched (mirrors the curated-image
  seeder pattern).
- **Static node-map, no new DB tables:** the region→word / region→child-scene map is a versioned
  TS config in the repo. Leaves reference existing `dictionary_entries.id`; the detail card reuses
  `anatomy_images`. Migrate to a DB table + admin UI only if it outgrows the config (not in v1).
- **New shared `WordDetailCard`:** clicking a leaf opens a word-detail card. No such component
  exists today (words render as plain rows), so v1 builds it; the card-grid reuses it too.

## Architecture

Two deliberately separated layers:

1. **Engine (code, anatomy-agnostic):** `AnatomyExplorer` renders a *scene* (one inline SVG),
   highlights regions on hover, and on click drills into a child scene or opens a word card. It
   reads a node-map + SVGs and knows nothing anatomy-specific.
2. **Content (pluggable):** SVG scene files + the static node-map. Real art is interchangeable with
   the committed placeholders.

Data reuse: leaf nodes point at existing `topic='anatomy'` `dictionary_entries` via `entryId`; the
detail card shows the word's **primary** `anatomy_images` row. No schema changes.

### Data & config

A scene tree in `src/lib/anatomyScenes.ts`:

```ts
// One scene per SVG file. A node is a clickable region inside that SVG.
export interface SceneNode {
  node: string;          // matches data-node="..." in the SVG
  entryId?: string;      // dictionary word this region opens (leaf, or a parent that also has a word)
  childScene?: string;   // if set, clicking this region zooms into this scene id
  labelKey?: string;     // optional i18n label for a pure grouping node that has no word
}
export interface Scene { id: string; svg: string; nodes: SceneNode[]; }
```

- **Root scene:** `body` (whole figure). `data-node="eye"` → `childScene: 'eye'`; a handful of
  other top-level organs are leaves (`entryId` only).
- **Detail scene:** `eye`. `iris` / `pupil` / `conjunctiva` are each an `entryId` leaf.
- A node may be **both** a word and a parent: click = **zoom**; the parent's own word card is
  reachable from the breadcrumb (see Interaction model). This keeps a single, predictable click
  behavior (click always drills when a child exists).
- **SVG convention:** each clickable area is a `<path>` or `<g>` carrying `data-node="…"`.
  Everything else in the SVG is inert (decorative). SVGs are rendered **inline** (not via `<img>`)
  so regions are individually styleable, focusable, and clickable.

### Components

- **`AnatomyView`** — the `/anatomy` page wrapper. Holds the Browse ⇄ Explore toggle and renders
  either the card-grid or the explorer. Toggle state lives in the URL (`?view=explore`) so it is
  linkable and back-button-friendly; default (no param) = Browse (card-grid).
- **`AnatomyExplorer`** — owns the scene stack (breadcrumb path), the current scene, and the
  current selection. Loads the node-map, renders the active `Scene`, handles drill/back.
- **`Scene`** — renders one inline SVG; wires hover + click/activate per `data-node`. Maps each
  `data-node` to its `SceneNode` and applies the right behavior (drill vs open-card vs inert).
- **`Breadcrumb`** — e.g. `Body › Eye › …`; clicking a crumb pops the stack back to that scene.
  When the current scene's parent node also has a word (`entryId`), the breadcrumb exposes a way to
  open that parent word's card.
- **`WordDetailCard`** (new, shared) — a modal on desktop / bottom-sheet on mobile. Given an
  `entryId`, it fetches the entry + that word's **primary** anatomy image and shows: `hebrewNikud`,
  English, everyday synonym, notes, gender, and the image. Reused by the card-grid to finally give
  it a detail view.

### Interaction model

- **Hover (desktop, pointer:fine):** the region highlights (CSS fill/stroke) and a floating label
  shows the Hebrew word; pointer cursor. The floating label is decorative (`aria-hidden`).
- **Click a leaf** → open `WordDetailCard` for its `entryId`.
- **Click a parent** (`childScene` set) → cross-fade to the child SVG and push a breadcrumb crumb.
  Back = a breadcrumb crumb or a back control.
- **Touch (no hover, pointer:coarse):** first tap on a region highlights it and shows its label
  chip; tapping the same region again (or the label chip) activates it (drill or open card). One
  obvious affordance, no reliance on hover.
- **Keyboard / a11y:** each clickable region is a focusable control with `role="button"` and an
  `aria-label` = the region's English name; Enter/Space activates. Tab order follows document
  order. Non-`data-node` SVG content is inert and not focusable.
- **Zoom feel:** cross-fade + slight scale between scenes; honors `prefers-reduced-motion` (instant
  swap when set). Not a continuous viewBox zoom — each child SVG is drawn at its own proper detail
  rather than being a magnified parent.

### Pilot assets & placeholder strategy

The engine is built and tested against **committed placeholder SVGs**: crude but correctly
`data-node`-tagged (e.g. a body of labeled boxes, an eye of labeled circles). The full feature
ships and is verified before any real art exists. Real `body.svg` + `eye.svg` — open-license or
commissioned illustrative art tagged to the same `data-node` convention — drop in later as a pure
content change. **Art sourcing is a separate content task, not a code blocker.**

### Error handling & edge cases

- Missing/blank scene SVG → the explorer renders the card-grid view plus a quiet notice; never a
  broken figure.
- A `data-node` with no matching config node, or an `entryId` that doesn't resolve to a real
  anatomy word, or a `childScene` that doesn't exist → caught by the config validator at build/CI;
  at runtime such a region is inert (not clickable) and logged.
- A leaf whose word has no primary image → the detail card still opens and shows the text fields;
  the image slot is omitted (only the image is conditional, not the whole word).
- Deep-link `?view=explore` when no scenes are configured → falls back to Browse (card-grid).

## Testing

- **Config validator (unit, CI):** for every committed SVG, each `data-node` in the SVG has a
  matching config node and vice-versa; every `entryId` resolves to a real `topic='anatomy'` word;
  every `childScene` references an existing scene. A mistagged asset fails loudly.
- **Engine (Testing Library):** hover highlights a region; clicking a parent drills into the child
  scene and pushes the breadcrumb; a breadcrumb crumb pops back; clicking a leaf opens
  `WordDetailCard` with the correct word; the touch two-tap path (highlight then activate);
  keyboard Enter/Space activates a focused region.
- **`WordDetailCard` (unit):** renders the word's text fields; shows the primary image when
  present; omits the image slot when the word has no primary image.
- **View toggle (unit):** `?view=explore` renders the explorer; default renders the card-grid; no
  scenes configured falls back to the card-grid.

## Out of scope (v1)

- Deep branches beyond the eye (heart, abdomen, …) — added later once the pilot proves out; the
  engine already supports arbitrary depth, so this is pure content (SVG + config) work.
- A DB-backed node-map + admin UI for wiring regions to words — revisit only if the static config
  outgrows itself.
- True continuous viewBox zoom animation between scenes.
- Commissioned/real anatomical art — a separate content task; v1 ships on placeholder SVGs.
- Audio pronunciation, quizzing / FSRS practice on the figure — the figure is browse/reference,
  consistent with the card-grid tab.
