# Dictionary Tab & Reviewer Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a learner-facing Dictionary tab (read-only browse/search) and a moderated in-app Reviewer console that replaces the Excel review round-trip for the ~1187-word dictionary.

**Architecture:** The live `dictionary_entries` table becomes the source of truth. Reviewer edits land in a new `entry_edits` staging table and stay invisible to learners until the owner approves them via a `SECURITY DEFINER` RPC. The learner read path is unchanged except that deprecated rows are hidden. A new `export:content` script dumps the DB back to `content/dictionary.tsv` for a git-versioned backup; `import:content` becomes seed-only.

**Tech Stack:** React 19 + react-router 8, TypeScript, Tailwind, Supabase (Postgres + RLS + RPC), `postgres` (postgres.js) for scripts, Vitest, Playwright, react-i18next.

## Global Constraints

- Migrations are numbered sequentially in `supabase/migrations/`; next free number is **0010**.
- Postgres RLS helpers are `SECURITY DEFINER ... set search_path = public` (see `0002_rls.sql`).
- The DB stores translations as a single `translations jsonb` column `{en, ar?, ru?, fr?}`; the TSV keeps 4 separate columns `en ar ru fr` (see `import-content.ts`).
- `dictionary.tsv` column order is fixed: `id hebrew hebrew_nikud part_of_speech level gender plural root everyday_synonym en ar ru fr notes category`.
- `part_of_speech` enum: `noun verb adjective phrase abbreviation adverb pronoun preposition conjunction numeral particle interjection`.
- Reviewer role = `profiles.is_admin = true`. Approver role = `profiles.can_approve = true` (owner only). Owner email: `ori.lencovsky@gmail.com`.
- UI copy goes through i18n; add every new key to all 5 locale files (`en, he, ar, ru, fr`).
- Tests run with `npm test` (vitest); RLS check with `npm run verify:rls`; e2e with `npm run test:e2e`.
- Commit after every task.

---

### Task 1: Migration — schema, RLS, and approval RPC

**Files:**
- Create: `supabase/migrations/0010_reviewer_console.sql`

**Interfaces:**
- Produces (DB): columns `dictionary_entries.review_state`, `.review_priority`, `.is_deprecated`; column `profiles.can_approve`; table `entry_edits`; SQL fn `public.can_approve()`; RPC `public.apply_entry_edit(edit_id uuid, decision text)`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0010_reviewer_console.sql`:

```sql
-- Reviewer console: moderated in-app editing of dictionary_entries.
-- Live table stays the source of truth; edits are staged in entry_edits and
-- applied only when an approver (can_approve) accepts them via apply_entry_edit.

-- 1. Ops-only columns on the live table (NOT part of the content TSV).
alter table public.dictionary_entries
  add column review_state text not null default 'unreviewed'
    check (review_state in ('unreviewed', 'reviewed', 'edit_pending')),
  add column review_priority int not null default 0,
  add column is_deprecated boolean not null default false;

-- 2. Approver flag. Reviewer access reuses profiles.is_admin.
alter table public.profiles
  add column can_approve boolean not null default false;

-- 3. Staging table for proposed changes.
create table public.entry_edits (
  id           uuid primary key default gen_random_uuid(),
  entry_id     text references public.dictionary_entries(id),
  change_type  text not null check (change_type in ('create', 'update', 'delete')),
  payload      jsonb not null,
  editor_id    uuid not null references auth.users(id),
  editor_note  text,
  status       text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected')),
  decided_by   uuid references auth.users(id),
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);

-- At most one open pending edit per existing entry (creates are exempt: entry_id is null).
create unique index entry_edits_one_open_per_entry
  on public.entry_edits (entry_id)
  where status = 'pending' and change_type <> 'create';

alter table public.entry_edits enable row level security;

-- 4. Approver helper, mirroring is_admin() from 0002_rls.sql.
create function public.can_approve() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select can_approve from public.profiles where user_id = auth.uid()), false) $$;

-- 5. Learner read path hides deprecated rows; admins still see everything.
drop policy read_dictionary on public.dictionary_entries;
create policy read_dictionary on public.dictionary_entries for select to authenticated
  using (is_deprecated = false or public.is_admin());

-- 6. entry_edits RLS: reviewers insert/read; only approvers decide.
create policy edits_admin_select on public.entry_edits for select to authenticated
  using (public.is_admin());
create policy edits_admin_insert on public.entry_edits for insert to authenticated
  with check (public.is_admin() and editor_id = auth.uid());
-- Reviewer may withdraw their own still-pending edit.
create policy edits_owner_withdraw on public.entry_edits for update to authenticated
  using (editor_id = auth.uid() and status = 'pending')
  with check (status = 'rejected');
-- Approver decisions flow only through apply_entry_edit (SECURITY DEFINER); no broad update policy.

-- 7. Reviewer may update dictionary_entries (needed for "mark reviewed" and the
--    review_state=edit_pending flag), but a trigger keeps content columns locked
--    to approvers only — reviewers can change ONLY the ops columns. RLS cannot
--    restrict columns, so the guard is a trigger.
create policy admin_update_entries on public.dictionary_entries for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create function public.guard_entry_content_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- SECURITY DEFINER callers (apply_entry_edit) and approvers may change content.
  if public.can_approve() then return new; end if;
  if new.hebrew is distinct from old.hebrew
     or new.hebrew_nikud is distinct from old.hebrew_nikud
     or new.part_of_speech is distinct from old.part_of_speech
     or new.level is distinct from old.level
     or new.gender is distinct from old.gender
     or new.plural is distinct from old.plural
     or new.root is distinct from old.root
     or new.everyday_synonym is distinct from old.everyday_synonym
     or new.translations is distinct from old.translations
     or new.notes is distinct from old.notes
     or new.category is distinct from old.category
     or new.is_deprecated is distinct from old.is_deprecated then
    raise exception 'content changes must go through apply_entry_edit';
  end if;
  return new;
end $$;

create trigger guard_entry_content
  before update on public.dictionary_entries
  for each row execute function public.guard_entry_content_update();

-- 8. Apply-or-reject RPC. All content mutation is server-side and atomic.
create function public.apply_entry_edit(edit_id uuid, decision text)
returns void language plpgsql security definer set search_path = public as $$
declare e public.entry_edits;
begin
  if not public.can_approve() then
    raise exception 'not authorized to decide edits';
  end if;
  if decision not in ('approved', 'rejected') then
    raise exception 'decision must be approved or rejected';
  end if;

  select * into e from public.entry_edits where id = edit_id and status = 'pending';
  if not found then
    raise exception 'edit % not found or already decided', edit_id;
  end if;

  if decision = 'approved' then
    if e.change_type = 'update' then
      update public.dictionary_entries set
        hebrew           = coalesce(e.payload->>'hebrew', hebrew),
        hebrew_nikud     = coalesce(e.payload->>'hebrew_nikud', hebrew_nikud),
        part_of_speech   = coalesce(e.payload->>'part_of_speech', part_of_speech),
        level            = coalesce((e.payload->>'level')::int, level),
        gender           = nullif(e.payload->>'gender', ''),
        plural           = nullif(e.payload->>'plural', ''),
        root             = nullif(e.payload->>'root', ''),
        everyday_synonym = nullif(e.payload->>'everyday_synonym', ''),
        translations     = coalesce(e.payload->'translations', translations),
        notes            = nullif(e.payload->>'notes', ''),
        category         = nullif(e.payload->>'category', ''),
        review_state     = 'reviewed',
        updated_at       = now()
      where id = e.entry_id;
    elsif e.change_type = 'delete' then
      update public.dictionary_entries
        set is_deprecated = true, review_state = 'reviewed', updated_at = now()
      where id = e.entry_id;
    elsif e.change_type = 'create' then
      insert into public.dictionary_entries
        (id, hebrew, hebrew_nikud, part_of_speech, level, gender, plural, root,
         everyday_synonym, translations, notes, category, review_state)
      values (
        e.payload->>'id', e.payload->>'hebrew', e.payload->>'hebrew_nikud',
        e.payload->>'part_of_speech', (e.payload->>'level')::int,
        nullif(e.payload->>'gender', ''), nullif(e.payload->>'plural', ''),
        nullif(e.payload->>'root', ''), nullif(e.payload->>'everyday_synonym', ''),
        e.payload->'translations', nullif(e.payload->>'notes', ''),
        nullif(e.payload->>'category', ''), 'reviewed');
    end if;
  else
    -- rejected: revert the entry's pending flag if this was the reason it was set.
    if e.entry_id is not null then
      update public.dictionary_entries
        set review_state = 'unreviewed', updated_at = now()
      where id = e.entry_id and review_state = 'edit_pending';
    end if;
  end if;

  update public.entry_edits
    set status = decision, decided_by = auth.uid(), decided_at = now()
  where id = edit_id;
