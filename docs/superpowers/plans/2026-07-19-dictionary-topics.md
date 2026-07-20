# Dictionary Topics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tag every dictionary word with one clinical subject and let learners browse by topic (a grid of topic cards → filtered word list), with reviewers confirming each word's topic directly in the existing console.

**Architecture:** A nullable `topic` column on `dictionary_entries` (controlled 19-slug vocabulary, CHECK-enforced). An owner-run AI pipeline proposes one topic per untagged word; reviewers confirm/correct it inline with a **direct write** (no `entry_edits` draft — `topic` is deliberately left out of the content-guard trigger, like `review_state`). The learner `/dictionary` becomes a topic-grid landing; `/dictionary/:topic` is the existing searchable list pre-filtered.

**Tech Stack:** React 19 + react-router 8, TypeScript, Tailwind, Supabase (Postgres + RLS), `postgres` (postgres.js) for scripts, raw `fetch` to the Anthropic Messages API (no SDK — mirrors `supabase/functions/drill/claude.ts`), Vitest, react-i18next, lucide-react.

## Global Constraints

- Next migration number is **0012**; file `supabase/migrations/0012_dictionary_topic.sql`.
- **Author-files-defer-apply:** do NOT apply migrations to any DB and do NOT run the pipeline against prod. `main` auto-deploys to Cloudflare — apply `0012` and run the pipeline at the finish-branch checkpoint, before merge. Only Vitest-testable work runs during implementation.
- Controlled vocabulary (19 slugs, exact): `anatomy, symptoms, cardiology, respiratory, gastro, neuro, msk, genitourinary, endocrine, dermatology, medications, procedures, lab_imaging, emergency, mental_health, obgyn, pediatrics, infectious, general`. The CHECK, `src/lib/topics.ts`, and the locale `topics.*` label maps must list the same 19 — change them together.
- `topic` is a **direct-write** field: it is NOT added to `guard_entry_content_update`'s blocked-column list (a new column is unguarded by default), so reviewers write it via the existing `admin_update_entries` policy with no draft/approval.
- Whole-table reads MUST use the `fetchAllRows` helper (`src/data/fetchAll.ts`) — PostgREST caps at 1000 rows.
- Hebrew renders via the `<He>` component (`src/components/He.tsx`), nikud-primary.
- UI copy goes through i18n; every new key in all 5 locales (`en, he, ar, ru, fr`).
- Tests: `npm test` (Vitest); build `npm run build` (tsc + vite); RLS `npm run verify:rls`.
- Commit after every task.

---

### Task 1: Migration — `topic` column

**Files:**
- Create: `supabase/migrations/0012_dictionary_topic.sql`

**Interfaces:**
- Produces (DB): `dictionary_entries.topic text` with a 19-value CHECK.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0012_dictionary_topic.sql`:

```sql
-- One clinical subject per word, for browse-by-topic. Nullable = untagged.
-- Controlled vocabulary; keep this CHECK, src/lib/topics.ts, and the locale
-- topics.* label maps in sync when the set changes.
-- topic is intentionally OMITTED from guard_entry_content_update's blocked-column
-- list (0010) so reviewers set it directly (no entry_edits draft), like review_state.
alter table public.dictionary_entries
  add column topic text check (topic in (
    'anatomy','symptoms','cardiology','respiratory','gastro','neuro','msk',
    'genitourinary','endocrine','dermatology','medications','procedures',
    'lab_imaging','emergency','mental_health','obgyn','pediatrics','infectious','general'));
```

- [ ] **Step 2: Sanity-check (no DB)**

Confirm the file has 19 slugs in the CHECK (matches the Global Constraints list exactly) and balanced parentheses. Do NOT apply.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0012_dictionary_topic.sql
git commit -m "feat(db): add topic column to dictionary_entries (19-slug vocab)"
```

---

### Task 2: Topic vocabulary, types, mappers, and `setTopic`

