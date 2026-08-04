# Interactive Anatomy Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive, zoomable body-figure "Explore" view to `/anatomy` — hover highlights a region, clicking drills into a child scene (body → eye → iris/pupil/conjunctiva) or opens that word's dictionary detail card — coexisting with the shipped card-grid via a Browse ⇄ Explore toggle.

**Architecture:** A generic, anatomy-agnostic engine renders inline SVG "scenes" tagged with `data-node` attributes; a static in-repo node-map wires each region to a dictionary word (`entryId`) and/or a child scene. Art is pluggable content — the engine ships and is tested against committed placeholder SVGs. No new DB tables; leaves reuse `dictionary_entries` + `anatomy_images`.

**Tech Stack:** React 19 + react-router 8 (`useSearchParams`), react-i18next, Tailwind 4 (logical props), Vite `?raw` SVG imports, Supabase JS, Vitest + Testing Library.

## Global Constraints

- Coexist, don't replace: the figure is a second view on `/anatomy`, toggled against the card-grid. Toggle state lives in the URL query param `?view=explore` (default/absent = Browse). Never remove the card-grid.
- v1 coverage = one deep branch: whole-body top level + the **eye** fully deep (eye → conjunctiva / iris / pupil). The engine supports arbitrary depth; more branches are later content.
- Static node-map only — no new DB tables, no admin UI in v1.
- Engine / content decoupling: the engine must work against ANY `data-node`-tagged SVG. Real art replaces placeholders with zero code change.
- SVG convention: each clickable region is an element carrying `data-node="…"`; all other SVG content is inert (decorative). SVGs render **inline** (via `?raw` + `dangerouslySetInnerHTML`), never `<img>`, so regions are styleable/focusable/clickable.
- A leaf whose word has no primary image → the detail card still opens with text fields; only the image slot is omitted.
- Accessibility: every clickable region is keyboard-focusable with `role="button"` + an `aria-label` (English name); Enter/Space activates. Motion honors `prefers-reduced-motion`. Touch (no hover) uses two-tap: first tap highlights + labels, second tap on the same region activates.
- Styling uses Tailwind logical properties (`ms-`/`me-`/`ps-`/`pe-`/`start`/`end`), never `ml-`/`mr-` — RTL (Hebrew) must not break.
- i18n: every new user-facing string added to all 5 locales (`en`, `he`, `ar`, `ru`, `fr`).
- Placeholder `entryId`s in the committed config (`eye`, `iris`, `pupil`, `conjunctiva`, `heart`, `stomach`) are stand-ins. They must be swapped for real `dictionary_entries.id` values tagged `topic='anatomy'` before the pilot shows real data — a content step, not a code step. Tests mock the data layer, so they stay green regardless.

---

### Task 1: Scene config, placeholder SVGs, and validator

**Files:**
- Create: `src/anatomy/scenes/body.svg`
- Create: `src/anatomy/scenes/eye.svg`
- Create: `src/lib/anatomyScenes.ts`
- Create: `src/lib/anatomyScenes.test.ts`
- Modify: `src/vite-env.d.ts` (add `*.svg?raw` module typing if not already present)

**Interfaces:**
- Produces: `interface SceneNode { node: string; entryId?: string; childScene?: string; labelKey?: string }`; `interface Scene { id: string; svg: string; nodes: SceneNode[] }`; `const SCENES: Record<string, Scene>`; `const ROOT_SCENE_ID = 'body'`; `function getScene(id: string): Scene | undefined`; `function nodeFor(scene: Scene, nodeName: string): SceneNode | undefined`; `function parseNodeIds(svg: string): string[]`; `function validateScenes(scenes: Record<string, Scene>): string[]` (returns a list of human-readable problems; empty = valid). Consumed by Tasks 4, 5.

- [ ] **Step 1: Create the placeholder body SVG**

`src/anatomy/scenes/body.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 400" role="img" aria-label="Body figure (placeholder)">
  <rect x="0" y="0" width="200" height="400" fill="#f1f5f9"/>
  <circle data-node="eye" cx="100" cy="60" r="18" fill="#cbd5e1"/>
  <rect data-node="heart" x="78" y="150" width="44" height="40" rx="6" fill="#cbd5e1"/>
  <rect data-node="stomach" x="82" y="210" width="36" height="30" rx="6" fill="#cbd5e1"/>
</svg>
```

- [ ] **Step 2: Create the placeholder eye SVG**

`src/anatomy/scenes/eye.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="Eye detail (placeholder)">
  <rect x="0" y="0" width="200" height="200" fill="#f1f5f9"/>
  <ellipse data-node="conjunctiva" cx="100" cy="100" rx="92" ry="52" fill="#e2e8f0"/>
  <circle data-node="iris" cx="100" cy="100" r="40" fill="#93c5fd"/>
  <circle data-node="pupil" cx="100" cy="100" r="16" fill="#1e293b"/>
</svg>
```

- [ ] **Step 3: Ensure `*.svg?raw` is typed**

Read `src/vite-env.d.ts`. If it does not already reference vite/client (which declares `*.svg?raw` as `string`), make it exactly:

```ts
/// <reference types="vite/client" />
```

If the file already has that reference plus other content, leave the existing content and do not duplicate the reference.

- [ ] **Step 4: Write the failing test**

