# Learner Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stats strip (streak / due today / mastered / learned) at the top of HomePage plus a coverage-based progress bar on each unit card.

**Architecture:** Pure read + presentation. One new query (`unit_items` slugs+entry ids), everything else derives from data HomePage already fetches. New `StatsStrip` component; HomePage computes unit coverage client-side.

**Tech Stack:** Vite + React + TypeScript, Supabase JS, react-i18next, Vitest + Testing Library.

## Global Constraints

- No schema changes, no new routes, no new tables (spec).
- Unit percent = entries with `reps > 0` / total unit items (coverage, NOT stability).
- "Mastered" definition reuses existing `KNOWN_STABILITY_DAYS = 7` (`state === 'review' && stability >= 7`).
- i18n: only `src/locales/en.json` exists today — add keys there only (spec's "four locale files" assumption was wrong; ar/ru/fr files don't exist yet).
- Test runner: `npx vitest run <file>` from repo root `/Users/ori/Desktop/Medlingo`.
- Follow existing style: Tailwind classes, `data-testid` attributes, camelCase mappers over snake_case rows.

---

### Task 1: `loadUnitEntryIds` data helper

**Files:**
- Modify: `src/data/units.ts` (append function)
- Test: `src/data/units.test.ts` (append describe block)

**Interfaces:**
- Consumes: `supabase` client from `../lib/supabase` (already imported in units.ts).
- Produces: `loadUnitEntryIds(): Promise<Record<string, string[]>>` — map of `unit_slug` → array of `entry_id`. Task 3 relies on this exact name and shape.

- [ ] **Step 1: Write the failing test**

Look at the top of `src/data/units.test.ts` to see how the supabase client is mocked in this file (it mocks `../lib/supabase`); extend the existing mock so a `from('unit_items').select('unit_slug, entry_id')` call resolves with rows. Then append:

```typescript
describe('loadUnitEntryIds', () => {
  it('groups entry ids by unit slug', async () => {
    // arrange the mock (match this file's existing mock pattern) to return:
    // [{ unit_slug: 'u1', entry_id: 'a' }, { unit_slug: 'u1', entry_id: 'b' },
    //  { unit_slug: 'u2', entry_id: 'c' }]
    const map = await loadUnitEntryIds();
    expect(map).toEqual({ u1: ['a', 'b'], u2: ['c'] });
  });

  it('returns empty object when there are no rows', async () => {
    // arrange mock to return []
    expect(await loadUnitEntryIds()).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/units.test.ts`
