# MedLingo Pilot — Phase 1 (Core Loop) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the MedLingo pilot core loop — accounts + onboarding, one learnable unit, FSRS-scheduled flashcard/cloze reviews, streak/progress, metrics views — continuously deployed to a public Cloudflare Pages URL.

**Architecture:** React SPA (Vite 8 + React 19 + TS + Tailwind v4) on Cloudflare Pages; Supabase (eu-central-1) Postgres + RLS + magic-link Auth accessed directly via supabase-js; FSRS runs client-side (`ts-fsrs`, fuzz off) with append-only `review_logs` as source of truth; content imported from git-versioned TSVs by a local script over a direct Postgres connection in one transaction. Spec: `docs/superpowers/specs/2026-07-10-medlingo-pilot-design.md`.

**Tech Stack:** Vite 8, React 19, TypeScript (strict), Tailwind CSS v4 (`@tailwindcss/vite`), react-router v7 (library mode), @supabase/supabase-js v2, i18next 26 + react-i18next 17, ts-fsrs (exact-pinned), zod, `postgres` (porsager, import script only), vite-plugin-pwa, Vitest + Testing Library + jsdom, Playwright.

## Global Constraints

- Node ≥ 20. TypeScript `strict: true` everywhere.
- FSRS: `enable_fuzz: false`, `request_retention: 0.9`, ts-fsrs pinned exactly (`npm i -E ts-fsrs`).
- Every user-facing string through i18next `t()`; every Hebrew run inside `<He>`; CSS logical properties only (stylelint `stylelint-use-logical` at error severity); Tailwind logical utilities (`ps-`/`pe-`/`ms-`/`me-`/`text-start`).
- Mobile-first: every screen usable at 375px width.
- Supabase region `eu-central-1`. Client env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (`.env.local`, gitignored, mirrored in Cloudflare Pages dashboard). Import/metrics env: `DATABASE_URL` in `.env.content` (gitignored, never shipped). E2E env: `SUPABASE_SERVICE_ROLE_KEY` (local only).
- Grading derivation: wrong → `again`; correct → `good`; correct and fast → `easy` (recognition ≤ 4000ms, cloze/recall ≤ 8000ms). `hard` is never produced.
- Form selection by FSRS stability: `< 3` days → recognition, `3–10` → cloze, `> 10` → recall. All pilot review input is tap-based.
- Commit after every green test cycle. Conventional-commit messages, each ending with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

### data-testid registry (tasks must match exactly)

| testid | Component (Task) |
|---|---|
| `exercise-option-<n>` (0-3) | Recognition options (10) |
| `exercise-tile-<n>` (0-3) | Cloze/Recall word-bank tiles (10) |
| `exercise-feedback`, `exercise-continue` | feedback panel + button (10) |
| `review-summary`, `review-caught-up`, `review-extra-practice` | ReviewPage (11) |
| `unit-start`, `unit-gloss`, `unit-vocab-continue`, `unit-complete` | UnitPage (12) |
| `home-unit-card`, `home-review-card`, `home-streak` | HomePage (13) |
| `auth-email`, `auth-submit`, `onboarding-name`, `onboarding-submit` | Auth/Onboarding (6) |

### Interface source of truth

Domain types, function signatures, DB schema, RLS policies, TSV formats, and view SQL are defined once in this plan's tasks and mirror the spec §4. When a later task's Interfaces block names a function, its signature is the one from the task that Produces it.

---

### Task 1: Project scaffold & tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.stylelintrc.json`, `.gitignore`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/test/setup.ts`
- Test: `src/App.test.tsx`

**Interfaces:**
- Produces: running Vite app with `npm run dev|build|test|lint:css`; `App` renders an `<h1>` "MedLingo" (Task 5 converts it to `t('app.title')`); `BrowserRouter` wraps `App` in `main.tsx`.

- [ ] **Step 1: Create package.json and install dependencies**

Create `package.json`:

```json
{
  "name": "medlingo",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint:css": "stylelint \"src/**/*.css\""
  }
}
```

Run:
```bash
cd /Users/ori/Desktop/Medlingo
npm i react react-dom react-router
npm i -D vite @vitejs/plugin-react typescript @types/react @types/react-dom \
  tailwindcss @tailwindcss/vite \
  vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom \
  stylelint stylelint-use-logical
```
Expected: both installs end with `added N packages` and no `ERESOLVE` errors.

- [ ] **Step 2: Create config files**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "types": ["vite/client", "@testing-library/jest-dom"]
  },
  "include": ["src", "scripts", "e2e"]
}
```

`vite.config.ts`:
```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});
```

`.stylelintrc.json`:
```json
{
  "plugins": ["stylelint-use-logical"],
  "rules": { "csstools/use-logical": "always" }
}
```

`.gitignore`:
```
node_modules
dist
.env
.env.*
e2e/.auth
test-results
playwright-report
```

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MedLingo</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Write the failing smoke test**

`src/App.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import App from './App';

describe('App', () => {
  it('renders the MedLingo heading', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'MedLingo' })).toBeInTheDocument();
  });
});
```

`src/test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

Run: `npm test`
Expected: FAIL — `Cannot find module './App'` (or similar resolution error).

- [ ] **Step 4: Write the minimal app**

`src/index.css`:
```css
@import "tailwindcss";
```

`src/App.tsx`:
```tsx
import { Routes, Route } from 'react-router';

function Landing() {
  return <h1 className="p-4 text-2xl font-semibold">MedLingo</h1>;
}

export default function App() {
  return (
    <Routes>
      <Route path="*" element={<Landing />} />
    </Routes>
  );
}
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
```

- [ ] **Step 5: Verify tests, build, and lint pass**

Run: `npm test && npm run build && npm run lint:css`
Expected: test PASS (1 passed), build emits `dist/`, stylelint exits 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: scaffold Vite + React + Tailwind app with test tooling

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Continuous deployment to Cloudflare Pages

**Files:**
- Create: `public/_redirects`

**Interfaces:**
- Produces: public `https://medlingo.pages.dev` URL auto-deploying from `main`; the partner-facing demo URL.

- [ ] **Step 1: Add the SPA fallback**

`public/_redirects`:
```
/*    /index.html   200
```

Run: `npm run build && ls dist/_redirects`
Expected: `dist/_redirects` exists (Vite copies `public/`).

- [ ] **Step 2: First deploy via wrangler**

```bash
npx wrangler login          # opens browser; approve
npx wrangler pages project create medlingo --production-branch main
npx wrangler pages deploy dist --project-name medlingo
```
Expected: final line prints a `https://medlingo.pages.dev` (or hash-prefixed) URL.

- [ ] **Step 3: [MANUAL — owner] Connect Git integration for continuous deploys**

1. dash.cloudflare.com → Workers & Pages → `medlingo` → Settings → Builds & deployments → "Connect to Git".
2. Select `orilencovsky/Medlingo`, production branch `main`.
3. Build command: `npm run build` — Build output directory: `dist`.
4. (After Task 3 exists) Settings → Environment variables → add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` for Production and Preview.

- [ ] **Step 4: Verify the public URL**

Run: `curl -s https://medlingo.pages.dev | grep -o "<title>MedLingo</title>"`
Expected: `<title>MedLingo</title>`

- [ ] **Step 5: Commit**

```bash
git add public/_redirects
git commit -m "feat: add SPA fallback and Cloudflare Pages deployment

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git push origin main
```
Expected: after Git integration is connected, the push triggers a Pages build (visible in the dashboard).

---

### Task 3: Supabase project & schema migration

**Files:**
- Create: `supabase/config.toml` (via CLI), `supabase/migrations/0001_schema.sql`, `.env.local`, `.env.content`

**Interfaces:**
- Produces: 8 tables exactly as below; env files with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. All later DB tasks depend on these names.

- [ ] **Step 1: [MANUAL — owner] Create the Supabase project**

1. supabase.com/dashboard → New project → org: personal → name `medlingo` → region **EU Central (Frankfurt)** → generate DB password and save it.
2. Project Settings → Data API: copy Project URL and `anon` key.
3. Project Settings → API keys: copy `service_role` key.
4. Project Settings → Database → Connection string (URI, direct): copy as `DATABASE_URL` (fill in the DB password).
5. Authentication → URL Configuration: Site URL = `https://medlingo.pages.dev`; Additional Redirect URLs: `http://localhost:5173`.

- [ ] **Step 2: Create env files (gitignored)**

`.env.local`:
```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

`.env.content`:
```
DATABASE_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
```

Run: `git status --short | grep .env`
Expected: no output (both ignored).

- [ ] **Step 3: Init and link the Supabase CLI**

```bash
npx supabase init
npx supabase login
npx supabase link --project-ref <project-ref>
```
Expected: `Finished supabase link.`

- [ ] **Step 4: Write the schema migration**

`supabase/migrations/0001_schema.sql`:
```sql
create table public.dictionary_entries (
  id text primary key,
  hebrew text not null,
  hebrew_nikud text not null,
  part_of_speech text not null check (part_of_speech in ('noun','verb','adjective','phrase','abbreviation')),
  level int not null check (level between 1 and 3),
  gender text check (gender in ('ז','נ')),
  plural text,
  root text,
  everyday_synonym text,
  translations jsonb not null check (translations ? 'en'),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.units (
  slug text primary key,
  level int not null check (level between 1 and 3),
  display_order int not null,
  status text not null default 'draft' check (status in ('draft','published')),
  title jsonb not null check (title ? 'en'),
  dialogue jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.unit_items (
  unit_slug text not null references public.units(slug) on delete cascade,
  entry_id text not null references public.dictionary_entries(id),
  display_order int not null,
  context_sentences jsonb not null,
  primary key (unit_slug, entry_id)
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  ui_language text not null default 'en',
  is_admin boolean not null default false,
  streak_current int not null default 0,
  streak_longest int not null default 0,
  last_active_date date,
  created_at timestamptz not null default now()
);

create table public.user_card_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id text not null references public.dictionary_entries(id),
  due timestamptz not null,
  stability real not null,
  difficulty real not null,
  reps int not null default 0,
  lapses int not null default 0,
  learning_steps int not null default 0,
  state text not null check (state in ('new','learning','review','relearning')),
  last_review timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, entry_id)
);

create table public.review_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id text not null references public.dictionary_entries(id),
  reviewed_at timestamptz not null default now(),
  practice_form text not null check (practice_form in ('flashcard_recognition','flashcard_recall','cloze','drill')),
  rating text not null check (rating in ('again','good','easy')),
  latency_ms int,
  counts_for_scheduling boolean not null default true
);
create index review_logs_user_time on public.review_logs (user_id, reviewed_at);

create table public.unit_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  unit_slug text not null references public.units(slug),
  status text not null default 'not_started' check (status in ('not_started','in_progress','completed')),
  completed_at timestamptz,
  primary key (user_id, unit_slug)
);

create table public.drill_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  sessions_started int not null default 0,
  primary key (user_id, usage_date)
);
```

- [ ] **Step 5: Push and verify**

Run: `npx supabase db push`
Expected: `Applying migration 0001_schema.sql... Finished supabase db push.`

Run: `psql "$(grep DATABASE_URL .env.content | cut -d= -f2-)" -c "\dt public.*"`
Expected: 8 rows — `dictionary_entries, units, unit_items, profiles, user_card_state, review_logs, unit_progress, drill_usage`.

- [ ] **Step 6: Commit**

```bash
git add supabase/
git commit -m "feat: add Supabase schema migration (8 tables per spec §4)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: RLS policies

**Files:**
- Create: `supabase/migrations/0002_rls.sql`, `scripts/verify-rls.ts`

**Interfaces:**
- Consumes: Task 3 tables + env files.
- Produces: RLS active on all 8 tables; `public.is_admin()` helper; verified access semantics that all client data code (Tasks 6–13) relies on.

- [ ] **Step 1: Write the RLS migration**

`supabase/migrations/0002_rls.sql`:
```sql
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select is_admin from public.profiles where user_id = auth.uid()), false) $$;

alter table public.dictionary_entries enable row level security;
alter table public.units enable row level security;
alter table public.unit_items enable row level security;
alter table public.profiles enable row level security;
alter table public.user_card_state enable row level security;
alter table public.review_logs enable row level security;
alter table public.unit_progress enable row level security;
alter table public.drill_usage enable row level security;

create policy read_dictionary on public.dictionary_entries for select to authenticated using (true);

create policy read_units on public.units for select to authenticated
  using (status = 'published' or public.is_admin());

create policy read_unit_items on public.unit_items for select to authenticated
  using (exists (select 1 from public.units u where u.slug = unit_items.unit_slug
                 and (u.status = 'published' or public.is_admin())));

create policy own_profile_select on public.profiles for select to authenticated using (user_id = auth.uid());
create policy own_profile_insert on public.profiles for insert to authenticated
  with check (user_id = auth.uid() and is_admin = false);
create policy own_profile_update on public.profiles for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
              and is_admin = (select p.is_admin from public.profiles p where p.user_id = auth.uid()));

create policy own_cards on public.user_card_state for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy own_logs_insert on public.review_logs for insert to authenticated with check (user_id = auth.uid());
create policy own_logs_select on public.review_logs for select to authenticated using (user_id = auth.uid());

create policy own_unit_progress on public.unit_progress for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
```
(No update/delete policies on `review_logs` — append-only. No client policies on `drill_usage` — service role only.)

Run: `npx supabase db push`
Expected: `Applying migration 0002_rls.sql... Finished supabase db push.`

- [ ] **Step 2: Install script deps and write the verification script**

Run: `npm i -D tsx dotenv && npm i @supabase/supabase-js`
Expected: `added N packages`.

Add to `package.json` scripts: `"verify:rls": "tsx scripts/verify-rls.ts"`.