end $$;

-- 9. Seed the owner as approver (idempotent; no-op until that profile exists).
update public.profiles p set can_approve = true
from auth.users u where u.id = p.user_id and u.email = 'ori.lencovsky@gmail.com';
```

- [ ] **Step 2: Apply the migration**

Apply via the Supabase MCP `apply_migration` tool (name `reviewer_console`) or `supabase db push` against the project. 

- [ ] **Step 3: Smoke-check the schema**

Run this SQL (MCP `execute_sql` or psql) and confirm no error + expected columns:

```sql
select column_name from information_schema.columns
where table_name = 'dictionary_entries' and column_name in ('review_state','review_priority','is_deprecated');
select proname from pg_proc where proname in ('can_approve','apply_entry_edit');
```
Expected: 3 column rows, 2 proc rows.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0010_reviewer_console.sql
git commit -m "feat(db): reviewer console schema, RLS, and apply_entry_edit RPC"
```

---

### Task 2: Migration — seed review priority from REVIEW_FLAGS.md

**Files:**
- Create: `supabase/migrations/0011_seed_review_priority.sql`

**Interfaces:**
- Consumes: `dictionary_entries.review_priority` (Task 1).
- Produces (DB): `review_priority = 1` on the pre-flagged uncertain headwords.

- [ ] **Step 1: Write the data migration**

The words below are the "uncertain" headwords from `content/REVIEW_FLAGS.md` (homograph sense, gender, nikud, root). Match by `hebrew` headword. Create `supabase/migrations/0011_seed_review_priority.sql`:

```sql
-- Float the entries flagged uncertain at enrichment time (content/REVIEW_FLAGS.md)
-- to the top of the reviewer queue. Priority is advisory; the reviewer can still
-- work any word. Matched by headword; unmatched words are silently skipped.
update public.dictionary_entries set review_priority = 1 where hebrew in (
  -- homograph / sense picked without a hint
  'תיקן','כעס','לחץ','כתב','מדד','מוכר','נעל','נהג','מרץ','מר','מילא','מלווה',
  'שטף','שמן','שקט','רעב','קצב','סגר','עובד','עבר','עם','פחד','פתח','צמא','כבד',
  'ירק','גזר','הבא','הגה','דיווח','גובה','בטח','עצמי','חי','נראה',
  -- gender uncertain
  'אות','זרת','פנים','צומת','שמש','סכין','גרב','ימין','תכלת','שתן','חדשות',
  'אפריל','אוגוסט','אוקטובר','דצמבר','פברואר',
  -- nikud uncertain (loanwords + dagesh/vowel)
  'אלרגי','אימייל','אינטרנט','אוטו','בננה','בלגן','ביי','ביופסיה','כרוני','פארק',
  'פרוצדורה','פלסטר','היי','סבבה','חולצה','אזור','חמישים','זיהום','חלש','הפנייה',
  'התאוששות','זכר','קרסול','רטוב','שחור','רעיון','ריבוע','קיבה','שנייה','שיחה',
  'שיער','שלפוחית','כדאי','כווייה','מסוכן','במיוחד','אחראי','מזגן','מאוורר','מעבדה',
  'סבתא','סתיו','סיסמה','סיעוד','נעלם','חמאה','חנייה','יכל','חייב','ירייה','דוגמה',
  'הכל','חמישי','כל',
  -- root uncertain / empty
  'אבחנה','גרעין','דעה','מינון','נייר','מין','מסקנה','מטרה','מותר'
);
```

- [ ] **Step 2: Apply and verify**

Apply (MCP `apply_migration` name `seed_review_priority`). Then:

```sql
select count(*) from public.dictionary_entries where review_priority = 1;
```
Expected: a non-zero count (roughly 90–110 depending on which headwords exist).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0011_seed_review_priority.sql
git commit -m "feat(db): seed review priority from REVIEW_FLAGS uncertain list"
```

---

### Task 3: Shared entry mapper + learner dictionary data layer

**Files:**
- Create: `src/data/entryMapper.ts`
- Modify: `src/data/cards.ts` (remove local `EntryRow`/`mapEntryRow`, import from `entryMapper`)
- Create: `src/data/dictionary.ts`
- Test: `src/data/dictionary.test.ts`

**Interfaces:**
- Produces: `entryMapper.ts` exports `type EntryRow` and `mapEntryRow(r: EntryRow): DictionaryEntry`.
- Produces: `dictionary.ts` exports `fetchDictionary(): Promise<DictionaryEntry[]>` and `filterEntries(entries: DictionaryEntry[], query: string): DictionaryEntry[]`.

- [ ] **Step 1: Extract the shared mapper**

Create `src/data/entryMapper.ts` (moved verbatim from `cards.ts`):

```ts
import type { DictionaryEntry } from '../lib/types';

export type EntryRow = {
  id: string; hebrew: string; hebrew_nikud: string; part_of_speech: DictionaryEntry['partOfSpeech'];
  level: 1 | 2 | 3; gender: 'ז' | 'נ' | null; plural: string | null; root: string | null;
  everyday_synonym: string | null; translations: DictionaryEntry['translations']; notes: string | null;
  category: DictionaryEntry['category'];
};

export function mapEntryRow(r: EntryRow): DictionaryEntry {
  return {
    id: r.id, hebrew: r.hebrew, hebrewNikud: r.hebrew_nikud, partOfSpeech: r.part_of_speech,
    level: r.level, gender: r.gender, plural: r.plural, root: r.root,
    everydaySynonym: r.everyday_synonym, translations: r.translations, notes: r.notes,
    category: r.category ?? null,
  };
}
```

- [ ] **Step 2: Point cards.ts at the shared mapper**

In `src/data/cards.ts`: delete the local `type EntryRow = {...}` and `function mapEntryRow(...)` (lines 14–38), and add near the top imports:

```ts
import { mapEntryRow, type EntryRow } from './entryMapper';
```

- [ ] **Step 3: Run the existing suite to confirm the refactor is clean**

Run: `npm test -- cards`
Expected: PASS (no behavior change).

- [ ] **Step 4: Write the failing test for the search filter**

Create `src/data/dictionary.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
vi.mock('../lib/supabase', () => ({ supabase: {} }));
import { filterEntries } from './dictionary';
import type { DictionaryEntry } from '../lib/types';