**Files:**
- Create: `src/lib/topics.ts`
- Create: `src/lib/topics.test.ts`
- Modify: `src/lib/types.ts` (add `topic` to `DictionaryEntry`)
- Modify: `src/data/entryMapper.ts` (map `topic`)
- Modify: `src/data/reviewConsole.ts` (add `setTopic`; `AdminEntryRow` gains `topic`)
- Modify: every test file that builds a `DictionaryEntry`/`AdminEntry` literal (add `topic: null`)
- Test: `src/data/reviewConsole.test.ts` (add a `setTopic` test)

**Interfaces:**
- Produces: `src/lib/topics.ts` exports `const TOPICS` (readonly 19-slug tuple), `type Topic = typeof TOPICS[number]`, and `isTopic(x: string): x is Topic`.
- Produces: `DictionaryEntry.topic: Topic | null` (and therefore `AdminEntry.topic`).
- Produces: `setTopic(entryId: string, topic: Topic | null): Promise<void>` in `reviewConsole.ts`.

- [ ] **Step 1: Write the failing test for the vocab guard**

Create `src/lib/topics.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TOPICS, isTopic } from './topics';

describe('topics vocabulary', () => {
  it('has exactly 19 unique slugs', () => {
    expect(TOPICS).toHaveLength(19);
    expect(new Set(TOPICS).size).toBe(19);
  });
  it('isTopic accepts a known slug and rejects others', () => {
    expect(isTopic('cardiology')).toBe(true);
    expect(isTopic('Cardiology')).toBe(false);
    expect(isTopic('not-a-topic')).toBe(false);
    expect(isTopic('')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- topics`
Expected: FAIL — `./topics` not found.

- [ ] **Step 3: Implement the vocabulary module**

Create `src/lib/topics.ts`:

```ts
// Controlled vocabulary for dictionary_entries.topic. Keep in sync with the DB CHECK
// (0012_dictionary_topic.sql) and the topics.* label maps in every locale file.
export const TOPICS = [
  'anatomy', 'symptoms', 'cardiology', 'respiratory', 'gastro', 'neuro', 'msk',
  'genitourinary', 'endocrine', 'dermatology', 'medications', 'procedures',
  'lab_imaging', 'emergency', 'mental_health', 'obgyn', 'pediatrics', 'infectious', 'general',
] as const;

export type Topic = typeof TOPICS[number];

export function isTopic(x: string): x is Topic {
  return (TOPICS as readonly string[]).includes(x);
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npm test -- topics`
Expected: PASS.

- [ ] **Step 5: Add `topic` to the entry type + mapper**

In `src/lib/types.ts`, add to the `DictionaryEntry` interface (after `category`):

```ts
  topic: import('./topics').Topic | null;
```

In `src/data/entryMapper.ts`: add `topic: DictionaryEntry['topic'];` to the `EntryRow` type, and `topic: r.topic ?? null,` to `mapEntryRow`'s return.

- [ ] **Step 6: Add `topic` to the admin row + `setTopic`**

In `src/data/reviewConsole.ts`: the `AdminEntryRow` type spreads `EntryRow`, so it already includes `topic`. Add the setter near `markReviewed` (import `Topic`):

```ts
import type { Topic } from '../lib/topics';
// ...
export async function setTopic(entryId: string, topic: Topic | null): Promise<void> {
  const { error } = await supabase.from('dictionary_entries')
    .update({ topic }).eq('id', entryId);
  if (error) throw error;
}
```

- [ ] **Step 7: Fix every `DictionaryEntry`/`AdminEntry` literal (tsc will list them)**

Run `npm run build` — tsc reports each literal now missing `topic`. Add `topic: null,` to each. Known sites: `src/pages/ReviewPage.test.tsx`, `src/pages/DictionaryPage.test.tsx`, `src/data/dictionary.test.ts`, `src/data/reviewConsole.test.ts`, `src/pages/AdminDictionaryPage.test.tsx`, `src/components/admin/ReviewQueue.test.tsx`, and any entry factory in `src/components/exercises/*.test.tsx`. Re-run `npm run build` until clean.