`src/lib/anatomyScenes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SCENES, ROOT_SCENE_ID, getScene, nodeFor, parseNodeIds, validateScenes } from './anatomyScenes';

describe('anatomyScenes config', () => {
  it('has a valid root scene', () => {
    expect(getScene(ROOT_SCENE_ID)).toBeDefined();
  });

  it('parseNodeIds extracts every data-node from an SVG string', () => {
    const svg = '<svg><circle data-node="eye"/><rect data-node="heart"/><rect/></svg>';
    expect(parseNodeIds(svg).sort()).toEqual(['eye', 'heart']);
  });

  it('nodeFor finds a configured node by name', () => {
    const body = getScene('body')!;
    expect(nodeFor(body, 'eye')?.childScene).toBe('eye');
    expect(nodeFor(body, 'nonexistent')).toBeUndefined();
  });

  it('validateScenes reports no problems for the shipped config', () => {
    expect(validateScenes(SCENES)).toEqual([]);
  });

  it('validateScenes flags a data-node with no config node', () => {
    const broken: Record<string, import('./anatomyScenes').Scene> = {
      x: { id: 'x', svg: '<svg><circle data-node="ghost"/></svg>', nodes: [] },
    };
    expect(validateScenes(broken).some((p) => p.includes('ghost'))).toBe(true);
  });

  it('validateScenes flags a config node missing from the SVG', () => {
    const broken: Record<string, import('./anatomyScenes').Scene> = {
      x: { id: 'x', svg: '<svg></svg>', nodes: [{ node: 'phantom', entryId: 'w' }] },
    };
    expect(validateScenes(broken).some((p) => p.includes('phantom'))).toBe(true);
  });

  it('validateScenes flags a childScene that does not exist', () => {
    const broken: Record<string, import('./anatomyScenes').Scene> = {
      x: { id: 'x', svg: '<svg><circle data-node="a"/></svg>', nodes: [{ node: 'a', childScene: 'missing' }] },
    };
    expect(validateScenes(broken).some((p) => p.includes('missing'))).toBe(true);
  });

  it('every node in the config is either a leaf (entryId) or a parent (childScene)', () => {
    for (const scene of Object.values(SCENES)) {
      for (const n of scene.nodes) {
        expect(Boolean(n.entryId) || Boolean(n.childScene)).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx vitest run src/lib/anatomyScenes.test.ts`
Expected: FAIL — `Cannot find module './anatomyScenes'`.

- [ ] **Step 6: Write the implementation**

`src/lib/anatomyScenes.ts`:

```ts
// Static node-map for the interactive anatomy explorer. Each Scene is one inline
// SVG; each SceneNode is a clickable region (matches a data-node="..." in the SVG)
// that is either a leaf (opens the entryId's dictionary card) or a parent (zooms
// into childScene), or both (click drills; the word is reachable from the breadcrumb).
//
// The entryId values below are PLACEHOLDERS — swap for real dictionary_entries.id
// values tagged topic='anatomy' before the pilot shows real data. Tests mock the
// data layer, so they do not depend on these being real ids.
import bodySvg from '../anatomy/scenes/body.svg?raw';
import eyeSvg from '../anatomy/scenes/eye.svg?raw';

export interface SceneNode {
  node: string;        // matches data-node="..." in the SVG
  entryId?: string;    // dictionary word this region opens
  childScene?: string; // if set, clicking zooms into this scene id
  labelKey?: string;   // optional i18n label for a pure grouping node with no word
}

export interface Scene {
  id: string;
  svg: string;         // raw inline SVG markup
  nodes: SceneNode[];
}

export const ROOT_SCENE_ID = 'body';

export const SCENES: Record<string, Scene> = {
  body: {
    id: 'body',
    svg: bodySvg,
    nodes: [
      { node: 'eye', entryId: 'eye', childScene: 'eye' },
      { node: 'heart', entryId: 'heart' },
      { node: 'stomach', entryId: 'stomach' },
    ],
  },
  eye: {
    id: 'eye',
    svg: eyeSvg,
    nodes: [
      { node: 'conjunctiva', entryId: 'conjunctiva' },
      { node: 'iris', entryId: 'iris' },
      { node: 'pupil', entryId: 'pupil' },
    ],
  },
};

export function getScene(id: string): Scene | undefined {
  return SCENES[id];
}

export function nodeFor(scene: Scene, nodeName: string): SceneNode | undefined {
  return scene.nodes.find((n) => n.node === nodeName);
}

// Extract every data-node="..." value from a raw SVG string.
export function parseNodeIds(svg: string): string[] {
  const ids: string[] = [];
  const re = /data-node="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg)) !== null) ids.push(m[1]);
  return ids;
}

// Structural validation (offline, no DB). Returns a list of problems; empty = valid.
// NOTE: whether each entryId resolves to a real topic='anatomy' word is a content
// concern verified when real ids are wired in, not here.
export function validateScenes(scenes: Record<string, Scene>): string[] {
  const problems: string[] = [];
  for (const scene of Object.values(scenes)) {
    const svgNodes = new Set(parseNodeIds(scene.svg));
    const configNodes = new Set(scene.nodes.map((n) => n.node));
    for (const id of svgNodes) {
      if (!configNodes.has(id)) problems.push(`scene "${scene.id}": SVG data-node "${id}" has no config node`);
    }
    for (const n of scene.nodes) {
      if (!svgNodes.has(n.node)) problems.push(`scene "${scene.id}": config node "${n.node}" is absent from the SVG`);
      if (n.childScene && !scenes[n.childScene]) {
        problems.push(`scene "${scene.id}": node "${n.node}" references missing childScene "${n.childScene}"`);
      }
      if (!n.entryId && !n.childScene) {
        problems.push(`scene "${scene.id}": node "${n.node}" is neither a leaf (entryId) nor a parent (childScene)`);
      }
    }
  }
  return problems;
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run src/lib/anatomyScenes.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 8: Commit**

```bash
git add src/anatomy/scenes/body.svg src/anatomy/scenes/eye.svg src/lib/anatomyScenes.ts src/lib/anatomyScenes.test.ts src/vite-env.d.ts
git commit -m "feat: anatomy scene config, placeholder SVGs, and structural validator"
```

---

### Task 2: Data layer — single-word fetch + scene labels

**Files:**
- Modify: `src/data/anatomy.ts`
- Test: `src/data/anatomy.test.ts` (append to the existing file)

**Interfaces:**
- Consumes: `supabase`, `fetchAllRows`, `mapEntryRow`/`EntryRow`, `publicImageUrl` (already in `anatomy.ts`).
- Produces: `interface AnatomyWord { entry: DictionaryEntry; imageUrl: string | null; imageCredit: string | null }`; `async function fetchAnatomyWord(entryId: string): Promise<AnatomyWord | null>`; `async function fetchSceneLabels(entryIds: string[]): Promise<Record<string, { he: string; en: string }>>`. Consumed by Tasks 3 (`WordDetailCard`) and 5 (`AnatomyExplorer`).

- [ ] **Step 1: Write the failing tests (append to `src/data/anatomy.test.ts`)**

The existing `src/data/anatomy.test.ts` (from PR #10) opens with this mock — `select()` returns an `orderChain` whose `.range()` yields `{ returns: () => rangeMock(...) }`:

```ts
const rangeMock = vi.fn();
const orderChain: { order: () => typeof orderChain; range: (...args: unknown[]) => { returns: () => ReturnType<typeof rangeMock> } } = {
  order: () => orderChain,
  range: (...args: unknown[]) => ({ returns: () => rangeMock(...args) }),
};
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ select: vi.fn(() => orderChain) })),
    storage: { from: vi.fn(() => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.test/${p}` } }) })) },
  },
}));
```

Replace that whole block with this one — it keeps the card query working (`order→order→range→returns`) and adds `eq→maybeSingle` (for `fetchAnatomyWord`) and `in` (for `fetchSceneLabels`) onto the same chain node:

```ts
const rangeMock = vi.fn();
const singleMock = vi.fn();
const inMock = vi.fn();
// select() returns this one chain node. fetchAnatomyCards: order→order→range→returns.
// fetchAnatomyWord: eq→maybeSingle. fetchSceneLabels: in.
const chain: {
  order: () => typeof chain;
  range: (...a: unknown[]) => { returns: () => ReturnType<typeof rangeMock> };
  eq: () => { maybeSingle: typeof singleMock };
  in: (...a: unknown[]) => ReturnType<typeof inMock>;
} = {
  order: () => chain,
  range: (...a: unknown[]) => ({ returns: () => rangeMock(...a) }),
  eq: () => ({ maybeSingle: singleMock }),
  in: (...a: unknown[]) => inMock(...a),
};
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ select: vi.fn(() => chain) })),
    storage: { from: vi.fn(() => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.test/${p}` } }) })) },
  },
}));
```

Then append these tests (the existing card tests above stay unchanged):

```ts
import { fetchAnatomyWord, fetchSceneLabels } from './anatomy';