Expected: FAIL — `loadUnitEntryIds` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/data/units.ts`:

```typescript
export async function loadUnitEntryIds(): Promise<Record<string, string[]>> {
  const { data, error } = await supabase
    .from('unit_items').select('unit_slug, entry_id');
  if (error) throw error;
  const map: Record<string, string[]> = {};
  for (const row of (data ?? []) as { unit_slug: string; entry_id: string }[]) {
    (map[row.unit_slug] ??= []).push(row.entry_id);
  }
  return map;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/units.test.ts`
Expected: PASS (all tests in file, old and new).

- [ ] **Step 5: Commit**

```bash
git add src/data/units.ts src/data/units.test.ts
git commit -m "feat: load unit entry ids for dashboard coverage"
```

---

### Task 2: `StatsStrip` component + i18n keys

**Files:**
- Create: `src/components/StatsStrip.tsx`
- Create: `src/components/StatsStrip.test.tsx`
- Modify: `src/locales/en.json` (add `home.stats` object)

**Interfaces:**
- Consumes: react-i18next `useTranslation`, `Link` from `react-router`.
- Produces: `StatsStrip({ streak, dueCount, mastered, learned }: { streak: number; dueCount: number; mastered: number; learned: number })` — named export. Task 3 renders it with these exact prop names.

- [ ] **Step 1: Add i18n keys**

In `src/locales/en.json`, inside the existing `"home"` object, add:

```json
"stats": {
  "streak": "Day streak",
  "dueToday": "Due today",
  "mastered": "Mastered",
  "learned": "Learned"
}
```

- [ ] **Step 2: Write the failing test**

Create `src/components/StatsStrip.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import '../lib/i18n';
import { StatsStrip } from './StatsStrip';

function renderStrip(props: Partial<Parameters<typeof StatsStrip>[0]> = {}) {
  return render(
    <MemoryRouter>
      <StatsStrip streak={5} dueCount={12} mastered={23} learned={41} {...props} />
    </MemoryRouter>,
  );
}

describe('StatsStrip', () => {
  it('renders all four tiles with values and labels', () => {
    renderStrip();
    const strip = screen.getByTestId('stats-strip');
    expect(strip).toHaveTextContent('5');
    expect(strip).toHaveTextContent('Day streak');
    expect(strip).toHaveTextContent('12');
    expect(strip).toHaveTextContent('Due today');
    expect(strip).toHaveTextContent('23');
    expect(strip).toHaveTextContent('Mastered');
    expect(strip).toHaveTextContent('41');
    expect(strip).toHaveTextContent('Learned');
  });

  it('due tile links to /review when dueCount > 0', () => {
    renderStrip();
    expect(screen.getByTestId('stat-due')).toHaveAttribute('href', '/review');
  });

  it('due tile is not a link when dueCount is 0', () => {
    renderStrip({ dueCount: 0 });
    expect(screen.getByTestId('stat-due')).not.toHaveAttribute('href');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/components/StatsStrip.test.tsx`
Expected: FAIL — module `./StatsStrip` not found.

- [ ] **Step 4: Write minimal implementation**

Create `src/components/StatsStrip.tsx`:

```tsx
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';

interface StatsStripProps {
  streak: number;
  dueCount: number;
  mastered: number;
  learned: number;
}

function Tile({ value, label, highlight = false }: { value: number; label: string; highlight?: boolean }) {
  return (
    <>
      <span className={`text-xl font-bold ${highlight ? 'text-blue-700' : ''}`}>{value}</span>
      <span className="text-xs text-gray-600">{label}</span>
    </>
  );
}

export function StatsStrip({ streak, dueCount, mastered, learned }: StatsStripProps) {
  const { t } = useTranslation();
  const tile = 'flex flex-col items-center rounded border p-2';
  return (
    <div data-testid="stats-strip" className="grid grid-cols-4 gap-2">
      <div className={tile}>
        <Tile value={streak} label={t('home.stats.streak')} />
      </div>
      {dueCount > 0 ? (
        <Link data-testid="stat-due" to="/review" className={`${tile} border-blue-700`}>
          <Tile value={dueCount} label={t('home.stats.dueToday')} highlight />
        </Link>
      ) : (
        <div data-testid="stat-due" className={tile}>
          <Tile value={dueCount} label={t('home.stats.dueToday')} />
        </div>
      )}
      <div className={tile}>
        <Tile value={mastered} label={t('home.stats.mastered')} />
      </div>
      <div className={tile}>
        <Tile value={learned} label={t('home.stats.learned')} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/StatsStrip.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/StatsStrip.tsx src/components/StatsStrip.test.tsx src/locales/en.json
git commit -m "feat: stats strip component for learner dashboard"
```

---

### Task 3: HomePage integration — strip + unit progress bars

**Files:**
- Modify: `src/pages/HomePage.tsx`
- Test: `src/pages/HomePage.test.tsx` (extend existing mocks + add tests)

**Interfaces:**
- Consumes: `StatsStrip` from `../components/StatsStrip` (Task 2 props), `loadUnitEntryIds` from `../data/units` (Task 1).
- Produces: final UI. Unit card shows a bar with `data-testid="unit-progress-bar"` (inner fill `data-testid="unit-progress-fill"` with inline `width: N%`) and text `data-testid="unit-progress-text"` = `covered/total · N%`.

- [ ] **Step 1: Write the failing tests**

In `src/pages/HomePage.test.tsx`:

1. Extend the `vi.mock('../data/units', ...)` factory with `loadUnitEntryIds: () => Promise.resolve(db.entryIds)` and add `entryIds: {} as Record<string, string[]>` to the `db` object (reset to `{}` in `beforeEach`).
2. Append tests:

```tsx
describe('dashboard', () => {
  it('renders the stats strip with due, mastered, and learned counts', async () => {
    db.cards = [
      card('a', 'review', 10, 3),  // mastered + learned
      card('b', 'learning', 1, 1), // learned only
      card('c', 'new', 0, 0),      // neither
    ];
    db.due = [{}, {}];
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    const strip = await screen.findByTestId('stats-strip');
    expect(strip).toHaveTextContent('Day streak');
    expect(screen.getByTestId('stat-due')).toHaveTextContent('2');
    expect(strip).toHaveTextContent('Mastered');
    expect(strip).toHaveTextContent('Learned');
  });

  it('shows coverage percent per unit', async () => {
    db.entryIds = { 'unit-01-intake': ['a', 'b', 'c', 'd'] };
    db.cards = [card('a', 'learning', 1, 2), card('b', 'review', 8, 5)];
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(await screen.findByTestId('unit-progress-text')).toHaveTextContent('2/4 · 50%');
    expect(screen.getByTestId('unit-progress-fill')).toHaveStyle({ width: '50%' });
  });

  it('shows 0% when the unit has no started entries', async () => {
    db.entryIds = { 'unit-01-intake': ['a', 'b'] };
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(await screen.findByTestId('unit-progress-text')).toHaveTextContent('0/2 · 0%');
  });

  it('renders no progress bar for a unit with zero items', async () => {
    db.entryIds = {};
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    await screen.findByTestId('home-unit-card');
    expect(screen.queryByTestId('unit-progress-bar')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/pages/HomePage.test.tsx`
Expected: new tests FAIL (`stats-strip` / `unit-progress-text` not found); pre-existing tests still PASS.

- [ ] **Step 3: Implement in HomePage.tsx**

Changes to `src/pages/HomePage.tsx`:

```tsx
// imports
import { loadUnits, loadUnitProgress, loadUnitEntryIds } from '../data/units';
import { StatsStrip } from '../components/StatsStrip';

// HomeState gains:
//   entryIds: Record<string, string[]>;

// in the mount effect, fetch in the same Promise.all:
const [units, profile, due, cards, entryIds] = await Promise.all([
  loadUnits(), getProfile(), loadDueCards(), loadAllCards(), loadUnitEntryIds(),
]);
// ...and include entryIds in setState.

// replace the current data-testid="home-streak" div with:
<StatsStrip
  streak={state.profile?.streakCurrent ?? 0}
  dueCount={state.dueCount}
  mastered={known}
  learned={learned}
/>

// inside the unit-card map, after the title row, before the CTA:
const ids = state.entryIds[unit.slug] ?? [];
const startedIds = new Set(state.cards.filter((c) => c.reps > 0).map((c) => c.entryId));
const covered = ids.filter((id) => startedIds.has(id)).length;
const percent = ids.length === 0 ? 0 : Math.round((covered / ids.length) * 100);
// render only when ids.length > 0:
{ids.length > 0 && (
  <div className="mt-2">
    <div data-testid="unit-progress-bar" className="h-1.5 overflow-hidden rounded bg-gray-200">
      <div
        data-testid="unit-progress-fill"
        className={percent === 100 ? 'h-full bg-green-600' : 'h-full bg-blue-700'}
        style={{ width: `${percent}%` }}
      />
    </div>
    <p data-testid="unit-progress-text" className="mt-1 text-xs text-gray-500">
      {covered}/{ids.length} · {percent}%
    </p>
  </div>
)}
```

Hoist `startedIds` out of the map (compute once next to `learned`/`known`). Delete the old `home-streak` div — its three spans are replaced by the strip. Keep `KNOWN_STABILITY_DAYS` and the `learned`/`known` computations unchanged.

Note: the old `home-streak` testid disappears — if any existing test references it, update that test to assert on `stats-strip` instead.

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: ALL tests pass (HomePage old + new, StatsStrip, units, everything else untouched).

- [ ] **Step 5: Verify in browser**

Start the dev server (`.claude/launch.json` / existing dev workflow), sign in, confirm: strip renders with 4 tiles, due tile navigates to /review, unit cards show bars, no console errors.

- [ ] **Step 6: Commit**

```bash
git add src/pages/HomePage.tsx src/pages/HomePage.test.tsx
git commit -m "feat: learner dashboard on home page"
```

---

### Task 4: UI language selection (en / ar / ru / fr) — added mid-execution by owner request

**Files:**
- Create: `src/locales/ar.json`, `src/locales/ru.json`, `src/locales/fr.json`
- Create: `src/components/LanguagePicker.tsx`, `src/components/LanguagePicker.test.tsx`
- Modify: `src/lib/i18n.ts`, `src/pages/HomePage.tsx`, `src/data/profile.ts`

**Interfaces:**
- Consumes: `i18n` singleton from `src/lib/i18n.ts`; `supabase` client; `Profile.uiLanguage`.
- Produces: `setUiLanguage(lang: string): Promise<void>` in `src/data/profile.ts` (updates `profiles.ui_language` for current user); `applyLanguage(lang: string)` in `src/lib/i18n.ts` (changeLanguage + sets `document.documentElement.dir` to `rtl` for `ar`, `ltr` otherwise, and `document.documentElement.lang`); `LanguagePicker` named export — `<select data-testid="language-picker">` with options en/ar/ru/fr labeled in their own language (English / العربية / Русский / Français).

**Requirements:**
1. `ar.json` / `ru.json` / `fr.json` mirror `en.json`'s full key structure (all 55 keys incl. the new `home.stats.*`). Translations authored by the implementing model — pilot-quality, plain register, medical-app tone. Keep `{{count}}`/`{{time}}` interpolations and pluralization suffixes (`_one`/`_other`; Russian needs `_one`/`_few`/`_many`/`_other`).
2. `i18n.ts` registers all four resources; `lng` stays `'en'` default; `fallbackLng: 'en'` unchanged.
3. `applyLanguage` called (a) when HomePage loads a profile with a non-current `uiLanguage`, (b) on picker change. Picker change also calls `setUiLanguage` to persist.
4. Picker renders on HomePage near the title. Signed-in only (HomePage is already behind auth).
5. RTL: `dir="rtl"` on `<html>` for `ar` only.
6. Tests: LanguagePicker renders 4 options and fires change; `applyLanguage('ar')` sets dir rtl and `applyLanguage('en')` resets ltr; HomePage applies profile language on load (mock profile `uiLanguage: 'ru'` → i18n.language becomes `ru`). Full suite green.

**Steps:** same TDD cycle as Tasks 1-3 (failing tests → implement → full suite → commit `feat: ui language selection with rtl support`).