- [ ] **Step 8: Write the failing `setTopic` test**

Add to `src/data/reviewConsole.test.ts` (extend the existing `vi.mock('../lib/supabase', ...)` if present, or add one that captures the update). Minimal version using a captured update spy:

```ts
import { setTopic } from './reviewConsole';

describe('setTopic', () => {
  it('writes the topic directly to the entry row', async () => {
    const eq = vi.fn(async () => ({ error: null }));
    const update = vi.fn(() => ({ eq }));
    const { supabase } = await import('../lib/supabase');
    (supabase.from as unknown as ReturnType<typeof vi.fn>) = vi.fn(() => ({ update }));
    await setTopic('a', 'cardiology');
    expect(update).toHaveBeenCalledWith({ topic: 'cardiology' });
    expect(eq).toHaveBeenCalledWith('id', 'a');
  });
});
```

If the file's existing supabase mock shape differs, match it — the assertion that matters: `update` receives `{ topic: 'cardiology' }` and `eq('id','a')`.

- [ ] **Step 9: Run tests + build**

Run: `npm test` then `npm run build`
Expected: PASS + clean.

- [ ] **Step 10: Commit**

```bash
git add src/lib/topics.ts src/lib/topics.test.ts src/lib/types.ts src/data/entryMapper.ts src/data/reviewConsole.ts src/data/reviewConsole.test.ts src/pages src/components
git commit -m "feat: topic vocabulary, entry.topic field, and direct setTopic writer"
```

---

### Task 3: AI-suggest pipeline

**Files:**
- Create: `scripts/suggest-topics.ts`
- Create: `scripts/suggest-topics.test.ts`

**Interfaces:**
- Consumes: `TOPICS`/`isTopic` from `src/lib/topics.ts`.
- Produces: `parseTopicResponse(text: string): Topic | null` (pure) and a `main()` that reads untagged rows, classifies, and writes.

- [ ] **Step 1: Write the failing parser test**

Create `scripts/suggest-topics.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseTopicResponse } from './suggest-topics';

describe('parseTopicResponse', () => {
  it('accepts a bare valid slug', () => {
    expect(parseTopicResponse('cardiology')).toBe('cardiology');
  });
  it('trims and lowercases', () => {
    expect(parseTopicResponse('  Cardiology\n')).toBe('cardiology');
  });
  it('extracts the slug when the model adds a sentence', () => {
    expect(parseTopicResponse('The topic is respiratory.')).toBe('respiratory');
  });
  it('returns null for an unknown label (no fabrication)', () => {
    expect(parseTopicResponse('oncology')).toBeNull();
  });
  it('returns null when two different slugs appear (ambiguous)', () => {
    expect(parseTopicResponse('cardiology or respiratory')).toBeNull();
  });
  it('returns null for empty', () => {
    expect(parseTopicResponse('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npm test -- suggest-topics`
Expected: FAIL — `parseTopicResponse` not exported.

- [ ] **Step 3: Implement the script**

Create `scripts/suggest-topics.ts`:

```ts
import { TOPICS, isTopic, type Topic } from '../src/lib/topics';

// Extract exactly one known slug from the model's reply; null if none or ambiguous.
export function parseTopicResponse(text: string): Topic | null {
  const norm = text.trim().toLowerCase();
  if (norm === '') return null;
  if (isTopic(norm)) return norm;
  const found = TOPICS.filter((t) => new RegExp(`\\b${t}\\b`).test(norm));
  return found.length === 1 ? found[0] : null;
}

async function classify(hebrew: string, en: string, notes: string | null): Promise<Topic | null> {
  const list = TOPICS.join(', ');
  const prompt =
    `Classify this Hebrew medical term into exactly ONE topic from this fixed list:\n${list}\n\n` +
    `Term (Hebrew): ${hebrew}\nEnglish: ${en}\n${notes ? `Notes: ${notes}\n` : ''}` +
    `Reply with ONLY the single topic slug, nothing else.`;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}`);
  const json = await res.json();
  return parseTopicResponse(json.content?.[0]?.text ?? '');
}