function e(id: string, hebrew: string, en: string, synonym: string | null = null): DictionaryEntry {
  return {
    id, hebrew, hebrewNikud: hebrew, partOfSpeech: 'noun', level: 1, gender: null,
    plural: null, root: null, everydaySynonym: synonym, translations: { en }, notes: null, category: null,
  };
}
const pool = [e('a', 'תלונה', 'complaint', 'מה מפריע'), e('b', 'חום', 'fever'), e('c', 'ספסיס', 'sepsis')];

describe('filterEntries', () => {
  it('returns all entries for an empty query', () => {
    expect(filterEntries(pool, '').length).toBe(3);
  });
  it('matches on Hebrew headword', () => {
    expect(filterEntries(pool, 'חום').map((x) => x.id)).toEqual(['b']);
  });
  it('matches on English gloss, case-insensitive', () => {
    expect(filterEntries(pool, 'SEPSIS').map((x) => x.id)).toEqual(['c']);
  });
  it('matches on everyday synonym', () => {
    expect(filterEntries(pool, 'מפריע').map((x) => x.id)).toEqual(['a']);
  });
  it('trims whitespace', () => {
    expect(filterEntries(pool, '  חום  ').map((x) => x.id)).toEqual(['b']);
  });
});
```

- [ ] **Step 5: Run it to confirm it fails**

Run: `npm test -- dictionary`
Expected: FAIL — `filterEntries` not exported.

- [ ] **Step 6: Implement the data layer**

Create `src/data/dictionary.ts`:

```ts
import { supabase } from '../lib/supabase';
import { mapEntryRow, type EntryRow } from './entryMapper';
import type { DictionaryEntry } from '../lib/types';

export async function fetchDictionary(): Promise<DictionaryEntry[]> {
  const { data, error } = await supabase
    .from('dictionary_entries')
    .select('*')
    .order('hebrew', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as EntryRow[]).map(mapEntryRow);
}

export function filterEntries(entries: DictionaryEntry[], query: string): DictionaryEntry[] {
  const q = query.trim().toLowerCase();
  if (q === '') return entries;
  return entries.filter((e) => {
    const haystack = [
      e.hebrew, e.hebrewNikud, e.everydaySynonym ?? '',
      e.translations.en, e.translations.ar ?? '', e.translations.ru ?? '', e.translations.fr ?? '',
    ].join(' ').toLowerCase();
    return haystack.includes(q);
  });
}
```

- [ ] **Step 7: Run the tests**

Run: `npm test -- dictionary cards`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/data/entryMapper.ts src/data/cards.ts src/data/dictionary.ts src/data/dictionary.test.ts
git commit -m "feat: learner dictionary data layer + shared entry mapper"
```

---

### Task 4: Learner Dictionary page, route, nav, and i18n

**Files:**
- Create: `src/pages/DictionaryPage.tsx`
- Modify: `src/App.tsx` (add route)
- Modify: `src/components/AppShell.tsx` (add nav item)
- Modify: `src/locales/en.json`, `he.json`, `ar.json`, `ru.json`, `fr.json` (add `nav.dictionary` + `dictionary.*`)
- Test: `src/pages/DictionaryPage.test.tsx`

**Interfaces:**
- Consumes: `fetchDictionary`, `filterEntries` (Task 3).

- [ ] **Step 1: Add i18n keys**

In `src/locales/en.json`, add `"dictionary": "Dictionary"` to the `nav` object, and a top-level block:

```json
  "dictionary": {
    "title": "Dictionary",
    "searchPlaceholder": "Search words…",
    "empty": "No words match your search.",
    "count": "{{count}} words"
  },
```

Add the same keys to `he.json` (`"dictionary": "מילון"`, `title` "מילון", `searchPlaceholder` "חיפוש מילים…", `empty` "אין מילים שתואמות לחיפוש.", `count` "{{count}} מילים"), and to `ar.json`, `ru.json`, `fr.json` with translations (mirror the drill/review entries already present for tone). Every file must contain the same key paths.

- [ ] **Step 2: Write the failing page test**

Create `src/pages/DictionaryPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import '../lib/i18n';
import type { DictionaryEntry } from '../lib/types';

const entries: DictionaryEntry[] = [
  { id: 'a', hebrew: 'תלונה', hebrewNikud: 'תְּלוּנָה', partOfSpeech: 'noun', level: 1, gender: 'נ',
    plural: 'תלונות', root: null, everydaySynonym: null, translations: { en: 'complaint' }, notes: null, category: null },
  { id: 'b', hebrew: 'חום', hebrewNikud: 'חוֹם', partOfSpeech: 'noun', level: 1, gender: 'ז',
    plural: null, root: null, everydaySynonym: null, translations: { en: 'fever' }, notes: null, category: null },
];
vi.mock('../data/dictionary', async (orig) => ({
  ...(await orig<typeof import('./DictionaryPage')>()),
  fetchDictionary: vi.fn(async () => entries),
}));

import { DictionaryPage } from './DictionaryPage';

function renderPage() {
  return render(<MemoryRouter><DictionaryPage /></MemoryRouter>);
}

describe('DictionaryPage', () => {
  beforeEach(() => vi.clearAllMocks());
  it('lists fetched words', async () => {
    renderPage();
    expect(await screen.findByText('תלונה')).toBeTruthy();
    expect(screen.getByText('חום')).toBeTruthy();
    expect(screen.getByText('complaint')).toBeTruthy();
  });
  it('filters as the user types', async () => {
    renderPage();
    await screen.findByText('תלונה');
    await userEvent.type(screen.getByRole('searchbox'), 'fever');
    expect(screen.queryByText('תלונה')).toBeNull();
    expect(screen.getByText('חום')).toBeTruthy();
  });
});
```

Note: the mock above imports its own module by mistake — replace the `vi.mock` factory with a direct mock:

```tsx
vi.mock('../data/dictionary', () => ({
  fetchDictionary: vi.fn(async () => entries),
  filterEntries: (list: DictionaryEntry[], q: string) =>
    q.trim() === '' ? list : list.filter((e) => (e.hebrew + ' ' + e.translations.en).toLowerCase().includes(q.toLowerCase())),
}));
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npm test -- DictionaryPage`
Expected: FAIL — `DictionaryPage` not defined.

- [ ] **Step 4: Implement the page**

Create `src/pages/DictionaryPage.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchDictionary, filterEntries } from '../data/dictionary';
import { PageHeader } from '../components/ui/PageHeader';
import type { DictionaryEntry } from '../lib/types';

export function DictionaryPage() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDictionary().then((e) => { setEntries(e); setLoading(false); });
  }, []);

  const shown = useMemo(() => filterEntries(entries, query), [entries, query]);

  return (
    <div className="mx-auto max-w-2xl p-4">
      <PageHeader title={t('dictionary.title')} />
      <input
        type="search"
        role="searchbox"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('dictionary.searchPlaceholder')}
        className="mt-4 w-full rounded-md border border-line px-3 py-2 text-sm"
      />
      <p className="mt-2 text-xs text-ink-muted">{t('dictionary.count', { count: shown.length })}</p>
      {loading ? (
        <p className="mt-6 text-ink-muted">{t('common.loading')}</p>
      ) : shown.length === 0 ? (
        <p className="mt-6 text-ink-muted">{t('dictionary.empty')}</p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {shown.map((e) => (
            <li key={e.id} className="py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-lg font-bold text-ink">{e.hebrewNikud || e.hebrew}</span>
                <span className="text-xs text-ink-muted">{e.partOfSpeech} · L{e.level}</span>
              </div>
              <div className="text-sm text-ink-muted">{e.translations.en}</div>
              {e.everydaySynonym && (
                <div className="text-xs text-ink-muted">≈ {e.everydaySynonym}</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Wire the route**

In `src/App.tsx`, add the import and route inside the `AppShell` group:

```tsx
import { DictionaryPage } from './pages/DictionaryPage';
// ...
        <Route path="/dictionary" element={<DictionaryPage />} />