`scripts/verify-rls.ts`:
```ts
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env.content' });

const url = process.env.VITE_SUPABASE_URL!;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const EMAIL = 'rls-check@medlingo.test';
const PASS = 'rls-check-password-123';
let failures = 0;

function check(name: string, ok: boolean) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failures++;
}

async function main() {
  // seed: test user + one draft unit
  const { data: existing } = await admin.auth.admin.listUsers();
  let userId = existing.users.find((u) => u.email === EMAIL)?.id;
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL, password: PASS, email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
  }
  await admin.from('units').upsert({
    slug: 'rls-draft-unit', level: 1, display_order: 999, status: 'draft',
    title: { en: 'RLS draft' }, dialogue: [],
  });

  // anon (signed out) reads nothing
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data: anonDict } = await anon.from('dictionary_entries').select('id').limit(1);
  check('signed-out client reads no dictionary rows', (anonDict ?? []).length === 0);

  // signed-in user
  const user = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInErr } = await user.auth.signInWithPassword({ email: EMAIL, password: PASS });
  if (signInErr) throw signInErr;

  const { error: dictErr } = await user.from('dictionary_entries').select('id').limit(1);
  check('signed-in user can read dictionary', dictErr === null);

  const { data: draftRows } = await user.from('units').select('slug').eq('slug', 'rls-draft-unit');
  check('signed-in non-admin cannot see draft units', (draftRows ?? []).length === 0);

  const { error: foreignLog } = await user.from('review_logs').insert({
    user_id: '00000000-0000-0000-0000-000000000000',
    entry_id: 'nonexistent', practice_form: 'cloze', rating: 'good',
  });
  check("cannot insert another user's review_logs", foreignLog !== null);

  const { error: updErr } = await user.from('review_logs')
    .update({ rating: 'easy' }).eq('user_id', userId!).select();
  const { data: updData } = await user.from('review_logs').select('id').limit(0);
  check('review_logs update is rejected/ineffective', updErr !== null || updData !== null);

  // cleanup
  await admin.from('units').delete().eq('slug', 'rls-draft-unit');
  console.log(failures === 0 ? '\nALL RLS CHECKS PASSED' : `\n${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
```

- [ ] **Step 3: Run the verification**

Run: `npm run verify:rls`
Expected: 5 `PASS` lines, then `ALL RLS CHECKS PASSED`, exit 0.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0002_rls.sql scripts/verify-rls.ts package.json package-lock.json
git commit -m "feat: add RLS policies and verification script

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: i18n layer + `<He>` bidi component

**Files:**
- Create: `src/lib/i18n.ts`, `src/locales/en.json`, `src/components/He.tsx`
- Modify: `src/main.tsx`, `src/App.tsx`, `src/App.test.tsx`
- Test: `src/components/He.test.tsx`, `src/lib/i18n.test.ts`

**Interfaces:**
- Produces: `t()` available app-wide; `He({children, className})` component; the full en.json key set below — later tasks reference these exact keys.

- [ ] **Step 1: Install and write failing tests**

Run: `npm i i18next react-i18next`

`src/components/He.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { He } from './He';

describe('He', () => {
  it('isolates Hebrew with rtl direction and lang', () => {
    const { container } = render(<He>לחץ דם</He>);
    const bdi = container.querySelector('bdi');
    expect(bdi).not.toBeNull();
    expect(bdi).toHaveAttribute('dir', 'rtl');
    expect(bdi).toHaveAttribute('lang', 'he');
    expect(bdi).toHaveTextContent('לחץ דם');
  });
});
```

`src/lib/i18n.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import i18n from './i18n';

describe('i18n', () => {
  it('resolves app.title', () => {
    expect(i18n.t('app.title')).toBe('MedLingo');
  });
});
```

Run: `npm test`
Expected: FAIL — cannot find `./He` and `./i18n`.

- [ ] **Step 2: Implement**

`src/components/He.tsx`:
```tsx
import type { ReactNode } from 'react';

export function He({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <bdi dir="rtl" lang="he" className={className}>
      {children}
    </bdi>
  );
}
```

`src/lib/i18n.ts`:
```ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';

i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
```

`src/locales/en.json` (the complete pilot key set — later tasks use these keys verbatim):
```json
{
  "app": { "title": "MedLingo" },
  "common": {
    "continue": "Continue",
    "loading": "Loading…",
    "retry": "Try again",
    "back": "Back"
  },
  "auth": {
    "title": "Sign in to MedLingo",
    "emailLabel": "Email address",
    "sendLink": "Send me a sign-in link",
    "checkEmail": "Check your email for a sign-in link.",
    "error": "Could not send the link. Try again."
  },
  "onboarding": {
    "title": "Welcome to MedLingo",
    "nameLabel": "Your display name",
    "consent": "By continuing you agree that MedLingo stores your email, display name, and learning history to run this pilot (hosted in the EU). You can request deletion at any time.",
    "start": "Start learning"
  },
  "home": {
    "unitTitle": "Your unit",
    "start": "Start",
    "continue": "Continue",
    "completed": "Completed",
    "reviewTitle": "Reviews",
    "due_one": "{{count}} word due — review now",
    "due_other": "{{count}} words due — review now",
    "caughtUp": "All caught up — next review {{time}}",
    "extraPractice": "Extra practice",
    "firstRun": "Start your first unit to begin learning.",
    "streak": "{{count}}-day streak",
    "wordsLearned": "{{count}} learned",
    "wordsKnown": "{{count}} known"
  },
  "unit": {
    "scenario": "Scenario",
    "vocab": "New words",
    "practice": "Practice",
    "done": "Unit completed!",
    "start": "Start unit",
    "meaning": "Meaning",
    "gender": "Gender",
    "plural": "Plural",
    "root": "Root",
    "everyday": "Patients say"
  },
  "review": {
    "title": "Review",
    "correct": "Correct!",
    "wrong": "Not quite",
    "answer": "Answer",
    "summary": "Session complete",
    "reviewed": "{{count}} reviewed",
    "accuracy": "{{pct}}% correct",
    "caughtUp": "All caught up!",
    "nextDue": "Next review {{time}}",
    "extra": "Extra practice (doesn't affect your schedule)",
    "empty": "Nothing to review yet — learn the unit first."
  }
}
```

Modify `src/main.tsx` — add one import line before `./index.css`:
```ts
import './lib/i18n';
```

Modify `src/App.tsx` — Landing uses the key now:
```tsx
import { Routes, Route } from 'react-router';
import { useTranslation } from 'react-i18next';

function Landing() {
  const { t } = useTranslation();
  return <h1 className="p-4 text-2xl font-semibold">{t('app.title')}</h1>;
}

export default function App() {
  return (
    <Routes>
      <Route path="*" element={<Landing />} />
    </Routes>
  );
}
```

Modify `src/App.test.tsx` — add i18n init to the test file imports (top of file):
```ts
import '../src/lib/i18n';
```
(adjust path: from `src/App.test.tsx` it is `import './lib/i18n';`)

- [ ] **Step 3: Verify green**

Run: `npm test`
Expected: PASS — 3 test files.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add i18next layer, full en key set, and He bidi component

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Auth, session & onboarding

**Files:**
- Create: `src/lib/supabase.ts`, `src/components/SessionProvider.tsx`, `src/components/ProtectedRoute.tsx`, `src/pages/AuthPage.tsx`, `src/pages/OnboardingPage.tsx`, `src/data/profile.ts`, `src/lib/types.ts` (Profile only — Task 8 adds the rest)
- Modify: `src/App.tsx`, `src/main.tsx`
- Test: `src/components/ProtectedRoute.test.tsx`, `src/pages/AuthPage.test.tsx`, `src/pages/OnboardingPage.test.tsx`

**Interfaces:**
- Consumes: `He` (Task 5 — not needed here), i18n keys `auth.*`, `onboarding.*`.
- Produces: `supabase` singleton; `useSession(): { session: Session | null; loading: boolean }`; `ProtectedRoute` wrapper; `getProfile(): Promise<Profile | null>`; `completeOnboarding(displayName: string): Promise<Profile>`; `Profile` type. `computeStreak`/`touchStreak` are produced later by Task 13.

- [ ] **Step 1: Write the supabase singleton and Profile type**

`src/lib/supabase.ts`:
```ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);
```

`src/lib/types.ts` (started here; Task 8 appends the rest):
```ts
export interface Profile {
  userId: string;
  displayName: string;
  uiLanguage: string;
  isAdmin: boolean;
  streakCurrent: number;
  streakLongest: number;
  lastActiveDate: string | null; // 'YYYY-MM-DD'
}
```

- [ ] **Step 2: Write failing tests**

All three test files mock the singleton. `src/pages/AuthPage.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../lib/i18n';

const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
vi.mock('../lib/supabase', () => ({
  supabase: { auth: { signInWithOtp: (...a: unknown[]) => signInWithOtp(...a) } },
}));

import { AuthPage } from './AuthPage';

describe('AuthPage', () => {
  beforeEach(() => signInWithOtp.mockClear());

  it('sends a magic link and shows the check-email state', async () => {
    render(<AuthPage />);
    await userEvent.type(screen.getByTestId('auth-email'), 'doc@example.com');
    await userEvent.click(screen.getByTestId('auth-submit'));
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'doc@example.com',
      options: { emailRedirectTo: window.location.origin },
    });
    expect(await screen.findByText('Check your email for a sign-in link.')).toBeInTheDocument();
  });
});
```

`src/pages/OnboardingPage.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import '../lib/i18n';

const completeOnboarding = vi.fn().mockResolvedValue({ displayName: 'Dr. Test' });
vi.mock('../data/profile', () => ({
  completeOnboarding: (...a: unknown[]) => completeOnboarding(...a),
}));

import { OnboardingPage } from './OnboardingPage';

describe('OnboardingPage', () => {
  it('shows consent and saves the display name', async () => {
    render(<MemoryRouter><OnboardingPage /></MemoryRouter>);
    expect(screen.getByText(/stores your email, display name, and learning history/)).toBeInTheDocument();
    await userEvent.type(screen.getByTestId('onboarding-name'), 'Dr. Test');
    await userEvent.click(screen.getByTestId('onboarding-submit'));
    expect(completeOnboarding).toHaveBeenCalledWith('Dr. Test');
  });
});
```

`src/components/ProtectedRoute.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import '../lib/i18n';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

const state: { session: unknown; loading: boolean } = { session: null, loading: false };
vi.mock('./SessionProvider', () => ({ useSession: () => state }));

const profile: { value: unknown } = { value: null };
vi.mock('../data/profile', () => ({ getProfile: () => Promise.resolve(profile.value) }));

import { ProtectedRoute } from './ProtectedRoute';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/auth" element={<div>AUTH</div>} />
        <Route path="/onboarding" element={<div>ONBOARD</div>} />
        <Route path="/" element={<ProtectedRoute><div>HOME</div></ProtectedRoute>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  it('redirects to /auth when signed out', async () => {
    state.session = null;
    renderAt('/');
    expect(await screen.findByText('AUTH')).toBeInTheDocument();
  });
  it('redirects to /onboarding when signed in without profile', async () => {
    state.session = { user: { id: 'u1' } };
    profile.value = null;
    renderAt('/');
    expect(await screen.findByText('ONBOARD')).toBeInTheDocument();
  });
  it('renders children when signed in with profile', async () => {
    state.session = { user: { id: 'u1' } };
    profile.value = { displayName: 'x' };
    renderAt('/');
    expect(await screen.findByText('HOME')).toBeInTheDocument();
  });
});
```

Run: `npm test`
Expected: FAIL — modules under test don't exist yet.

- [ ] **Step 3: Implement**

`src/data/profile.ts`:
```ts
import { supabase } from '../lib/supabase';
import type { Profile } from '../lib/types';

type ProfileRow = {
  user_id: string; display_name: string; ui_language: string; is_admin: boolean;
  streak_current: number; streak_longest: number; last_active_date: string | null;
};

function mapProfileRow(r: ProfileRow): Profile {
  return {
    userId: r.user_id, displayName: r.display_name, uiLanguage: r.ui_language,
    isAdmin: r.is_admin, streakCurrent: r.streak_current,
    streakLongest: r.streak_longest, lastActiveDate: r.last_active_date,
  };
}

export async function getProfile(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  return data ? mapProfileRow(data as ProfileRow) : null;
}

export async function completeOnboarding(displayName: string): Promise<Profile> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');
  const { data, error } = await supabase
    .from('profiles')
    .insert({ user_id: user.id, display_name: displayName })
    .select()
    .single();
  if (error) throw error;
  return mapProfileRow(data as ProfileRow);
}
```

`src/components/SessionProvider.tsx`:
```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

const SessionContext = createContext<{ session: Session | null; loading: boolean }>({
  session: null,
  loading: true,
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return <SessionContext.Provider value={{ session, loading }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}
```

`src/components/ProtectedRoute.tsx`:
```tsx
import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useSession } from './SessionProvider';
import { getProfile } from '../data/profile';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  const { t } = useTranslation();
  const [profileState, setProfileState] = useState<'checking' | 'missing' | 'ok'>('checking');

  useEffect(() => {
    if (!session) return;
    getProfile().then((p) => setProfileState(p ? 'ok' : 'missing'));
  }, [session]);

  if (loading) return <p className="p-4">{t('common.loading')}</p>;
  if (!session) return <Navigate to="/auth" replace />;
  if (profileState === 'checking') return <p className="p-4">{t('common.loading')}</p>;
  if (profileState === 'missing') return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}
```

`src/pages/AuthPage.tsx`:
```tsx
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';

export function AuthPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sent' | 'error'>('idle');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setStatus(error ? 'error' : 'sent');
  }

  if (status === 'sent') return <p className="p-6 text-center">{t('auth.checkEmail')}</p>;

  return (
    <form onSubmit={submit} className="mx-auto flex max-w-sm flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">{t('auth.title')}</h1>
      <label className="flex flex-col gap-1">
        <span>{t('auth.emailLabel')}</span>
        <input
          data-testid="auth-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border p-2"
        />
      </label>
      <button data-testid="auth-submit" type="submit" className="rounded bg-blue-700 p-2 text-white">
        {t('auth.sendLink')}
      </button>
      {status === 'error' && <p role="alert" className="text-red-700">{t('auth.error')}</p>}
    </form>
  );
}
```

`src/pages/OnboardingPage.tsx`:
```tsx
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { completeOnboarding } from '../data/profile';

export function OnboardingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [name, setName] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    await completeOnboarding(name.trim());
    navigate('/', { replace: true });
  }

  return (
    <form onSubmit={submit} className="mx-auto flex max-w-sm flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">{t('onboarding.title')}</h1>
      <label className="flex flex-col gap-1">
        <span>{t('onboarding.nameLabel')}</span>
        <input
          data-testid="onboarding-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded border p-2"
        />
      </label>
      <p className="text-sm text-gray-600">{t('onboarding.consent')}</p>
      <button data-testid="onboarding-submit" type="submit" className="rounded bg-blue-700 p-2 text-white">
        {t('onboarding.start')}
      </button>
    </form>
  );
}
```

Modify `src/App.tsx` (full new content — Home placeholder replaced in Task 13):
```tsx
import { Routes, Route } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AuthPage } from './pages/AuthPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { ProtectedRoute } from './components/ProtectedRoute';

function HomePlaceholder() {
  const { t } = useTranslation();
  return <h1 className="p-4 text-2xl font-semibold">{t('app.title')}</h1>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/" element={<ProtectedRoute><HomePlaceholder /></ProtectedRoute>} />
    </Routes>
  );
}
```

Modify `src/main.tsx` — wrap with the provider:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';
import { SessionProvider } from './components/SessionProvider';
import './lib/i18n';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </SessionProvider>
  </StrictMode>,
);
```

Update `src/App.test.tsx`: the old smoke test now hits ProtectedRoute. Replace its content with:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import './lib/i18n';

vi.mock('./lib/supabase', () => ({ supabase: {} }));
vi.mock('./components/SessionProvider', () => ({ useSession: () => ({ session: null, loading: false }) }));
vi.mock('./data/profile', () => ({ getProfile: () => Promise.resolve(null) }));

import App from './App';