async function main() {
  const { config } = await import('dotenv');
  config({ path: '.env.content' });
  const { default: postgres } = await import('postgres');
  const sql = postgres(process.env.DATABASE_URL!);

  const rows = await sql<{ id: string; hebrew: string; en: string; notes: string | null }[]>`
    select id, hebrew, translations->>'en' as en, notes
    from dictionary_entries
    where topic is null and is_deprecated = false
    order by id`;
  console.log(`classifying ${rows.length} untagged entries`);

  let tagged = 0, skipped = 0;
  for (const r of rows) {
    const topic = await classify(r.hebrew, r.en, r.notes);
    if (topic) {
      await sql`update dictionary_entries set topic = ${topic} where id = ${r.id}`;
      tagged++;
    } else {
      console.warn(`  no confident topic for ${r.id} (${r.hebrew}) — left null`);
      skipped++;
    }
  }
  console.log(`done: ${tagged} tagged, ${skipped} left null`);
  await sql.end();
}

const isDirectRun = process.argv[1]?.endsWith('suggest-topics.ts');
if (isDirectRun) {
  main().catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
}
```

Add to `package.json` scripts: `"suggest:topics": "tsx scripts/suggest-topics.ts",`.

- [ ] **Step 4: Run the parser test + build**

Run: `npm test -- suggest-topics` then `npm run build`
Expected: PASS + clean. (Do NOT run the script — it needs `ANTHROPIC_API_KEY` + prod DB; that's the owner checkpoint.)

- [ ] **Step 5: Commit**

```bash
git add scripts/suggest-topics.ts scripts/suggest-topics.test.ts package.json
git commit -m "feat: suggest-topics pipeline (Claude classifies untagged words into the vocab)"
```

---

### Task 4: Reviewer console — topic control + coverage

**Files:**
- Modify: `src/pages/AdminDictionaryPage.tsx` (topic select per row + coverage counter)
- Modify: `src/locales/{en,he,ar,ru,fr}.json` (add `topics.*` labels + `admin.topicCoverage`, `admin.untagged`)
- Test: `src/pages/AdminDictionaryPage.test.tsx`

**Interfaces:**
- Consumes: `setTopic` (Task 2), `TOPICS`/`Topic` (Task 2), `getProfile`.

- [ ] **Step 1: Add i18n keys**

In each locale add a `topics` block with all 19 slugs, and two admin keys. English (`src/locales/en.json`):

```json
  "topics": {
    "anatomy": "Anatomy", "symptoms": "Symptoms", "cardiology": "Cardiology",
    "respiratory": "Respiratory", "gastro": "Gastro / abdomen", "neuro": "Neurology",
    "msk": "Musculoskeletal", "genitourinary": "Genitourinary", "endocrine": "Endocrine / metabolic",
    "dermatology": "Dermatology", "medications": "Medications", "procedures": "Procedures & exams",
    "lab_imaging": "Lab & imaging", "emergency": "Emergency & trauma", "mental_health": "Mental health",
    "obgyn": "OB / GYN", "pediatrics": "Pediatrics", "infectious": "Infectious disease", "general": "General & admin"
  },
