# Anatomy Review Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the browse-only `/anatomy` tab into a learning surface wired into the daily FSRS
review loop: a new image-based practice form (`image_recognition` — see the illustration → pick
the Hebrew term), an "add to review" seeding flow on the anatomy tab, a static body-figure
illustration that highlights the selected region, and a working hybrid image pipeline (AI
generation wired to a real provider + the existing curated manifest) so the ~30 currently-tagged
anatomy terms actually ship with images.

**Product decisions (owner, 2026-08-06):**
- Learning mechanic: **integrate into the daily FSRS review**, not a standalone quiz.
- Images: **hybrid** — AI candidates at scale with explicit admin approval, curated open-license
  art for terms AI gets wrong.
- Navigation: **static body illustration with region highlighting** beside the existing chips
  (not a full clickable body-map redesign).
- Scope: **the ~30 entries already tagged `topic='anatomy'`** (via `content/topics-second-thousand.tsv`).

**Architecture:** No new tables. `image_recognition` becomes a fifth `PracticeForm` value
(DB check constraint on `review_logs.practice_form` + the `PracticeForm` union + an
`EASY_LATENCY_MS` entry — the `Record` type makes the compiler enforce the third). `selectForm`
becomes capability-aware: anatomy cards have a primary image but **no context sentences**, so the
cloze band must fall back (today `selectForm` would emit `cloze` for a card whose
`contextSentences` is empty and the Cloze component would crash — unit-seeded cards all have
contexts, anatomy cards are the first that don't). The review data layer joins each due card's
primary anatomy image (`ReviewCard.imageUrl: string | null`); `ImageRecognition` renders when the
form selects it. Seeding reuses the existing batched `seedNewCards` from an "add to review"
button on `/anatomy`. The AI script's `generateImage()` stub gets a real provider behind an env
switch; the never-auto-primary invariant is untouched.

**Tech Stack:** React 19 + react-router 8 + react-i18next, Tailwind 4, Supabase (Postgres +
Storage), `ts-fsrs` (pinned), Vitest + Testing Library, tsx scripts, OpenAI Images API
(`gpt-image-1`) as the first `generateImage` provider.

## Global Constraints

- Migration file: next sequential number is `0014_anatomy_review.sql` (last is `0013_anatomy.sql`).
- `practice_form` vocabulary lives in 2 synced places: the DB check constraint and
  `PracticeForm` in `src/lib/types.ts` (plus the `EASY_LATENCY_MS` record for non-drill forms —
  the type system enforces that one).
- An AI image is **never** auto-published: `is_primary` starts `false`; only the admin RPC flips
  it. This plan does not weaken that.
- `OPENAI_API_KEY` goes in `.env.content` only (server-side script env). It must never appear in
  a `VITE_*` var or any client-bundled file.
- Styling uses Tailwind logical properties (`ms-`/`me-`/`ps-`/`pe-`, `text-start`) — RTL must not
  break. The body figure SVG is symmetric, so it needs no RTL mirroring.
- The exercise learning direction is **image → Hebrew term** (options show `hebrewNikud`), unlike
  `Recognition` which is Hebrew → English. Distractors prefer other anatomy entries so options
  are plausible.
- FSRS scheduling stays form-agnostic: `user_card_state` rows and `applyReview` are untouched;
  card state remains fully recomputable from `review_logs` + pinned config.
- Learner-visible anatomy terms still require region + system + primary image (the
  `fetchAnatomyCards` contract from the 2026-07-20 plan). The review queue has a weaker
  requirement: a seeded card whose image later loses primary status just falls back to the
  text forms — never a broken exercise.

---

### Task 1: Migration — allow `image_recognition` in `review_logs.practice_form`

**Files:**
- Create: `supabase/migrations/0014_anatomy_review.sql`

- [ ] **Step 1: Write the migration**

```sql
-- image_recognition: image-based practice form for anatomy terms (see the
-- illustration, pick the Hebrew term). Joins the existing four forms; FSRS
-- scheduling is form-agnostic so review_logs is the only schema touchpoint.
alter table public.review_logs drop constraint review_logs_practice_form_check;
alter table public.review_logs add constraint review_logs_practice_form_check
  check (practice_form in
    ('flashcard_recognition', 'flashcard_recall', 'cloze', 'drill', 'image_recognition'));
```

- [ ] **Step 2: Apply to the dev/prod Supabase project** (`supabase db push` or the project's
  usual apply flow). Expected: applies cleanly; existing rows all satisfy the widened check.

- [ ] **Step 3: Commit** — `feat: allow image_recognition practice form in review_logs`

---

### Task 2: `PracticeForm` + capability-aware `selectForm` + latency threshold

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/fsrs.ts`
- Modify: `src/lib/fsrs.test.ts` (extend existing suite)

**Interfaces:**
- Produces: `PracticeForm` gains `'image_recognition'`; `ReviewCard` gains
  `imageUrl: string | null`; `selectForm(card, caps?: { hasImage: boolean; hasContext: boolean })`.
  Consumed by Task 3 (cards.ts) and Task 5 (ReviewPage).

- [ ] **Step 1: Write the failing tests** (add to `src/lib/fsrs.test.ts`)

```ts
describe('selectForm capabilities', () => {
  const at = (stability: number): CardState =>
    ({ ...newCardState('x', new Date()), stability });

  it('keeps legacy behavior when no capabilities are passed', () => {
    expect(selectForm(at(1))).toBe('flashcard_recognition');
    expect(selectForm(at(5))).toBe('cloze');
    expect(selectForm(at(20))).toBe('flashcard_recall');
  });

  it('uses image_recognition in the recognition band when the card has an image', () => {
    expect(selectForm(at(1), { hasImage: true, hasContext: false })).toBe('image_recognition');
  });

  it('falls back from cloze when the card has no context sentences', () => {
    expect(selectForm(at(5), { hasImage: true, hasContext: false })).toBe('image_recognition');
    expect(selectForm(at(5), { hasImage: false, hasContext: false })).toBe('flashcard_recognition');
  });

  it('still recalls at high stability regardless of image', () => {
    expect(selectForm(at(20), { hasImage: true, hasContext: false })).toBe('flashcard_recall');
  });

  it('derives easy/good for image_recognition at the recognition threshold', () => {
    expect(deriveRating(true, 3000, 'image_recognition')).toBe('easy');
    expect(deriveRating(true, 5000, 'image_recognition')).toBe('good');
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/lib/fsrs.test.ts` (type errors /
  wrong form values).

- [ ] **Step 3: Implement**

`src/lib/types.ts`:

```ts
export type PracticeForm =
  | 'flashcard_recognition' | 'flashcard_recall' | 'cloze' | 'drill' | 'image_recognition';
```

```ts
export interface ReviewCard {
  card: CardState;
  entry: DictionaryEntry;
  contextSentences: ContextSentence[];
  imageUrl: string | null; // primary anatomy image, when the entry has one
}
```

`src/lib/fsrs.ts`:

```ts
export const EASY_LATENCY_MS: Record<Exclude<PracticeForm, 'drill'>, number> = {
  flashcard_recognition: 4000,
  cloze: 8000,
  flashcard_recall: 8000,
  image_recognition: 4000, // recognition-speed task: picking from 4 options
};
```

```ts
export interface FormCapabilities { hasImage: boolean; hasContext: boolean; }

// Defaults replicate the pre-anatomy behavior (every unit card has contexts,
// none had images), so legacy callers and recomputation stay byte-identical.
export function selectForm(
  card: CardState,
  caps: FormCapabilities = { hasImage: false, hasContext: true },
): Exclude<PracticeForm, 'drill'> {
  const recognition = caps.hasImage ? 'image_recognition' : 'flashcard_recognition';
  if (card.stability < FORM_BANDS.recognitionMaxStabilityDays) return recognition;
  // A card with no context sentence can't cloze — repeat the recognition-band
  // form in the middle band instead of crashing the Cloze exercise.
  if (card.stability < FORM_BANDS.clozeMaxStabilityDays) {
    return caps.hasContext ? 'cloze' : recognition;
  }
  return 'flashcard_recall';
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/lib/fsrs.test.ts`.
  Note: `ReviewCard.imageUrl` will break `cards.ts` / `ReviewPage` compilation until Tasks 3+5 —
  land Tasks 2+3 together if running `tsc -b` between commits matters to you, or accept the
  mid-sequence red typecheck within this task chain.

- [ ] **Step 5: Commit** — `feat: image_recognition practice form + capability-aware selectForm`

---

### Task 3: Review data layer joins the primary anatomy image

**Files:**
- Create: `src/data/anatomyImages.ts` (shared URL helper — third copy point of
  `publicImageUrl` in `anatomy.ts`/`anatomyAdmin.ts`; extract, don't fork again)
- Modify: `src/data/anatomy.ts`, `src/data/anatomyAdmin.ts` (use the shared helper)
- Modify: `src/data/cards.ts`
- Modify: `src/data/cards.test.ts`

**Interfaces:**
- Produces: `anatomyImageUrl(storagePath: string): string`; `joinCards` returns cards with
  `imageUrl` populated from `anatomy_images` where `is_primary = true`.

- [ ] **Step 1: Failing test** (add to `cards.test.ts`; the table-driven mock already returns
  `tables.anatomy_images.rows` once `'anatomy_images'` is added to `resetDb`'s table list)

```ts
it('loadDueCards attaches the primary anatomy image url when one exists', async () => {
  tables.user_card_state.rows = [
    { user_id: 'u1', entry_id: 'lev', due: T0.toISOString(), stability: 1, difficulty: 5,
      reps: 1, lapses: 0, state: 'learning', last_review: null },
  ];
  tables.dictionary_entries.rows = [
    { id: 'lev', hebrew: 'לב', hebrew_nikud: 'לֵב', part_of_speech: 'noun', level: 1,
      gender: 'ז', plural: null, root: null, everyday_synonym: null,
      translations: { en: 'heart' }, notes: null },
  ];
  tables.unit_items.rows = [];
  tables.anatomy_images.rows = [
    { entry_id: 'lev', storage_path: 'lev/1.png', is_primary: true },
  ];
  const due = await loadDueCards(T0);
  expect(due[0].imageUrl).toContain('lev/1.png');
  expect(due[0].contextSentences).toEqual([]);
});
```

The supabase mock needs `storage`: add
`storage: { from: () => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: \`https://cdn.test/${p}\` } }) }) }`
beside `auth`, and the `anatomy_images` chain needs `.in().eq()` — extend the chainable mock's
`in` to keep returning the chain and resolve on `eq`/`then` like the existing pattern (mirror
how `units.test.ts` chains resolve).

- [ ] **Step 2: Implement**

`src/data/anatomyImages.ts`:

```ts
import { supabase } from '../lib/supabase';

// Single place that turns an anatomy_images.storage_path into a public URL —
// used by the learner tab, the admin tab, and the review queue join.
export function anatomyImageUrl(storagePath: string): string {
  return supabase.storage.from('anatomy').getPublicUrl(storagePath).data.publicUrl;
}
```

Replace the private `publicImageUrl` in `anatomy.ts` and `anatomyAdmin.ts` with imports of this.

`src/data/cards.ts` — inside `joinCards`, alongside the entry/context queries:

```ts
const { data: imageRows, error: e3 } = await supabase
  .from('anatomy_images')
  .select('entry_id, storage_path')
  .in('entry_id', ids)
  .eq('is_primary', true);
if (e3) throw e3;
const images = new Map(
  ((imageRows ?? []) as Array<{ entry_id: string; storage_path: string }>)
    .map((r) => [r.entry_id, anatomyImageUrl(r.storage_path)]),
);
```

and in the returned mapping add `imageUrl: images.get(c.entryId) ?? null`.

- [ ] **Step 3: Run** — `npx vitest run src/data/cards.test.ts src/data/anatomy.test.ts src/data/anatomyAdmin.test.ts`.
- [ ] **Step 4: Commit** — `feat: join primary anatomy image into review cards`

---

### Task 4: `ImageRecognition` exercise component

**Files:**
- Create: `src/components/exercises/ImageRecognition.tsx`
- Modify: `src/components/exercises/Recognition.tsx` (extend `ExerciseProps` with
  `imageUrl?: string | null` so ReviewPage can spread one props object to every form)
- Modify: `src/components/exercises/exercises.test.tsx`

**Interfaces:**
- Consumes: `useExercise`, `shuffledOnce`, `ExerciseProps` from `./Recognition`; `Feedback`;
  `He`.
- Produces: `<ImageRecognition entry imageUrl distractors onResult />` — image prompt, four
  Hebrew-term options, standard `Feedback` + result flow.

- [ ] **Step 1: Failing tests** (add to `exercises.test.tsx`, following the Recognition suite's
  render/click/assert pattern)

```tsx
describe('ImageRecognition', () => {
  it('shows the image and Hebrew options, and reports a correct pick', async () => {
    const onResult = vi.fn();
    render(<ImageRecognition entry={heart} imageUrl="https://cdn.test/lev.png"
      contextSentences={[]} distractors={[lung, kidney, femur]} onResult={onResult} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://cdn.test/lev.png');
    await userEvent.click(screen.getByRole('button', { name: heart.hebrewNikud }));
    await userEvent.click(screen.getByTestId('feedback-continue'));
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ correct: true }));
  });

  it('reports incorrect on a distractor pick', async () => {
    const onResult = vi.fn();
    render(<ImageRecognition entry={heart} imageUrl="https://cdn.test/lev.png"
      contextSentences={[]} distractors={[lung, kidney, femur]} onResult={onResult} />);
    await userEvent.click(screen.getByRole('button', { name: lung.hebrewNikud }));
    await userEvent.click(screen.getByTestId('feedback-continue'));
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ correct: false }));
  });
});
```

(Reuse the suite's existing entry fixtures; add `hebrewNikud`-distinct fixtures if needed. Check
the actual `Feedback` continue-button testid/name in `Feedback.tsx` and match it.)

- [ ] **Step 2: Implement**

```tsx
// src/components/exercises/ImageRecognition.tsx
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { He } from '../He';
import { Feedback } from './Feedback';
import { useExercise, shuffledOnce, type ExerciseProps } from './Recognition';

// Image → Hebrew term. The inverse direction of Recognition (Hebrew → English):
// here the visual is the prompt and production of the Hebrew term is the goal,
// so options render hebrewNikud, not translations.
export function ImageRecognition({ entry, imageUrl, distractors, onResult }: ExerciseProps) {
  const { t } = useTranslation();
  const { answered, answer, finish } = useExercise(onResult);
  const options = useMemo(() => shuffledOnce([entry, ...distractors]), [entry, distractors]);
  return (
    <div className="p-4">
      <img src={imageUrl ?? undefined} alt="" className="mx-auto aspect-square w-48 rounded-md border border-border object-cover" />
      <p className="mt-3 text-center text-sm text-ink-muted">{t('review.imagePrompt')}</p>
      <div className="mt-4 flex flex-col gap-2">
        {options.map((o, i) => (
          <button key={o.id} data-testid={`exercise-option-${i}`} disabled={answered !== null}
            onClick={() => answer(o.id === entry.id)}
            className="rounded-md border border-border bg-surface p-3 text-start shadow-card transition-colors hover:bg-primary-tint disabled:opacity-60">
            <He className="text-ink">{o.hebrewNikud}</He>
          </button>
        ))}
      </div>
      {answered !== null && <Feedback entry={entry} correct={answered} onContinue={finish} />}
    </div>
  );
}
```

`ExerciseProps` in `Recognition.tsx` gains `imageUrl?: string | null;`.

- [ ] **Step 3: Run** — `npx vitest run src/components/exercises/exercises.test.tsx`.
- [ ] **Step 4: Commit** — `feat: ImageRecognition exercise (image → Hebrew term)`

---

### Task 5: ReviewPage wiring — form dispatch + anatomy-aware distractors

**Files:**
- Modify: `src/pages/ReviewPage.tsx`
- Modify: `src/pages/ReviewPage.test.tsx`

- [ ] **Step 1: Failing test** — seed the page mock with a due card carrying
  `imageUrl` + empty `contextSentences` and low stability; assert an `img` renders and the
  options are Hebrew (i.e. the ImageRecognition path is taken). Follow the existing
  ReviewPage.test mock structure for `loadDueCards`.

- [ ] **Step 2: Implement.** Three edits, all keeping `selectForm(card, caps)` calls identical
  between `handleResult` and render (they must derive the same form for the same card):

```ts
const capsOf = (c: ReviewCard) =>
  ({ hasImage: c.imageUrl !== null, hasContext: c.contextSentences.length > 0 });
```

1. `handleResult`: `const form = selectForm(current.card, capsOf(current));`
2. Render: `const form = selectForm(current.card, capsOf(current));` and add the dispatch arm
   `form === 'image_recognition' ? <ImageRecognition key={key} {...props} imageUrl={current.imageUrl} />`
   (or put `imageUrl: current.imageUrl` into the shared `props` object).
3. Distractors — prefer same-topic options for the image form so the four Hebrew terms are all
   anatomy (guessable-by-elimination otherwise):

```ts
const distractors = useMemo(() => {
  if (!current) return [];
  const caps = capsOf(current);
  const form = selectForm(current.card, caps);
  if (form === 'image_recognition') {
    const anatomyPool = pool.filter((e) => e.topic === 'anatomy');
    if (anatomyPool.length > 3) return pickDistractors(current.entry, anatomyPool);
  }
  return pickDistractors(current.entry, pool);
}, [current, pool]);
```

- [ ] **Step 3: Run** — `npx vitest run src/pages/ReviewPage.test.tsx`, then the full
  `npx vitest run && npx tsc -b` (this task closes the type loop opened in Task 2).
- [ ] **Step 4: Commit** — `feat: serve image_recognition exercises in the review queue`

---

### Task 6: Anatomy tab — "add to review" seeding + body-figure highlight

**Files:**
- Create: `src/components/BodyFigure.tsx`
- Modify: `src/pages/AnatomyPage.tsx`
- Modify: `src/pages/AnatomyPage.test.tsx`

**Interfaces:**
- Consumes: `seedNewCards`, `loadAllCards` from `../data/cards` (seeding is already batched —
  one upsert for N terms); `REGIONS`, `type Region`.
- Produces: `<BodyFigure region={RegionFilter} onSelect={(r: Region) => void} />`.

**Behavior:**
- The page loads the learner's existing card ids once (`loadAllCards` → `Set(entryId)`).
- Each visible tile shows a small "בחזרה ✓"-style badge when its entry is already in review.
- One button above the grid seeds every *shown* (region-filtered) term not yet in review:
  `seedNewCards(missingIds)`; on success the local Set is updated (no refetch). Seeded cards are
  due immediately, so they enter the next `/review` session as `image_recognition` exercises.
- `BodyFigure` renders beside the region chips: a schematic SVG silhouette (head/neck, chest,
  abdomen, limbs zones; `skeleton` highlights the whole figure). The selected region's zone gets
  the highlight fill. Zones also accept clicks as a shortcut (`onSelect`), but the SVG is
  `aria-hidden` — the chips remain the accessible control, so this stays "static illustration
  with highlight", not a body-map navigation rework.

- [ ] **Step 1: Failing tests** (extend `AnatomyPage.test.tsx`; mock `../data/cards` with
  `seedNewCards` spy + `loadAllCards` returning one already-seeded card)

```tsx
it('seeds only the not-yet-added shown terms into review', async () => {
  renderPage(); // heart already in review (loadAllCards mock), femur not
  await screen.findByText('heart');
  await userEvent.click(screen.getByTestId('anatomy-add-to-review'));
  expect(seedNewCards).toHaveBeenCalledWith(['femur']);
});

it('highlights the selected region zone on the body figure', async () => {
  renderPage();
  await screen.findByText('heart');
  await userEvent.click(screen.getByRole('button', { name: /chest|בית חזה/i }));
  expect(screen.getByTestId('body-zone-chest')).toHaveAttribute('data-active', 'true');
});
```

- [ ] **Step 2: Implement `BodyFigure.tsx`** — schematic, theme-token colors only:

```tsx
// src/components/BodyFigure.tsx
import type { Region } from '../lib/anatomyRegions';

interface BodyFigureProps { region: Region | 'all'; onSelect?: (r: Region) => void; }

const ZONES: Array<{ zone: Exclude<Region, 'skeleton'>; d: string }> = [
  { zone: 'head_neck', d: 'M50 6a13 13 0 1 1 0 26a13 13 0 0 1 0-26M46 32h8v10h-8z' },
  { zone: 'chest',     d: 'M32 44q18 -6 36 0v34q-18 6 -36 0z' },
  { zone: 'abdomen',   d: 'M34 82q16 -4 32 0v30q-16 5 -32 0z' },
  { zone: 'limbs',     d: 'M30 44l-10 4v58l8 2 6-40zM70 44l10 4v58l-8 2-6-40z' +
                          'M38 116h10v84l-8 2zM62 116h-10v84l8 2z' },
];

// The skeleton spans the whole body, so selecting it lights every zone; 'all'
// lights none. Purely decorative (aria-hidden) — the region chips stay the
// accessible control; zone clicks are just a pointer shortcut.
export function BodyFigure({ region, onSelect }: BodyFigureProps) {
  const active = (zone: Region) => region === zone || region === 'skeleton';
  return (
    <svg viewBox="0 0 100 205" aria-hidden="true" className="h-36 shrink-0">
      {ZONES.map(({ zone, d }) => (
        <path key={zone} d={d} data-testid={`body-zone-${zone}`}
          data-active={active(zone) || undefined}
          onClick={onSelect && (() => onSelect(zone))}
          className={`cursor-pointer stroke-border transition-colors ${
            active(zone) ? 'fill-primary/50' : 'fill-primary-tint'}`} />
      ))}
    </svg>
  );
}
```

(Path data is schematic; tune shapes visually in the browser — zones must merely read as head,
torso, belly, limbs at 9rem tall. `data-active` doubles as the test hook.)

- [ ] **Step 3: Implement the AnatomyPage changes** — add `inReview: Set<string>` +
  `seeding` state; `useEffect` also calls `loadAllCards()`; render `BodyFigure` in a
  `flex items-start gap-3` row with the chip wrap; the seed button:

```tsx
const missing = shown.filter((c) => !inReview.has(c.entry.id)).map((c) => c.entry.id);
// …
<button type="button" data-testid="anatomy-add-to-review" disabled={seeding || missing.length === 0}
  onClick={async () => {
    setSeeding(true);
    try { await seedNewCards(missing); setInReview((s) => new Set([...s, ...missing])); }
    finally { setSeeding(false); }
  }} …>
  {missing.length === 0 ? t('anatomy.allInReview') : t('anatomy.addToReview', { count: missing.length })}
</button>
```

and on each `CardTile` a badge when `inReview.has(card.entry.id)` (`t('anatomy.inReview')`).

- [ ] **Step 4: Run** — `npx vitest run src/pages/AnatomyPage.test.tsx`.
- [ ] **Step 5: Commit** — `feat: seed anatomy terms into review + body-figure region highlight`

---

### Task 7: Locale strings (5 locales)

**Files:**
- Modify: `src/locales/{en,he,ar,ru,fr}.json`

New keys — `review.imagePrompt`; `anatomy.addToReview` (with `{{count}}`), `anatomy.allInReview`,
`anatomy.inReview`:

| key | en | he |
|---|---|---|
| `review.imagePrompt` | Which term is this? | ?איזה מונח זה |
| `anatomy.addToReview` | Add {{count}} to daily review | הוספת {{count}} לחזרה היומית |
| `anatomy.allInReview` | All shown terms are in review | כל המונחים המוצגים כבר בחזרה |
| `anatomy.inReview` | In review | בחזרה |

- [ ] **Step 1:** Add the four keys to all five locales (translate ar/ru/fr in the same
  register as each file's existing `anatomy.*` block; keep key order consistent with en).
- [ ] **Step 2:** Parity check:
  `node -e "['en','he','ar','ru','fr'].forEach(l => JSON.parse(require('fs').readFileSync('src/locales/'+l+'.json','utf8')))"`.
- [ ] **Step 3: Commit** — `feat: anatomy review locale strings (5 locales)`

---

### Task 8: Wire a real provider into `generate-anatomy-images.ts`

**Files:**
- Modify: `scripts/generate-anatomy-images.ts`
- Modify: `.env.content.example` (document `OPENAI_API_KEY`)

**Behavior (existing invariants kept):** stages `source='ai', is_primary=false` candidates;
`--regenerate` re-runs existing; never touches primaries.

- [ ] **Step 1: Replace the hardcoded trial list with DB discovery.** Default: the trial ids if
  present; with `--all`, every `dictionary_entries` row where `topic='anatomy'` and
  `is_deprecated=false` that has no `anatomy_images` row with `source='ai'` yet:

```ts
async function targetEntryIds(all: boolean): Promise<string[]> {
  if (!all && TRIAL_ENTRY_IDS.length > 0) return TRIAL_ENTRY_IDS;
  const { data, error } = await admin
    .from('dictionary_entries')
    .select('id, anatomy_images(id, source)')
    .eq('topic', 'anatomy')
    .eq('is_deprecated', false);
  if (error) throw error;
  return (data ?? [])
    .filter((r) => !(r.anatomy_images ?? []).some((i: { source: string }) => i.source === 'ai'))
    .map((r) => r.id);
}
```

- [ ] **Step 2: Implement `generateImage` with OpenAI images, behind an env switch** (the stub's
  "pluggable" intent — the switch is where a second provider slots in later):

```ts
// Provider selection: ANATOMY_IMAGE_PROVIDER=openai (default). The prompt bans
// text/labels — learners see the Hebrew separately, and in-image text is where
// generation goes wrong most.
async function generateImage(termEnglish: string): Promise<Buffer> {
  const provider = process.env.ANATOMY_IMAGE_PROVIDER ?? 'openai';
  if (provider !== 'openai') throw new Error(`unknown ANATOMY_IMAGE_PROVIDER "${provider}"`);
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY missing from .env.content');
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-image-1', size: '1024x1024', n: 1,
      prompt: `Clean medical textbook illustration of the human ${termEnglish}, ` +
        'anatomically accurate, isolated on a plain white background, flat vector style, ' +
        'no text, no labels, no letters, no arrows',
    }),
  });
  if (!res.ok) throw new Error(`openai image generation failed (${res.status}): ${await res.text()}`);
  const json = await res.json() as { data: Array<{ b64_json: string }> };
  return Buffer.from(json.data[0].b64_json, 'base64');
}
```

- [ ] **Step 3:** Add to `.env.content.example`:
  `OPENAI_API_KEY=` with a comment `# anatomy image generation (scripts/generate-anatomy-images.ts) — never expose as VITE_*`.
- [ ] **Step 4: Dry-run against one term** (`npm run generate:anatomy-images` with a single-id
  trial list) — confirm an `anatomy_images` row lands with `source='ai', is_primary=false` and
  the file is visible in the `anatomy` bucket.
- [ ] **Step 5: Commit** — `feat: wire OpenAI provider + --all discovery into anatomy image generation`

---

### Task 9: Ship checklist (content ops — no code)

- [ ] Apply migration `0014` to production; redeploy the app from `main`.
- [ ] In `/admin/anatomy`: tag region + system for the ~30 anatomy-tagged entries (the admin UI
  and coverage counter already exist).
- [ ] Run `npm run generate:anatomy-images -- --all` to stage AI candidates for all 30.
- [ ] Expert pass in `/admin/anatomy`: set a primary per term where an AI candidate is medically
  acceptable; list the rejects.
- [ ] For the rejects: source open-license art (Gray's plates / Wikimedia CC), fill
  `content/anatomy-curated.tsv`, run `npm run seed:anatomy-images`, set primaries.
- [ ] Verify `/anatomy` shows all 30 with images; press "add to review"; run a `/review` session
  and confirm `image_recognition` exercises appear and log `review_logs.practice_form='image_recognition'`.
- [ ] Update `docs/ONBOARDING.md` status (anatomy review integration shipped) in the shipping PR.

## Explicitly out of scope (this iteration)

- A second image form (Hebrew term → pick the image) — natural v2 of the same machinery.
- Full clickable body-map as primary navigation (owner chose the light highlight variant).
- Anatomy audio/pronunciation — belongs to the audio plan from the 2026-07-17 vision update.
- E2E coverage: `e2e/pilot.spec.ts` stays green untouched (the wiped e2e user has no anatomy
  cards seeded); an anatomy e2e spec can follow once production content exists.