const ENTRY = (id = 'heart') => ({
  id, hebrew: 'לב', hebrew_nikud: 'לֵב', part_of_speech: 'noun', level: 1, gender: 'ז',
  plural: null, root: null, everyday_synonym: null, translations: { en: 'heart' },
  notes: null, category: null, topic: 'anatomy',
});

describe('fetchAnatomyWord', () => {
  it('returns the entry with a primary image url when one exists', async () => {
    singleMock.mockResolvedValueOnce({
      data: { ...ENTRY(), anatomy_images: [{ storage_path: 'heart/1.png', is_primary: true, credit: 'Gray' }] },
      error: null,
    });
    const w = await fetchAnatomyWord('heart');
    expect(w?.entry.id).toBe('heart');
    expect(w?.imageUrl).toContain('heart/1.png');
    expect(w?.imageCredit).toBe('Gray');
  });

  it('returns the entry with null image when the word has no primary image', async () => {
    singleMock.mockResolvedValueOnce({
      data: { ...ENTRY(), anatomy_images: [{ storage_path: 'heart/1.png', is_primary: false, credit: null }] },
      error: null,
    });
    const w = await fetchAnatomyWord('heart');
    expect(w?.entry.id).toBe('heart');
    expect(w?.imageUrl).toBeNull();
  });

  it('returns null when the entry does not exist', async () => {
    singleMock.mockResolvedValueOnce({ data: null, error: null });
    expect(await fetchAnatomyWord('ghost')).toBeNull();
  });
});