```

Add `"topicCoverage": "{{tagged}} / {{total}} tagged"` and `"untagged": "— untagged —"` to each locale's `admin` block. Translate `topics.*` and the two admin strings naturally in `he/ar/ru/fr` (Hebrew primary — e.g. `anatomy` "אנטומיה", `cardiology` "קרדיולוגיה", `respiratory` "מערכת הנשימה", `untagged` "— ללא נושא —"). Every locale must contain the identical `topics` key set (all 19) and both admin keys.

- [ ] **Step 2: Write the failing test**

Add to `src/pages/AdminDictionaryPage.test.tsx` — extend the `vi.mock('../data/reviewConsole', ...)` to spy `setTopic`, then:

```tsx
it('sets a topic directly from the row select', async () => {
  render(<MemoryRouter><AdminDictionaryPage /></MemoryRouter>);
  await screen.findByText(/תלונה|חום/);
  const select = screen.getByLabelText(/topic/i);
  await userEvent.selectOptions(select, 'cardiology');
  expect(setTopic).toHaveBeenCalledWith('a', 'cardiology');
});
```

(Add `setTopic: vi.fn()` to the mock and import it into the test scope; give the entry fixture `id: 'a'`.)

- [ ] **Step 3: Run it to confirm it fails**

Run: `npm test -- AdminDictionaryPage`
Expected: FAIL — no topic select.

- [ ] **Step 4: Implement the topic control + coverage**

In `src/pages/AdminDictionaryPage.tsx`: import `TOPICS` from `../lib/topics` and `setTopic` from `../data/reviewConsole`. In each entry row, add (with an accessible label):

```tsx
<label className="text-xs text-ink-muted">
  <span className="sr-only">topic</span>
  <select
    aria-label="topic"
    className="ms-2 rounded border border-border px-1 py-0.5 text-xs"
    value={e.topic ?? ''}
    onChange={async (ev) => {
      const v = ev.target.value;
      await setTopic(e.id, v === '' ? null : (v as typeof TOPICS[number]));
      await reload();
    }}
  >
    <option value="">{t('admin.untagged')}</option>
    {TOPICS.map((slug) => <option key={slug} value={slug}>{t(`topics.${slug}`)}</option>)}
  </select>
</label>
```

Add the coverage counter next to the existing review-progress line:

```tsx
<p className="text-sm text-ink-muted">
  {t('admin.topicCoverage', {
    tagged: entries.filter((e) => e.topic).length,
    total: entries.length,
  })}
</p>
```

- [ ] **Step 5: Run tests + build**

Run: `npm test -- AdminDictionaryPage` then `npm run build`
Expected: PASS + clean.

- [ ] **Step 6: Commit**

```bash
git add src/pages/AdminDictionaryPage.tsx src/pages/AdminDictionaryPage.test.tsx src/locales
git commit -m "feat: reviewer console topic select (direct write) + topic coverage counter"
```

---

### Task 5: Learner topic-grid landing + filtered topic page

**Files:**
- Create: `src/lib/topicIcons.tsx`
- Create: `src/pages/TopicPage.tsx`
- Create: `src/pages/TopicPage.test.tsx`
- Rewrite: `src/pages/DictionaryPage.tsx` (flat list → topic grid)
- Modify: `src/pages/DictionaryPage.test.tsx` (grid assertions)
- Modify: `src/App.tsx` (add `/dictionary/:topic` route)

**Interfaces:**
- Consumes: `fetchDictionary`, `filterEntries` (`src/data/dictionary.ts`), `TOPICS`/`Topic`/`isTopic` (Task 2), `<He>`.
- Produces: `DictionaryPage` (grid), `TopicPage` (filtered list at `/dictionary/:topic`), `topicIcon(slug)`.

- [ ] **Step 1: Icon map**

Create `src/lib/topicIcons.tsx`:

```tsx
import {
  HeartPulse, Wind, Brain, Bone, Pill, Stethoscope, FlaskConical, Ambulance,
  Baby, Bug, Activity, Tag, PersonStanding, Droplets, Thermometer, ShieldPlus,
  Microscope, Venus, ClipboardList, type LucideIcon,
} from 'lucide-react';
import type { Topic } from './topics';

const MAP: Record<Topic, LucideIcon> = {
  anatomy: PersonStanding, symptoms: Thermometer, cardiology: HeartPulse, respiratory: Wind,
  gastro: Activity, neuro: Brain, msk: Bone, genitourinary: Droplets, endocrine: ShieldPlus,
  dermatology: Droplets, medications: Pill, procedures: Stethoscope, lab_imaging: Microscope,
  emergency: Ambulance, mental_health: Brain, obgyn: Venus, pediatrics: Baby,
  infectious: Bug, general: ClipboardList,
};