describe('App', () => {
  it('routes signed-out users to the auth page', async () => {
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
    expect(await screen.findByText('Sign in to MedLingo')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Verify green**

Run: `npm test`
Expected: PASS — all test files green.

- [ ] **Step 5: Manual smoke test of the real magic link**

Run: `npm run dev` → open http://localhost:5173 → enter your real email → click the link in the email → you should land back on localhost, get redirected to `/onboarding`, complete it, and see the Home placeholder.
Expected: a `profiles` row exists (check Supabase Table Editor).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add magic-link auth, session provider, and onboarding flow

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Content formats, import script & dev-sample unit

**Files:**
- Create: `content/README.md`, `content/dictionary.tsv`, `content/units.tsv`, `content/units/unit-01-intake.dialogue.tsv`, `content/units/unit-01-intake.items.tsv`, `content/fixtures/missing-en.tsv`, `content/fixtures/bad-level.tsv`, `content/fixtures/duplicate-id.tsv`, `content/fixtures/unknown-entry.items.tsv`, `scripts/import-content.ts`, `scripts/tsv.ts`
- Test: `scripts/tsv.test.ts`, `scripts/import-content.test.ts`

**Interfaces:**
- Consumes: Task 3 schema + `DATABASE_URL`.
- Produces: TSV formats below (authoring contract for the owner/language professional); `parseTsv(text: string): Array<Record<string, string>>`; `npm run import:content` (validates → single transaction → upserts, never deletes).

**TSV formats** (single TAB between columns, UTF-8, header row required):
- `content/dictionary.tsv`: `id  hebrew  hebrew_nikud  part_of_speech  level  gender  plural  root  everyday_synonym  en  ar  ru  fr  notes`
- `content/units.tsv`: `slug  level  display_order  status  title_en`
- `content/units/<slug>.dialogue.tsv`: `line_order  speaker  he  en`
- `content/units/<slug>.items.tsv`: `display_order  entry_id  context_he  context_en`

- [ ] **Step 1: Write the dev-sample content**

`content/README.md`:
```markdown
# MedLingo content

Authoring lives here as TSV spreadsheets (tab-separated, UTF-8, header row).
Edit in Google Sheets/Excel and export as TSV, or edit in place.
Import with `npm run import:content` (validates everything first; writes all-or-nothing; never deletes — retire content by setting a unit's status to draft).

**The current unit-01-intake content is a DEV SAMPLE written for development.
Replace with professionally authored content before pilot launch.**

Empty cells: leave the cell empty (do not write "null"). `ar`/`ru`/`fr` may be empty during the pilot; `en` is required.
```

`content/dictionary.tsv` (12 dev-sample entries; columns TAB-separated):
```tsv
id	hebrew	hebrew_nikud	part_of_speech	level	gender	plural	root	everyday_synonym	en	ar	ru	fr	notes
tluna	תלונה	תְּלוּנָה	noun	1	נ	תלונות	ל-ו-נ	מה מפריע לך	complaint				the presenting complaint
keev	כאב	כְּאֵב	noun	1	ז	כאבים	כ-א-ב		pain				
lachatz-dam	לחץ דם	לַחַץ דָּם	noun	1	ז			לחץ	blood pressure				
dofek	דופק	דֹּפֶק	noun	1	ז		ד-פ-ק		pulse				
chom	חום	חֹם	noun	1	ז			חום גבוה	fever				also means heat
neshima	נשימה	נְשִׁימָה	noun	1	נ	נשימות	נ-ש-מ		breathing				
kotzer-neshima	קוצר נשימה	קֹצֶר נְשִׁימָה	phrase	1	ז			קשה לנשום	shortness of breath				
bchila	בחילה	בְּחִילָה	noun	1	נ	בחילות	ב-ח-ל		nausea				
hakaa	הקאה	הֲקָאָה	noun	1	נ	הקאות	ק-י-א		vomiting				
alergia	אלרגיה	אָלֶרְגְּיָה	noun	1	נ	אלרגיות		רגישות	allergy				loanword
trufa	תרופה	תְּרוּפָה	noun	1	נ	תרופות	ר-פ-א		medication				
anamneza	אנמנזה	אָנַמְנֶזָה	noun	1	נ				medical history				loanword; the intake interview
```

`content/units.tsv`:
```tsv
slug	level	display_order	status	title_en
unit-01-intake	1	1	published	Patient intake (anamnesis)
```

`content/units/unit-01-intake.dialogue.tsv`:
```tsv
line_order	speaker	he	en
1	רופאה	שלום, אני ד"ר לוי. מה התלונה העיקרית שלך?	Hello, I'm Dr. Levi. What is your main complaint?
2	מטופל	יש לי כאב חזק בחזה מהבוקר.	I have strong pain in my chest since the morning.
3	רופאה	יש לך גם קוצר נשימה?	Do you also have shortness of breath?
4	מטופל	כן, הנשימה שלי כבדה, במיוחד במאמץ.	Yes, my breathing is heavy, especially with effort.
5	רופאה	נמדוד עכשיו לחץ דם ודופק.	We will now measure blood pressure and pulse.
6	רופאה	יש לך חום? בחילה או הקאה?	Do you have fever? Nausea or vomiting?
7	מטופל	הייתה לי בחילה בבוקר, בלי הקאה. בלי חום.	I had nausea in the morning, without vomiting. No fever.
8	רופאה	יש לך אלרגיה לתרופה כלשהי?	Do you have an allergy to any medication?
9	מטופל	כן, יש לי אלרגיה לפניצילין.	Yes, I have an allergy to penicillin.
10	רופאה	אילו תרופות אתה לוקח באופן קבוע?	Which medications do you take regularly?
11	מטופל	תרופה ללחץ דם, פעם ביום.	A blood-pressure medication, once a day.
12	רופאה	תודה. נשלים עכשיו את האנמנזה ונמשיך בבדיקה.	Thank you. We will now complete the medical history and continue with the examination.
```

`content/units/unit-01-intake.items.tsv`:
```tsv
display_order	entry_id	context_he	context_en
1	tluna	מה התלונה העיקרית שלך?	What is your main complaint?
2	keev	יש לי כאב חזק בחזה מהבוקר.	I have strong pain in my chest since the morning.
3	kotzer-neshima	יש לך גם קוצר נשימה?	Do you also have shortness of breath?
4	neshima	הנשימה שלי כבדה, במיוחד במאמץ.	My breathing is heavy, especially with effort.
5	lachatz-dam	נמדוד עכשיו לחץ דם ודופק.	We will now measure blood pressure and pulse.
6	dofek	נמדוד עכשיו לחץ דם ודופק.	We will now measure blood pressure and pulse.
7	chom	יש לך חום?	Do you have fever?
8	bchila	הייתה לי בחילה בבוקר.	I had nausea in the morning.
9	hakaa	הייתה לי בחילה בבוקר, בלי הקאה.	I had nausea in the morning, without vomiting.
10	alergia	יש לך אלרגיה לתרופה כלשהי?	Do you have an allergy to any medication?
11	trufa	אילו תרופות אתה לוקח באופן קבוע?	Which medications do you take regularly?
12	anamneza	נשלים עכשיו את האנמנזה ונמשיך בבדיקה.	We will now complete the medical history and continue with the examination.
```

- [ ] **Step 2: Write the failing TSV-parser test**

`scripts/tsv.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseTsv } from './tsv';

describe('parseTsv', () => {
  it('parses header + rows into records', () => {
    const rows = parseTsv('a\tb\n1\t2\n3\t4\n');
    expect(rows).toEqual([{ a: '1', b: '2' }, { a: '3', b: '4' }]);
  });
  it('keeps empty cells as empty strings and skips blank lines', () => {
    const rows = parseTsv('a\tb\n1\t\n\n');
    expect(rows).toEqual([{ a: '1', b: '' }]);
  });
  it('throws on a row with the wrong column count', () => {
    expect(() => parseTsv('a\tb\n1\t2\t3\n')).toThrow(/row 2/);
  });
});
```

Run: `npx vitest run scripts/tsv.test.ts`
Expected: FAIL — `./tsv` not found.

- [ ] **Step 3: Implement the parser**

`scripts/tsv.ts`:
```ts
export function parseTsv(text: string): Array<Record<string, string>> {
  const lines = text.split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return [];
  const header = lines[0].split('\t').map((h) => h.trim());
  return lines.slice(1).map((line, i) => {
    const cells = line.split('\t');
    if (cells.length !== header.length) {
      throw new Error(`row ${i + 2}: expected ${header.length} columns, got ${cells.length}`);
    }
    const rec: Record<string, string> = {};
    header.forEach((h, c) => (rec[h] = cells[c].trim()));
    return rec;
  });
}
```

Run: `npx vitest run scripts/tsv.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 4: Write failing validation tests**

Create the fixture files first (each is a broken variant of `dictionary.tsv`'s format):

`content/fixtures/missing-en.tsv`:
```tsv
id	hebrew	hebrew_nikud	part_of_speech	level	gender	plural	root	everyday_synonym	en	ar	ru	fr	notes
x1	מילה	מִלָּה	noun	1					 				
```
(the `en` column is a single space → empty after trim)

`content/fixtures/bad-level.tsv`:
```tsv
id	hebrew	hebrew_nikud	part_of_speech	level	gender	plural	root	everyday_synonym	en	ar	ru	fr	notes
x1	מילה	מִלָּה	noun	7					word				
```

`content/fixtures/duplicate-id.tsv`:
```tsv
id	hebrew	hebrew_nikud	part_of_speech	level	gender	plural	root	everyday_synonym	en	ar	ru	fr	notes
x1	מילה	מִלָּה	noun	1					word				
x1	מילה	מִלָּה	noun	1					word				
```

`content/fixtures/unknown-entry.items.tsv`:
```tsv
display_order	entry_id	context_he	context_en
1	no-such-entry	משפט	sentence
```

`scripts/import-content.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  validateDictionary, validateItems, loadContent,
} from './import-content';

const fixture = (name: string) => readFileSync(`content/fixtures/${name}`, 'utf8');

describe('content validation', () => {
  it('accepts the real content files', () => {
    const content = loadContent('content');
    expect(content.dictionary).toHaveLength(12);
    expect(content.units).toHaveLength(1);
    expect(content.units[0].items).toHaveLength(12);
    expect(content.units[0].dialogue).toHaveLength(12);
  });
  it('rejects a missing en translation with the row number', () => {
    expect(() => validateDictionary(fixture('missing-en.tsv'), 'missing-en.tsv'))
      .toThrow(/missing-en.tsv row 2.*en/);
  });
  it('rejects an out-of-range level', () => {
    expect(() => validateDictionary(fixture('bad-level.tsv'), 'bad-level.tsv'))
      .toThrow(/bad-level.tsv row 2.*level/);
  });
  it('rejects duplicate ids', () => {
    expect(() => validateDictionary(fixture('duplicate-id.tsv'), 'duplicate-id.tsv'))
      .toThrow(/duplicate id "x1"/);
  });
  it('rejects an items file referencing an unknown entry', () => {
    const dict = validateDictionary(readFileSync('content/dictionary.tsv', 'utf8'), 'dictionary.tsv');
    expect(() => validateItems(fixture('unknown-entry.items.tsv'), 'unknown-entry.items.tsv', dict))
      .toThrow(/unknown entry_id "no-such-entry"/);
  });
});
```

Run: `npx vitest run scripts/import-content.test.ts`
Expected: FAIL — `./import-content` not found.

- [ ] **Step 5: Implement the import script**

Run: `npm i zod && npm i -D postgres` — Expected: `added N packages`.

Add to `package.json` scripts: `"import:content": "tsx scripts/import-content.ts"`, `"metrics": "tsx scripts/metrics.ts"`.

`scripts/import-content.ts`:
```ts
import { readFileSync, readdirSync } from 'node:fs';
import { z } from 'zod';
import { parseTsv } from './tsv';

const optional = (s: string) => (s === '' ? null : s);

const DictRow = z.object({
  id: z.string().min(1),
  hebrew: z.string().min(1),
  hebrew_nikud: z.string().min(1),
  part_of_speech: z.enum(['noun', 'verb', 'adjective', 'phrase', 'abbreviation']),
  level: z.coerce.number().int().min(1).max(3),
  gender: z.enum(['ז', 'נ']).nullable(),
  plural: z.string().nullable(),
  root: z.string().nullable(),
  everyday_synonym: z.string().nullable(),
  en: z.string().min(1),
  ar: z.string().nullable(),
  ru: z.string().nullable(),
  fr: z.string().nullable(),
  notes: z.string().nullable(),
});
export type DictEntry = z.infer<typeof DictRow>;

const UnitRow = z.object({
  slug: z.string().min(1),
  level: z.coerce.number().int().min(1).max(3),
  display_order: z.coerce.number().int(),
  status: z.enum(['draft', 'published']),
  title_en: z.string().min(1),
});

const DialogueRow = z.object({
  line_order: z.coerce.number().int(),
  speaker: z.string().min(1),
  he: z.string().min(1),
  en: z.string().min(1),
});

const ItemRow = z.object({
  display_order: z.coerce.number().int(),
  entry_id: z.string().min(1),
  context_he: z.string().min(1),
  context_en: z.string().min(1),
});

function validateRows<T>(schema: z.ZodType<T>, raw: Array<Record<string, string>>, file: string,
  nullable: string[]): T[] {
  return raw.map((rec, i) => {
    const cooked: Record<string, unknown> = { ...rec };
    for (const k of nullable) cooked[k] = optional(rec[k] ?? '');
    const res = schema.safeParse(cooked);
    if (!res.success) {
      const issue = res.error.issues[0];
      throw new Error(`${file} row ${i + 2}: ${issue.path.join('.')} — ${issue.message}`);
    }
    return res.data;
  });
}

export function validateDictionary(text: string, file: string): DictEntry[] {
  const rows = validateRows(DictRow, parseTsv(text), file,
    ['gender', 'plural', 'root', 'everyday_synonym', 'ar', 'ru', 'fr', 'notes']);
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.id)) throw new Error(`${file}: duplicate id "${r.id}"`);
    seen.add(r.id);
  }
  return rows;
}

export function validateItems(text: string, file: string, dict: DictEntry[]) {
  const rows = validateRows(ItemRow, parseTsv(text), file, []);
  const ids = new Set(dict.map((d) => d.id));
  for (const r of rows) {
    if (!ids.has(r.entry_id)) throw new Error(`${file}: unknown entry_id "${r.entry_id}"`);
  }
  return rows;
}

export function loadContent(dir: string) {
  const dictionary = validateDictionary(readFileSync(`${dir}/dictionary.tsv`, 'utf8'), 'dictionary.tsv');
  const unitRows = validateRows(UnitRow, parseTsv(readFileSync(`${dir}/units.tsv`, 'utf8')), 'units.tsv', []);
  const files = readdirSync(`${dir}/units`);
  const units = unitRows.map((u) => {
    const dialogueFile = `${u.slug}.dialogue.tsv`;
    const itemsFile = `${u.slug}.items.tsv`;
    if (!files.includes(dialogueFile)) throw new Error(`units.tsv: missing ${dialogueFile}`);
    if (!files.includes(itemsFile)) throw new Error(`units.tsv: missing ${itemsFile}`);
    const dialogue = validateRows(DialogueRow,
      parseTsv(readFileSync(`${dir}/units/${dialogueFile}`, 'utf8')), dialogueFile, []);
    const items = validateItems(readFileSync(`${dir}/units/${itemsFile}`, 'utf8'), itemsFile, dictionary);
    return { ...u, dialogue, items };
  });
  return { dictionary, units };
}

async function main() {
  const { config } = await import('dotenv');
  config({ path: '.env.content' });
  const { default: postgres } = await import('postgres');
  const sql = postgres(process.env.DATABASE_URL!);

  const { dictionary, units } = loadContent('content');

  await sql.begin(async (tx) => {
    for (const d of dictionary) {
      const translations = { en: d.en, ar: d.ar, ru: d.ru, fr: d.fr };
      await tx`
        insert into dictionary_entries
          (id, hebrew, hebrew_nikud, part_of_speech, level, gender, plural, root,
           everyday_synonym, translations, notes)
        values (${d.id}, ${d.hebrew}, ${d.hebrew_nikud}, ${d.part_of_speech}, ${d.level},
                ${d.gender}, ${d.plural}, ${d.root}, ${d.everyday_synonym},
                ${tx.json(translations)}, ${d.notes})
        on conflict (id) do update set
          hebrew = excluded.hebrew, hebrew_nikud = excluded.hebrew_nikud,
          part_of_speech = excluded.part_of_speech, level = excluded.level,
          gender = excluded.gender, plural = excluded.plural, root = excluded.root,
          everyday_synonym = excluded.everyday_synonym,
          translations = excluded.translations, notes = excluded.notes,
          updated_at = now()`;
    }
    for (const u of units) {
      const dialogue = u.dialogue
        .sort((a, b) => a.line_order - b.line_order)
        .map((l) => ({ order: l.line_order, speaker: l.speaker, he: l.he, translations: { en: l.en } }));
      await tx`
        insert into units (slug, level, display_order, status, title, dialogue)
        values (${u.slug}, ${u.level}, ${u.display_order}, ${u.status},
                ${tx.json({ en: u.title_en })}, ${tx.json(dialogue)})
        on conflict (slug) do update set
          level = excluded.level, display_order = excluded.display_order,
          status = excluded.status, title = excluded.title,
          dialogue = excluded.dialogue, updated_at = now()`;
      for (const it of u.items) {
        const ctx = [{ he: it.context_he, translations: { en: it.context_en } }];
        await tx`
          insert into unit_items (unit_slug, entry_id, display_order, context_sentences)
          values (${u.slug}, ${it.entry_id}, ${it.display_order}, ${tx.json(ctx)})
          on conflict (unit_slug, entry_id) do update set
            display_order = excluded.display_order,
            context_sentences = excluded.context_sentences`;
      }
    }
  });

  console.log(`dictionary_entries: ${dictionary.length} upserted`);
  for (const u of units) console.log(`unit ${u.slug}: 1 unit, ${u.items.length} items upserted`);
  await sql.end();
}

const isDirectRun = process.argv[1]?.endsWith('import-content.ts');
if (isDirectRun) {
  main().catch((e) => {
    console.error(String(e.message ?? e));
    process.exit(1);
  });
}
```

- [ ] **Step 6: Verify tests, then run the real import twice (idempotence)**

Run: `npx vitest run scripts/`
Expected: PASS — tsv + import-content tests green.

Run: `npm run import:content && npm run import:content`
Expected (both runs, identical output):
```
dictionary_entries: 12 upserted
unit unit-01-intake: 1 unit, 12 items upserted
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add TSV content formats, dev-sample intake unit, and transactional import script

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: FSRS module

**Files:**
- Modify: `src/lib/types.ts` (append domain types)
- Create: `src/lib/fsrs.ts`
- Test: `src/lib/fsrs.test.ts`

**Interfaces:**
- Produces (all later review code depends on these exact signatures):
  - types: `PracticeForm`, `Rating`, `CardStateName`, `PartOfSpeech`, `Translations`, `DictionaryEntry`, `ContextSentence`, `DialogueLine`, `Unit`, `UnitItem`, `CardState`, `ReviewCard`
  - `newCardState(entryId: string, now: Date): CardState`
  - `deriveRating(correct: boolean, latencyMs: number, form: Exclude<PracticeForm,'drill'>): Rating`
  - `applyReview(card: CardState, rating: Rating, now: Date): CardState`
  - `selectForm(card: CardState): Exclude<PracticeForm,'drill'>`
  - `isDue(card: CardState, now: Date): boolean`
  - constants `EASY_LATENCY_MS`, `FORM_BANDS`, `FSRS_DESIRED_RETENTION`

- [ ] **Step 1: Install ts-fsrs pinned exactly**

Run: `npm i -E ts-fsrs`
Expected: package.json dependency has no `^`/`~` prefix (e.g. `"ts-fsrs": "5.4.1"`).

- [ ] **Step 2: Append domain types**

Append to `src/lib/types.ts`:
```ts
export type PracticeForm = 'flashcard_recognition' | 'flashcard_recall' | 'cloze' | 'drill';
export type Rating = 'again' | 'good' | 'easy';
export type CardStateName = 'new' | 'learning' | 'review' | 'relearning';
export type PartOfSpeech = 'noun' | 'verb' | 'adjective' | 'phrase' | 'abbreviation';

export interface Translations { en: string; ar?: string | null; ru?: string | null; fr?: string | null; }

export interface DictionaryEntry {
  id: string;
  hebrew: string;
  hebrewNikud: string;
  partOfSpeech: PartOfSpeech;
  level: 1 | 2 | 3;
  gender: 'ז' | 'נ' | null;
  plural: string | null;
  root: string | null;
  everydaySynonym: string | null;
  translations: Translations;
  notes: string | null;
}

export interface ContextSentence { he: string; translations: Translations; }
export interface DialogueLine { order: number; speaker: string; he: string; translations: Translations; }

export interface Unit {
  slug: string;
  level: 1 | 2 | 3;
  displayOrder: number;
  status: 'draft' | 'published';
  title: Translations;
  dialogue: DialogueLine[];
}

export interface UnitItem { entryId: string; displayOrder: number; contextSentences: ContextSentence[]; }

export interface CardState {
  entryId: string;
  due: Date;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  learningSteps: number; // ts-fsrs internal step counter — must round-trip or lapsed learning cards graduate early
  state: CardStateName;
  lastReview: Date | null;
}

export interface ReviewCard { card: CardState; entry: DictionaryEntry; contextSentences: ContextSentence[]; }
```

- [ ] **Step 3: Write the failing FSRS tests**

`src/lib/fsrs.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  newCardState, deriveRating, applyReview, selectForm, isDue,
  EASY_LATENCY_MS, FORM_BANDS,
} from './fsrs';

const T0 = new Date('2026-07-10T08:00:00Z');
const days = (n: number) => new Date(T0.getTime() + n * 86_400_000);

describe('fsrs module', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('a new card is due immediately', () => {
    const c = newCardState('keev', T0);
    expect(c.entryId).toBe('keev');
    expect(c.state).toBe('new');
    expect(isDue(c, T0)).toBe(true);
  });

  it('again keeps the card in learning and due within minutes', () => {
    const c = applyReview(newCardState('keev', T0), 'again', T0);
    expect(c.state).toBe('learning');
    expect(c.due.getTime() - T0.getTime()).toBeLessThan(30 * 60_000);
    expect(c.reps).toBe(1);
  });

  it('good on a new card schedules the first real gap under 3 days', () => {
    const c = applyReview(newCardState('keev', T0), 'good', T0);
    expect(c.due.getTime()).toBeGreaterThan(T0.getTime());
    expect(c.due.getTime()).toBeLessThanOrEqual(days(3).getTime());
  });

  it('repeated good reviews grow stability monotonically', () => {
    let c = newCardState('keev', T0);
    let prevStability = 0;
    let now = T0;
    for (let i = 0; i < 5; i++) {
      c = applyReview(c, 'good', now);
      expect(c.stability).toBeGreaterThanOrEqual(prevStability);
      prevStability = c.stability;
      now = new Date(c.due.getTime());
    }
    expect(c.state).toBe('review');
  });

  it('is deterministic (fuzz disabled): identical inputs → identical due dates', () => {
    const a = applyReview(newCardState('keev', T0), 'good', T0);
    const b = applyReview(newCardState('keev', T0), 'good', T0);
    expect(a.due.getTime()).toBe(b.due.getTime());
    expect(a.stability).toBe(b.stability);
  });

  it('deriveRating truth table with exact boundaries', () => {
    expect(deriveRating(false, 100, 'flashcard_recognition')).toBe('again');
    expect(deriveRating(true, EASY_LATENCY_MS.flashcard_recognition, 'flashcard_recognition')).toBe('easy');
    expect(deriveRating(true, EASY_LATENCY_MS.flashcard_recognition + 1, 'flashcard_recognition')).toBe('good');
    expect(deriveRating(true, EASY_LATENCY_MS.cloze, 'cloze')).toBe('easy');
    expect(deriveRating(true, EASY_LATENCY_MS.cloze + 1, 'cloze')).toBe('good');
    expect(deriveRating(true, EASY_LATENCY_MS.flashcard_recall, 'flashcard_recall')).toBe('easy');
  });

  it('selectForm band edges', () => {
    const base = newCardState('keev', T0);
    expect(selectForm({ ...base, stability: 2.9 })).toBe('flashcard_recognition');
    expect(selectForm({ ...base, stability: FORM_BANDS.recognitionMaxStabilityDays })).toBe('cloze');
    expect(selectForm({ ...base, stability: 9.9 })).toBe('cloze');
    expect(selectForm({ ...base, stability: FORM_BANDS.clozeMaxStabilityDays })).toBe('flashcard_recall');
    expect(selectForm({ ...base, stability: 40 })).toBe('flashcard_recall');
  });

  it('isDue boundary', () => {
    const c = { ...newCardState('keev', T0), due: days(1) };
    expect(isDue(c, T0)).toBe(false);
    expect(isDue(c, days(1))).toBe(true);
    expect(isDue(c, days(2))).toBe(true);
  });

  it('recompute check (spec §9): replaying a review log reproduces the card state', () => {
    // simulate a stored review_logs sequence: (rating, reviewedAt) pairs
    const log: Array<{ rating: 'again' | 'good' | 'easy'; at: Date }> = [
      { rating: 'good', at: T0 },
      { rating: 'again', at: days(2) },
      { rating: 'good', at: days(2.01) },
      { rating: 'easy', at: days(5) },
    ];
    // incrementally maintained state (what the client persists)
    let live = newCardState('keev', T0);
    for (const l of log) live = applyReview(live, l.rating, l.at);
    // recomputed from scratch using only the log + pinned config
    let rebuilt = newCardState('keev', T0);
    for (const l of log) rebuilt = applyReview(rebuilt, l.rating, l.at);
    expect(rebuilt).toEqual(live);
    expect(rebuilt.due.getTime()).toBe(live.due.getTime());
  });
});
```

Run: `npx vitest run src/lib/fsrs.test.ts`
Expected: FAIL — `./fsrs` not found.

- [ ] **Step 4: Implement the wrapper**

`src/lib/fsrs.ts`:
```ts
import {
  fsrs, generatorParameters, createEmptyCard,
  Rating as FsrsRating, State, type Card,
} from 'ts-fsrs';
import type { CardState, CardStateName, PracticeForm, Rating } from './types';

export const FSRS_DESIRED_RETENTION = 0.9;

export const EASY_LATENCY_MS: Record<Exclude<PracticeForm, 'drill'>, number> = {
  flashcard_recognition: 4000,
  cloze: 8000,
  flashcard_recall: 8000,
};

export const FORM_BANDS = { recognitionMaxStabilityDays: 3, clozeMaxStabilityDays: 10 };

const scheduler = fsrs(generatorParameters({
  enable_fuzz: false,
  request_retention: FSRS_DESIRED_RETENTION,
}));

const STATE_TO_NAME: Record<State, CardStateName> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};
const NAME_TO_STATE: Record<CardStateName, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};
const RATING_TO_FSRS: Record<Rating, FsrsRating> = {
  again: FsrsRating.Again,
  good: FsrsRating.Good,
  easy: FsrsRating.Easy,
};

function fromCard(entryId: string, c: Card): CardState {
  return {
    entryId,
    due: new Date(c.due),
    stability: c.stability,
    difficulty: c.difficulty,
    reps: c.reps,
    lapses: c.lapses,
    learningSteps: c.learning_steps ?? 0,
    state: STATE_TO_NAME[c.state],
    lastReview: c.last_review ? new Date(c.last_review) : null,
  };
}

function toCard(cs: CardState): Card {
  // elapsed_days/scheduled_days are reconstructed — not persisted in user_card_state
  const scheduledDays = cs.lastReview
    ? Math.max(0, Math.round((cs.due.getTime() - cs.lastReview.getTime()) / 86_400_000))
    : 0;
  return {
    due: cs.due,
    stability: cs.stability,
    difficulty: cs.difficulty,
    elapsed_days: 0,
    scheduled_days: scheduledDays,
    learning_steps: cs.learningSteps,
    reps: cs.reps,
    lapses: cs.lapses,
    state: NAME_TO_STATE[cs.state],
    last_review: cs.lastReview ?? undefined,
  } as Card;
}

export function newCardState(entryId: string, now: Date): CardState {
  return fromCard(entryId, createEmptyCard(now));
}

export function deriveRating(
  correct: boolean, latencyMs: number, form: Exclude<PracticeForm, 'drill'>,
): Rating {
  if (!correct) return 'again';
  return latencyMs <= EASY_LATENCY_MS[form] ? 'easy' : 'good';
}

export function applyReview(card: CardState, rating: Rating, now: Date): CardState {
  const result = scheduler.next(toCard(card), now, RATING_TO_FSRS[rating]);
  return fromCard(card.entryId, result.card);
}

export function selectForm(card: CardState): Exclude<PracticeForm, 'drill'> {
  if (card.stability < FORM_BANDS.recognitionMaxStabilityDays) return 'flashcard_recognition';
  if (card.stability < FORM_BANDS.clozeMaxStabilityDays) return 'cloze';
  return 'flashcard_recall';
}

export function isDue(card: CardState, now: Date): boolean {
  return card.due.getTime() <= now.getTime();
}
```

- [ ] **Step 5: Verify green**

Run: `npx vitest run src/lib/fsrs.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/fsrs.ts src/lib/fsrs.test.ts package.json package-lock.json
git commit -m "feat: add FSRS wrapper with derived grading and stability-band form selection

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Cards data layer with offline retry queue

**Files:**
- Create: `src/data/cards.ts`
- Test: `src/data/cards.test.ts`

**Interfaces:**
- Consumes: `supabase` singleton (6), FSRS module (8).
- Produces:
  - `loadDueCards(now?: Date): Promise<ReviewCard[]>`
  - `loadUpcomingCards(limit: number): Promise<ReviewCard[]>` (soonest-due first, NOT filtered by due — for extra practice)
  - `loadAllCards(): Promise<CardState[]>`
  - `loadEntryPool(): Promise<DictionaryEntry[]>` (distractor pool)
  - `seedNewCards(entryIds: string[], now?: Date): Promise<void>`
  - `submitReview(input: { entryId: string; form: PracticeForm; correct: boolean; latencyMs: number; countsForScheduling?: boolean }, now?: Date): Promise<CardState>`
  - `flushPendingReviews(): Promise<number>` — drains in order, stops on first failure; an item that fails 3 flush attempts is dropped (with a console warning) so a poison item can't block the queue forever
  - localStorage queue key: `medlingo.pendingReviews`

- [ ] **Step 1: Write the failing tests**

`src/data/cards.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CardState } from '../lib/types';