```

- [ ] **Step 6: Add the nav item**

In `src/components/AppShell.tsx`, add `Library` to the lucide import and a nav link after Review:

```tsx
import { Home, Clock, Stethoscope, Library } from 'lucide-react';
// ...
        <NavLink to="/dictionary" className={NAV_ITEM_CLASSES}>
          <Library className="size-4" />
          {t('nav.dictionary')}
        </NavLink>
```

- [ ] **Step 7: Run tests + typecheck**

Run: `npm test -- DictionaryPage` then `npm run build`
Expected: PASS + clean build.

- [ ] **Step 8: Commit**

```bash
git add src/pages/DictionaryPage.tsx src/pages/DictionaryPage.test.tsx src/App.tsx src/components/AppShell.tsx src/locales
git commit -m "feat: learner Dictionary tab with search"
```

---

### Task 5: Reviewer console data layer

**Files:**
- Modify: `src/lib/types.ts` (add `EntryEdit`, `AdminEntry`, `EntryEditInput`; add `canApprove` to `Profile`)
- Modify: `src/data/profile.ts` (map `can_approve`)
- Create: `src/data/reviewConsole.ts`
- Test: `src/data/reviewConsole.test.ts`

**Interfaces:**
- Consumes: `EntryRow`/`mapEntryRow` (Task 3), `supabase`.
- Produces:
  - `type AdminEntry = DictionaryEntry & { reviewState: ReviewState; reviewPriority: number; isDeprecated: boolean }`
  - `type ReviewState = 'unreviewed' | 'reviewed' | 'edit_pending'`
  - `type EntryEdit = { id; entryId: string | null; changeType: 'create'|'update'|'delete'; payload: EntryPayload; editorNote: string | null; status: 'pending'|'approved'|'rejected'; createdAt: string }`
  - `type EntryPayload` — snake_case field bag matching the RPC (`id?, hebrew, hebrew_nikud, part_of_speech, level, gender, plural, root, everyday_synonym, translations, notes, category`).
  - `entryToPayload(e: AdminEntry | FormValues): EntryPayload`
  - `fetchAdminEntries(): Promise<AdminEntry[]>`
  - `fetchPendingEdits(): Promise<EntryEdit[]>`
  - `saveEditDraft(entryId, payload, note): Promise<void>`
  - `createEntryDraft(payload, note): Promise<void>`
  - `flagDelete(entryId, note): Promise<void>`
  - `markReviewed(entryId): Promise<void>`
  - `decideEdit(editId, decision: 'approved'|'rejected'): Promise<void>`
  - `withdrawEdit(editId): Promise<void>`

- [ ] **Step 1: Extend types**

In `src/lib/types.ts` add to `Profile`: `canApprove: boolean;`. Add at the end:

```ts
export type ReviewState = 'unreviewed' | 'reviewed' | 'edit_pending';

export interface AdminEntry extends DictionaryEntry {
  reviewState: ReviewState;
  reviewPriority: number;
  isDeprecated: boolean;
}

export interface EntryPayload {
  id?: string;
  hebrew: string; hebrew_nikud: string; part_of_speech: PartOfSpeech;
  level: number; gender: string | null; plural: string | null; root: string | null;
  everyday_synonym: string | null; translations: Translations; notes: string | null;
  category: string | null;
}

export interface EntryEdit {
  id: string;
  entryId: string | null;
  changeType: 'create' | 'update' | 'delete';
  payload: EntryPayload;
  editorNote: string | null;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}
```

- [ ] **Step 2: Map `can_approve` in profile.ts**

In `src/data/profile.ts`: add `can_approve: boolean;` to `ProfileRow`, and `canApprove: r.can_approve,` to `mapProfileRow`'s return.

- [ ] **Step 3: Write the failing test for `entryToPayload`**

Create `src/data/reviewConsole.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
vi.mock('../lib/supabase', () => ({ supabase: {} }));
import { entryToPayload } from './reviewConsole';
import type { AdminEntry } from '../lib/types';

const base: AdminEntry = {
  id: 'x', hebrew: 'חום', hebrewNikud: 'חוֹם', partOfSpeech: 'noun', level: 2, gender: 'ז',
  plural: null, root: null, everydaySynonym: null, translations: { en: 'fever', ar: null },
  notes: null, category: null, reviewState: 'unreviewed', reviewPriority: 0, isDeprecated: false,
};

describe('entryToPayload', () => {
  it('maps camelCase entry fields to the snake_case RPC payload', () => {
    expect(entryToPayload(base)).toEqual({
      id: 'x', hebrew: 'חום', hebrew_nikud: 'חוֹם', part_of_speech: 'noun', level: 2,
      gender: 'ז', plural: null, root: null, everyday_synonym: null,
      translations: { en: 'fever', ar: null }, notes: null, category: null,
    });
  });
});
```

- [ ] **Step 4: Run it to confirm it fails**

Run: `npm test -- reviewConsole`
Expected: FAIL — `entryToPayload` not exported.

- [ ] **Step 5: Implement the data layer**

Create `src/data/reviewConsole.ts`:

```ts
import { supabase } from '../lib/supabase';
import { mapEntryRow, type EntryRow } from './entryMapper';
import type { AdminEntry, EntryEdit, EntryPayload } from '../lib/types';

type AdminEntryRow = EntryRow & { review_state: AdminEntry['reviewState']; review_priority: number; is_deprecated: boolean };
type EditRow = {
  id: string; entry_id: string | null; change_type: EntryEdit['changeType'];
  payload: EntryPayload; editor_note: string | null; status: EntryEdit['status']; created_at: string;
};

function mapAdminEntry(r: AdminEntryRow): AdminEntry {
  return { ...mapEntryRow(r), reviewState: r.review_state, reviewPriority: r.review_priority, isDeprecated: r.is_deprecated };
}
function mapEdit(r: EditRow): EntryEdit {
  return {
    id: r.id, entryId: r.entry_id, changeType: r.change_type, payload: r.payload,
    editorNote: r.editor_note, status: r.status, createdAt: r.created_at,
  };
}

export function entryToPayload(e: AdminEntry): EntryPayload {
  return {
    id: e.id, hebrew: e.hebrew, hebrew_nikud: e.hebrewNikud, part_of_speech: e.partOfSpeech,
    level: e.level, gender: e.gender, plural: e.plural, root: e.root,
    everyday_synonym: e.everydaySynonym, translations: e.translations, notes: e.notes, category: e.category,
  };
}

async function currentUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');
  return user.id;
}

export async function fetchAdminEntries(): Promise<AdminEntry[]> {
  const { data, error } = await supabase
    .from('dictionary_entries').select('*')
    .order('review_priority', { ascending: false }).order('hebrew', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as AdminEntryRow[]).map(mapAdminEntry);
}

export async function fetchPendingEdits(): Promise<EntryEdit[]> {
  const { data, error } = await supabase
    .from('entry_edits').select('*').eq('status', 'pending').order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as EditRow[]).map(mapEdit);
}

export async function saveEditDraft(entryId: string, payload: EntryPayload, note: string | null): Promise<void> {
  const editorId = await currentUserId();
  const { error } = await supabase.from('entry_edits')
    .insert({ entry_id: entryId, change_type: 'update', payload, editor_id: editorId, editor_note: note });
  if (error) throw error;
  const { error: e2 } = await supabase.from('dictionary_entries')
    .update({ review_state: 'edit_pending' }).eq('id', entryId);
  if (e2) throw e2;
}