export function topicIcon(slug: Topic): LucideIcon {
  return MAP[slug] ?? Tag;
}
```

(If any of these lucide names doesn't exist in `lucide-react@1.24.0`, substitute the nearest real icon — grep `node_modules/lucide-react` or an existing import; `FlaskConical`/`Microscope` etc. are interchangeable. The exact icons are refinable.)

- [ ] **Step 2: Write the failing TopicPage test**

Create `src/pages/TopicPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import '../lib/i18n';
import type { DictionaryEntry } from '../lib/types';

function e(id: string, hebrew: string, en: string, topic: DictionaryEntry['topic']): DictionaryEntry {
  return { id, hebrew, hebrewNikud: hebrew, partOfSpeech: 'noun', level: 1, gender: null,
    plural: null, root: null, everydaySynonym: null, translations: { en }, notes: null, category: null, topic };
}
const entries = [e('a', 'לב', 'heart', 'cardiology'), e('b', 'חום', 'fever', 'symptoms')];
vi.mock('../data/dictionary', () => ({
  fetchDictionary: vi.fn(async () => entries),
  filterEntries: (list: DictionaryEntry[], q: string) =>
    q.trim() === '' ? list : list.filter((x) => (x.hebrew + ' ' + x.translations.en).toLowerCase().includes(q.toLowerCase())),
}));
import { TopicPage } from './TopicPage';

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/dictionary/:topic" element={<TopicPage />} /></Routes>
  </MemoryRouter>);
}