const tables: Record<string, { rows: unknown[]; insertError: Error | null }> = {};
function resetDb() {
  for (const t of ['user_card_state', 'dictionary_entries', 'unit_items', 'review_logs']) {
    tables[t] = { rows: [], insertError: null };
  }
}

// Minimal chainable supabase mock: from(t).select().in()/eq() resolves rows;
// insert/upsert append; thrown insertError simulates network failure.
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
    from: (table: string) => {
      const t = () => tables[table];
      const result = (rows: unknown[]) => Promise.resolve({ data: rows, error: null });
      const chain = {
        select: () => chain,
        in: (_c: string, ids: string[]) =>
          result(t().rows.filter((r) => ids.includes((r as { id?: string; entry_id?: string }).id ?? (r as { entry_id: string }).entry_id))),
        eq: () => chain,
        then: (res: (v: { data: unknown[]; error: null }) => void) =>
          Promise.resolve({ data: t().rows, error: null }).then(res),
        insert: (row: unknown) => {
          if (t().insertError) return Promise.resolve({ data: null, error: t().insertError });
          t().rows.push(row);
          return Promise.resolve({ data: row, error: null });
        },
        upsert: (row: unknown, _opts?: unknown) => {
          if (t().insertError) return Promise.resolve({ data: null, error: t().insertError });
          t().rows.push(row);
          return Promise.resolve({ data: row, error: null });
        },
      };
      return chain;
    },
  },
}));

import {
  seedNewCards, submitReview, flushPendingReviews, loadDueCards,
} from './cards';

const T0 = new Date('2026-07-10T08:00:00Z');

describe('cards data layer', () => {
  beforeEach(() => {
    resetDb();
    localStorage.clear();
  });

  it('seedNewCards upserts a new-state row per entry', async () => {
    await seedNewCards(['keev', 'chom'], T0);
    expect(tables.user_card_state.rows).toHaveLength(2);
  });

  it('submitReview writes a log and updates card state', async () => {
    await seedNewCards(['keev'], T0);
    const next = await submitReview(
      { entryId: 'keev', form: 'flashcard_recognition', correct: true, latencyMs: 2000 }, T0,
    );
    expect(tables.review_logs.rows).toHaveLength(1);
    const log = tables.review_logs.rows[0] as { rating: string; counts_for_scheduling: boolean };
    expect(log.rating).toBe('easy');
    expect(log.counts_for_scheduling).toBe(true);
    expect(next.reps).toBe(1);
  });

  it('countsForScheduling=false logs but does not touch card state', async () => {
    await seedNewCards(['keev'], T0);
    const before = tables.user_card_state.rows.length;
    await submitReview(
      { entryId: 'keev', form: 'cloze', correct: true, latencyMs: 9000, countsForScheduling: false }, T0,
    );
    expect(tables.review_logs.rows).toHaveLength(1);
    expect(tables.user_card_state.rows).toHaveLength(before);
  });

  it('network failure enqueues; flushPendingReviews drains', async () => {
    await seedNewCards(['keev'], T0);
    tables.review_logs.insertError = new Error('fetch failed');
    await submitReview({ entryId: 'keev', form: 'cloze', correct: true, latencyMs: 5000 }, T0);
    expect(JSON.parse(localStorage.getItem('medlingo.pendingReviews')!)).toHaveLength(1);

    tables.review_logs.insertError = null;
    const flushed = await flushPendingReviews();
    expect(flushed).toBe(1);
    expect(JSON.parse(localStorage.getItem('medlingo.pendingReviews')!)).toHaveLength(0);
  });

  it('loadDueCards returns only due cards joined with entries', async () => {
    tables.user_card_state.rows = [
      { user_id: 'u1', entry_id: 'keev', due: T0.toISOString(), stability: 1, difficulty: 5,
        reps: 1, lapses: 0, state: 'learning', last_review: null },
      { user_id: 'u1', entry_id: 'chom', due: new Date(T0.getTime() + 86_400_000).toISOString(),
        stability: 1, difficulty: 5, reps: 1, lapses: 0, state: 'learning', last_review: null },
    ];
    tables.dictionary_entries.rows = [
      { id: 'keev', hebrew: 'כאב', hebrew_nikud: 'כְּאֵב', part_of_speech: 'noun', level: 1,
        gender: 'ז', plural: 'כאבים', root: null, everyday_synonym: null,
        translations: { en: 'pain' }, notes: null },
    ];
    tables.unit_items.rows = [
      { unit_slug: 'unit-01-intake', entry_id: 'keev', display_order: 2,
        context_sentences: [{ he: 'יש לי כאב', translations: { en: 'I have pain' } }] },
    ];
    const due = await loadDueCards(T0);
    expect(due).toHaveLength(1);
    expect(due[0].entry.translations.en).toBe('pain');
    expect(due[0].contextSentences[0].he).toBe('יש לי כאב');
  });
});
```

Run: `npx vitest run src/data/cards.test.ts`
Expected: FAIL — `./cards` not found.

- [ ] **Step 2: Implement**

`src/data/cards.ts`:
```ts
import { supabase } from '../lib/supabase';
import { applyReview, deriveRating, isDue, newCardState } from '../lib/fsrs';
import type {
  CardState, ContextSentence, DictionaryEntry, PracticeForm, Rating, ReviewCard,
} from '../lib/types';

const QUEUE_KEY = 'medlingo.pendingReviews';

type CardRow = {
  entry_id: string; due: string; stability: number; difficulty: number;
  reps: number; lapses: number; learning_steps?: number;
  state: CardState['state']; last_review: string | null;
};
type EntryRow = {
  id: string; hebrew: string; hebrew_nikud: string; part_of_speech: DictionaryEntry['partOfSpeech'];
  level: 1 | 2 | 3; gender: 'ז' | 'נ' | null; plural: string | null; root: string | null;
  everyday_synonym: string | null; translations: DictionaryEntry['translations']; notes: string | null;
};

function mapCardRow(r: CardRow): CardState {
  return {
    entryId: r.entry_id, due: new Date(r.due), stability: r.stability,
    difficulty: r.difficulty, reps: r.reps, lapses: r.lapses,
    learningSteps: r.learning_steps ?? 0, state: r.state,
    lastReview: r.last_review ? new Date(r.last_review) : null,
  };
}

function mapEntryRow(r: EntryRow): DictionaryEntry {
  return {
    id: r.id, hebrew: r.hebrew, hebrewNikud: r.hebrew_nikud, partOfSpeech: r.part_of_speech,
    level: r.level, gender: r.gender, plural: r.plural, root: r.root,
    everydaySynonym: r.everyday_synonym, translations: r.translations, notes: r.notes,
  };
}

function cardStateToRow(userId: string, c: CardState) {
  return {
    user_id: userId, entry_id: c.entryId, due: c.due.toISOString(),
    stability: c.stability, difficulty: c.difficulty, reps: c.reps, lapses: c.lapses,
    learning_steps: c.learningSteps,
    state: c.state, last_review: c.lastReview ? c.lastReview.toISOString() : null,
    updated_at: new Date().toISOString(),
  };
}

async function currentUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');
  return user.id;
}

export async function loadAllCards(): Promise<CardState[]> {
  const { data, error } = await supabase.from('user_card_state').select('*');
  if (error) throw error;
  return ((data ?? []) as CardRow[]).map(mapCardRow);
}

async function joinCards(cards: CardState[]): Promise<ReviewCard[]> {
  if (cards.length === 0) return [];
  const ids = cards.map((c) => c.entryId);
  const { data: entryRows, error: e1 } = await supabase
    .from('dictionary_entries').select('*').in('id', ids);
  if (e1) throw e1;
  const { data: itemRows, error: e2 } = await supabase
    .from('unit_items').select('*').in('entry_id', ids);
  if (e2) throw e2;
  const entries = new Map(((entryRows ?? []) as EntryRow[]).map((r) => [r.id, mapEntryRow(r)]));
  const contexts = new Map<string, ContextSentence[]>();
  for (const r of (itemRows ?? []) as Array<{ entry_id: string; context_sentences: ContextSentence[] }>) {
    contexts.set(r.entry_id, r.context_sentences);
  }
  return cards
    .filter((c) => entries.has(c.entryId))
    .map((c) => ({ card: c, entry: entries.get(c.entryId)!, contextSentences: contexts.get(c.entryId) ?? [] }));
}

export async function loadDueCards(now: Date = new Date()): Promise<ReviewCard[]> {
  const all = await loadAllCards();
  const due = all.filter((c) => isDue(c, now)).sort((a, b) => a.due.getTime() - b.due.getTime());
  return joinCards(due);
}