describe('fetchSceneLabels', () => {
  it('returns an empty map for an empty id list without querying', async () => {
    expect(await fetchSceneLabels([])).toEqual({});
    expect(inMock).not.toHaveBeenCalled();
  });

  it('maps entry ids to their hebrew + english labels', async () => {
    inMock.mockResolvedValueOnce({
      data: [{ id: 'heart', hebrew_nikud: 'לֵב', translations: { en: 'heart' } }], error: null,
    });
    const labels = await fetchSceneLabels(['heart']);
    expect(labels.heart).toEqual({ he: 'לֵב', en: 'heart' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/data/anatomy.test.ts`
Expected: FAIL — `fetchAnatomyWord`/`fetchSceneLabels` are not exported.

- [ ] **Step 3: Write the implementation (append to `src/data/anatomy.ts`)**

```ts
export interface AnatomyWord {
  entry: DictionaryEntry;
  imageUrl: string | null;
  imageCredit: string | null;
}

type WordRow = EntryRow & {
  anatomy_images: { storage_path: string; is_primary: boolean; credit: string | null }[] | null;
};

// One anatomy word by id, with its primary image if it has one. Returns null when
// the entry doesn't exist or isn't readable. The image is optional: the detail card
// still opens for a word with no primary image (text-only).
export async function fetchAnatomyWord(entryId: string): Promise<AnatomyWord | null> {
  const { data, error } = await supabase
    .from('dictionary_entries')
    .select('*, anatomy_images(storage_path, is_primary, credit)')
    .eq('id', entryId)
    .maybeSingle<WordRow>();
  if (error) throw error;
  if (!data) return null;
  const primary = (data.anatomy_images ?? []).find((img) => img.is_primary);
  return {
    entry: mapEntryRow(data),
    imageUrl: primary ? publicImageUrl(primary.storage_path) : null,
    imageCredit: primary?.credit ?? null,
  };
}

// Lightweight labels (nikud Hebrew + English) for a set of entry ids — used for the
// hover label + aria-label on figure regions without fetching whole words.
export async function fetchSceneLabels(entryIds: string[]): Promise<Record<string, { he: string; en: string }>> {
  if (entryIds.length === 0) return {};
  const { data, error } = await supabase
    .from('dictionary_entries')
    .select('id, hebrew_nikud, translations')
    .in('id', entryIds);
  if (error) throw error;
  const out: Record<string, { he: string; en: string }> = {};
  for (const r of (data ?? []) as { id: string; hebrew_nikud: string; translations: { en: string } }[]) {
    out[r.id] = { he: r.hebrew_nikud, en: r.translations.en };
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/data/anatomy.test.ts`
Expected: PASS (existing card tests + 5 new).

- [ ] **Step 5: Commit**

```bash
git add src/data/anatomy.ts src/data/anatomy.test.ts
git commit -m "feat: add fetchAnatomyWord + fetchSceneLabels data layer for the anatomy explorer"
```

---

### Task 3: `WordDetailCard` component

**Files:**
- Create: `src/components/anatomy/WordDetailCard.tsx`
- Test: `src/components/anatomy/WordDetailCard.test.tsx`

**Interfaces:**
- Consumes: `fetchAnatomyWord, type AnatomyWord` from `../../data/anatomy`; `He` from `../He`.
- Produces: `function WordDetailCard({ entryId, onClose }: { entryId: string; onClose: () => void }): JSX.Element`. Consumed by Task 5.

- [ ] **Step 1: Write the failing test**

`src/components/anatomy/WordDetailCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '../../lib/i18n';
import { WordDetailCard } from './WordDetailCard';

const fetchAnatomyWord = vi.fn();
vi.mock('../../data/anatomy', () => ({ fetchAnatomyWord: (...a: unknown[]) => fetchAnatomyWord(...a) }));

const WORD = (imageUrl: string | null) => ({
  entry: { id: 'heart', hebrew: 'לב', hebrewNikud: 'לֵב', partOfSpeech: 'noun', level: 1, gender: 'ז',
    plural: null, root: null, everydaySynonym: 'המנוע של הגוף', notes: 'שריר', translations: { en: 'heart' },
    category: null, topic: 'anatomy' },
  imageUrl, imageCredit: imageUrl ? 'Gray' : null,
});

describe('WordDetailCard', () => {
  it('shows the word fields and image when a primary image exists', async () => {
    fetchAnatomyWord.mockResolvedValueOnce(WORD('https://cdn.test/heart.png'));
    render(<WordDetailCard entryId="heart" onClose={() => {}} />);
    expect(await screen.findByText('heart')).toBeInTheDocument();
    expect(screen.getByText('לֵב')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://cdn.test/heart.png');
  });

  it('omits the image slot when the word has no primary image', async () => {
    fetchAnatomyWord.mockResolvedValueOnce(WORD(null));
    render(<WordDetailCard entryId="heart" onClose={() => {}} />);
    expect(await screen.findByText('heart')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', async () => {
    fetchAnatomyWord.mockResolvedValueOnce(WORD(null));
    const onClose = vi.fn();
    render(<WordDetailCard entryId="heart" onClose={onClose} />);
    await screen.findByText('heart');
    await userEvent.click(screen.getByRole('button', { name: /close|סגור|إغلاق|закрыть|fermer/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/anatomy/WordDetailCard.test.tsx`
Expected: FAIL — `Cannot find module './WordDetailCard'`.

- [ ] **Step 3: Write the component**

`src/components/anatomy/WordDetailCard.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAnatomyWord, type AnatomyWord } from '../../data/anatomy';
import { He } from '../He';

// Modal (desktop) / bottom-sheet (mobile) detail for one anatomy word. Given an
// entryId it fetches the word + its primary image; the image slot is omitted when
// the word has no primary image (text still shows).
export function WordDetailCard({ entryId, onClose }: { entryId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [word, setWord] = useState<AnatomyWord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    fetchAnatomyWord(entryId).then((w) => { if (live) { setWord(w); setLoading(false); } });
    return () => { live = false; };
  }, [entryId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog" aria-modal="true" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-2xl bg-surface p-4 shadow-raised sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            {word && <He className="block text-2xl font-bold text-ink">{word.entry.hebrewNikud}</He>}
            {word && <div className="text-sm text-ink-muted">{word.entry.translations.en}</div>}
          </div>
          <button type="button" onClick={onClose}
            className="rounded-md border border-border px-2 py-1 text-sm text-ink-muted">
            {t('anatomy.close')}
          </button>
        </div>
        {loading ? <p className="mt-4 text-ink-muted">{t('common.loading')}</p>
          : !word ? <p className="mt-4 text-ink-muted">{t('anatomy.wordMissing')}</p>
          : (
          <div className="mt-3">
            {word.imageUrl && (
              <figure>
                <img src={word.imageUrl} alt={word.entry.translations.en}
                  className="max-h-64 w-full rounded-md object-contain" />
                {word.imageCredit && <figcaption className="mt-1 text-[10px] text-ink-subtle">{word.imageCredit}</figcaption>}
              </figure>
            )}
            <dl className="mt-3 space-y-1 text-sm">
              {word.entry.everydaySynonym && (
                <div className="flex gap-2"><dt className="text-ink-muted">{t('unit.everyday')}:</dt>
                  <dd className="text-ink">{word.entry.everydaySynonym}</dd></div>
              )}
              {word.entry.gender && (
                <div className="flex gap-2"><dt className="text-ink-muted">{t('unit.gender')}:</dt>
                  <dd className="text-ink">{word.entry.gender}</dd></div>
              )}
              {word.entry.notes && (
                <div className="flex gap-2"><dt className="text-ink-muted">{t('unit.meaning')}:</dt>
                  <dd className="text-ink">{word.entry.notes}</dd></div>
              )}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add the two new i18n keys used above to all 5 locales**

In each of `src/locales/{en,he,ar,ru,fr}.json`, add `close` and `wordMissing` inside the existing `"anatomy"` object:

- en: `"close": "Close", "wordMissing": "This word isn't available."`
- he: `"close": "סגור", "wordMissing": "המילה הזו אינה זמינה."`
- ar: `"close": "إغلاق", "wordMissing": "هذه الكلمة غير متوفرة."`
- ru: `"close": "Закрыть", "wordMissing": "Это слово недоступно."`
- fr: `"close": "Fermer", "wordMissing": "Ce mot n'est pas disponible."`

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/anatomy/WordDetailCard.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/anatomy/WordDetailCard.tsx src/components/anatomy/WordDetailCard.test.tsx src/locales
git commit -m "feat: add shared WordDetailCard modal for anatomy word detail"
```

---

### Task 4: `Scene` component — inline SVG with hover / click / keyboard / touch

**Files:**
- Create: `src/components/anatomy/Scene.tsx`
- Test: `src/components/anatomy/Scene.test.tsx`

**Interfaces:**
- Consumes: `type Scene, type SceneNode, nodeFor` from `../../lib/anatomyScenes`.
- Produces: `interface SceneLabels { [entryId: string]: { he: string; en: string } }`; `function Scene({ scene, labels, onActivate }: { scene: Scene; labels: SceneLabels; onActivate: (node: SceneNode) => void }): JSX.Element`. `onActivate` fires with the resolved config node when a configured region is clicked/Enter/Space-activated (or second-tapped on touch); regions with no config node are inert. Consumed by Task 5.

- [ ] **Step 1: Write the failing test**

`src/components/anatomy/Scene.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Scene } from './Scene';
import type { Scene as SceneType } from '../../lib/anatomyScenes';

const SCENE: SceneType = {
  id: 'body',
  svg: '<svg><circle data-node="eye"/><rect data-node="heart"/><rect data-node="untagged_inert" class="deco"/></svg>',
  nodes: [
    { node: 'eye', entryId: 'eye', childScene: 'eye' },
    { node: 'heart', entryId: 'heart' },
  ],
};
const LABELS = { eye: { he: 'עַיִן', en: 'eye' }, heart: { he: 'לֵב', en: 'heart' } };

function renderScene(onActivate = vi.fn()) {
  render(<Scene scene={SCENE} labels={LABELS} onActivate={onActivate} />);
  return onActivate;
}

describe('Scene', () => {
  it('marks configured regions as focusable buttons with an english aria-label', () => {
    renderScene();
    const eye = document.querySelector('[data-node="eye"]')!;
    expect(eye.getAttribute('role')).toBe('button');
    expect(eye.getAttribute('tabindex')).toBe('0');
    expect(eye.getAttribute('aria-label')).toBe('eye');
  });

  it('leaves an SVG region with no config node inert (not focusable)', () => {
    renderScene();
    const inert = document.querySelector('[data-node="untagged_inert"]')!;
    expect(inert.getAttribute('role')).toBeNull();
    expect(inert.getAttribute('tabindex')).toBeNull();
  });

  it('activates the node on click', async () => {
    const onActivate = renderScene();
    await userEvent.click(document.querySelector('[data-node="heart"]')!);
    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ node: 'heart', entryId: 'heart' }));
  });

  it('activates the node on Enter', async () => {
    const onActivate = renderScene();
    const eye = document.querySelector('[data-node="eye"]') as HTMLElement;
    eye.focus();
    await userEvent.keyboard('{Enter}');
    expect(onActivate).toHaveBeenCalledWith(expect.objectContaining({ node: 'eye' }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/anatomy/Scene.test.tsx`
Expected: FAIL — `Cannot find module './Scene'`.

- [ ] **Step 3: Write the component**

`src/components/anatomy/Scene.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { nodeFor, type Scene as SceneType, type SceneNode } from '../../lib/anatomyScenes';

export interface SceneLabels { [entryId: string]: { he: string; en: string } }

// Renders one scene's SVG inline and wires interaction. Configured regions become
// focusable role="button" elements (English aria-label); regions with no config
// node stay inert. Desktop: hover highlights + shows the Hebrew label. Touch (no
// hover): first tap highlights + labels, second tap on the same region activates.
export function Scene({ scene, labels, onActivate }: {
  scene: SceneType; labels: SceneLabels; onActivate: (node: SceneNode) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null); // touch: first-tapped region

  const isTouch = typeof window !== 'undefined'
    && window.matchMedia?.('(hover: none)').matches;

  // After the SVG is injected, tag configured regions with a11y attributes.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    for (const el of Array.from(root.querySelectorAll<SVGElement>('[data-node]'))) {
      const name = el.getAttribute('data-node')!;
      const cfg = nodeFor(scene, name);
      if (!cfg) continue; // inert
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', labels[cfg.entryId ?? '']?.en ?? name);
      el.style.cursor = 'pointer';
    }
    setHovered(null);
    setArmed(null);
  }, [scene, labels]);

  const resolve = (target: EventTarget | null): SceneNode | undefined => {
    const el = (target as Element | null)?.closest?.('[data-node]');
    if (!el) return undefined;
    return nodeFor(scene, el.getAttribute('data-node')!);
  };

  const activate = useCallback((cfg: SceneNode) => {
    setHovered(null); setArmed(null);
    onActivate(cfg);
  }, [onActivate]);

  const onClick = (e: React.MouseEvent) => {
    const cfg = resolve(e.target);
    if (!cfg) return;
    if (isTouch && armed !== cfg.node) { setArmed(cfg.node); setHovered(cfg.node); return; }
    activate(cfg);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const cfg = resolve(e.target);
    if (!cfg) return;
    e.preventDefault();
    activate(cfg);
  };

  const onMouseOver = (e: React.MouseEvent) => {
    const cfg = resolve(e.target);
    setHovered(cfg?.node ?? null);
  };

  const hoveredLabel = hovered
    ? labels[nodeFor(scene, hovered)?.entryId ?? '']?.he
    : undefined;

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="anatomy-scene [&_[data-node]]:transition-opacity [&_[role=button]:hover]:opacity-70 [&_[role=button]:focus-visible]:outline [&_[role=button]:focus-visible]:outline-2 [&_[role=button]:focus-visible]:outline-primary"
        data-hovered={hovered ?? ''}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onMouseOver={onMouseOver}
        onMouseLeave={() => setHovered(null)}
        dangerouslySetInnerHTML={{ __html: scene.svg }}
      />
      {hoveredLabel && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-2 mx-auto w-fit rounded-full bg-ink px-3 py-1 text-sm font-bold text-white">
          {hoveredLabel}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/anatomy/Scene.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/anatomy/Scene.tsx src/components/anatomy/Scene.test.tsx
git commit -m "feat: add Scene component — inline SVG with hover/click/keyboard/touch"
```

---

### Task 5: `AnatomyExplorer` — scene stack, drill/back, breadcrumb, card

**Files:**
- Create: `src/components/anatomy/AnatomyExplorer.tsx`
- Test: `src/components/anatomy/AnatomyExplorer.test.tsx`

**Interfaces:**
- Consumes: `SCENES, ROOT_SCENE_ID, getScene, type SceneNode` from `../../lib/anatomyScenes`; `fetchSceneLabels` from `../../data/anatomy`; `Scene, type SceneLabels` from `./Scene`; `WordDetailCard` from `./WordDetailCard`.
- Produces: `function AnatomyExplorer(): JSX.Element`. Consumed by Task 6.

- [ ] **Step 1: Write the failing test**

`src/components/anatomy/AnatomyExplorer.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '../../lib/i18n';
import { AnatomyExplorer } from './AnatomyExplorer';

vi.mock('../../data/anatomy', () => ({
  fetchSceneLabels: vi.fn(async () => ({
    eye: { he: 'עַיִן', en: 'eye' }, heart: { he: 'לֵב', en: 'heart' }, stomach: { he: 'קֵבָה', en: 'stomach' },
    iris: { he: 'קַשְׁתִית', en: 'iris' }, pupil: { he: 'אִישׁוֹן', en: 'pupil' }, conjunctiva: { he: 'לַחְמִית', en: 'conjunctiva' },
  })),
  fetchAnatomyWord: vi.fn(async (id: string) => ({
    entry: { id, hebrew: id, hebrewNikud: id, partOfSpeech: 'noun', level: 1, gender: null, plural: null,
      root: null, everydaySynonym: null, notes: null, translations: { en: id }, category: null, topic: 'anatomy' },
    imageUrl: null, imageCredit: null,
  })),
}));

describe('AnatomyExplorer', () => {
  it('renders the root body scene', async () => {
    render(<AnatomyExplorer />);
    await waitFor(() => expect(document.querySelector('[data-node="eye"]')).toBeInTheDocument());
  });

  it('drills into the eye child scene when the eye region is clicked', async () => {
    render(<AnatomyExplorer />);
    await waitFor(() => expect(document.querySelector('[data-node="eye"]')).toBeInTheDocument());
    await userEvent.click(document.querySelector('[data-node="eye"]')!);
    await waitFor(() => expect(document.querySelector('[data-node="pupil"]')).toBeInTheDocument());
    // breadcrumb now shows the eye crumb
    expect(screen.getByRole('button', { name: /eye|עַיִן/i })).toBeInTheDocument();
  });

  it('opens the word card when a leaf region is clicked', async () => {
    render(<AnatomyExplorer />);
    await waitFor(() => expect(document.querySelector('[data-node="heart"]')).toBeInTheDocument());
    await userEvent.click(document.querySelector('[data-node="heart"]')!);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('pops back to the body scene via the breadcrumb', async () => {
    render(<AnatomyExplorer />);
    await waitFor(() => expect(document.querySelector('[data-node="eye"]')).toBeInTheDocument());
    await userEvent.click(document.querySelector('[data-node="eye"]')!);
    await waitFor(() => expect(document.querySelector('[data-node="pupil"]')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /body|גוף/i }));
    await waitFor(() => expect(document.querySelector('[data-node="stomach"]')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/anatomy/AnatomyExplorer.test.tsx`
Expected: FAIL — `Cannot find module './AnatomyExplorer'`.

- [ ] **Step 3: Write the component**

`src/components/anatomy/AnatomyExplorer.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SCENES, ROOT_SCENE_ID, getScene, type SceneNode } from '../../lib/anatomyScenes';
import { fetchSceneLabels } from '../../data/anatomy';
import { Scene, type SceneLabels } from './Scene';
import { WordDetailCard } from './WordDetailCard';

interface Crumb { sceneId: string; labelKey?: string; entryId?: string; nodeName?: string }

// All entryIds referenced anywhere in the config — fetched once for hover labels.
const ALL_ENTRY_IDS = Array.from(new Set(
  Object.values(SCENES).flatMap((s) => s.nodes.map((n) => n.entryId).filter((x): x is string => !!x)),
));

export function AnatomyExplorer() {
  const { t } = useTranslation();
  const [stack, setStack] = useState<Crumb[]>([{ sceneId: ROOT_SCENE_ID }]);
  const [labels, setLabels] = useState<SceneLabels>({});
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);

  useEffect(() => { fetchSceneLabels(ALL_ENTRY_IDS).then(setLabels); }, []);

  const current = stack[stack.length - 1];
  const scene = getScene(current.sceneId);

  const crumbLabel = (c: Crumb): string => {
    if (c.sceneId === ROOT_SCENE_ID) return t('anatomy.rootCrumb');
    return (c.entryId && labels[c.entryId]?.en) || c.sceneId;
  };

  const onActivate = (node: SceneNode) => {
    if (node.childScene && getScene(node.childScene)) {
      setStack((s) => [...s, { sceneId: node.childScene!, entryId: node.entryId, nodeName: node.node }]);
    } else if (node.entryId) {
      setOpenEntryId(node.entryId);
    }
  };

  const popTo = (index: number) => setStack((s) => s.slice(0, index + 1));

  // The current scene's parent word (if we drilled in via a node that also has an
  // entryId) — reachable from the breadcrumb tail per the design.
  const parentWordId = useMemo(
    () => (stack.length > 1 ? current.entryId ?? null : null),
    [stack, current],
  );

  if (!scene) {
    return <p className="mt-6 text-ink-muted">{t('anatomy.explorerUnavailable')}</p>;
  }

  return (
    <div className="mt-3">
      <nav aria-label={t('anatomy.breadcrumbLabel')} className="flex flex-wrap items-center gap-1 text-sm">
        {stack.map((c, i) => (
          <span key={`${c.sceneId}-${i}`} className="flex items-center gap-1">
            {i > 0 && <span className="text-ink-subtle">›</span>}
            <button type="button" onClick={() => popTo(i)}
              className={i === stack.length - 1 ? 'font-bold text-ink' : 'text-primary'}>
              {crumbLabel(c)}
            </button>
          </span>
        ))}
        {parentWordId && (
          <button type="button" onClick={() => setOpenEntryId(parentWordId)}
            className="ms-2 rounded-full border border-border px-2 py-0.5 text-xs text-primary">
            {t('anatomy.openThisCard')}
          </button>
        )}
      </nav>

      <div className="mt-3">
        <Scene key={scene.id} scene={scene} labels={labels} onActivate={onActivate} />
      </div>

      {openEntryId && <WordDetailCard entryId={openEntryId} onClose={() => setOpenEntryId(null)} />}
    </div>
  );
}
```

- [ ] **Step 4: Add the new i18n keys to all 5 locales**

In each of `src/locales/{en,he,ar,ru,fr}.json`, add inside the existing `"anatomy"` object: `rootCrumb`, `breadcrumbLabel`, `openThisCard`, `explorerUnavailable`.

- en: `"rootCrumb": "Body", "breadcrumbLabel": "Anatomy location", "openThisCard": "Open this word", "explorerUnavailable": "The interactive figure isn't available right now."`
- he: `"rootCrumb": "גוף", "breadcrumbLabel": "מיקום אנטומי", "openThisCard": "פתח מילה זו", "explorerUnavailable": "האיור האינטראקטיבי אינו זמין כרגע."`
- ar: `"rootCrumb": "الجسم", "breadcrumbLabel": "الموقع التشريحي", "openThisCard": "افتح هذه الكلمة", "explorerUnavailable": "الشكل التفاعلي غير متوفر حاليًا."`
- ru: `"rootCrumb": "Тело", "breadcrumbLabel": "Анатомическое расположение", "openThisCard": "Открыть это слово", "explorerUnavailable": "Интерактивная фигура сейчас недоступна."`
- fr: `"rootCrumb": "Corps", "breadcrumbLabel": "Emplacement anatomique", "openThisCard": "Ouvrir ce mot", "explorerUnavailable": "La figure interactive n'est pas disponible pour le moment."`

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/anatomy/AnatomyExplorer.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/anatomy/AnatomyExplorer.tsx src/components/anatomy/AnatomyExplorer.test.tsx src/locales
git commit -m "feat: add AnatomyExplorer — scene stack, drill/back, breadcrumb, word card"
```

---

### Task 6: `AnatomyView` wrapper + Browse ⇄ Explore toggle + route

**Files:**
- Create: `src/pages/AnatomyView.tsx`
- Create: `src/pages/anatomy/AnatomyBrowse.tsx` (extracted card-grid)
- Test: `src/pages/AnatomyView.test.tsx`
- Modify: `src/pages/AnatomyPage.tsx` (re-export shim, or delete — see steps)
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `AnatomyExplorer` from `../components/anatomy/AnatomyExplorer`; `AnatomyBrowse` from `./anatomy/AnatomyBrowse`; `useSearchParams` from `react-router`.
- Produces: `function AnatomyView(): JSX.Element` (the routed page); `function AnatomyBrowse(): JSX.Element` (the card-grid, unchanged behavior).

- [ ] **Step 1: Extract the card-grid into `AnatomyBrowse`**

Create `src/pages/anatomy/AnatomyBrowse.tsx` with the FULL current body of `src/pages/AnatomyPage.tsx`, but: rename the exported function `AnatomyPage` → `AnatomyBrowse`, remove its own `<PageHeader …>` line (the wrapper renders the header now), and change the outer wrapper `div` from `className="mx-auto max-w-2xl p-4"` to `className="mt-2"` (the wrapper owns page padding). Fix the relative import depths (now two levels deep): `../../data/anatomy`, `../../lib/anatomyRegions`, `../../components/He`. Keep everything else identical (the region chips, grouping, CardTile).

- [ ] **Step 2: Write the failing test**

`src/pages/AnatomyView.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import '../lib/i18n';
import { AnatomyView } from './AnatomyView';

vi.mock('../data/anatomy', () => ({
  fetchAnatomyCards: vi.fn(async () => []),
  fetchSceneLabels: vi.fn(async () => ({})),
  fetchAnatomyWord: vi.fn(async () => null),
}));

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/anatomy" element={<AnatomyView />} /></Routes>
    </MemoryRouter>,
  );
}

describe('AnatomyView', () => {
  it('defaults to the Browse (card-grid) view', async () => {
    renderAt('/anatomy');
    // card-grid renders the region-all chip; explorer does not
    expect(await screen.findByRole('button', { name: /^all$|^הכל$/i })).toBeInTheDocument();
    expect(document.querySelector('[data-node="eye"]')).not.toBeInTheDocument();
  });

  it('renders the explorer when ?view=explore', async () => {
    renderAt('/anatomy?view=explore');
    await waitFor(() => expect(document.querySelector('[data-node="eye"]')).toBeInTheDocument());
  });

  it('switches views when the toggle is clicked', async () => {
    renderAt('/anatomy');
    await screen.findByRole('button', { name: /explore|חקור/i });
    await userEvent.click(screen.getByRole('button', { name: /explore|חקור/i }));
    await waitFor(() => expect(document.querySelector('[data-node="eye"]')).toBeInTheDocument());
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/pages/AnatomyView.test.tsx`
Expected: FAIL — `Cannot find module './AnatomyView'`.

- [ ] **Step 4: Write the wrapper**

`src/pages/AnatomyView.tsx`:

```tsx
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/ui/PageHeader';
import { AnatomyBrowse } from './anatomy/AnatomyBrowse';
import { AnatomyExplorer } from '../components/anatomy/AnatomyExplorer';

// /anatomy has two views sharing the same topic='anatomy' words: the card-grid
// ("Browse") and the interactive figure ("Explore"). View is in the URL (?view=explore)
// so it's linkable and survives back/forward; absent = Browse.
export function AnatomyView() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const explore = params.get('view') === 'explore';

  const setView = (v: 'browse' | 'explore') => {
    const next = new URLSearchParams(params);
    if (v === 'explore') next.set('view', 'explore'); else next.delete('view');
    setParams(next, { replace: true });
  };

  return (
    <div className="mx-auto max-w-2xl p-4">
      <PageHeader title={t('anatomy.title')} />
      <div role="tablist" className="mt-3 inline-flex rounded-full border border-border p-0.5 text-sm">
        <button type="button" role="tab" aria-selected={!explore} onClick={() => setView('browse')}
          className={`rounded-full px-3 py-1 font-semibold ${!explore ? 'bg-primary text-white' : 'text-ink-muted'}`}>
          {t('anatomy.viewBrowse')}
        </button>
        <button type="button" role="tab" aria-selected={explore} onClick={() => setView('explore')}
          className={`rounded-full px-3 py-1 font-semibold ${explore ? 'bg-primary text-white' : 'text-ink-muted'}`}>
          {t('anatomy.viewExplore')}
        </button>
      </div>
      {explore ? <AnatomyExplorer /> : <AnatomyBrowse />}
    </div>
  );
}
```

- [ ] **Step 5: Add the toggle i18n keys to all 5 locales**

In each of `src/locales/{en,he,ar,ru,fr}.json`, add inside `"anatomy"`: `viewBrowse`, `viewExplore`.

- en: `"viewBrowse": "Browse", "viewExplore": "Explore"`
- he: `"viewBrowse": "עיון", "viewExplore": "חקור"`
- ar: `"viewBrowse": "تصفح", "viewExplore": "استكشف"`
- ru: `"viewBrowse": "Обзор", "viewExplore": "Исследовать"`
- fr: `"viewBrowse": "Parcourir", "viewExplore": "Explorer"`

- [ ] **Step 6: Point the route at `AnatomyView` and retire the old page**

In `src/App.tsx`: change the import `import { AnatomyPage } from './pages/AnatomyPage';` → `import { AnatomyView } from './pages/AnatomyView';`, and the route element `<Route path="/anatomy" element={<AnatomyPage />} />` → `<Route path="/anatomy" element={<AnatomyView />} />`. Then delete `src/pages/AnatomyPage.tsx` and `src/pages/AnatomyPage.test.tsx` (the card-grid behavior now lives in `AnatomyBrowse`, and its rendering is covered by `AnatomyView.test.tsx`). Verify no other file imports `AnatomyPage`:

Run: `grep -rn "AnatomyPage" src` — Expected: no matches after the edits/deletions.

- [ ] **Step 7: Run the full suite + typecheck**

Run: `npx vitest run && npx tsc -b`
Expected: all tests pass, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/pages/AnatomyView.tsx src/pages/AnatomyView.test.tsx src/pages/anatomy/AnatomyBrowse.tsx src/App.tsx src/locales
git rm src/pages/AnatomyPage.tsx src/pages/AnatomyPage.test.tsx
git commit -m "feat: add /anatomy Browse ⇄ Explore toggle wrapping card-grid + interactive figure"
```

---

## Verification (browser, after Task 6)

Once the suite is green, verify the real UI (the explorer is browser-observable):

1. `preview_start` the dev server; navigate to `/anatomy`.
2. Confirm Browse shows the card-grid; click **Explore** → the body placeholder renders; URL gains `?view=explore`.
3. Hover a region (desktop viewport) → it highlights + shows a label; click the **eye** → zooms to the eye scene, breadcrumb shows `Body › Eye`; click **pupil** → the word card opens; close it; click the `Body` crumb → back to the body.
4. Screenshot the explorer for the user.

(Real anatomical art + real `entryId`s are a separate content task — the placeholders prove the interaction.)

---

## Out of scope (per spec)

- Deep branches beyond the eye — later content (SVG + config only; engine already supports depth).
- DB-backed node-map + admin UI.
- True continuous viewBox zoom animation.
- Commissioned/real anatomical art (separate content task; v1 ships on placeholders).
- Audio, quizzing/FSRS on the figure.