export async function createEntryDraft(payload: EntryPayload, note: string | null): Promise<void> {
  const editorId = await currentUserId();
  const { error } = await supabase.from('entry_edits')
    .insert({ entry_id: null, change_type: 'create', payload, editor_id: editorId, editor_note: note });
  if (error) throw error;
}

export async function flagDelete(entryId: string, note: string | null): Promise<void> {
  const editorId = await currentUserId();
  const { error } = await supabase.from('entry_edits')
    .insert({ entry_id: entryId, change_type: 'delete', payload: {}, editor_id: editorId, editor_note: note });
  if (error) throw error;
  const { error: e2 } = await supabase.from('dictionary_entries')
    .update({ review_state: 'edit_pending' }).eq('id', entryId);
  if (e2) throw e2;
}

export async function markReviewed(entryId: string): Promise<void> {
  const { error } = await supabase.from('dictionary_entries')
    .update({ review_state: 'reviewed' }).eq('id', entryId);
  if (error) throw error;
}

export async function decideEdit(editId: string, decision: 'approved' | 'rejected'): Promise<void> {
  const { error } = await supabase.rpc('apply_entry_edit', { edit_id: editId, decision });
  if (error) throw error;
}

export async function withdrawEdit(editId: string): Promise<void> {
  const { error } = await supabase.from('entry_edits').update({ status: 'rejected' }).eq('id', editId);
  if (error) throw error;
}
```

- [ ] **Step 6: Run the test + typecheck**

Run: `npm test -- reviewConsole` then `npm run build`
Expected: PASS + clean build (note: `flagDelete` passes `payload: {}`; the `EntryPayload` param on `saveEditDraft`/`createEntryDraft` is typed, but the insert column accepts any jsonb — cast `{} as unknown as EntryPayload` if the compiler objects).

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/data/profile.ts src/data/reviewConsole.ts src/data/reviewConsole.test.ts
git commit -m "feat: reviewer console data layer + admin entry/edit types"
```

---

### Task 6: Reviewer console page — list, edit form, actions

**Files:**
- Create: `src/pages/AdminDictionaryPage.tsx`
- Create: `src/components/admin/EntryEditForm.tsx`
- Modify: `src/App.tsx` (gated route)
- Modify: `src/components/AppShell.tsx` (admin-only nav item)
- Modify: `src/locales/*.json` (add `admin.*` keys)
- Test: `src/pages/AdminDictionaryPage.test.tsx`

**Interfaces:**
- Consumes: `fetchAdminEntries`, `saveEditDraft`, `createEntryDraft`, `flagDelete`, `markReviewed`, `entryToPayload` (Task 5); `useSession`/`getProfile` for `isAdmin` gating.
- Produces: `AdminDictionaryPage`, `EntryEditForm` (props: `initial: EntryPayload; onSave(payload, note); onCancel()`).

- [ ] **Step 1: Add i18n keys**

Add to each locale a block (English shown; translate the rest):

```json
  "admin": {
    "dictionary": "Review words",
    "progress": "{{reviewed}} / {{total}} reviewed",
    "stateUnreviewed": "Unreviewed",
    "stateReviewed": "Reviewed",
    "statePending": "Pending",
    "edit": "Edit",
    "saveDraft": "Save draft",
    "markReviewed": "Mark reviewed",
    "flagDelete": "Flag for deletion",
    "addWord": "Add word",
    "note": "Note for approver",
    "cancel": "Cancel"
  },
```

Add `"dictionaryAdmin": "Review"` to each `nav` block.

- [ ] **Step 2: Write the failing test**

Create `src/pages/AdminDictionaryPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import '../lib/i18n';
import type { AdminEntry } from '../lib/types';

const entries: AdminEntry[] = [
  { id: 'a', hebrew: 'תלונה', hebrewNikud: 'תְּלוּנָה', partOfSpeech: 'noun', level: 1, gender: 'נ',
    plural: null, root: null, everydaySynonym: null, translations: { en: 'complaint' }, notes: null,
    category: null, reviewState: 'unreviewed', reviewPriority: 1, isDeprecated: false },
];
const saveEditDraft = vi.fn(async () => {});
const markReviewed = vi.fn(async () => {});
vi.mock('../data/reviewConsole', () => ({
  fetchAdminEntries: vi.fn(async () => entries),
  entryToPayload: (e: AdminEntry) => ({ id: e.id, hebrew: e.hebrew, hebrew_nikud: e.hebrewNikud,
    part_of_speech: e.partOfSpeech, level: e.level, gender: e.gender, plural: e.plural, root: e.root,
    everyday_synonym: e.everydaySynonym, translations: e.translations, notes: e.notes, category: e.category }),
  saveEditDraft, markReviewed, createEntryDraft: vi.fn(), flagDelete: vi.fn(),
}));

import { AdminDictionaryPage } from './AdminDictionaryPage';

describe('AdminDictionaryPage', () => {
  beforeEach(() => vi.clearAllMocks());
  it('shows the word list and a progress count', async () => {
    render(<MemoryRouter><AdminDictionaryPage /></MemoryRouter>);
    expect(await screen.findByText('תלונה')).toBeTruthy();
    expect(screen.getByText(/0 \/ 1/)).toBeTruthy();
  });
  it('marks a word reviewed', async () => {
    render(<MemoryRouter><AdminDictionaryPage /></MemoryRouter>);
    await screen.findByText('תלונה');
    await userEvent.click(screen.getByRole('button', { name: /mark reviewed/i }));
    expect(markReviewed).toHaveBeenCalledWith('a');
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npm test -- AdminDictionaryPage`
Expected: FAIL — `AdminDictionaryPage` not defined.

- [ ] **Step 4: Implement the edit form**

Create `src/components/admin/EntryEditForm.tsx`:

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EntryPayload, PartOfSpeech } from '../../lib/types';

const POS: PartOfSpeech[] = ['noun', 'verb', 'adjective', 'phrase', 'abbreviation', 'adverb',
  'pronoun', 'preposition', 'conjunction', 'numeral', 'particle', 'interjection'];

interface Props {
  initial: EntryPayload;
  onSave: (payload: EntryPayload, note: string | null) => void;
  onCancel: () => void;
}