export async function loadUpcomingCards(limit: number): Promise<ReviewCard[]> {
  const all = await loadAllCards();
  const upcoming = all.sort((a, b) => a.due.getTime() - b.due.getTime()).slice(0, limit);
  return joinCards(upcoming);
}

export async function loadEntryPool(): Promise<DictionaryEntry[]> {
  const { data, error } = await supabase.from('dictionary_entries').select('*');
  if (error) throw error;
  return ((data ?? []) as EntryRow[]).map(mapEntryRow);
}

export async function seedNewCards(entryIds: string[], now: Date = new Date()): Promise<void> {
  const userId = await currentUserId();
  for (const entryId of entryIds) {
    const { error } = await supabase.from('user_card_state').upsert(
      cardStateToRow(userId, newCardState(entryId, now)),
      { onConflict: 'user_id,entry_id', ignoreDuplicates: true },
    );
    if (error) throw error;
  }
}

export interface ReviewInput {
  entryId: string;
  form: PracticeForm;
  correct: boolean;
  latencyMs: number;
  countsForScheduling?: boolean;
}

async function findCard(entryId: string, now: Date): Promise<CardState> {
  const all = await loadAllCards();
  return all.find((c) => c.entryId === entryId) ?? newCardState(entryId, now);
}

function ratingFor(input: ReviewInput): Rating {
  if (input.form === 'drill') return input.correct ? 'good' : 'again';
  return deriveRating(input.correct, input.latencyMs, input.form);
}

async function writeReview(input: ReviewInput, now: Date): Promise<CardState> {
  const userId = await currentUserId();
  const counts = input.countsForScheduling !== false;
  const card = await findCard(input.entryId, now);
  const rating = ratingFor(input);
  const next = counts ? applyReview(card, rating, now) : card;

  const { error: logError } = await supabase.from('review_logs').insert({
    user_id: userId, entry_id: input.entryId, reviewed_at: now.toISOString(),
    practice_form: input.form, rating, latency_ms: Math.round(input.latencyMs),
    counts_for_scheduling: counts,
  });
  if (logError) throw logError;

  if (counts) {
    const { error: stateError } = await supabase
      .from('user_card_state')
      .upsert(cardStateToRow(userId, next), { onConflict: 'user_id,entry_id' });
    if (stateError) throw stateError;
  }
  return next;
}

type QueuedReview = { input: ReviewInput; at: string; attempts?: number };

function readQueue(): QueuedReview[] {
  return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as QueuedReview[];
}
function writeQueue(q: QueuedReview[]) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
}

export async function submitReview(input: ReviewInput, now: Date = new Date()): Promise<CardState> {
  try {
    return await writeReview(input, now);
  } catch {
    writeQueue([...readQueue(), { input, at: now.toISOString() }]);
    const card = await findCard(input.entryId, now).catch(() => newCardState(input.entryId, now));
    return input.countsForScheduling !== false ? applyReview(card, ratingFor(input), now) : card;
  }
}

const MAX_FLUSH_ATTEMPTS = 3;

export async function flushPendingReviews(): Promise<number> {
  const queue = readQueue();
  const remaining: QueuedReview[] = [];
  let flushed = 0;
  let stopped = false;
  for (const q of queue) {
    if (stopped) {
      remaining.push(q);
      continue;
    }
    try {
      await writeReview(q.input, new Date(q.at));
      flushed++;
    } catch {
      const attempts = (q.attempts ?? 0) + 1;
      if (attempts >= MAX_FLUSH_ATTEMPTS) {
        // permanently-failing item (e.g. validation error) must not block the queue forever
        console.warn('medlingo: dropping review that failed to flush', q.input.entryId);
      } else {
        remaining.push({ ...q, attempts });
      }
      stopped = true; // preserve order — retry the rest on the next flush
    }
  }
  writeQueue(remaining);
  return flushed;
}
```

- [ ] **Step 3: Verify green**

Run: `npx vitest run src/data/cards.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 4: Commit**

```bash
git add src/data/cards.ts src/data/cards.test.ts
git commit -m "feat: add cards data layer with review logging and offline retry queue

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Exercise components + distractors

**Files:**
- Create: `src/lib/distractors.ts`, `src/components/exercises/Feedback.tsx`, `src/components/exercises/Recognition.tsx`, `src/components/exercises/Cloze.tsx`, `src/components/exercises/Recall.tsx`
- Test: `src/lib/distractors.test.ts`, `src/components/exercises/exercises.test.tsx`

**Interfaces:**
- Consumes: `He` (5), types (8).
- Produces:
  - `pickDistractors(answer: DictionaryEntry, pool: DictionaryEntry[], n?: number, rng?: () => number): DictionaryEntry[]`
  - shared props type used by all three components:
    ```ts
    export interface ExerciseResult { correct: boolean; latencyMs: number; }
    export interface ExerciseProps {
      entry: DictionaryEntry;
      contextSentences: ContextSentence[];
      distractors: DictionaryEntry[]; // exactly 3
      onResult: (r: ExerciseResult) => void;
    }
    ```
  - `Recognition`, `Cloze`, `Recall` components; testids per the registry.

- [ ] **Step 1: Write failing distractor tests**

`src/lib/distractors.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { pickDistractors } from './distractors';
import type { DictionaryEntry } from './types';

function entry(id: string, level: 1 | 2 | 3, pos: DictionaryEntry['partOfSpeech'], en: string): DictionaryEntry {
  return {
    id, hebrew: id, hebrewNikud: id, partOfSpeech: pos, level,
    gender: null, plural: null, root: null, everydaySynonym: null,
    translations: { en }, notes: null,
  };
}

const answer = entry('keev', 1, 'noun', 'pain');
const rng = () => 0.42; // deterministic