describe('TopicPage', () => {
  beforeEach(() => vi.clearAllMocks());
  it('shows only the requested topic', async () => {
    renderAt('/dictionary/cardiology');
    expect(await screen.findByText('לב')).toBeTruthy();
    expect(screen.queryByText('חום')).toBeNull();
  });
  it('all shows every word', async () => {
    renderAt('/dictionary/all');
    expect(await screen.findByText('לב')).toBeTruthy();
    expect(screen.getByText('חום')).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npm test -- TopicPage`
Expected: FAIL — `TopicPage` not defined.

- [ ] **Step 4: Implement TopicPage** (the old flat-list rendering, filtered by the `:topic` param)

Create `src/pages/TopicPage.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { fetchDictionary, filterEntries } from '../data/dictionary';
import { PageHeader } from '../components/ui/PageHeader';
import { He } from '../components/He';
import { isTopic } from '../lib/topics';
import type { DictionaryEntry } from '../lib/types';

export function TopicPage() {
  const { t } = useTranslation();
  const { topic } = useParams();
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDictionary().then((all) => {
      const scoped = topic === 'all' ? all
        : topic && isTopic(topic) ? all.filter((e) => e.topic === topic)
        : [];
      setEntries(scoped); setLoading(false);
    });
  }, [topic]);

  const shown = useMemo(() => filterEntries(entries, query), [entries, query]);
  const title = topic === 'all' ? t('dictionary.allWords')
    : topic && isTopic(topic) ? t(`topics.${topic}`) : t('dictionary.title');

  return (
    <div className="mx-auto max-w-2xl p-4">
      <PageHeader title={title} />
      <Link to="/dictionary" className="mt-2 inline-block text-sm text-primary">← {t('dictionary.title')}</Link>
      <input type="search" role="searchbox" value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder={t('dictionary.searchPlaceholder')}
        className="mt-3 w-full rounded-md border border-border px-3 py-2 text-sm" />
      <p className="mt-2 text-xs text-ink-muted">{t('dictionary.count', { count: shown.length })}</p>
      {loading ? <p className="mt-6 text-ink-muted">{t('common.loading')}</p>
        : shown.length === 0 ? <p className="mt-6 text-ink-muted">{t('dictionary.empty')}</p>
        : (
        <ul className="mt-4 divide-y divide-border">
          {shown.map((e) => (
            <li key={e.id} className="py-3">
              <div className="flex items-baseline justify-between gap-3">
                <He className="text-lg font-bold text-ink">{e.hebrewNikud}</He>
                <span className="text-xs text-ink-muted">{e.partOfSpeech} · L{e.level}</span>
              </div>
              {e.hebrew && e.hebrew !== e.hebrewNikud && <He className="block text-sm text-ink-subtle">{e.hebrew}</He>}
              <div className="text-sm text-ink-muted">{e.translations.en}</div>
              {e.everydaySynonym && <div className="text-xs text-ink-muted">≈ {e.everydaySynonym}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run TopicPage test**

Run: `npm test -- TopicPage`
Expected: PASS.

- [ ] **Step 6: Write the failing grid test**

Replace the body of `src/pages/DictionaryPage.test.tsx` so it asserts the grid (keep the `vi.mock('../data/dictionary', ...)` factory, give fixtures a `topic`):

```tsx
it('renders a card per non-empty topic with counts and links to the topic', async () => {
  render(<MemoryRouter><DictionaryPage /></MemoryRouter>);
  const card = await screen.findByRole('link', { name: /Cardiology/i });
  expect(card.getAttribute('href')).toBe('/dictionary/cardiology');
});
it('always offers an all-words card', async () => {
  render(<MemoryRouter><DictionaryPage /></MemoryRouter>);
  const all = await screen.findByRole('link', { name: /all words/i });
  expect(all.getAttribute('href')).toBe('/dictionary/all');
});
```

(Fixtures: at least one entry with `topic: 'cardiology'`. Mock `fetchDictionary` to return them; `filterEntries` no longer needed by this page but keep the mock export to avoid import errors.)

- [ ] **Step 7: Run it to confirm it fails**

Run: `npm test -- DictionaryPage`
Expected: FAIL — no topic cards / links.

- [ ] **Step 8: Rewrite DictionaryPage as the grid**

Replace `src/pages/DictionaryPage.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { fetchDictionary } from '../data/dictionary';
import { PageHeader } from '../components/ui/PageHeader';
import { TOPICS, type Topic } from '../lib/topics';
import { topicIcon } from '../lib/topicIcons';
import type { DictionaryEntry } from '../lib/types';

export function DictionaryPage() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDictionary().then((e) => { setEntries(e); setLoading(false); });
  }, []);

  const counts = useMemo(() => {
    const c = {} as Record<Topic, number>;
    for (const e of entries) if (e.topic) c[e.topic] = (c[e.topic] ?? 0) + 1;
    return c;
  }, [entries]);

  return (
    <div className="mx-auto max-w-2xl p-4">
      <PageHeader title={t('dictionary.title')} />
      {loading ? <p className="mt-6 text-ink-muted">{t('common.loading')}</p> : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {TOPICS.filter((slug) => (counts[slug] ?? 0) > 0).map((slug) => {
            const Icon = topicIcon(slug);
            return (
              <Link key={slug} to={`/dictionary/${slug}`}
                className="flex flex-col items-center gap-2 rounded-xl border border-border p-4 text-center hover:bg-primary-tint">
                <Icon className="size-6 text-primary" />
                <span className="text-sm font-semibold text-ink">{t(`topics.${slug}`)}</span>
                <span className="text-xs text-ink-muted">{t('dictionary.count', { count: counts[slug] ?? 0 })}</span>
              </Link>
            );
          })}
          <Link to="/dictionary/all"
            className="flex flex-col items-center gap-2 rounded-xl border border-border p-4 text-center hover:bg-primary-tint">
            <span className="text-sm font-semibold text-ink">{t('dictionary.allWords')}</span>
            <span className="text-xs text-ink-muted">{t('dictionary.count', { count: entries.length })}</span>
          </Link>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 9: Add the route + i18n keys**

In `src/App.tsx`, add inside the `AppShell` group (after the `/dictionary` route):

```tsx
import { TopicPage } from './pages/TopicPage';
// ...
        <Route path="/dictionary/:topic" element={<TopicPage />} />
```

Add to each locale's `dictionary` block: `"allWords": "All words"` (he: "כל המילים", natural ar/ru/fr).

- [ ] **Step 10: Run tests + build**

Run: `npm test -- DictionaryPage TopicPage` then `npm test` then `npm run build`
Expected: PASS (full suite green) + clean build.

- [ ] **Step 11: Commit**

```bash
git add src/lib/topicIcons.tsx src/pages/TopicPage.tsx src/pages/TopicPage.test.tsx src/pages/DictionaryPage.tsx src/pages/DictionaryPage.test.tsx src/App.tsx src/locales
git commit -m "feat: learner topic-grid landing + /dictionary/:topic filtered list"
```

---

### Task 6: RLS verification for direct topic writes

**Files:**
- Modify: `scripts/verify-rls.ts`

**Interfaces:**
- Consumes: the deployed migration (owner checkpoint).

- [ ] **Step 1: Add the checks**

In `scripts/verify-rls.ts`, before the cleanup block, add (reuses the existing `admin`/`user`/`userId`/`sampleEntryId`/`check` from the file; the reviewer path temporarily flips `is_admin` as the existing content-guard check does — place AFTER that check so ordering is clean, and reset after):

```ts
  // a reviewer (is_admin) may set topic directly — it is NOT a moderated content column
  await admin.from('profiles').update({ is_admin: true }).eq('user_id', userId!);
  const { error: topicErr } = await user.from('dictionary_entries')
    .update({ topic: 'cardiology' }).eq('id', sampleEntryId!);
  const { data: afterTopic } = await admin.from('dictionary_entries')
    .select('topic').eq('id', sampleEntryId!).single();
  check('reviewer can set topic directly', topicErr === null && afterTopic?.topic === 'cardiology');
  // but still cannot change a content column in the same breath
  const { error: stillBlocked } = await user.from('dictionary_entries')
    .update({ hebrew: 'NOPE' }).eq('id', sampleEntryId!);
  const { data: afterHeb } = await admin.from('dictionary_entries')
    .select('hebrew').eq('id', sampleEntryId!).single();
  check('reviewer still cannot edit content columns', stillBlocked !== null || afterHeb?.hebrew !== 'NOPE');
  await admin.from('dictionary_entries').update({ topic: null }).eq('id', sampleEntryId!);
  await admin.from('profiles').update({ is_admin: false }).eq('user_id', userId!);
```

- [ ] **Step 2: Do NOT run it (needs the deployed migration)**

Confirm it type-checks: `npm run build`. Execution is the owner checkpoint.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-rls.ts
git commit -m "test: verify reviewer can set topic directly but not content columns"
```

---

## Owner checkpoint (post-merge, before/right-after deploy)

`main` auto-deploys; the grid tolerates an all-`null` topic column (topics with 0 count are hidden, "All words" still works), so deploy order is not fatal — but run these to light it up:

1. Apply `supabase/migrations/0012_dictionary_topic.sql` to prod (dashboard SQL or the `.env.content` connection).
2. `npm run verify:rls` → expect ALL PASSED incl. the two new topic checks.
3. `ANTHROPIC_API_KEY=… npm run suggest:topics` → classifies all ~1187 untagged words (logs tagged/null counts). Costs a Haiku call per word — set a spend cap.
4. Reviewers confirm/correct topics in the console; coverage counter climbs.
5. Optional: `npm run export:content` backup after tagging (note: `topic` is an ops column, NOT in the TSV — coverage lives only in the DB, which is fine).

## Notes for the implementer

- The `DictionaryEntry.topic` addition is a required field; `tsc` is your checklist for every literal that needs `topic: null` (Task 2 Step 7).
- Reviewer topic writes are direct (no draft) by design — do not route them through `entry_edits`.
- Do not run the pipeline or apply migrations during implementation (author-files-defer-apply).