export function EntryEditForm({ initial, onSave, onCancel }: Props) {
  const { t } = useTranslation();
  const [p, setP] = useState<EntryPayload>(initial);
  const [note, setNote] = useState('');
  const set = (k: keyof EntryPayload, v: unknown) => setP({ ...p, [k]: v });
  const field = (label: string, key: keyof EntryPayload) => (
    <label className="block text-sm">
      <span className="text-ink-muted">{label}</span>
      <input className="mt-1 w-full rounded-md border border-line px-2 py-1"
        value={(p[key] as string) ?? ''} onChange={(e) => set(key, e.target.value || null)} />
    </label>
  );
  return (
    <div className="space-y-3 rounded-md border border-line p-3">
      {field('hebrew', 'hebrew')}
      {field('nikud', 'hebrew_nikud')}
      <label className="block text-sm">
        <span className="text-ink-muted">part of speech</span>
        <select className="mt-1 w-full rounded-md border border-line px-2 py-1"
          value={p.part_of_speech} onChange={(e) => set('part_of_speech', e.target.value)}>
          {POS.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-ink-muted">level</span>
        <select className="mt-1 w-full rounded-md border border-line px-2 py-1"
          value={p.level} onChange={(e) => set('level', Number(e.target.value))}>
          {[1, 2, 3].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </label>
      {field('gender (ז/נ)', 'gender')}
      {field('plural', 'plural')}
      {field('root', 'root')}
      {field('everyday synonym', 'everyday_synonym')}
      <label className="block text-sm">
        <span className="text-ink-muted">en</span>
        <input className="mt-1 w-full rounded-md border border-line px-2 py-1"
          value={p.translations.en}
          onChange={(e) => set('translations', { ...p.translations, en: e.target.value })} />
      </label>
      {field('notes', 'notes')}
      <label className="block text-sm">
        <span className="text-ink-muted">{t('admin.note')}</span>
        <input className="mt-1 w-full rounded-md border border-line px-2 py-1"
          value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="flex gap-2">
        <button className="rounded-md bg-primary px-3 py-1 text-sm font-semibold text-white"
          onClick={() => onSave(p, note || null)}>{t('admin.saveDraft')}</button>
        <button className="rounded-md border border-line px-3 py-1 text-sm"
          onClick={onCancel}>{t('admin.cancel')}</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Implement the page**

Create `src/pages/AdminDictionaryPage.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/ui/PageHeader';
import { EntryEditForm } from '../components/admin/EntryEditForm';
import {
  fetchAdminEntries, entryToPayload, saveEditDraft, createEntryDraft, flagDelete, markReviewed,
} from '../data/reviewConsole';
import type { AdminEntry, EntryPayload } from '../lib/types';

const EMPTY: EntryPayload = {
  hebrew: '', hebrew_nikud: '', part_of_speech: 'noun', level: 1, gender: null, plural: null,
  root: null, everyday_synonym: null, translations: { en: '' }, notes: null, category: null,
};

export function AdminDictionaryPage() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<AdminEntry[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const reload = () => fetchAdminEntries().then(setEntries);
  useEffect(() => { reload(); }, []);

  const reviewedCount = useMemo(
    () => entries.filter((e) => e.reviewState === 'reviewed').length, [entries]);

  const onSave = async (entryId: string, payload: EntryPayload, note: string | null) => {
    await saveEditDraft(entryId, payload, note);
    setEditingId(null); await reload();
  };
  const onCreate = async (payload: EntryPayload, note: string | null) => {
    await createEntryDraft(payload, note); setAdding(false); await reload();
  };
  const onReview = async (id: string) => { await markReviewed(id); await reload(); };
  const onDelete = async (id: string) => { await flagDelete(id, null); await reload(); };

  return (
    <div className="mx-auto max-w-2xl p-4">
      <PageHeader title={t('admin.dictionary')} />
      <div className="mt-3 flex items-center justify-between">
        <p className="text-sm text-ink-muted">
          {t('admin.progress', { reviewed: reviewedCount, total: entries.length })}
        </p>
        <button className="rounded-md border border-line px-3 py-1 text-sm"
          onClick={() => setAdding(true)}>{t('admin.addWord')}</button>
      </div>
      {adding && <div className="mt-3"><EntryEditForm initial={EMPTY} onSave={onCreate} onCancel={() => setAdding(false)} /></div>}
      <ul className="mt-4 divide-y divide-line">
        {entries.map((e) => (
          <li key={e.id} className="py-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-lg font-bold text-ink">{e.hebrewNikud || e.hebrew}</span>
                <span className="ms-2 text-sm text-ink-muted">{e.translations.en}</span>
              </div>
              <span className="text-xs text-ink-muted">
                {e.reviewState === 'reviewed' ? t('admin.stateReviewed')
                  : e.reviewState === 'edit_pending' ? t('admin.statePending') : t('admin.stateUnreviewed')}
              </span>
            </div>
            {editingId === e.id ? (
              <div className="mt-2">
                <EntryEditForm initial={entryToPayload(e)}
                  onSave={(payload, note) => onSave(e.id, payload, note)}
                  onCancel={() => setEditingId(null)} />
              </div>
            ) : (
              <div className="mt-2 flex gap-2">
                <button className="text-sm text-primary" onClick={() => setEditingId(e.id)}>{t('admin.edit')}</button>
                <button className="text-sm text-ink-muted" onClick={() => onReview(e.id)}>{t('admin.markReviewed')}</button>
                <button className="text-sm text-danger" onClick={() => onDelete(e.id)}>{t('admin.flagDelete')}</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 6: Gate the route**

Create `src/components/AdminRoute.tsx`:

```tsx
import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import { getProfile } from '../data/profile';

export function AdminRoute({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'no' | 'yes'>('checking');
  useEffect(() => { getProfile().then((p) => setState(p?.isAdmin ? 'yes' : 'no')); }, []);
  if (state === 'checking') return <p className="p-4">…</p>;
  if (state === 'no') return <Navigate to="/" replace />;
  return <>{children}</>;
}
```

In `src/App.tsx` add the route inside the `AppShell` group:

```tsx
import { AdminDictionaryPage } from './pages/AdminDictionaryPage';
import { AdminRoute } from './components/AdminRoute';
// ...
        <Route path="/admin/dictionary" element={<AdminRoute><AdminDictionaryPage /></AdminRoute>} />
```

- [ ] **Step 7: Admin-only nav item**

In `src/components/AppShell.tsx`, load the profile and conditionally show the link:

```tsx
import { useEffect, useState } from 'react';
import { getProfile } from '../data/profile';
// inside AppShell():
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => { getProfile().then((p) => setIsAdmin(!!p?.isAdmin)); }, []);
// after the dictionary NavLink:
        {isAdmin && (
          <NavLink to="/admin/dictionary" className={NAV_ITEM_CLASSES}>
            <ClipboardCheck className="size-4" />
            {t('nav.dictionaryAdmin')}
          </NavLink>
        )}
```

Add `ClipboardCheck` to the lucide import.

- [ ] **Step 8: Run tests + build**

Run: `npm test -- AdminDictionaryPage` then `npm run build`
Expected: PASS + clean build. (If `text-danger` is not a defined token, use `text-red-600`.)

- [ ] **Step 9: Commit**

```bash
git add src/pages/AdminDictionaryPage.tsx src/components/admin/EntryEditForm.tsx src/components/AdminRoute.tsx src/App.tsx src/components/AppShell.tsx src/locales
git commit -m "feat: reviewer console page with edit/flag/add + admin gating"
```

---

### Task 7: Owner review queue — approve/reject with diff

**Files:**
- Create: `src/components/admin/ReviewQueue.tsx`
- Modify: `src/pages/AdminDictionaryPage.tsx` (render queue when `canApprove`)
- Modify: `src/locales/*.json` (add `admin.queue`, `admin.approve`, `admin.reject`, `admin.noPending`)
- Test: `src/components/admin/ReviewQueue.test.tsx`

**Interfaces:**
- Consumes: `fetchPendingEdits`, `decideEdit`, `AdminEntry[]` (to show the current value against a proposed one).
- Produces: `ReviewQueue` (props: `entries: AdminEntry[]; onDecided(): void`).

- [ ] **Step 1: Add i18n keys**

Add to each locale's `admin` block: `"queue": "Pending edits"`, `"approve": "Approve"`, `"reject": "Reject"`, `"noPending": "Nothing waiting for review."`, `"changeCreate": "New word"`, `"changeDelete": "Delete"`, `"changeUpdate": "Edit"`.

- [ ] **Step 2: Write the failing test**

Create `src/components/admin/ReviewQueue.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../../lib/i18n';
import type { AdminEntry, EntryEdit } from '../../lib/types';

const edits: EntryEdit[] = [{
  id: 'ed1', entryId: 'a', changeType: 'update', status: 'pending', editorNote: 'fix nikud',
  createdAt: '2026-07-18T00:00:00Z',
  payload: { id: 'a', hebrew: 'חום', hebrew_nikud: 'חֹם', part_of_speech: 'noun', level: 2,
    gender: 'ז', plural: null, root: null, everyday_synonym: null, translations: { en: 'fever' },
    notes: null, category: null },
}];
const decideEdit = vi.fn(async () => {});
vi.mock('../../data/reviewConsole', () => ({
  fetchPendingEdits: vi.fn(async () => edits), decideEdit,
}));
import { ReviewQueue } from './ReviewQueue';

const entries: AdminEntry[] = [{
  id: 'a', hebrew: 'חום', hebrewNikud: 'חוֹם', partOfSpeech: 'noun', level: 2, gender: 'ז',
  plural: null, root: null, everydaySynonym: null, translations: { en: 'fever' }, notes: null,
  category: null, reviewState: 'edit_pending', reviewPriority: 0, isDeprecated: false,
}];

describe('ReviewQueue', () => {
  beforeEach(() => vi.clearAllMocks());
  it('shows a pending edit and its note', async () => {
    render(<ReviewQueue entries={entries} onDecided={() => {}} />);
    expect(await screen.findByText(/fix nikud/)).toBeTruthy();
  });
  it('approves an edit', async () => {
    render(<ReviewQueue entries={entries} onDecided={() => {}} />);
    await screen.findByText(/fix nikud/);
    await userEvent.click(screen.getByRole('button', { name: /approve/i }));
    expect(decideEdit).toHaveBeenCalledWith('ed1', 'approved');
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npm test -- ReviewQueue`
Expected: FAIL — `ReviewQueue` not defined.

- [ ] **Step 4: Implement the queue**

Create `src/components/admin/ReviewQueue.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchPendingEdits, decideEdit } from '../../data/reviewConsole';
import type { AdminEntry, EntryEdit } from '../../lib/types';

interface Props { entries: AdminEntry[]; onDecided: () => void; }

const DIFF_FIELDS: Array<[string, keyof EntryEdit['payload']]> = [
  ['hebrew', 'hebrew'], ['nikud', 'hebrew_nikud'], ['pos', 'part_of_speech'],
  ['level', 'level'], ['gender', 'gender'], ['plural', 'plural'], ['root', 'root'],
  ['synonym', 'everyday_synonym'], ['notes', 'notes'],
];

export function ReviewQueue({ entries, onDecided }: Props) {
  const { t } = useTranslation();
  const [edits, setEdits] = useState<EntryEdit[]>([]);
  const byId = new Map(entries.map((e) => [e.id, e]));

  const reload = () => fetchPendingEdits().then(setEdits);
  useEffect(() => { reload(); }, []);

  const decide = async (id: string, d: 'approved' | 'rejected') => {
    await decideEdit(id, d); await reload(); onDecided();
  };
  const currentValue = (edit: EntryEdit, key: string): string => {
    const e = edit.entryId ? byId.get(edit.entryId) : undefined;
    if (!e) return '—';
    const map: Record<string, unknown> = {
      hebrew: e.hebrew, hebrew_nikud: e.hebrewNikud, part_of_speech: e.partOfSpeech, level: e.level,
      gender: e.gender, plural: e.plural, root: e.root, everyday_synonym: e.everydaySynonym, notes: e.notes,
    };
    return String(map[key] ?? '—');
  };

  const label = (c: EntryEdit['changeType']) =>
    c === 'create' ? t('admin.changeCreate') : c === 'delete' ? t('admin.changeDelete') : t('admin.changeUpdate');

  return (
    <div className="rounded-md border border-line p-3">
      <h2 className="text-sm font-bold text-ink">{t('admin.queue')}</h2>
      {edits.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">{t('admin.noPending')}</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {edits.map((edit) => (
            <li key={edit.id} className="rounded-md bg-primary-tint p-2 text-sm">
              <div className="font-semibold">{label(edit.changeType)} · {edit.payload.hebrew || edit.entryId}</div>
              {edit.editorNote && <div className="text-ink-muted">“{edit.editorNote}”</div>}
              {edit.changeType === 'update' && (
                <table className="mt-1 text-xs">
                  <tbody>
                    {DIFF_FIELDS.map(([lbl, key]) => {
                      const proposed = String(edit.payload[key] ?? '—');
                      const before = currentValue(edit, key as string);
                      if (proposed === before) return null;
                      return (
                        <tr key={key as string}>
                          <td className="pe-2 text-ink-muted">{lbl}</td>
                          <td className="pe-2 line-through">{before}</td>
                          <td className="font-semibold">{proposed}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              <div className="mt-2 flex gap-2">
                <button className="rounded-md bg-primary px-2 py-1 text-white"
                  onClick={() => decide(edit.id, 'approved')}>{t('admin.approve')}</button>
                <button className="rounded-md border border-line px-2 py-1"
                  onClick={() => decide(edit.id, 'rejected')}>{t('admin.reject')}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Render the queue for approvers**

In `src/pages/AdminDictionaryPage.tsx`: import `ReviewQueue` and `getProfile`; add `const [canApprove, setCanApprove] = useState(false);` and in the existing effect chain `getProfile().then((p) => setCanApprove(!!p?.canApprove));`. Render above the list:

```tsx
{canApprove && <div className="mt-4"><ReviewQueue entries={entries} onDecided={reload} /></div>}
```

- [ ] **Step 6: Run tests + build**

Run: `npm test -- ReviewQueue AdminDictionaryPage` then `npm run build`
Expected: PASS + clean build.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/ReviewQueue.tsx src/components/admin/ReviewQueue.test.tsx src/pages/AdminDictionaryPage.tsx src/locales
git commit -m "feat: owner review queue with field diff + approve/reject"
```

---

### Task 8: `export:content` script + round-trip test + import guard

**Files:**
- Create: `scripts/export-content.ts`
- Create: `scripts/export-content.test.ts`
- Modify: `scripts/import-content.ts` (add seed-only warning)
- Modify: `package.json` (add `export:content` script)

**Interfaces:**
- Consumes: `validateDictionary` from `import-content.ts` (round-trip target); `DictEntry` type.
- Produces: `serializeDictionary(rows: DictEntry[]): string` — the inverse of `validateDictionary`.

- [ ] **Step 1: Write the failing round-trip test**

Create `scripts/export-content.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { serializeDictionary } from './export-content';
import { validateDictionary } from './import-content';

describe('serializeDictionary', () => {
  it('is the inverse of validateDictionary (round-trip identity)', () => {
    const rows = [
      { id: 'a', hebrew: 'חום', hebrew_nikud: 'חוֹם', part_of_speech: 'noun' as const, level: 2,
        gender: 'ז' as const, plural: null, root: null, everyday_synonym: null,
        en: 'fever', ar: null, ru: null, fr: null, notes: null, category: null },
      { id: 'b', hebrew: 'ספסיס', hebrew_nikud: 'סֶפְּסִיס', part_of_speech: 'noun' as const, level: 2,
        gender: 'ז' as const, plural: null, root: null, everyday_synonym: 'זיהום בדם',
        en: 'sepsis', ar: null, ru: null, fr: null, notes: 'loanword', category: 'medical_loanword' as const },
    ];
    const tsv = serializeDictionary(rows);
    expect(validateDictionary(tsv, 'roundtrip')).toEqual(rows);
  });
  it('emits the fixed 15-column header', () => {
    expect(serializeDictionary([]).trim()).toBe(
      'id\thebrew\thebrew_nikud\tpart_of_speech\tlevel\tgender\tplural\troot\teveryday_synonym\ten\tar\tru\tfr\tnotes\tcategory');
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- export-content`
Expected: FAIL — `serializeDictionary` not exported.

- [ ] **Step 3: Implement the export script**

Create `scripts/export-content.ts`:

```ts
import { writeFileSync } from 'node:fs';
import type { DictEntry } from './import-content';

const COLUMNS = ['id', 'hebrew', 'hebrew_nikud', 'part_of_speech', 'level', 'gender', 'plural',
  'root', 'everyday_synonym', 'en', 'ar', 'ru', 'fr', 'notes', 'category'] as const;

const cell = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

export function serializeDictionary(rows: DictEntry[]): string {
  const lines = [COLUMNS.join('\t')];
  for (const r of rows) {
    lines.push(COLUMNS.map((c) => cell((r as Record<string, unknown>)[c])).join('\t'));
  }
  return lines.join('\n') + '\n';
}

type DbRow = {
  id: string; hebrew: string; hebrew_nikud: string; part_of_speech: DictEntry['part_of_speech'];
  level: number; gender: 'ז' | 'נ' | null; plural: string | null; root: string | null;
  everyday_synonym: string | null; translations: { en: string; ar?: string | null; ru?: string | null; fr?: string | null };
  notes: string | null; category: 'medical_loanword' | null;
};

function toDictEntry(r: DbRow): DictEntry {
  return {
    id: r.id, hebrew: r.hebrew, hebrew_nikud: r.hebrew_nikud, part_of_speech: r.part_of_speech,
    level: r.level, gender: r.gender, plural: r.plural, root: r.root, everyday_synonym: r.everyday_synonym,
    en: r.translations.en, ar: r.translations.ar ?? null, ru: r.translations.ru ?? null,
    fr: r.translations.fr ?? null, notes: r.notes, category: r.category,
  };
}

async function main() {
  const { config } = await import('dotenv');
  config({ path: '.env.content' });
  const { default: postgres } = await import('postgres');
  const sql = postgres(process.env.DATABASE_URL!);
  const dbRows = await sql<DbRow[]>`
    select id, hebrew, hebrew_nikud, part_of_speech, level, gender, plural, root,
           everyday_synonym, translations, notes, category
    from dictionary_entries where is_deprecated = false order by id`;
  const rows = dbRows.map(toDictEntry);
  writeFileSync('content/dictionary.tsv', serializeDictionary(rows), 'utf8');
  console.log(`content/dictionary.tsv: ${rows.length} rows exported`);
  await sql.end();
}

const isDirectRun = process.argv[1]?.endsWith('export-content.ts');
if (isDirectRun) {
  main().catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- export-content`
Expected: PASS.

- [ ] **Step 5: Add the npm script + import guard**

In `package.json` `scripts`, add: `"export:content": "tsx scripts/export-content.ts",`.

In `scripts/import-content.ts`, at the top of `main()` (before loading content), add:

```ts
  console.warn('⚠  import:content OVERWRITES dictionary_entries from the TSV (seed/bootstrap only).');
  console.warn('   The DB is the source of truth — run `npm run export:content` to back it up first.');
```

- [ ] **Step 6: Run the full suite + build**

Run: `npm test` then `npm run build`
Expected: PASS + clean build.

- [ ] **Step 7: Commit**

```bash
git add scripts/export-content.ts scripts/export-content.test.ts scripts/import-content.ts package.json
git commit -m "feat: export:content (DB → dictionary.tsv) + import seed-only guard"
```

---

### Task 9: RLS verification + e2e coverage

**Files:**
- Modify: `scripts/verify-rls.ts`
- Create: `e2e/dictionary.spec.ts`

**Interfaces:**
- Consumes: the deployed migration (Tasks 1–2), the running app (dev server) for e2e.

- [ ] **Step 1: Extend the RLS checks**

In `scripts/verify-rls.ts`, before the cleanup block, add checks that use the existing `admin` (service-role) and signed-in `user` (non-admin) clients:

```ts
  // deprecated rows are hidden from non-admin learners
  await admin.from('dictionary_entries')
    .update({ is_deprecated: true }).eq('id', sampleEntryId!);
  const { data: depRows } = await user.from('dictionary_entries')
    .select('id').eq('id', sampleEntryId!);
  check('non-admin cannot read deprecated entries', (depRows ?? []).length === 0);
  await admin.from('dictionary_entries')
    .update({ is_deprecated: false }).eq('id', sampleEntryId!);

  // non-admin cannot insert an entry_edit
  const { error: editErr } = await user.from('entry_edits').insert({
    entry_id: sampleEntryId!, change_type: 'update', payload: {}, editor_id: userId!,
  });
  check('non-admin cannot stage an entry_edit', editErr !== null);

  // non-approver cannot run apply_entry_edit
  const { error: rpcErr } = await user.rpc('apply_entry_edit', {
    edit_id: '00000000-0000-0000-0000-000000000000', decision: 'approved',
  });
  check('non-approver cannot call apply_entry_edit', rpcErr !== null);

  // a reviewer (or any non-approver) cannot bypass moderation with a direct content update.
  // NOTE: this asserts the guard_entry_content trigger fires. `user` here is a plain
  // learner; to exercise the reviewer path, temporarily set is_admin=true on this test
  // user (admin client) so the update reaches the trigger rather than RLS.
  await admin.from('profiles').update({ is_admin: true }).eq('user_id', userId!);
  const { error: contentErr } = await user.from('dictionary_entries')
    .update({ hebrew: 'TAMPERED' }).eq('id', sampleEntryId!);
  const { data: afterEntry } = await admin.from('dictionary_entries')
    .select('hebrew').eq('id', sampleEntryId!).single();
  check('reviewer cannot directly edit content columns',
    contentErr !== null || afterEntry?.hebrew !== 'TAMPERED');
  await admin.from('profiles').update({ is_admin: false }).eq('user_id', userId!);
```

- [ ] **Step 2: Run the RLS checks**

Run: `npm run verify:rls`
Expected: `ALL RLS CHECKS PASSED` (requires `.env.local` + `.env.content` with service-role key and a deployed migration).

- [ ] **Step 3: Write the e2e spec**

Create `e2e/dictionary.spec.ts` following the existing `e2e/` patterns (reuse the auth/setup helper already used by other specs — inspect a sibling spec for the login fixture). Cover:

```ts
import { test, expect } from '@playwright/test';
// import { signInAsLearner } from './helpers'; // match the helper name used by sibling specs

test('learner can open the dictionary and search', async ({ page }) => {
  // await signInAsLearner(page);
  await page.goto('/dictionary');
  await expect(page.getByRole('searchbox')).toBeVisible();
  await page.getByRole('searchbox').fill('חום');
  await expect(page.getByText('חום')).toBeVisible();
});
```

Adapt the auth fixture to whatever the sibling specs use (check `e2e/*.spec.ts` for the shared login step); the reviewer-approve flow can be added once a seeded admin+approver test user exists.

- [ ] **Step 4: Run e2e**

Run: `npm run test:e2e -- dictionary`
Expected: PASS (dev server auto-starts per `playwright.config.ts`).

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-rls.ts e2e/dictionary.spec.ts
git commit -m "test: RLS + e2e coverage for dictionary tab and reviewer console"
```

---

## Notes for the implementer

- **Manual verification of the full moderation loop** (after Task 7, against a real DB): as the reviewer, edit a word → it appears in the queue; as the owner, approve → the live entry changes and the learner Dictionary reflects it; flag-delete → approve → the word disappears for the learner. This exercises `apply_entry_edit`'s three branches end-to-end.
- **After a real review session**, run `npm run export:content` and commit the regenerated `content/dictionary.tsv` so git holds the backup.
- If any Tailwind token used here (`border-line`, `text-ink-muted`, `bg-primary-tint`, `text-danger`) is not defined in this project's theme, substitute the nearest existing token — grep an existing component (`Card.tsx`, `HomePage.tsx`) for the real names.