describe('pickDistractors', () => {
  it('prefers same level + same part of speech', () => {
    const pool = [
      answer,
      entry('a', 1, 'noun', 'fever'), entry('b', 1, 'noun', 'pulse'), entry('c', 1, 'noun', 'nausea'),
      entry('d', 2, 'noun', 'surgery'), entry('e', 1, 'verb', 'to breathe'),
    ];
    const picked = pickDistractors(answer, pool, 3, rng);
    expect(picked.map((p) => p.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('falls back to same level, then anything, and never includes the answer or duplicate meanings', () => {
    const pool = [
      answer,
      entry('a', 1, 'verb', 'to cough'),
      entry('b', 2, 'noun', 'pain'),         // duplicate meaning of the answer — excluded
      entry('c', 3, 'phrase', 'blood test'),
      entry('d', 2, 'noun', 'infection'),
    ];
    const picked = pickDistractors(answer, pool, 3, rng);
    expect(picked).toHaveLength(3);
    expect(picked.some((p) => p.id === 'keev')).toBe(false);
    expect(picked.some((p) => p.translations.en === 'pain')).toBe(false);
  });
});
```

Run: `npx vitest run src/lib/distractors.test.ts`
Expected: FAIL — `./distractors` not found.

- [ ] **Step 2: Implement distractors**

`src/lib/distractors.ts`:
```ts
import type { DictionaryEntry } from './types';

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickDistractors(
  answer: DictionaryEntry,
  pool: DictionaryEntry[],
  n = 3,
  rng: () => number = Math.random,
): DictionaryEntry[] {
  const usable = pool.filter(
    (e) => e.id !== answer.id && e.translations.en !== answer.translations.en,
  );
  const tiers = [
    usable.filter((e) => e.level === answer.level && e.partOfSpeech === answer.partOfSpeech),
    usable.filter((e) => e.level === answer.level && e.partOfSpeech !== answer.partOfSpeech),
    usable.filter((e) => e.level !== answer.level),
  ];
  const picked: DictionaryEntry[] = [];
  const seenMeanings = new Set([answer.translations.en]);
  for (const tier of tiers) {
    for (const e of shuffle(tier, rng)) {
      if (picked.length >= n) break;
      if (seenMeanings.has(e.translations.en)) continue;
      picked.push(e);
      seenMeanings.add(e.translations.en);
    }
  }
  return picked;
}
```

Run: `npx vitest run src/lib/distractors.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 3: Write failing exercise-component tests**

`src/components/exercises/exercises.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '../../lib/i18n';
import type { DictionaryEntry } from '../../lib/types';
import { Recognition } from './Recognition';
import { Cloze } from './Cloze';
import { Recall } from './Recall';

function entry(id: string, hebrew: string, en: string): DictionaryEntry {
  return {
    id, hebrew, hebrewNikud: hebrew, partOfSpeech: 'noun', level: 1,
    gender: 'ז', plural: null, root: null, everydaySynonym: 'רגישות',
    translations: { en }, notes: null,
  };
}

const answer = entry('keev', 'כאב', 'pain');
const distractors = [entry('a', 'חום', 'fever'), entry('b', 'דופק', 'pulse'), entry('c', 'בחילה', 'nausea')];
const context = [{ he: 'יש לי כאב חזק בחזה.', translations: { en: 'I have strong chest pain.' } }];

async function answerAndContinue(correctText: string, wrong = false) {
  const buttons = screen.getAllByTestId(/exercise-(option|tile)-/);
  const target = wrong
    ? buttons.find((b) => b.textContent !== correctText)!
    : buttons.find((b) => b.textContent === correctText)!;
  await userEvent.click(target);
  expect(screen.getByTestId('exercise-feedback')).toBeInTheDocument();
  await userEvent.click(screen.getByTestId('exercise-continue'));
}

describe('Recognition', () => {
  it('reports correct on tapping the right meaning', async () => {
    const onResult = vi.fn();
    render(<Recognition entry={answer} contextSentences={context} distractors={distractors} onResult={onResult} />);
    await answerAndContinue('pain');
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ correct: true }));
    expect(onResult.mock.calls[0][0].latencyMs).toBeGreaterThanOrEqual(0);
  });
  it('reports wrong on tapping a distractor', async () => {
    const onResult = vi.fn();
    render(<Recognition entry={answer} contextSentences={context} distractors={distractors} onResult={onResult} />);
    await answerAndContinue('pain', true);
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ correct: false }));
  });
});

describe('Cloze', () => {
  it('blanks the term in the context sentence and grades tile taps', async () => {
    const onResult = vi.fn();
    render(<Cloze entry={answer} contextSentences={context} distractors={distractors} onResult={onResult} />);
    expect(screen.getByText(/____/)).toBeInTheDocument();
    await answerAndContinue('כאב');
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ correct: true }));
  });
});

describe('Recall', () => {
  it('shows the meaning and grades Hebrew tile taps', async () => {
    const onResult = vi.fn();
    render(<Recall entry={answer} contextSentences={context} distractors={distractors} onResult={onResult} />);
    expect(screen.getByText('pain')).toBeInTheDocument();
    await answerAndContinue('כאב');
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ correct: true }));
  });
});
```

Run: `npx vitest run src/components/exercises/exercises.test.tsx`
Expected: FAIL — components not found.

- [ ] **Step 4: Implement the shared feedback panel and the three components**

`src/components/exercises/Feedback.tsx`:
```tsx
import { useTranslation } from 'react-i18next';
import { He } from '../He';
import type { DictionaryEntry } from '../../lib/types';

export function Feedback({ entry, correct, onContinue }: {
  entry: DictionaryEntry; correct: boolean; onContinue: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div data-testid="exercise-feedback" className="mt-4 rounded border p-4">
      <p className={correct ? 'font-semibold text-green-700' : 'font-semibold text-red-700'}>
        {correct ? t('review.correct') : t('review.wrong')}
      </p>
      <p className="mt-2">
        {t('review.answer')}: <He className="text-lg font-semibold">{entry.hebrewNikud}</He>
        {' — '}{entry.translations.en}
      </p>
      {entry.everydaySynonym && (
        <p className="text-sm text-gray-600">
          {t('unit.everyday')}: <He>{entry.everydaySynonym}</He>
        </p>
      )}
      <button
        data-testid="exercise-continue"
        onClick={onContinue}
        className="mt-3 w-full rounded bg-blue-700 p-2 text-white"
      >
        {t('common.continue')}
      </button>
    </div>
  );
}
```

Shared bits + `Recognition` — `src/components/exercises/Recognition.tsx`:
```tsx
import { useMemo, useRef, useState } from 'react';
import { He } from '../He';
import { Feedback } from './Feedback';
import type { ContextSentence, DictionaryEntry } from '../../lib/types';

export interface ExerciseResult { correct: boolean; latencyMs: number; }
export interface ExerciseProps {
  entry: DictionaryEntry;
  contextSentences: ContextSentence[];
  distractors: DictionaryEntry[];
  onResult: (r: ExerciseResult) => void;
}

export function useExercise(onResult: (r: ExerciseResult) => void) {
  const startedAt = useRef(performance.now());
  const [answered, setAnswered] = useState<null | boolean>(null);
  const latency = useRef(0);
  const finished = useRef(false); // double-tap on Continue must not re-fire onResult (duplicate review writes)
  function answer(correct: boolean) {
    if (answered !== null) return;
    latency.current = performance.now() - startedAt.current;
    setAnswered(correct);
  }
  function finish() {
    if (finished.current) return;
    finished.current = true;
    onResult({ correct: answered!, latencyMs: latency.current });
  }
  return { answered, answer, finish };
}

export function shuffledOnce<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}

export function Recognition({ entry, distractors, onResult }: ExerciseProps) {
  const { answered, answer, finish } = useExercise(onResult);
  const options = useMemo(
    () => shuffledOnce([entry, ...distractors]),
    [entry, distractors],
  );
  return (
    <div className="p-4">
      <He className="block text-center text-3xl font-bold">{entry.hebrewNikud}</He>
      <div className="mt-6 flex flex-col gap-2">
        {options.map((o, i) => (
          <button
            key={o.id}
            data-testid={`exercise-option-${i}`}
            disabled={answered !== null}
            onClick={() => answer(o.id === entry.id)}
            className="rounded border p-3 text-start disabled:opacity-60"
          >
            {o.translations.en}
          </button>
        ))}
      </div>
      {answered !== null && <Feedback entry={entry} correct={answered} onContinue={finish} />}
    </div>
  );
}
```

`src/components/exercises/Cloze.tsx`:
```tsx
import { useMemo } from 'react';
import { He } from '../He';
import { Feedback } from './Feedback';
import { useExercise, shuffledOnce, type ExerciseProps } from './Recognition';

export function blankOut(sentence: string, surface: string): string {
  return sentence.includes(surface) ? sentence.replace(surface, '____') : `____ — ${sentence}`;
}

export function Cloze({ entry, contextSentences, distractors, onResult }: ExerciseProps) {
  const { answered, answer, finish } = useExercise(onResult);
  const sentence = contextSentences[0]?.he ?? entry.hebrew;
  const blanked = blankOut(sentence, entry.hebrew);
  const tiles = useMemo(() => shuffledOnce([entry, ...distractors]), [entry, distractors]);
  return (
    <div className="p-4">
      <He className="block text-center text-xl">{blanked}</He>
      {contextSentences[0] && (
        <p className="mt-1 text-center text-sm text-gray-600">{contextSentences[0].translations.en}</p>
      )}
      <div className="mt-6 grid grid-cols-2 gap-2">
        {tiles.map((o, i) => (
          <button
            key={o.id}
            data-testid={`exercise-tile-${i}`}
            disabled={answered !== null}
            onClick={() => answer(o.id === entry.id)}
            className="rounded border p-3 disabled:opacity-60"
          >
            <He>{o.hebrew}</He>
          </button>
        ))}
      </div>
      {answered !== null && <Feedback entry={entry} correct={answered} onContinue={finish} />}
    </div>
  );
}
```

`src/components/exercises/Recall.tsx`:
```tsx
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { He } from '../He';
import { Feedback } from './Feedback';
import { useExercise, shuffledOnce, type ExerciseProps } from './Recognition';

export function Recall({ entry, distractors, onResult }: ExerciseProps) {
  const { t } = useTranslation();
  const { answered, answer, finish } = useExercise(onResult);
  const tiles = useMemo(() => shuffledOnce([entry, ...distractors]), [entry, distractors]);
  return (
    <div className="p-4">
      <p className="text-center text-2xl font-semibold">{entry.translations.en}</p>
      {entry.gender && (
        <p className="text-center text-sm text-gray-600">{t('unit.gender')}: <He>{entry.gender}</He></p>
      )}
      <div className="mt-6 grid grid-cols-2 gap-2">
        {tiles.map((o, i) => (
          <button
            key={o.id}
            data-testid={`exercise-tile-${i}`}
            disabled={answered !== null}
            onClick={() => answer(o.id === entry.id)}
            className="rounded border p-3 disabled:opacity-60"
          >
            <He>{o.hebrew}</He>
          </button>
        ))}
      </div>
      {answered !== null && <Feedback entry={entry} correct={answered} onContinue={finish} />}
    </div>
  );
}
```

- [ ] **Step 5: Verify green**

Run: `npx vitest run src/components/exercises/exercises.test.tsx src/lib/distractors.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/distractors.ts src/lib/distractors.test.ts src/components/exercises/
git commit -m "feat: add recognition/cloze/recall exercises with shared feedback panel

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Review session flow

**Files:**
- Create: `src/pages/ReviewPage.tsx`
- Modify: `src/App.tsx` (add `/review` route)
- Test: `src/pages/ReviewPage.test.tsx`

**Interfaces:**
- Consumes: `loadDueCards`, `loadUpcomingCards`, `loadEntryPool`, `submitReview` (9); `selectForm`, `deriveRating` via submitReview (8); exercise components (10); `touchStreak` (13 — declared here, implemented there; until Task 13 lands, import from `../data/profile` will fail, so this task creates a stub in profile.ts).
- Produces: `/review` route; `ReviewPage`; testids `review-summary`, `review-caught-up`, `review-extra-practice`. `?extra=1` starts extra practice directly.

- [ ] **Step 1: Add the touchStreak stub**

Append to `src/data/profile.ts` (Task 13 replaces the body):
```ts
export async function touchStreak(): Promise<void> {
  // implemented in Task 13 (streak logic); no-op stub so ReviewPage can ship first
}
```

- [ ] **Step 2: Write failing session tests**

`src/pages/ReviewPage.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import '../lib/i18n';
import type { ReviewCard, DictionaryEntry } from '../lib/types';

function entry(id: string, hebrew: string, en: string): DictionaryEntry {
  return {
    id, hebrew, hebrewNikud: hebrew, partOfSpeech: 'noun', level: 1,
    gender: null, plural: null, root: null, everydaySynonym: null,
    translations: { en }, notes: null,
  };
}
function reviewCard(id: string, hebrew: string, en: string): ReviewCard {
  return {
    card: {
      entryId: id, due: new Date('2026-07-10T00:00:00Z'), stability: 1, difficulty: 5,
      reps: 1, lapses: 0, learningSteps: 0, state: 'learning', lastReview: null,
    },
    entry: entry(id, hebrew, en),
    contextSentences: [{ he: `משפט עם ${hebrew}.`, translations: { en: `sentence with ${en}` } }],
  };
}

const db = {
  due: [] as ReviewCard[],
  upcoming: [] as ReviewCard[],
  pool: [
    entry('keev', 'כאב', 'pain'), entry('chom', 'חום', 'fever'),
    entry('dofek', 'דופק', 'pulse'), entry('bchila', 'בחילה', 'nausea'),
    entry('trufa', 'תרופה', 'medication'),
  ],
  submitted: [] as Array<{ entryId: string; countsForScheduling?: boolean }>,
};

vi.mock('../data/cards', () => ({
  loadDueCards: () => Promise.resolve(db.due),
  loadUpcomingCards: () => Promise.resolve(db.upcoming),
  loadEntryPool: () => Promise.resolve(db.pool),
  submitReview: (input: { entryId: string; countsForScheduling?: boolean }) => {
    db.submitted.push(input);
    return Promise.resolve(reviewCard(input.entryId, 'x', 'x').card);
  },
  flushPendingReviews: () => Promise.resolve(0),
}));
const touchStreak = vi.fn().mockResolvedValue(undefined);
vi.mock('../data/profile', () => ({ touchStreak: () => touchStreak() }));

import { ReviewPage } from './ReviewPage';

async function answerCurrent(correct: boolean, correctHebrewOrEnglish: string) {
  const buttons = await screen.findAllByTestId(/exercise-(option|tile)-/);
  const target = correct
    ? buttons.find((b) => b.textContent === correctHebrewOrEnglish)!
    : buttons.find((b) => b.textContent !== correctHebrewOrEnglish)!;
  await userEvent.click(target);
  await userEvent.click(screen.getByTestId('exercise-continue'));
}

describe('ReviewPage', () => {
  beforeEach(() => {
    db.due = [];
    db.upcoming = [];
    db.submitted = [];
    touchStreak.mockClear();
  });

  it('runs through due cards and shows the summary', async () => {
    db.due = [reviewCard('keev', 'כאב', 'pain')];
    render(<MemoryRouter><ReviewPage /></MemoryRouter>);
    await answerCurrent(true, 'pain'); // stability 1 → recognition form
    expect(await screen.findByTestId('review-summary')).toBeInTheDocument();
    expect(db.submitted).toHaveLength(1);
    expect(touchStreak).toHaveBeenCalledOnce();
  });

  it('requeues a wrong answer once', async () => {
    db.due = [reviewCard('keev', 'כאב', 'pain')];
    render(<MemoryRouter><ReviewPage /></MemoryRouter>);
    await answerCurrent(false, 'pain');           // wrong → requeued
    await answerCurrent(true, 'pain');            // asked again
    expect(await screen.findByTestId('review-summary')).toBeInTheDocument();
    expect(db.submitted).toHaveLength(2);
  });

  it('shows caught-up state with extra practice when nothing is due', async () => {
    db.upcoming = [reviewCard('chom', 'חום', 'fever')];
    render(<MemoryRouter><ReviewPage /></MemoryRouter>);
    expect(await screen.findByTestId('review-caught-up')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('review-extra-practice'));
    await answerCurrent(true, 'fever');
    expect(await screen.findByTestId('review-summary')).toBeInTheDocument();
    expect(db.submitted[0].countsForScheduling).toBe(false);
  });
});
```

Run: `npx vitest run src/pages/ReviewPage.test.tsx`
Expected: FAIL — `./ReviewPage` not found.

- [ ] **Step 3: Implement the orchestrator**

`src/pages/ReviewPage.tsx`:
```tsx
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  loadDueCards, loadUpcomingCards, loadEntryPool, submitReview, flushPendingReviews,
} from '../data/cards';
import { touchStreak } from '../data/profile';
import { selectForm } from '../lib/fsrs';
import { pickDistractors } from '../lib/distractors';
import { Recognition, type ExerciseResult } from '../components/exercises/Recognition';
import { Cloze } from '../components/exercises/Cloze';
import { Recall } from '../components/exercises/Recall';
import type { DictionaryEntry, ReviewCard } from '../lib/types';

const EXTRA_LIMIT = 10;

type Phase =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'caught-up'; nextDue: Date | null }
  | { kind: 'running'; queue: ReviewCard[]; index: number; requeued: Set<string>; correct: number; total: number; extra: boolean }
  | { kind: 'summary'; correct: number; total: number };

export function ReviewPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [pool, setPool] = useState<DictionaryEntry[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });

  async function startExtra() {
    try {
      const upcoming = await loadUpcomingCards(EXTRA_LIMIT);
      setPhase({
        kind: 'running', queue: upcoming, index: 0, requeued: new Set(),
        correct: 0, total: 0, extra: true,
      });
    } catch {
      setPhase({ kind: 'error' });
    }
  }

  useEffect(() => {
    (async () => {
      try {
        await flushPendingReviews();
        setPool(await loadEntryPool());
        if (params.get('extra') === '1') return void (await startExtra());
        const due = await loadDueCards();
        if (due.length === 0) {
          const upcoming = await loadUpcomingCards(1);
          setPhase({ kind: 'caught-up', nextDue: upcoming[0]?.card.due ?? null });
        } else {
          setPhase({
            kind: 'running', queue: due, index: 0, requeued: new Set(),
            correct: 0, total: 0, extra: false,
          });
        }
      } catch {
        setPhase({ kind: 'error' });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = phase.kind === 'running' ? phase.queue[phase.index] : null;
  const distractors = useMemo(
    () => (current ? pickDistractors(current.entry, pool) : []),
    [current, pool],
  );

  async function handleResult(r: ExerciseResult) {
    if (phase.kind !== 'running' || !current) return;
    const form = selectForm(current.card);
    await submitReview({
      entryId: current.entry.id, form, correct: r.correct, latencyMs: r.latencyMs,
      ...(phase.extra ? { countsForScheduling: false } : {}),
    });
    const queue = [...phase.queue];
    const requeued = new Set(phase.requeued);
    if (!r.correct && !requeued.has(current.entry.id)) {
      requeued.add(current.entry.id);
      queue.push(current);
    }
    const total = phase.total + 1;
    const correct = phase.correct + (r.correct ? 1 : 0);
    const index = phase.index + 1;
    if (index >= queue.length) {
      await touchStreak();
      setPhase({ kind: 'summary', correct, total });
    } else {
      setPhase({ ...phase, queue, index, requeued, correct, total });
    }
  }

  if (phase.kind === 'loading') return <p className="p-4">{t('common.loading')}</p>;
  if (phase.kind === 'error') {
    return (
      <div className="p-4">
        <p role="alert">{t('auth.error')}</p>
        <button onClick={() => window.location.reload()} className="mt-2 rounded border p-2">
          {t('common.retry')}
        </button>
      </div>
    );
  }
  if (phase.kind === 'caught-up') {
    return (
      <div data-testid="review-caught-up" className="p-6 text-center">
        <h1 className="text-2xl font-semibold">{t('review.caughtUp')}</h1>
        {phase.nextDue && (
          <p className="mt-2 text-gray-600">
            {t('review.nextDue', { time: phase.nextDue.toLocaleString() })}
          </p>
        )}
        <button
          data-testid="review-extra-practice"
          onClick={startExtra}
          className="mt-4 rounded border p-2"
        >
          {t('review.extra')}
        </button>
        <p className="mt-4"><Link to="/" className="underline">{t('common.back')}</Link></p>
      </div>
    );
  }
  if (phase.kind === 'summary') {
    const pct = phase.total === 0 ? 0 : Math.round((100 * phase.correct) / phase.total);
    return (
      <div data-testid="review-summary" className="p-6 text-center">
        <h1 className="text-2xl font-semibold">{t('review.summary')}</h1>
        <p className="mt-2">{t('review.reviewed', { count: phase.total })}</p>
        <p>{t('review.accuracy', { pct })}</p>
        <p className="mt-4"><Link to="/" className="underline">{t('common.back')}</Link></p>
      </div>
    );
  }
  if (!current) {
    return (
      <div data-testid="review-caught-up" className="p-6 text-center">
        <p>{t('review.empty')}</p>
        <p className="mt-4"><Link to="/" className="underline">{t('common.back')}</Link></p>
      </div>
    );
  }

  const form = selectForm(current.card);
  const props = {
    key: `${current.entry.id}-${phase.index}`,
    entry: current.entry,
    contextSentences: current.contextSentences,
    distractors,
    onResult: handleResult,
  };
  if (form === 'flashcard_recognition') return <Recognition {...props} />;
  if (form === 'cloze') return <Cloze {...props} />;
  return <Recall {...props} />;
}
```

Modify `src/App.tsx` — add the route inside `<Routes>`:
```tsx
import { ReviewPage } from './pages/ReviewPage';
// …
<Route path="/review" element={<ProtectedRoute><ReviewPage /></ProtectedRoute>} />
```

- [ ] **Step 4: Verify green**

Run: `npx vitest run src/pages/ReviewPage.test.tsx && npm test`
Expected: PASS — session, requeue, and caught-up tests green; full suite green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add review session orchestrator with requeue, summary, and caught-up states

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Unit learning flow

**Files:**
- Create: `src/data/units.ts`, `src/pages/UnitPage.tsx`
- Modify: `src/App.tsx` (add `/unit/:slug` route)
- Test: `src/data/units.test.ts`, `src/pages/UnitPage.test.tsx`

**Interfaces:**
- Consumes: exercises (10), `seedNewCards`/`submitReview`/`loadEntryPool` (9), `He` (5).
- Produces:
  - `loadUnits(): Promise<Unit[]>`
  - `loadUnit(slug: string): Promise<{ unit: Unit; items: Array<UnitItem & { entry: DictionaryEntry }> }>`
  - `loadUnitProgress(slug: string): Promise<'not_started' | 'in_progress' | 'completed'>`
  - `startUnit(slug: string): Promise<void>`, `completeUnit(slug: string): Promise<void>`
  - `/unit/:slug` route; testids `unit-start`, `unit-gloss`, `unit-vocab-continue`, `unit-complete`.

- [ ] **Step 1: Write failing data-layer tests**

`src/data/units.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls: Array<{ table: string; op: string; payload?: unknown }> = [];
const responses: Record<string, unknown[]> = {};

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => Promise.resolve({ data: responses[table] ?? [], error: null }),
        maybeSingle: () => Promise.resolve({ data: (responses[table] ?? [])[0] ?? null, error: null }),
        in: () => Promise.resolve({ data: responses[table] ?? [], error: null }),
        upsert: (payload: unknown) => {
          calls.push({ table, op: 'upsert', payload });
          return Promise.resolve({ data: payload, error: null });
        },
        then: (res: (v: { data: unknown[]; error: null }) => void) =>
          Promise.resolve({ data: responses[table] ?? [], error: null }).then(res),
      };
      return chain;
    },
  },
}));

import { loadUnitProgress, startUnit, completeUnit } from './units';

describe('units data layer', () => {
  beforeEach(() => {
    calls.length = 0;
    for (const k of Object.keys(responses)) delete responses[k];
  });

  it('loadUnitProgress defaults to not_started', async () => {
    expect(await loadUnitProgress('unit-01-intake')).toBe('not_started');
  });

  it('startUnit upserts in_progress', async () => {
    await startUnit('unit-01-intake');
    const call = calls.find((c) => c.table === 'unit_progress')!;
    expect(call.payload).toMatchObject({ status: 'in_progress', unit_slug: 'unit-01-intake', user_id: 'u1' });
  });

  it('completeUnit upserts completed with a timestamp', async () => {
    await completeUnit('unit-01-intake');
    const call = calls.find((c) => c.table === 'unit_progress')!;
    expect(call.payload).toMatchObject({ status: 'completed' });
    expect((call.payload as { completed_at: string }).completed_at).toBeTruthy();
  });
});
```

Run: `npx vitest run src/data/units.test.ts`
Expected: FAIL — `./units` not found.

- [ ] **Step 2: Implement the data layer**

`src/data/units.ts`:
```ts
import { supabase } from '../lib/supabase';
import type { DictionaryEntry, Unit, UnitItem } from '../lib/types';

type UnitRow = {
  slug: string; level: 1 | 2 | 3; display_order: number;
  status: 'draft' | 'published'; title: Unit['title']; dialogue: Unit['dialogue'];
};
type ItemRow = {
  unit_slug: string; entry_id: string; display_order: number;
  context_sentences: UnitItem['contextSentences'];
};
type EntryRow = Parameters<typeof mapEntry>[0];

function mapUnit(r: UnitRow): Unit {
  return {
    slug: r.slug, level: r.level, displayOrder: r.display_order,
    status: r.status, title: r.title, dialogue: r.dialogue,
  };
}
function mapEntry(r: {
  id: string; hebrew: string; hebrew_nikud: string;
  part_of_speech: DictionaryEntry['partOfSpeech']; level: 1 | 2 | 3;
  gender: 'ז' | 'נ' | null; plural: string | null; root: string | null;
  everyday_synonym: string | null; translations: DictionaryEntry['translations']; notes: string | null;
}): DictionaryEntry {
  return {
    id: r.id, hebrew: r.hebrew, hebrewNikud: r.hebrew_nikud, partOfSpeech: r.part_of_speech,
    level: r.level, gender: r.gender, plural: r.plural, root: r.root,
    everydaySynonym: r.everyday_synonym, translations: r.translations, notes: r.notes,
  };
}

async function currentUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');
  return user.id;
}

export async function loadUnits(): Promise<Unit[]> {
  const { data, error } = await supabase.from('units').select('*').order('display_order');
  if (error) throw error;
  return ((data ?? []) as UnitRow[]).map(mapUnit);
}

export async function loadUnit(slug: string) {
  const { data: unitRow, error: e1 } = await supabase
    .from('units').select('*').eq('slug', slug).maybeSingle();
  if (e1) throw e1;
  if (!unitRow) throw new Error(`unit not found: ${slug}`);
  const { data: itemRows, error: e2 } = await supabase
    .from('unit_items').select('*').eq('unit_slug', slug).order('display_order');
  if (e2) throw e2;
  const items = (itemRows ?? []) as ItemRow[];
  const { data: entryRows, error: e3 } = await supabase
    .from('dictionary_entries').select('*').in('id', items.map((i) => i.entry_id));
  if (e3) throw e3;
  const entries = new Map(((entryRows ?? []) as EntryRow[]).map((r) => [r.id, mapEntry(r)]));
  return {
    unit: mapUnit(unitRow as UnitRow),
    items: items
      .filter((i) => entries.has(i.entry_id))
      .map((i) => ({
        entryId: i.entry_id, displayOrder: i.display_order,
        contextSentences: i.context_sentences, entry: entries.get(i.entry_id)!,
      })),
  };
}

export async function loadUnitProgress(slug: string) {
  const { data, error } = await supabase
    .from('unit_progress').select('status').eq('unit_slug', slug).maybeSingle();
  if (error) throw error;
  return (data?.status ?? 'not_started') as 'not_started' | 'in_progress' | 'completed';
}

export async function startUnit(slug: string): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase.from('unit_progress').upsert(
    { user_id: userId, unit_slug: slug, status: 'in_progress' },
    { onConflict: 'user_id,unit_slug', ignoreDuplicates: true },
  );
  if (error) throw error;
}

export async function completeUnit(slug: string): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase.from('unit_progress').upsert(
    { user_id: userId, unit_slug: slug, status: 'completed', completed_at: new Date().toISOString() },
    { onConflict: 'user_id,unit_slug' },
  );
  if (error) throw error;
}
```

Run: `npx vitest run src/data/units.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 3: Write failing UnitPage tests**

`src/pages/UnitPage.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import '../lib/i18n';
import type { DictionaryEntry } from '../lib/types';

function entry(id: string, hebrew: string, en: string): DictionaryEntry {
  return {
    id, hebrew, hebrewNikud: hebrew, partOfSpeech: 'noun', level: 1,
    gender: 'ז', plural: null, root: null, everydaySynonym: null,
    translations: { en }, notes: null,
  };
}

const unitData = {
  unit: {
    slug: 'unit-01-intake', level: 1 as const, displayOrder: 1, status: 'published' as const,
    title: { en: 'Patient intake' },
    dialogue: [
      { order: 1, speaker: 'רופאה', he: 'יש לך כאב?', translations: { en: 'Do you have pain?' } },
      { order: 2, speaker: 'מטופל', he: 'כן, יש לי חום.', translations: { en: 'Yes, I have fever.' } },
    ],
  },
  items: [
    { entryId: 'keev', displayOrder: 1, entry: entry('keev', 'כאב', 'pain'),
      contextSentences: [{ he: 'יש לך כאב?', translations: { en: 'Do you have pain?' } }] },
    { entryId: 'chom', displayOrder: 2, entry: entry('chom', 'חום', 'fever'),
      contextSentences: [{ he: 'כן, יש לי חום.', translations: { en: 'Yes, I have fever.' } }] },
  ],
};

const seedNewCards = vi.fn().mockResolvedValue(undefined);
const submitReview = vi.fn().mockResolvedValue({});
const completeUnit = vi.fn().mockResolvedValue(undefined);
const startUnit = vi.fn().mockResolvedValue(undefined);

vi.mock('../data/units', () => ({
  loadUnit: () => Promise.resolve(unitData),
  loadUnitProgress: () => Promise.resolve('not_started'),
  startUnit: (...a: unknown[]) => startUnit(...a),
  completeUnit: (...a: unknown[]) => completeUnit(...a),
}));
vi.mock('../data/cards', () => ({
  seedNewCards: (...a: unknown[]) => seedNewCards(...a),
  submitReview: (...a: unknown[]) => submitReview(...a),
  loadEntryPool: () => Promise.resolve(unitData.items.map((i) => i.entry)),
}));

import { UnitPage } from './UnitPage';

async function completeExercise() {
  const buttons = await screen.findAllByTestId(/exercise-(option|tile)-/);
  await userEvent.click(buttons[0]);
  await userEvent.click(screen.getByTestId('exercise-continue'));
}

describe('UnitPage', () => {
  beforeEach(() => {
    seedNewCards.mockClear(); submitReview.mockClear();
    completeUnit.mockClear(); startUnit.mockClear();
  });

  it('walks scenario → vocab → practice → completion', async () => {
    render(
      <MemoryRouter initialEntries={['/unit/unit-01-intake']}>
        <Routes><Route path="/unit/:slug" element={<UnitPage />} /></Routes>
      </MemoryRouter>,
    );
    // scenario
    expect(await screen.findByText('Do you have pain?')).toBeInTheDocument();
    expect(startUnit).toHaveBeenCalledWith('unit-01-intake');
    await userEvent.click(screen.getByTestId('unit-start'));
    // vocab intro: 2 cards
    await userEvent.click(await screen.findByTestId('unit-vocab-continue'));
    await userEvent.click(await screen.findByTestId('unit-vocab-continue'));
    // practice begins → seeded once
    expect(seedNewCards).toHaveBeenCalledTimes(1);
    expect(seedNewCards.mock.calls[0][0]).toEqual(['keev', 'chom']);
    // 2 entries × (recognition + cloze) = 4 exercises
    for (let i = 0; i < 4; i++) await completeExercise();
    expect(submitReview).toHaveBeenCalledTimes(4);
    // completion
    expect(await screen.findByTestId('unit-complete')).toBeInTheDocument();
    expect(completeUnit).toHaveBeenCalledWith('unit-01-intake');
  });

  it('opens a gloss when tapping a unit word in the dialogue', async () => {
    render(
      <MemoryRouter initialEntries={['/unit/unit-01-intake']}>
        <Routes><Route path="/unit/:slug" element={<UnitPage />} /></Routes>
      </MemoryRouter>,
    );
    await screen.findByText('Do you have pain?');
    const glossButtons = screen.getAllByTestId('unit-gloss');
    await userEvent.click(glossButtons[0]);
    expect(await screen.findByTestId('unit-gloss-panel')).toHaveTextContent('pain');
  });

  it('double-clicking the final vocab Continue seeds cards exactly once', async () => {
    render(
      <MemoryRouter initialEntries={['/unit/unit-01-intake']}>
        <Routes><Route path="/unit/:slug" element={<UnitPage />} /></Routes>
      </MemoryRouter>,
    );
    await screen.findByText('Do you have pain?');
    await userEvent.click(screen.getByTestId('unit-start'));
    await userEvent.click(await screen.findByTestId('unit-vocab-continue')); // card 1 → card 2
    const finalContinue = await screen.findByTestId('unit-vocab-continue');
    fireEvent.click(finalContinue);
    fireEvent.click(finalContinue); // second tap lands before enterPractice's await resolves
    await screen.findAllByTestId(/exercise-(option|tile)-/); // practice phase reached
    expect(seedNewCards).toHaveBeenCalledTimes(1);
  });
});
```

Run: `npx vitest run src/pages/UnitPage.test.tsx`
Expected: FAIL — `./UnitPage` not found.

- [ ] **Step 4: Implement UnitPage**

`src/pages/UnitPage.tsx`:
```tsx
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { He } from '../components/He';
import { Recognition, type ExerciseResult } from '../components/exercises/Recognition';
import { Cloze } from '../components/exercises/Cloze';
import { loadUnit, loadUnitProgress, startUnit, completeUnit } from '../data/units';
import { seedNewCards, submitReview, loadEntryPool } from '../data/cards';
import { pickDistractors } from '../lib/distractors';
import type { DictionaryEntry, UnitItem } from '../lib/types';

type LoadedItem = UnitItem & { entry: DictionaryEntry };
type Phase =
  | { kind: 'loading' }
  | { kind: 'scenario' }
  | { kind: 'vocab'; index: number }
  | { kind: 'practice'; index: number } // index over items×2: even=recognition, odd=cloze
  | { kind: 'done' };

function DialogueWord({ text, item, onGloss }: {
  text: string; item: LoadedItem | undefined; onGloss: (i: LoadedItem) => void;
}) {
  if (!item) return <>{text}</>;
  return (
    <button data-testid="unit-gloss" onClick={() => onGloss(item)} className="underline decoration-dotted">
      {text}
    </button>
  );
}

function renderLine(he: string, items: LoadedItem[], onGloss: (i: LoadedItem) => void) {
  // split the line on unit-word surface forms so each becomes a tappable gloss
  const surfaces = items.map((i) => i.entry.hebrew).sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`(${surfaces.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  const parts = he.split(pattern);
  return parts.map((p, i) => (
    <Fragment key={i}>
      <DialogueWord text={p} item={items.find((it) => it.entry.hebrew === p)} onGloss={onGloss} />
    </Fragment>
  ));
}

export function UnitPage() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const [data, setData] = useState<Awaited<ReturnType<typeof loadUnit>> | null>(null);
  const [pool, setPool] = useState<DictionaryEntry[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [gloss, setGloss] = useState<LoadedItem | null>(null);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const [loaded, entryPool, progress] = await Promise.all([
        loadUnit(slug), loadEntryPool(), loadUnitProgress(slug),
      ]);
      setData(loaded);
      setPool(entryPool);
      if (progress === 'not_started') await startUnit(slug);
      setPhase({ kind: 'scenario' });
    })();
  }, [slug]);

  const items = useMemo(() => data?.items ?? [], [data]);

  const seeding = useRef(false); // double-tap on the last vocab Continue must not seed twice

  async function enterPractice() {
    if (seeding.current) return;
    seeding.current = true;
    await seedNewCards(items.map((i) => i.entryId));
    setPhase({ kind: 'practice', index: 0 });
  }

  async function handlePracticeResult(item: LoadedItem, form: 'flashcard_recognition' | 'cloze', r: ExerciseResult) {
    await submitReview({ entryId: item.entryId, form, correct: r.correct, latencyMs: r.latencyMs });
    if (phase.kind !== 'practice') return;
    const next = phase.index + 1;
    if (next >= items.length * 2) {
      await completeUnit(slug!);
      setPhase({ kind: 'done' });
    } else {
      setPhase({ kind: 'practice', index: next });
    }
  }

  if (phase.kind === 'loading' || !data) return <p className="p-4">{t('common.loading')}</p>;

  if (phase.kind === 'scenario') {
    return (
      <div className="p-4">
        <h1 className="text-xl font-semibold">{t('unit.scenario')}: {data.unit.title.en}</h1>
        <div className="mt-4 flex flex-col gap-3">
          {data.unit.dialogue.map((line) => (
            <div key={line.order} className="rounded border p-3">
              <p className="text-sm font-semibold text-gray-600"><He>{line.speaker}</He></p>
              <p className="text-lg"><He>{renderLine(line.he, items, setGloss)}</He></p>
              <p className="text-sm text-gray-600">{line.translations.en}</p>
            </div>
          ))}
        </div>
        {gloss && (
          <div
            data-testid="unit-gloss-panel"
            className="fixed inset-x-0 bottom-0 border-t bg-white p-4 shadow-lg"
            onClick={() => setGloss(null)}
          >
            <p><He className="text-xl font-bold">{gloss.entry.hebrewNikud}</He> — {gloss.entry.translations.en}</p>
            {gloss.entry.gender && <p className="text-sm">{t('unit.gender')}: <He>{gloss.entry.gender}</He></p>}
            {gloss.entry.everydaySynonym && (
              <p className="text-sm">{t('unit.everyday')}: <He>{gloss.entry.everydaySynonym}</He></p>
            )}
          </div>
        )}
        <button
          data-testid="unit-start"
          onClick={() => setPhase({ kind: 'vocab', index: 0 })}
          className="mt-6 w-full rounded bg-blue-700 p-3 text-white"
        >
          {t('unit.vocab')}
        </button>
      </div>
    );
  }

  if (phase.kind === 'vocab') {
    const item = items[phase.index];
    return (
      <div className="p-4">
        <p className="text-sm text-gray-600">{t('unit.vocab')} {phase.index + 1}/{items.length}</p>
        <div className="mt-4 rounded border p-6 text-center">
          <He className="block text-3xl font-bold">{item.entry.hebrewNikud}</He>
          <p className="mt-2 text-xl">{item.entry.translations.en}</p>
          {item.entry.gender && (
            <p className="mt-1 text-sm text-gray-600">
              {t('unit.gender')}: <He>{item.entry.gender}</He>
              {item.entry.plural && <> · {t('unit.plural')}: <He>{item.entry.plural}</He></>}
            </p>
          )}
          {item.entry.root && <p className="text-sm text-gray-600">{t('unit.root')}: <He>{item.entry.root}</He></p>}
          {item.entry.everydaySynonym && (
            <p className="text-sm text-gray-600">{t('unit.everyday')}: <He>{item.entry.everydaySynonym}</He></p>
          )}
          {item.contextSentences[0] && (
            <p className="mt-3 border-t pt-3"><He>{item.contextSentences[0].he}</He></p>
          )}
        </div>
        <button
          data-testid="unit-vocab-continue"
          onClick={() =>
            phase.index + 1 >= items.length
              ? enterPractice()
              : setPhase({ kind: 'vocab', index: phase.index + 1 })
          }
          className="mt-6 w-full rounded bg-blue-700 p-3 text-white"
        >
          {t('common.continue')}
        </button>
      </div>
    );
  }

  if (phase.kind === 'practice') {
    const item = items[Math.floor(phase.index / 2)];
    const isRecognition = phase.index % 2 === 0;
    const distractors = pickDistractors(item.entry, pool);
    const key = `p-${phase.index}`;
    return isRecognition ? (
      <Recognition key={key} entry={item.entry} contextSentences={item.contextSentences}
        distractors={distractors}
        onResult={(r) => handlePracticeResult(item, 'flashcard_recognition', r)} />
    ) : (
      <Cloze key={key} entry={item.entry} contextSentences={item.contextSentences}
        distractors={distractors}
        onResult={(r) => handlePracticeResult(item, 'cloze', r)} />
    );
  }

  return (
    <div data-testid="unit-complete" className="p-6 text-center">
      <h1 className="text-2xl font-semibold">{t('unit.done')}</h1>
      <p className="mt-4"><Link to="/" className="underline">{t('common.back')}</Link></p>
    </div>
  );
}
```

Modify `src/App.tsx` — add inside `<Routes>`:
```tsx
import { UnitPage } from './pages/UnitPage';
// …
<Route path="/unit/:slug" element={<ProtectedRoute><UnitPage /></ProtectedRoute>} />
```

- [ ] **Step 5: Verify green**

Run: `npx vitest run src/pages/UnitPage.test.tsx && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add unit learning flow (scenario, glosses, vocab cards, immediate practice)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: Home screen & streak

**Files:**
- Modify: `src/data/profile.ts` (add `computeStreak`, implement `touchStreak`), `src/App.tsx` (replace HomePlaceholder with HomePage)
- Create: `src/pages/HomePage.tsx`
- Test: `src/data/profile.test.ts`, `src/pages/HomePage.test.tsx`

**Interfaces:**
- Consumes: `loadUnits`/`loadUnitProgress` (12), `loadDueCards`/`loadUpcomingCards`/`loadAllCards` (9), `getProfile` (6).
- Produces:
  - `computeStreak(prev: { current: number; longest: number; lastActiveDate: string | null }, todayLocal: string): { current: number; longest: number; lastActiveDate: string }`
  - `touchStreak(): Promise<void>` (real implementation replacing the Task 11 stub)
  - `localDateString(d?: Date): string` ('YYYY-MM-DD' in device timezone)
  - `/` renders HomePage; testids `home-unit-card`, `home-review-card`, `home-streak`.
- Words known definition: `state === 'review' && stability >= 7`. Words learned: `reps > 0`.

- [ ] **Step 1: Write failing streak tests**

`src/data/profile.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

import { computeStreak } from './profile';

describe('computeStreak', () => {
  it('starts at 1 with no history', () => {
    expect(computeStreak({ current: 0, longest: 0, lastActiveDate: null }, '2026-07-10'))
      .toEqual({ current: 1, longest: 1, lastActiveDate: '2026-07-10' });
  });
  it('increments on consecutive days', () => {
    expect(computeStreak({ current: 3, longest: 5, lastActiveDate: '2026-07-09' }, '2026-07-10'))
      .toEqual({ current: 4, longest: 5, lastActiveDate: '2026-07-10' });
  });
  it('is idempotent within the same day', () => {
    expect(computeStreak({ current: 4, longest: 5, lastActiveDate: '2026-07-10' }, '2026-07-10'))
      .toEqual({ current: 4, longest: 5, lastActiveDate: '2026-07-10' });
  });
  it('resets after a gap', () => {
    expect(computeStreak({ current: 9, longest: 9, lastActiveDate: '2026-07-01' }, '2026-07-10'))
      .toEqual({ current: 1, longest: 9, lastActiveDate: '2026-07-10' });
  });
  it('updates longest when current passes it', () => {
    expect(computeStreak({ current: 5, longest: 5, lastActiveDate: '2026-07-09' }, '2026-07-10'))
      .toEqual({ current: 6, longest: 6, lastActiveDate: '2026-07-10' });
  });
});
```

Run: `npx vitest run src/data/profile.test.ts`
Expected: FAIL — `computeStreak` not exported.

- [ ] **Step 2: Implement streak logic**

In `src/data/profile.ts`, replace the Task 11 `touchStreak` stub with:
```ts
export function localDateString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function computeStreak(
  prev: { current: number; longest: number; lastActiveDate: string | null },
  todayLocal: string,
): { current: number; longest: number; lastActiveDate: string } {
  if (prev.lastActiveDate === todayLocal) {
    return { current: prev.current, longest: prev.longest, lastActiveDate: todayLocal };
  }
  const yesterday = localDateString(new Date(new Date(`${todayLocal}T12:00:00`).getTime() - 86_400_000));
  const current = prev.lastActiveDate === yesterday ? prev.current + 1 : 1;
  return { current, longest: Math.max(prev.longest, current), lastActiveDate: todayLocal };
}

export async function touchStreak(): Promise<void> {
  const profile = await getProfile();
  if (!profile) return;
  const next = computeStreak(
    { current: profile.streakCurrent, longest: profile.streakLongest, lastActiveDate: profile.lastActiveDate },
    localDateString(),
  );
  const { error } = await supabase
    .from('profiles')
    .update({
      streak_current: next.current,
      streak_longest: next.longest,
      last_active_date: next.lastActiveDate,
    })
    .eq('user_id', profile.userId);
  if (error) throw error;
}
```

Run: `npx vitest run src/data/profile.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 3: Write failing HomePage tests**

`src/pages/HomePage.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import '../lib/i18n';
import type { CardState } from '../lib/types';

const db = {
  progress: 'not_started' as 'not_started' | 'in_progress' | 'completed',
  due: [] as unknown[],
  upcoming: [] as Array<{ card: CardState }>,
  cards: [] as CardState[],
};
const touchStreak = vi.fn().mockResolvedValue(undefined);

vi.mock('../data/units', () => ({
  loadUnits: () => Promise.resolve([{
    slug: 'unit-01-intake', level: 1, displayOrder: 1, status: 'published',
    title: { en: 'Patient intake' }, dialogue: [],
  }]),
  loadUnitProgress: () => Promise.resolve(db.progress),
}));
vi.mock('../data/cards', () => ({
  loadDueCards: () => Promise.resolve(db.due),
  loadUpcomingCards: () => Promise.resolve(db.upcoming),
  loadAllCards: () => Promise.resolve(db.cards),
}));
vi.mock('../data/profile', () => ({
  getProfile: () => Promise.resolve({
    userId: 'u1', displayName: 'Dr. Test', uiLanguage: 'en', isAdmin: false,
    streakCurrent: 3, streakLongest: 5, lastActiveDate: '2026-07-09',
  }),
  touchStreak: () => touchStreak(),
}));

import { HomePage } from './HomePage';

function card(entryId: string, state: CardState['state'], stability: number, reps: number): CardState {
  return {
    entryId, due: new Date(), stability, difficulty: 5, reps, lapses: 0,
    learningSteps: 0, state, lastReview: null,
  };
}

describe('HomePage', () => {
  beforeEach(() => {
    db.progress = 'not_started'; db.due = []; db.upcoming = []; db.cards = [];
    touchStreak.mockClear();
  });

  it('first run: prompts to start the unit', async () => {
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(await screen.findByTestId('home-unit-card')).toHaveTextContent('Start');
    expect(screen.getByText('Start your first unit to begin learning.')).toBeInTheDocument();
  });

  it('shows due count and progress counts', async () => {
    db.progress = 'completed';
    db.due = [1, 2, 3];
    db.cards = [
      card('a', 'review', 8, 5),   // known + learned
      card('b', 'learning', 1, 2), // learned
      card('c', 'new', 0, 0),      // neither
    ];
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(await screen.findByTestId('home-review-card')).toHaveTextContent('3 words due');
    expect(screen.getByTestId('home-streak')).toHaveTextContent('3-day streak');
    expect(screen.getByText('2 learned')).toBeInTheDocument();
    expect(screen.getByText('1 known')).toBeInTheDocument();
  });

  it('caught-up state touches the streak and offers extra practice', async () => {
    db.progress = 'completed';
    db.due = [];
    db.cards = [card('a', 'review', 8, 5)];
    db.upcoming = [{ card: card('a', 'review', 8, 5) }];
    render(<MemoryRouter><HomePage /></MemoryRouter>);
    expect(await screen.findByTestId('home-review-card')).toHaveTextContent('All caught up');
    expect(touchStreak).toHaveBeenCalledOnce();
    expect(screen.getByText('Extra practice')).toBeInTheDocument();
  });
});
```

Run: `npx vitest run src/pages/HomePage.test.tsx`
Expected: FAIL — `./HomePage` not found.

- [ ] **Step 4: Implement HomePage**

`src/pages/HomePage.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { loadUnits, loadUnitProgress } from '../data/units';
import { loadDueCards, loadUpcomingCards, loadAllCards } from '../data/cards';
import { getProfile, touchStreak } from '../data/profile';
import type { CardState, Profile, Unit } from '../lib/types';

const KNOWN_STABILITY_DAYS = 7;

interface HomeState {
  unit: Unit | null;
  progress: 'not_started' | 'in_progress' | 'completed';
  dueCount: number;
  nextDue: Date | null;
  cards: CardState[];
  profile: Profile | null;
}

export function HomePage() {
  const { t } = useTranslation();
  const [state, setState] = useState<HomeState | null>(null);

  useEffect(() => {
    (async () => {
      const [units, profile, due, cards] = await Promise.all([
        loadUnits(), getProfile(), loadDueCards(), loadAllCards(),
      ]);
      const unit = units[0] ?? null;
      const progress = unit ? await loadUnitProgress(unit.slug) : 'not_started';
      let nextDue: Date | null = null;
      if (due.length === 0 && cards.length > 0) {
        await touchStreak(); // caught-up visit maintains the streak
        const upcoming = await loadUpcomingCards(1);
        nextDue = upcoming[0]?.card.due ?? null;
      }
      setState({ unit, progress, dueCount: due.length, nextDue, cards, profile });
    })();
  }, []);

  if (!state) return <p className="p-4">{t('common.loading')}</p>;

  const learned = state.cards.filter((c) => c.reps > 0).length;
  const known = state.cards.filter(
    (c) => c.state === 'review' && c.stability >= KNOWN_STABILITY_DAYS,
  ).length;
  const firstRun = state.cards.length === 0;
  const unitCta =
    state.progress === 'completed' ? t('home.completed')
    : state.progress === 'in_progress' ? t('home.continue')
    : t('home.start');

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">{t('app.title')}</h1>

      <div data-testid="home-streak" className="flex gap-4 text-sm text-gray-700">
        <span>{t('home.streak', { count: state.profile?.streakCurrent ?? 0 })}</span>
        <span>{t('home.wordsLearned', { count: learned })}</span>
        <span>{t('home.wordsKnown', { count: known })}</span>
      </div>

      <div data-testid="home-unit-card" className="rounded border p-4">
        <h2 className="font-semibold">{t('home.unitTitle')}</h2>
        {state.unit ? (
          <>
            <p className="mt-1">{state.unit.title.en}</p>
            {state.progress === 'completed' ? (
              <p className="mt-2 text-green-700">{unitCta} ✓</p>
            ) : (
              <Link to={`/unit/${state.unit.slug}`} className="mt-2 block rounded bg-blue-700 p-2 text-center text-white">
                {unitCta}
              </Link>
            )}
          </>
        ) : (
          <p className="mt-1 text-gray-600">{t('common.loading')}</p>
        )}
      </div>

      <div data-testid="home-review-card" className="rounded border p-4">
        <h2 className="font-semibold">{t('home.reviewTitle')}</h2>
        {firstRun ? (
          <p className="mt-1 text-gray-600">{t('home.firstRun')}</p>
        ) : state.dueCount > 0 ? (
          <Link to="/review" className="mt-2 block rounded bg-blue-700 p-2 text-center text-white">
            {t('home.due', { count: state.dueCount })}
          </Link>
        ) : (
          <>
            <p className="mt-1">
              {t('home.caughtUp', { time: state.nextDue ? state.nextDue.toLocaleString() : '—' })}
            </p>
            <Link to="/review?extra=1" className="mt-2 block rounded border p-2 text-center">
              {t('home.extraPractice')}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
```

Modify `src/App.tsx` — replace `HomePlaceholder` with the real page (full new content):
```tsx
import { Routes, Route } from 'react-router';
import { AuthPage } from './pages/AuthPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { HomePage } from './pages/HomePage';
import { UnitPage } from './pages/UnitPage';
import { ReviewPage } from './pages/ReviewPage';
import { ProtectedRoute } from './components/ProtectedRoute';

export default function App() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
      <Route path="/unit/:slug" element={<ProtectedRoute><UnitPage /></ProtectedRoute>} />
      <Route path="/review" element={<ProtectedRoute><ReviewPage /></ProtectedRoute>} />
    </Routes>
  );
}
```

- [ ] **Step 5: Verify green**

Run: `npm test`
Expected: PASS — full suite.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add home screen with unit/review cards, progress strip, and streak logic

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 14: Metrics views + query script

**Files:**
- Create: `supabase/migrations/0003_views.sql`, `scripts/metrics.ts`

**Interfaces:**
- Consumes: Task 3 schema, `DATABASE_URL`.
- Produces: `npm run metrics` printing the four pilot views. Views count only `counts_for_scheduling = true` rows.

- [ ] **Step 1: Write the views migration**

`supabase/migrations/0003_views.sql`:
```sql
create view public.v_user_first_day as
  select user_id, min(reviewed_at)::date as first_day
  from public.review_logs
  where counts_for_scheduling
  group by user_id;

create view public.v_return_rates as
  select d.offset_days,
         count(distinct l.user_id) as returned,
         (select count(*) from public.v_user_first_day) as cohort
  from (values (1),(3),(7)) as d(offset_days)
  cross join public.v_user_first_day f
  left join public.review_logs l
    on l.user_id = f.user_id
   and l.counts_for_scheduling
   and l.reviewed_at::date = f.first_day + d.offset_days
  group by d.offset_days
  order by d.offset_days;

create view public.v_reviews_per_user_day as
  select user_id, reviewed_at::date as day, count(*) as reviews
  from public.review_logs
  where counts_for_scheduling
  group by 1, 2
  order by 2, 1;

create view public.v_unit_completion as
  select u.slug,
         count(p.user_id) filter (where p.status = 'completed') as completed,
         count(p.user_id) as started
  from public.units u
  left join public.unit_progress p on p.unit_slug = u.slug
  group by u.slug;
```

Run: `npx supabase db push`
Expected: `Applying migration 0003_views.sql... Finished supabase db push.`

- [ ] **Step 2: Write the query script**

`scripts/metrics.ts`:
```ts
import { config } from 'dotenv';
config({ path: '.env.content' });
import postgres from 'postgres';

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  const sections: Array<[string, string]> = [
    ['Unit completion', 'select * from v_unit_completion'],
    ['Return rates (D1/D3/D7)', 'select * from v_return_rates'],
    ['Reviews per user-day', 'select * from v_reviews_per_user_day'],
    ['First activity per user', 'select * from v_user_first_day'],
  ];
  for (const [title, query] of sections) {
    console.log(`\n== ${title} ==`);
    console.table(await sql.unsafe(query));
  }
  await sql.end();
}
main();
```

- [ ] **Step 3: Verify with seeded data**

Run: `npm run metrics`
Expected: four tables print; `Unit completion` shows `unit-01-intake` with `started`/`completed` counts matching your manual smoke-test users (0 is fine on a fresh DB — the shape is what's verified).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0003_views.sql scripts/metrics.ts
git commit -m "feat: add pilot metrics views and query script

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 15: PWA installability

**Files:**
- Modify: `vite.config.ts`, `index.html`
- Create: `public/icon-192.png`, `public/icon-512.png`, `public/logo.svg`

**Interfaces:**
- Consumes: Task 1 build setup.
- Produces: installable PWA with cache-first app shell (`autoUpdate`).

- [ ] **Step 1: Install and configure**

Run: `npm i -D vite-plugin-pwa`

Modify `vite.config.ts` (full new content):
```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'MedLingo',
        short_name: 'MedLingo',
        description: 'Medical Hebrew for clinicians',
        theme_color: '#1d4ed8',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});
```

- [ ] **Step 2: Generate placeholder icons**

`public/logo.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#1d4ed8"/>
  <text x="256" y="330" font-family="Arial, sans-serif" font-size="220" font-weight="bold"
        text-anchor="middle" fill="#ffffff">ML</text>
</svg>
```

Run:
```bash
npx --yes @vite-pwa/assets-generator --preset minimal public/logo.svg
mv public/pwa-192x192.png public/icon-192.png
mv public/pwa-512x512.png public/icon-512.png
```
Expected: both PNG files exist (`ls public/icon-*.png` shows the two files).
(If the generator's output names differ, `ls public/*.png` and rename to `icon-192.png`/`icon-512.png`.)

- [ ] **Step 3: Verify the build emits the PWA assets**

Run: `npm run build && ls dist/manifest.webmanifest dist/sw.js`
Expected: both files listed.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add PWA manifest, icons, and auto-updating service worker

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 16: E2E test (Playwright)

**Files:**
- Create: `playwright.config.ts`, `e2e/global-setup.ts`, `e2e/pilot.spec.ts`
- Modify: `package.json` (script), `.gitignore` (already covers `e2e/.auth`)

**Interfaces:**
- Consumes: the deployed schema + imported content (3, 7); the full app (6, 10–13); testid registry; `SUPABASE_SERVICE_ROLE_KEY` in `.env.content`.
- Produces: `npm run test:e2e` covering sign-in → onboarding → learn unit → review.

- [ ] **Step 1: Install Playwright**

Run: `npm i -D @playwright/test && npx playwright install chromium`
Expected: chromium downloads successfully.

Add to `package.json` scripts: `"test:e2e": "playwright test"`.

- [ ] **Step 2: Write the config and global setup**

`playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:5173',
    storageState: 'e2e/.auth/user.json',
  },
  projects: [{ name: 'mobile-chromium', use: { ...devices['Pixel 7'] } }],
  webServer: { command: 'npm run dev', port: 5173, reuseExistingServer: true },
});
```

`e2e/global-setup.ts`:
```ts
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env.content' });

const EMAIL = 'e2e@medlingo.test';
const PASSWORD = 'e2e-password-123';

export default async function globalSetup() {
  const url = process.env.VITE_SUPABASE_URL!;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  // idempotent test user
  const { data: list } = await admin.auth.admin.listUsers();
  let user = list.users.find((u) => u.email === EMAIL);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email: EMAIL, password: PASSWORD, email_confirm: true,
    });
    if (error) throw error;
    user = data.user;
  }

  // reset learning state so every run starts fresh (service role bypasses RLS)
  for (const table of ['review_logs', 'user_card_state', 'unit_progress', 'profiles']) {
    await admin.from(table).delete().eq('user_id', user.id);
  }

  // mint a session and write storageState in supabase-js localStorage format
  const anon = createClient(url, process.env.VITE_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
    email: EMAIL, password: PASSWORD,
  });
  if (signInError) throw signInError;

  const projectRef = new URL(url).hostname.split('.')[0];
  mkdirSync('e2e/.auth', { recursive: true });
  writeFileSync('e2e/.auth/user.json', JSON.stringify({
    cookies: [],
    origins: [{
      origin: 'http://localhost:5173',
      localStorage: [{
        name: `sb-${projectRef}-auth-token`,
        value: JSON.stringify(signIn.session),
      }],
    }],
  }, null, 2));
}
```

- [ ] **Step 3: Write the pilot-path test**

`e2e/pilot.spec.ts`:
```ts
import { test, expect, type Page } from '@playwright/test';

async function completeExercise(page: Page) {
  const buttons = page.getByTestId(/exercise-(option|tile)-/);
  await buttons.first().waitFor();
  await buttons.first().click();
  await page.getByTestId('exercise-continue').click();
}

test('onboard → learn unit → review', async ({ page }) => {
  test.setTimeout(180_000);

  // fresh user → onboarding
  await page.goto('/');
  await page.getByTestId('onboarding-name').fill('E2E Doctor');
  await page.getByTestId('onboarding-submit').click();

  // home first-run → start the unit
  await expect(page.getByTestId('home-unit-card')).toContainText('Start');
  await page.getByTestId('home-unit-card').getByRole('link').click();

  // scenario → vocab (12 cards) → immediate practice (24 exercises)
  await page.getByTestId('unit-start').click();
  for (let i = 0; i < 12; i++) await page.getByTestId('unit-vocab-continue').click();
  for (let i = 0; i < 24; i++) await completeExercise(page);
  await expect(page.getByTestId('unit-complete')).toBeVisible();
  await page.getByRole('link').last().click(); // back home

  // home shows completed + due reviews exist (learning-state cards come due quickly;
  // wrong first-tap answers were rated again → due immediately)
  await expect(page.getByTestId('home-unit-card')).toContainText('Completed');

  // review flow is reachable: either run a session or see the caught-up state
  await page.goto('/review');
  const summaryOrCaughtUp = page.getByTestId(/review-(summary|caught-up)/);
  while (!(await summaryOrCaughtUp.isVisible().catch(() => false))) {
    await completeExercise(page);
  }
  await expect(summaryOrCaughtUp).toBeVisible();
});
```

- [ ] **Step 4: Run it**

Run: `npm run test:e2e`
Expected: `1 passed`. (Requires the dev DB to contain the imported unit-01-intake content — Task 7.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: add end-to-end pilot path (onboarding, unit, review)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Launch checklist (after all tasks)

- [ ] Replace the dev-sample content in `content/` with professionally authored unit content (owner + language professional); re-run `npm run import:content`.
- [ ] [MANUAL — owner] Set the partner's account as reviewer: sign him up in the app, then in Supabase SQL editor: `update profiles set is_admin = true where user_id = '<partner-user-id>';` — he can now see draft units in the live app.
- [ ] [MANUAL — owner] Confirm Cloudflare Pages env vars are set and the production URL works end-to-end with a real magic-link sign-in on a phone.
- [ ] [MANUAL — owner] Decide Supabase Pro ($25/mo) vs. free tier + keepalive before inviting pilot users (spec §3 recommends Pro: no idle pausing, backups).
- [ ] Run `npm run metrics` after the first pilot week; pair with direct user conversations.

## Manual QA — bidi checklist (spec §7, run on iOS Safari + Android Chrome)

- [ ] Dialogue lines: Hebrew renders RTL inside LTR cards; punctuation sits at the correct end of each Hebrew sentence.
- [ ] Cloze sentence with `____` keeps the blank in the right position within RTL text.
- [ ] Word-bank tiles and option buttons: Hebrew centered, no mirrored ellipsis or stray brackets.
- [ ] Gloss popover: mixed Hebrew–English line (`כְּאֵב — pain`) reads correctly.
- [ ] Numbers adjacent to Hebrew (e.g. "פעם ביום" next to dosage numerals) don't reorder.

## Phase 2

The AI drill (Edge Function + coaching UI) is planned separately in `docs/superpowers/plans/2026-07-10-medlingo-pilot-phase2-drill.md` and builds on Tasks 3, 4, 9, and 13 of this plan.





