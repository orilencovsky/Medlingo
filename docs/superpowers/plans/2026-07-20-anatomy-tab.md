# Anatomy Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a standalone `/anatomy` learner tab (region navigator → system card grids of Hebrew+English anatomy terms with an image) backed by a curated+AI dual image source, plus an `/admin/anatomy` view for region/system tagging and primary-image selection.

**Architecture:** Two new tables (`anatomy_terms`, `anatomy_images`) sit beside `dictionary_entries` (already tagged `topic='anatomy'` by the shipped topics feature) — reuse, don't fork. A new public Storage bucket (`anatomy`) holds image files; the DB stores only `storage_path` + metadata. Learner reads are open (any authenticated user); all writes are `is_admin()`-gated, matching the existing reviewer-console RLS pattern. Primary-image selection is a single SECURITY DEFINER RPC (`set_primary_anatomy_image`) so the "exactly one primary per term" invariant can't race across two client updates.

**Tech Stack:** React 19 + react-router 8 + react-i18next, Tailwind 4, Supabase (Postgres + Storage + `@supabase/supabase-js`), Vitest + Testing Library, tsx for standalone scripts.

## Global Constraints

- Migration file: next sequential number is `0013_anatomy.sql` (last is `0012_dictionary_topic.sql`).
- Region vocabulary (fixed, 5 values): `head_neck`, `chest`, `abdomen`, `limbs`, `skeleton`. `all` is a UI-only filter, never stored.
- System vocabulary (fixed, 9 values): `cardiovascular`, `respiratory`, `gastrointestinal`, `musculoskeletal`, `nervous`, `genitourinary`, `endocrine`, `integumentary`, `lymphatic`.
- Every enum lives in 3 places kept in sync (mirrors the existing `topics.ts` pattern): the DB `check` constraint, a `src/lib/*.ts` const array, and `regions.*`/`systems.*` keys in all 5 locale files (`en`, `he`, `ar`, `ru`, `fr`).
- Styling uses Tailwind logical properties (`ms-`/`me-`/`ps-`/`pe-`, not `ml-`/`mr-`) — RTL (Hebrew) must not break.
- A learner-visible anatomy term requires all three of: an `anatomy_terms` row (region+system), a `dictionary_entries` row with `topic='anatomy'` and `is_deprecated=false`, and an `anatomy_images` row with `is_primary=true`. Missing any one of these hides the term from `/anatomy` (but it can still appear, unfinished, in `/admin/anatomy`).
- No AI-generated image is ever auto-published (`is_primary` starts `false` and only an explicit admin action can flip it).
- Route registration goes in `src/App.tsx`; nav items go in `src/components/AppShell.tsx` (desktop sidebar) — follow the existing `isAdmin &&` conditional-render pattern for the admin link.

---

### Task 1: Migration — `anatomy_terms`, `anatomy_images`, storage bucket, RLS

**Files:**
- Create: `supabase/migrations/0013_anatomy.sql`

**Interfaces:**
- Produces: table `public.anatomy_terms(entry_id text pk, region text, system text, display_order int)`; table `public.anatomy_images(id uuid pk, entry_id text, storage_path text, source text, is_primary boolean, credit text|null, created_at timestamptz)`; function `public.set_primary_anatomy_image(image_id uuid) returns void`; storage bucket `anatomy` (public read).

- [ ] **Step 1: Write the migration file**

```sql
-- Anatomy tab: region/system tagging + dual-source (curated/ai) images for
-- dictionary_entries where topic='anatomy'. Reuses dictionary_entries as the
-- source of truth (spec: "reuse, don't fork") — these two tables hold only
-- anatomy-specific metadata, so region/system stay off the other ~1186 words.

create table public.anatomy_terms (
  entry_id      text primary key references public.dictionary_entries(id),
  region        text not null check (region in ('head_neck', 'chest', 'abdomen', 'limbs', 'skeleton')),
  system        text not null check (system in (
                  'cardiovascular', 'respiratory', 'gastrointestinal', 'musculoskeletal',
                  'nervous', 'genitourinary', 'endocrine', 'integumentary', 'lymphatic')),
  display_order int not null default 0
);

create table public.anatomy_images (
  id           uuid primary key default gen_random_uuid(),
  entry_id     text not null references public.dictionary_entries(id),
  storage_path text not null,
  source       text not null check (source in ('curated', 'ai')),
  is_primary   boolean not null default false,
  credit       text,
  created_at   timestamptz not null default now(),
  constraint anatomy_images_curated_has_credit check (source <> 'curated' or credit is not null)
);

-- At most one primary image per term.
create unique index anatomy_images_one_primary_per_entry
  on public.anatomy_images (entry_id) where is_primary;

alter table public.anatomy_terms enable row level security;
alter table public.anatomy_images enable row level security;

-- Learner read: any authenticated user (matches dictionary_entries' open read).
create policy anatomy_terms_read on public.anatomy_terms for select to authenticated using (true);
create policy anatomy_images_read on public.anatomy_images for select to authenticated using (true);

-- Admin write, mirroring admin_update_entries from 0010_reviewer_console.sql.
create policy anatomy_terms_admin_insert on public.anatomy_terms for insert to authenticated
  with check (public.is_admin());
create policy anatomy_terms_admin_update on public.anatomy_terms for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy anatomy_terms_admin_delete on public.anatomy_terms for delete to authenticated
  using (public.is_admin());

create policy anatomy_images_admin_insert on public.anatomy_images for insert to authenticated
  with check (public.is_admin());
create policy anatomy_images_admin_update on public.anatomy_images for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy anatomy_images_admin_delete on public.anatomy_images for delete to authenticated
  using (public.is_admin());

-- Primary-image selection is a single atomic RPC, not two client-side updates,
-- so the "exactly one primary per entry" invariant can't be violated by a race
-- between "unset old primary" and "set new primary" landing out of order.
create function public.set_primary_anatomy_image(image_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare target_entry text;
begin
  if not public.is_admin() then
    raise exception 'not authorized to set a primary anatomy image';
  end if;
  select entry_id into target_entry from public.anatomy_images where id = image_id;
  if target_entry is null then
    raise exception 'anatomy image % not found', image_id;
  end if;
  update public.anatomy_images set is_primary = false where entry_id = target_entry and is_primary;
  update public.anatomy_images set is_primary = true where id = image_id;
end $$;

-- Storage: public bucket for anatomy images, admin-only write.
insert into storage.buckets (id, name, public)
values ('anatomy', 'anatomy', true)
on conflict (id) do nothing;

create policy anatomy_bucket_public_read on storage.objects for select
  using (bucket_id = 'anatomy');
create policy anatomy_bucket_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'anatomy' and public.is_admin());
create policy anatomy_bucket_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'anatomy' and public.is_admin())
  with check (bucket_id = 'anatomy' and public.is_admin());
create policy anatomy_bucket_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'anatomy' and public.is_admin());
```

- [ ] **Step 2: Apply the migration to the local/dev Supabase project**

Run: `supabase db push` (or the project's existing migration-apply command — check `package.json`/README for the exact one; `verify-rls.ts` in Task 2 assumes the migration is already applied to the target project).
Expected: migration applies with no errors; `supabase migration list` shows `0013_anatomy` as applied.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0013_anatomy.sql
git commit -m "feat: add anatomy_terms/anatomy_images tables, RLS, and anatomy storage bucket"
```

---

### Task 2: Extend `verify-rls.ts` with anatomy checks

**Files:**
- Modify: `scripts/verify-rls.ts`

**Interfaces:**
- Consumes: `admin`, `user`, `userId`, `sampleEntryId`, `check()` — all already defined earlier in the script (see existing file).

- [ ] **Step 1: Insert anatomy RLS checks before the `// cleanup` block**

Add this block right before the existing `// cleanup` comment (uses the same `admin`/`user`/`userId` clients and `sampleEntryId` already established earlier in the file):

```ts
  // anatomy: tag the sample entry as an anatomy term (admin client, bypasses RLS to seed)
  await admin.from('dictionary_entries').update({ topic: 'anatomy' }).eq('id', sampleEntryId!);
  await admin.from('anatomy_terms').upsert({
    entry_id: sampleEntryId!, region: 'chest', system: 'cardiovascular', display_order: 0,
  });
  const { data: imgRow, error: imgSeedErr } = await admin.from('anatomy_images').insert({
    entry_id: sampleEntryId!, storage_path: 'rls-check/placeholder.png', source: 'curated',
    credit: 'RLS check fixture', is_primary: false,
  }).select('id').single();
  if (imgSeedErr) throw imgSeedErr;

  const { data: termRead, error: termReadErr } = await user.from('anatomy_terms')
    .select('entry_id').eq('entry_id', sampleEntryId!);
  check('signed-in user can read anatomy_terms', termReadErr === null && (termRead ?? []).length === 1);

  const { error: termWriteErr } = await user.from('anatomy_terms')
    .update({ region: 'abdomen' }).eq('entry_id', sampleEntryId!);
  check('non-admin cannot write anatomy_terms', termWriteErr !== null);

  const { error: primaryRpcErr } = await user.rpc('set_primary_anatomy_image', { image_id: imgRow.id });
  check('non-admin cannot call set_primary_anatomy_image', primaryRpcErr !== null);

  await admin.from('profiles').update({ is_admin: true }).eq('user_id', userId!);
  const { error: primaryAdminErr } = await user.rpc('set_primary_anatomy_image', { image_id: imgRow.id });
  const { data: afterPrimary } = await admin.from('anatomy_images')
    .select('is_primary').eq('id', imgRow.id).single();
  check('admin can set a primary anatomy image via RPC',
    primaryAdminErr === null && afterPrimary?.is_primary === true);
  await admin.from('profiles').update({ is_admin: false }).eq('user_id', userId!);

  const { error: secondPrimaryErr } = await admin.from('anatomy_images').insert({
    entry_id: sampleEntryId!, storage_path: 'rls-check/second.png', source: 'ai', is_primary: true,
  });
  check('a second is_primary=true row for the same entry is rejected', secondPrimaryErr !== null);

  const { error: uncreditedCuratedErr } = await admin.from('anatomy_images').insert({
    entry_id: sampleEntryId!, storage_path: 'rls-check/no-credit.png', source: 'curated', credit: null,
  });
  check('a curated image without credit is rejected', uncreditedCuratedErr !== null);

  await admin.from('anatomy_images').delete().eq('entry_id', sampleEntryId!);
  await admin.from('anatomy_terms').delete().eq('entry_id', sampleEntryId!);
  await admin.from('dictionary_entries').update({ topic: null }).eq('id', sampleEntryId!);
```

- [ ] **Step 2: Run the script against the migrated project**

Run: `npm run verify:rls`
Expected: every new `PASS  ...` line printed, ending in `ALL RLS CHECKS PASSED` (exit code 0). If any anatomy line prints `FAIL`, fix the migration from Task 1, not the script.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-rls.ts
git commit -m "test: verify RLS for anatomy_terms, anatomy_images, and set_primary_anatomy_image"
```

---

### Task 3: Region/system vocabulary + icon libs

**Files:**
- Create: `src/lib/anatomyRegions.ts`
- Create: `src/lib/anatomySystems.ts`
- Test: `src/lib/anatomyRegions.test.ts`
- Test: `src/lib/anatomySystems.test.ts`

**Interfaces:**
- Produces: `REGIONS: readonly Region[]`, `type Region`, `isRegion(x: string): x is Region` from `anatomyRegions.ts`; `SYSTEMS: readonly BodySystem[]`, `type BodySystem`, `isSystem(x: string): x is BodySystem` from `anatomySystems.ts`. These are consumed by Task 5 (`data/anatomy.ts`), Task 6 (`AnatomyPage.tsx`), and Task 7 (`data/anatomyAdmin.ts`).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/anatomyRegions.test.ts
import { describe, expect, it } from 'vitest';
import { REGIONS, isRegion } from './anatomyRegions';

describe('anatomyRegions', () => {
  it('accepts every declared region', () => {
    for (const r of REGIONS) expect(isRegion(r)).toBe(true);
  });
  it('rejects an unknown region', () => {
    expect(isRegion('nope')).toBe(false);
  });
});
```

```ts
// src/lib/anatomySystems.test.ts
import { describe, expect, it } from 'vitest';
import { SYSTEMS, isSystem } from './anatomySystems';

describe('anatomySystems', () => {
  it('accepts every declared system', () => {
    for (const s of SYSTEMS) expect(isSystem(s)).toBe(true);
  });
  it('rejects an unknown system', () => {
    expect(isSystem('nope')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/anatomyRegions.test.ts src/lib/anatomySystems.test.ts`
Expected: FAIL — `Cannot find module './anatomyRegions'` / `'./anatomySystems'`.

- [ ] **Step 3: Write the implementations**

```ts
// src/lib/anatomyRegions.ts
// Controlled vocabulary for anatomy_terms.region. Keep in sync with the DB
// CHECK (0013_anatomy.sql) and the regions.* label maps in every locale file.
export const REGIONS = ['head_neck', 'chest', 'abdomen', 'limbs', 'skeleton'] as const;

export type Region = typeof REGIONS[number];

export function isRegion(x: string): x is Region {
  return (REGIONS as readonly string[]).includes(x);
}
```

```ts
// src/lib/anatomySystems.ts
// Controlled vocabulary for anatomy_terms.system. Keep in sync with the DB
// CHECK (0013_anatomy.sql) and the systems.* label maps in every locale file.
export const SYSTEMS = [
  'cardiovascular', 'respiratory', 'gastrointestinal', 'musculoskeletal',
  'nervous', 'genitourinary', 'endocrine', 'integumentary', 'lymphatic',
] as const;

export type BodySystem = typeof SYSTEMS[number];

export function isSystem(x: string): x is BodySystem {
  return (SYSTEMS as readonly string[]).includes(x);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/anatomyRegions.test.ts src/lib/anatomySystems.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/anatomyRegions.ts src/lib/anatomySystems.ts src/lib/anatomyRegions.test.ts src/lib/anatomySystems.test.ts
git commit -m "feat: add region/system controlled vocabularies for the anatomy tab"
```

---

### Task 4: Locale strings for regions, systems, nav, tab, admin (5 locales)

**Files:**
- Modify: `src/locales/en.json`
- Modify: `src/locales/he.json`
- Modify: `src/locales/ar.json`
- Modify: `src/locales/ru.json`
- Modify: `src/locales/fr.json`

**Interfaces:**
- Produces: JSON keys `nav.anatomy`, `nav.anatomyAdmin`, `anatomy.title`, `anatomy.regionAll`, `anatomy.empty`, `regions.<region>` (5 keys), `systems.<system>` (9 keys), `admin.anatomyCoverage`, `admin.anatomyRegionLabel`, `admin.anatomySystemLabel`, `admin.anatomyNoRegion`, `admin.anatomyNoSystem`, `admin.anatomySetPrimary`, `admin.anatomyPrimary`, `admin.anatomyCurated`, `admin.anatomyAi`, `admin.anatomyNoImages` — consumed by Task 6 (`AnatomyPage.tsx`) and Task 8 (`AdminAnatomyPage.tsx`).

- [ ] **Step 1: `src/locales/en.json`** — add `"anatomy"` under `"nav"` (after `"dictionary"`) and `"anatomyAdmin"` (after `"dictionaryAdmin"`); add a new top-level `"anatomy"` object after `"topics"`; add a new top-level `"regions"` and `"systems"` object after `"anatomy"`; add the `admin.anatomy*` keys inside the existing `"admin"` object.

```json
  "nav": {
    "home": "Home",
    "review": "Review",
    "drill": "Drill",
    "dictionary": "Dictionary",
    "dictionaryAdmin": "Review",
    "anatomy": "Anatomy",
    "anatomyAdmin": "Anatomy admin"
  },
```

```json
  "anatomy": {
    "title": "Anatomy",
    "regionAll": "All",
    "empty": "No anatomy terms ready yet."
  },
  "regions": {
    "head_neck": "Head & neck", "chest": "Chest", "abdomen": "Abdomen",
    "limbs": "Limbs", "skeleton": "Skeleton"
  },
  "systems": {
    "cardiovascular": "Cardiovascular", "respiratory": "Respiratory",
    "gastrointestinal": "Gastrointestinal", "musculoskeletal": "Musculoskeletal",
    "nervous": "Nervous", "genitourinary": "Genitourinary", "endocrine": "Endocrine",
    "integumentary": "Skin", "lymphatic": "Lymphatic"
  },
```

Inside `"admin"`, add (order doesn't matter, keep alongside the other `admin.*` keys):

```json
    "anatomyCoverage": "{{ready}} / {{total}} publish-ready",
    "anatomyRegionLabel": "Region",
    "anatomySystemLabel": "System",
    "anatomyNoRegion": "— no region —",
    "anatomyNoSystem": "— no system —",
    "anatomySetPrimary": "Set primary",
    "anatomyPrimary": "Primary",
    "anatomyCurated": "Curated",
    "anatomyAi": "AI",
    "anatomyNoImages": "No candidate images yet."
```

- [ ] **Step 2: `src/locales/he.json`** — same key structure, Hebrew strings.

```json
  "nav": {
    "home": "בית",
    "review": "חזרה",
    "drill": "תרגול",
    "dictionary": "מילון",
    "dictionaryAdmin": "סקירה",
    "anatomy": "אנטומיה",
    "anatomyAdmin": "ניהול אנטומיה"
  },
```

```json
  "anatomy": {
    "title": "אנטומיה",
    "regionAll": "הכל",
    "empty": "עדיין אין מונחי אנטומיה מוכנים."
  },
  "regions": {
    "head_neck": "ראש וצוואר", "chest": "בית חזה", "abdomen": "בטן",
    "limbs": "גפיים", "skeleton": "שלד"
  },
  "systems": {
    "cardiovascular": "לב וכלי דם", "respiratory": "נשימה",
    "gastrointestinal": "מערכת העיכול", "musculoskeletal": "שרירים ושלד",
    "nervous": "עצבים", "genitourinary": "מערכת השתן והמין", "endocrine": "אנדוקרינית",
    "integumentary": "עור", "lymphatic": "לימפה"
  },
```

```json
    "anatomyCoverage": "{{ready}} / {{total}} מוכנות לפרסום",
    "anatomyRegionLabel": "אזור",
    "anatomySystemLabel": "מערכת",
    "anatomyNoRegion": "— ללא אזור —",
    "anatomyNoSystem": "— ללא מערכת —",
    "anatomySetPrimary": "קבע כתמונה ראשית",
    "anatomyPrimary": "ראשית",
    "anatomyCurated": "אוצרת",
    "anatomyAi": "AI",
    "anatomyNoImages": "אין עדיין תמונות מועמדות."
```

- [ ] **Step 3: `src/locales/ar.json`** — read the file first to match its existing key ordering/formatting, then add the same key set with Arabic strings:

```json
  "nav": { "anatomy": "التشريح", "anatomyAdmin": "إدارة التشريح" },
```
(merge `anatomy`/`anatomyAdmin` into the existing `nav` object rather than replacing it)

```json
  "anatomy": {
    "title": "التشريح",
    "regionAll": "الكل",
    "empty": "لا توجد مصطلحات تشريح جاهزة بعد."
  },
  "regions": {
    "head_neck": "الرأس والرقبة", "chest": "الصدر", "abdomen": "البطن",
    "limbs": "الأطراف", "skeleton": "الهيكل العظمي"
  },
  "systems": {
    "cardiovascular": "القلب والأوعية الدموية", "respiratory": "الجهاز التنفسي",
    "gastrointestinal": "الجهاز الهضمي", "musculoskeletal": "العضلي الهيكلي",
    "nervous": "الجهاز العصبي", "genitourinary": "البولي التناسلي", "endocrine": "الغدد الصماء",
    "integumentary": "الجلد", "lymphatic": "الجهاز اللمفاوي"
  },
```

```json
    "anatomyCoverage": "{{ready}} / {{total}} جاهزة للنشر",
    "anatomyRegionLabel": "المنطقة",
    "anatomySystemLabel": "الجهاز",
    "anatomyNoRegion": "— بلا منطقة —",
    "anatomyNoSystem": "— بلا جهاز —",
    "anatomySetPrimary": "تعيين كصورة رئيسية",
    "anatomyPrimary": "رئيسية",
    "anatomyCurated": "منسقة",
    "anatomyAi": "AI",
    "anatomyNoImages": "لا توجد صور مرشحة بعد."
```

- [ ] **Step 4: `src/locales/ru.json`** — same merge pattern, Russian strings:

```json
  "nav": { "anatomy": "Анатомия", "anatomyAdmin": "Управление анатомией" },
```

```json
  "anatomy": {
    "title": "Анатомия",
    "regionAll": "Все",
    "empty": "Пока нет готовых анатомических терминов."
  },
  "regions": {
    "head_neck": "Голова и шея", "chest": "Грудь", "abdomen": "Живот",
    "limbs": "Конечности", "skeleton": "Скелет"
  },
  "systems": {
    "cardiovascular": "Сердечно-сосудистая", "respiratory": "Дыхательная",
    "gastrointestinal": "Пищеварительная", "musculoskeletal": "Опорно-двигательная",
    "nervous": "Нервная", "genitourinary": "Мочеполовая", "endocrine": "Эндокринная",
    "integumentary": "Кожа", "lymphatic": "Лимфатическая"
  },
```

```json
    "anatomyCoverage": "{{ready}} / {{total}} готово к публикации",
    "anatomyRegionLabel": "Область",
    "anatomySystemLabel": "Система",
    "anatomyNoRegion": "— без области —",
    "anatomyNoSystem": "— без системы —",
    "anatomySetPrimary": "Сделать основной",
    "anatomyPrimary": "Основная",
    "anatomyCurated": "Отобрано",
    "anatomyAi": "ИИ",
    "anatomyNoImages": "Пока нет вариантов изображений."
```

- [ ] **Step 5: `src/locales/fr.json`** — same merge pattern, French strings:

```json
  "nav": { "anatomy": "Anatomie", "anatomyAdmin": "Administration anatomie" },
```

```json
  "anatomy": {
    "title": "Anatomie",
    "regionAll": "Tout",
    "empty": "Aucun terme d'anatomie prêt pour l'instant."
  },
  "regions": {
    "head_neck": "Tête et cou", "chest": "Thorax", "abdomen": "Abdomen",
    "limbs": "Membres", "skeleton": "Squelette"
  },
  "systems": {
    "cardiovascular": "Cardiovasculaire", "respiratory": "Respiratoire",
    "gastrointestinal": "Digestif", "musculoskeletal": "Musculo-squelettique",
    "nervous": "Nerveux", "genitourinary": "Génito-urinaire", "endocrine": "Endocrinien",
    "integumentary": "Peau", "lymphatic": "Lymphatique"
  },
```

```json
    "anatomyCoverage": "{{ready}} / {{total}} prêts à publier",
    "anatomyRegionLabel": "Région",
    "anatomySystemLabel": "Système",
    "anatomyNoRegion": "— aucune région —",
    "anatomyNoSystem": "— aucun système —",
    "anatomySetPrimary": "Définir comme principale",
    "anatomyPrimary": "Principale",
    "anatomyCurated": "Sélectionnée",
    "anatomyAi": "IA",
    "anatomyNoImages": "Aucune image candidate pour l'instant."
```

- [ ] **Step 6: Validate JSON and key parity across locales**

Run: `node -e "['en','he','ar','ru','fr'].forEach(l => JSON.parse(require('fs').readFileSync('src/locales/'+l+'.json','utf8')))"`
Expected: no output (all 5 files parse). Then manually diff key sets — every locale must have the same `regions.*`/`systems.*`/`anatomy.*`/`nav.anatomy*`/`admin.anatomy*` keys (a simple way: `node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync('src/locales/en.json')).regions))"` repeated per locale, compare arrays by eye).

- [ ] **Step 7: Commit**

```bash
git add src/locales/en.json src/locales/he.json src/locales/ar.json src/locales/ru.json src/locales/fr.json
git commit -m "feat: add anatomy tab, region, system, and admin locale strings (5 locales)"
```

---

### Task 5: Learner data layer — `src/data/anatomy.ts`

**Files:**
- Create: `src/data/anatomy.ts`
- Test: `src/data/anatomy.test.ts`

**Interfaces:**
- Consumes: `supabase` from `../lib/supabase`; `fetchAllRows` from `./fetchAll`; `mapEntryRow, type EntryRow` from `./entryMapper`; `type Region` from `../lib/anatomyRegions`; `type BodySystem` from `../lib/anatomySystems`; `type DictionaryEntry` from `../lib/types`.
- Produces: `interface AnatomyCard { entry: DictionaryEntry; region: Region; system: BodySystem; imageUrl: string; imageCredit: string | null; }` and `async function fetchAnatomyCards(): Promise<AnatomyCard[]>` — consumed by Task 6 (`AnatomyPage.tsx`).

- [ ] **Step 1: Write the failing test**

```ts
// src/data/anatomy.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

const rangeMock = vi.fn();
// fetchAnatomyCards chains .select().order().order().range() — mock that shape.
const orderMock = () => ({ order: () => ({ range: rangeMock }) });
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ select: vi.fn(orderMock) })),
    storage: { from: vi.fn(() => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.test/${p}` } }) })) },
  },
}));

import { fetchAnatomyCards } from './anatomy';

const ROW = (overrides: Record<string, unknown> = {}) => ({
  entry_id: 'heart', region: 'chest', system: 'cardiovascular', display_order: 0,
  dictionary_entries: {
    id: 'heart', hebrew: 'לב', hebrew_nikud: 'לֵב', part_of_speech: 'noun', level: 1,
    gender: 'ז', plural: null, root: null, everyday_synonym: null,
    translations: { en: 'heart' }, notes: null, category: null, topic: 'anatomy',
  },
  anatomy_images: [{ id: 'img1', storage_path: 'heart/1.png', source: 'curated', is_primary: true, credit: 'Gray\'s Anatomy' }],
  ...overrides,
});

beforeEach(() => { rangeMock.mockReset(); });

describe('fetchAnatomyCards', () => {
  it('maps a complete row to a card with a built public image URL', async () => {
    rangeMock.mockResolvedValueOnce({ data: [ROW()], error: null });
    const cards = await fetchAnatomyCards();
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      region: 'chest', system: 'cardiovascular', imageCredit: "Gray's Anatomy",
      entry: { id: 'heart', hebrewNikud: 'לֵב' },
    });
    expect(cards[0].imageUrl).toContain('heart/1.png');
  });

  it('drops a term that has no primary image', async () => {
    rangeMock.mockResolvedValueOnce({
      data: [ROW({ anatomy_images: [{ id: 'img1', storage_path: 'heart/1.png', source: 'ai', is_primary: false, credit: null }] })],
      error: null,
    });
    const cards = await fetchAnatomyCards();
    expect(cards).toHaveLength(0);
  });

  it('drops a term missing region/system', async () => {
    rangeMock.mockResolvedValueOnce({ data: [ROW({ region: null })], error: null });
    const cards = await fetchAnatomyCards();
    expect(cards).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/anatomy.test.ts`
Expected: FAIL — `Cannot find module './anatomy'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/data/anatomy.ts
import { supabase } from '../lib/supabase';
import { fetchAllRows } from './fetchAll';
import { mapEntryRow, type EntryRow } from './entryMapper';
import type { Region } from '../lib/anatomyRegions';
import type { BodySystem } from '../lib/anatomySystems';
import type { DictionaryEntry } from '../lib/types';

export interface AnatomyCard {
  entry: DictionaryEntry;
  region: Region;
  system: BodySystem;
  imageUrl: string;
  imageCredit: string | null;
}

type AnatomyImageRow = {
  id: string; storage_path: string; source: 'curated' | 'ai';
  is_primary: boolean; credit: string | null;
};

type AnatomyTermRow = {
  entry_id: string; region: Region | null; system: BodySystem | null; display_order: number;
  dictionary_entries: EntryRow | null;
  anatomy_images: AnatomyImageRow[] | null;
};

function publicImageUrl(storagePath: string): string {
  return supabase.storage.from('anatomy').getPublicUrl(storagePath).data.publicUrl;
}

// Only terms with a region, a system, and a primary image are learner-visible —
// half-built terms (still being tagged/imaged in /admin/anatomy) stay hidden.
export async function fetchAnatomyCards(): Promise<AnatomyCard[]> {
  const rows = await fetchAllRows<AnatomyTermRow>((from, to) =>
    supabase
      .from('anatomy_terms')
      .select('entry_id, region, system, display_order, dictionary_entries(*), anatomy_images(id, storage_path, source, is_primary, credit)')
      .order('display_order', { ascending: true })
      .order('entry_id', { ascending: true })
      .range(from, to),
  );

  const cards: AnatomyCard[] = [];
  for (const row of rows) {
    if (!row.region || !row.system || !row.dictionary_entries) continue;
    const primary = (row.anatomy_images ?? []).find((img) => img.is_primary);
    if (!primary) continue;
    cards.push({
      entry: mapEntryRow(row.dictionary_entries),
      region: row.region,
      system: row.system,
      imageUrl: publicImageUrl(primary.storage_path),
      imageCredit: primary.credit,
    });
  }
  return cards;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/anatomy.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/anatomy.ts src/data/anatomy.test.ts
git commit -m "feat: add fetchAnatomyCards data layer for the learner anatomy tab"
```

---

### Task 6: Learner UI — `AnatomyPage.tsx`, route, nav item

**Files:**
- Create: `src/pages/AnatomyPage.tsx`
- Test: `src/pages/AnatomyPage.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/AppShell.tsx`

**Interfaces:**
- Consumes: `fetchAnatomyCards, type AnatomyCard` from `../data/anatomy`; `REGIONS, isRegion, type Region` from `../lib/anatomyRegions`; `PageHeader` from `../components/ui/PageHeader`; `He` from `../components/He`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/AnatomyPage.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import '../lib/i18n';
import { AnatomyPage } from './AnatomyPage';

vi.mock('../data/anatomy', () => ({
  fetchAnatomyCards: vi.fn(async () => [
    {
      entry: { id: 'heart', hebrew: 'לב', hebrewNikud: 'לֵב', partOfSpeech: 'noun', level: 1,
        gender: 'ז', plural: null, root: null, everydaySynonym: null,
        translations: { en: 'heart' }, notes: null, category: null, topic: 'anatomy' },
      region: 'chest', system: 'cardiovascular', imageUrl: 'https://example.test/heart.png', imageCredit: null,
    },
    {
      entry: { id: 'femur', hebrew: 'עצם ירך', hebrewNikud: 'עֶצֶם יָרֵךְ', partOfSpeech: 'noun', level: 1,
        gender: null, plural: null, root: null, everydaySynonym: null,
        translations: { en: 'femur' }, notes: null, category: null, topic: 'anatomy' },
      region: 'limbs', system: 'musculoskeletal', imageUrl: 'https://example.test/femur.png', imageCredit: null,
    },
  ]),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/anatomy']}>
      <Routes><Route path="/anatomy" element={<AnatomyPage />} /></Routes>
    </MemoryRouter>,
  );
}

describe('AnatomyPage', () => {
  it('shows every card grouped by system when region is "all"', async () => {
    renderPage();
    expect(await screen.findByText('heart')).toBeInTheDocument();
    expect(screen.getByText('femur')).toBeInTheDocument();
  });

  it('filters to one region when a region chip is clicked', async () => {
    renderPage();
    await screen.findByText('heart');
    await userEvent.click(screen.getByRole('button', { name: /limbs|גפיים/i }));
    expect(screen.getByText('femur')).toBeInTheDocument();
    expect(screen.queryByText('heart')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/AnatomyPage.test.tsx`
Expected: FAIL — `Cannot find module './AnatomyPage'`.

- [ ] **Step 3: Write the page**

```tsx
// src/pages/AnatomyPage.tsx
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchAnatomyCards, type AnatomyCard } from '../data/anatomy';
import { REGIONS, type Region } from '../lib/anatomyRegions';
import { PageHeader } from '../components/ui/PageHeader';
import { He } from '../components/He';

const ALL = 'all' as const;
type RegionFilter = Region | typeof ALL;

interface SystemGroup { system: string; items: AnatomyCard[]; }

function CardTile({ card }: { card: AnatomyCard }) {
  const { t } = useTranslation();
  return (
    <li className="overflow-hidden rounded-md border border-border bg-surface">
      <img src={card.imageUrl} alt={card.entry.translations.en}
        className="aspect-square w-full object-cover" loading="lazy" />
      <div className="p-2">
        <He className="block text-base font-bold text-ink">{card.entry.hebrewNikud}</He>
        <div className="text-sm text-ink-muted">{card.entry.translations.en}</div>
        {card.imageCredit && <div className="mt-1 text-[10px] text-ink-subtle">{card.imageCredit}</div>}
      </div>
      <span className="sr-only">{t(`regions.${card.region}`)}</span>
    </li>
  );
}

export function AnatomyPage() {
  const { t } = useTranslation();
  const [cards, setCards] = useState<AnatomyCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [region, setRegion] = useState<RegionFilter>(ALL);

  useEffect(() => { fetchAnatomyCards().then((c) => { setCards(c); setLoading(false); }); }, []);

  const shown = useMemo(
    () => (region === ALL ? cards : cards.filter((c) => c.region === region)),
    [cards, region],
  );

  const groups = useMemo<SystemGroup[]>(() => {
    const bySystem = new Map<string, AnatomyCard[]>();
    for (const c of shown) {
      if (!bySystem.has(c.system)) bySystem.set(c.system, []);
      bySystem.get(c.system)!.push(c);
    }
    return [...bySystem.entries()]
      .map(([system, items]) => ({ system, items }))
      .sort((a, b) => t(`systems.${a.system}`).localeCompare(t(`systems.${b.system}`)));
  }, [shown, t]);

  return (
    <div className="mx-auto max-w-2xl p-4">
      <PageHeader title={t('anatomy.title')} />
      <div className="sticky top-0 z-10 mt-3 flex flex-wrap gap-2 bg-bg py-2">
        <button type="button" onClick={() => setRegion(ALL)}
          className={`rounded-full px-3 py-1 text-sm font-semibold ${region === ALL ? 'bg-primary text-white' : 'border border-border text-ink-muted'}`}>
          {t('anatomy.regionAll')}
        </button>
        {REGIONS.map((r) => (
          <button key={r} type="button" onClick={() => setRegion(r)}
            className={`rounded-full px-3 py-1 text-sm font-semibold ${region === r ? 'bg-primary text-white' : 'border border-border text-ink-muted'}`}>
            {t(`regions.${r}`)}
          </button>
        ))}
      </div>
      {loading ? <p className="mt-6 text-ink-muted">{t('common.loading')}</p>
        : shown.length === 0 ? <p className="mt-6 text-ink-muted">{t('anatomy.empty')}</p>
        : (
        <div className="mt-2">
          {groups.map((g) => (
            <section key={g.system} className="mt-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-primary">{t(`systems.${g.system}`)}</h2>
              <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {g.items.map((c) => <CardTile key={c.entry.id} card={c} />)}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/AnatomyPage.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire the route in `src/App.tsx`**

```tsx
import { AnatomyPage } from './pages/AnatomyPage';
```
(add alongside the other page imports)

```tsx
        <Route path="/anatomy" element={<AnatomyPage />} />
```
(add inside the `<Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>` block, after the `/dictionary/:topic` route)

- [ ] **Step 6: Add the nav item in `src/components/AppShell.tsx`**

```tsx
import { Home, Clock, Stethoscope, Library, ClipboardCheck, PersonStanding } from 'lucide-react';
```

```tsx
        <NavLink to="/anatomy" className={NAV_ITEM_CLASSES}>
          <PersonStanding className="size-4" />
          {t('nav.anatomy')}
        </NavLink>
```
(add after the `/dictionary` `NavLink`, before the `isAdmin &&` block)

- [ ] **Step 7: Run the full test suite and typecheck**

Run: `npx vitest run && npx tsc -b`
Expected: all tests pass, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/pages/AnatomyPage.tsx src/pages/AnatomyPage.test.tsx src/App.tsx src/components/AppShell.tsx
git commit -m "feat: add /anatomy learner tab with region navigator and system card grids"
```

---

### Task 7: Admin data layer — `src/data/anatomyAdmin.ts`

**Files:**
- Create: `src/data/anatomyAdmin.ts`
- Test: `src/data/anatomyAdmin.test.ts`

**Interfaces:**
- Consumes: `supabase` from `../lib/supabase`; `fetchAllRows` from `./fetchAll`; `mapEntryRow, type EntryRow` from `./entryMapper`; `type Region` from `../lib/anatomyRegions`; `type BodySystem` from `../lib/anatomySystems`; `type DictionaryEntry` from `../lib/types`.
- Produces: `interface AnatomyImageAdmin { id: string; url: string; source: 'curated' | 'ai'; isPrimary: boolean; credit: string | null; }`; `interface AnatomyAdminEntry { entry: DictionaryEntry; region: Region | null; system: BodySystem | null; images: AnatomyImageAdmin[]; }`; `async function fetchAnatomyAdmin(): Promise<AnatomyAdminEntry[]>`; `async function setAnatomyMeta(entryId: string, region: Region, system: BodySystem): Promise<void>`; `async function setPrimaryImage(imageId: string): Promise<void>` — all consumed by Task 8 (`AdminAnatomyPage.tsx`).

- [ ] **Step 1: Write the failing test**

```ts
// src/data/anatomyAdmin.test.ts
import { describe, expect, it, vi, beforeEach } from 'vitest';

const rangeMock = vi.fn();
const upsertMock = vi.fn(async () => ({ error: null }));
const rpcMock = vi.fn(async () => ({ error: null }));
const fromMock = vi.fn((table: string) => {
  if (table === 'dictionary_entries') return { select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ range: rangeMock })) })) })) };
  if (table === 'anatomy_terms') return { upsert: upsertMock };
  throw new Error(`unexpected table ${table}`);
});
const storageMock = { from: vi.fn(() => ({ getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.test/${p}` } }) })) };
vi.mock('../lib/supabase', () => ({ supabase: { from: fromMock, rpc: rpcMock, storage: storageMock } }));

import { fetchAnatomyAdmin, setAnatomyMeta, setPrimaryImage } from './anatomyAdmin';

const ROW = (overrides: Record<string, unknown> = {}) => ({
  id: 'heart', hebrew: 'לב', hebrew_nikud: 'לֵב', part_of_speech: 'noun', level: 1,
  gender: 'ז', plural: null, root: null, everyday_synonym: null,
  translations: { en: 'heart' }, notes: null, category: null, topic: 'anatomy',
  anatomy_terms: null, anatomy_images: [],
  ...overrides,
});

beforeEach(() => { rangeMock.mockReset(); upsertMock.mockClear(); rpcMock.mockClear(); });

describe('fetchAnatomyAdmin', () => {
  it('includes anatomy words with no region/system/images yet', async () => {
    rangeMock.mockResolvedValueOnce({ data: [ROW()], error: null });
    const rows = await fetchAnatomyAdmin();
    expect(rows).toEqual([{ entry: expect.objectContaining({ id: 'heart' }), region: null, system: null, images: [] }]);
  });

  it('maps a row with terms and images', async () => {
    rangeMock.mockResolvedValueOnce({
      data: [ROW({
        anatomy_terms: { region: 'chest', system: 'cardiovascular' },
        anatomy_images: [{ id: 'img1', storage_path: 'heart/1.png', source: 'curated', is_primary: true, credit: 'Gray' }],
      })],
      error: null,
    });
    const rows = await fetchAnatomyAdmin();
    expect(rows[0].region).toBe('chest');
    expect(rows[0].images).toEqual([{ id: 'img1', url: expect.stringContaining('heart/1.png'), source: 'curated', isPrimary: true, credit: 'Gray' }]);
  });
});

describe('setAnatomyMeta', () => {
  it('upserts region/system for the entry', async () => {
    await setAnatomyMeta('heart', 'chest', 'cardiovascular');
    expect(upsertMock).toHaveBeenCalledWith(
      { entry_id: 'heart', region: 'chest', system: 'cardiovascular' },
      { onConflict: 'entry_id' },
    );
  });
});

describe('setPrimaryImage', () => {
  it('calls the set_primary_anatomy_image RPC', async () => {
    await setPrimaryImage('img1');
    expect(rpcMock).toHaveBeenCalledWith('set_primary_anatomy_image', { image_id: 'img1' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/anatomyAdmin.test.ts`
Expected: FAIL — `Cannot find module './anatomyAdmin'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/data/anatomyAdmin.ts
import { supabase } from '../lib/supabase';
import { fetchAllRows } from './fetchAll';
import { mapEntryRow, type EntryRow } from './entryMapper';
import type { Region } from '../lib/anatomyRegions';
import type { BodySystem } from '../lib/anatomySystems';
import type { DictionaryEntry } from '../lib/types';

export interface AnatomyImageAdmin {
  id: string; url: string; source: 'curated' | 'ai'; isPrimary: boolean; credit: string | null;
}

export interface AnatomyAdminEntry {
  entry: DictionaryEntry; region: Region | null; system: BodySystem | null; images: AnatomyImageAdmin[];
}

type AdminRow = EntryRow & {
  anatomy_terms: { region: Region; system: BodySystem } | null;
  anatomy_images: { id: string; storage_path: string; source: 'curated' | 'ai'; is_primary: boolean; credit: string | null }[] | null;
};

function publicImageUrl(storagePath: string): string {
  return supabase.storage.from('anatomy').getPublicUrl(storagePath).data.publicUrl;
}

// Admin view of every anatomy word, including ones still missing region/system/
// a primary image — unlike fetchAnatomyCards, nothing here is filtered out.
export async function fetchAnatomyAdmin(): Promise<AnatomyAdminEntry[]> {
  const rows = await fetchAllRows<AdminRow>((from, to) =>
    supabase
      .from('dictionary_entries')
      .select('*, anatomy_terms(region, system), anatomy_images(id, storage_path, source, is_primary, credit)')
      .eq('topic', 'anatomy')
      .eq('is_deprecated', false)
      .range(from, to),
  );

  return rows.map((r) => ({
    entry: mapEntryRow(r),
    region: r.anatomy_terms?.region ?? null,
    system: r.anatomy_terms?.system ?? null,
    images: (r.anatomy_images ?? []).map((img) => ({
      id: img.id, url: publicImageUrl(img.storage_path), source: img.source,
      isPrimary: img.is_primary, credit: img.credit,
    })),
  }));
}

// Direct write, like setTopic in reviewConsole.ts — region/system assignment is
// operational metadata, not moderated content, so it bypasses entry_edits.
export async function setAnatomyMeta(entryId: string, region: Region, system: BodySystem): Promise<void> {
  const { error } = await supabase
    .from('anatomy_terms')
    .upsert({ entry_id: entryId, region, system }, { onConflict: 'entry_id' });
  if (error) throw error;
}

export async function setPrimaryImage(imageId: string): Promise<void> {
  const { error } = await supabase.rpc('set_primary_anatomy_image', { image_id: imageId });
  if (error) throw error;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/anatomyAdmin.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/anatomyAdmin.ts src/data/anatomyAdmin.test.ts
git commit -m "feat: add anatomy admin data layer (fetch, setAnatomyMeta, setPrimaryImage)"
```

---

### Task 8: Admin UI — `AdminAnatomyPage.tsx`, route, nav item

**Files:**
- Create: `src/pages/AdminAnatomyPage.tsx`
- Test: `src/pages/AdminAnatomyPage.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/AppShell.tsx`

**Interfaces:**
- Consumes: `fetchAnatomyAdmin, setAnatomyMeta, setPrimaryImage, type AnatomyAdminEntry` from `../data/anatomyAdmin`; `REGIONS, type Region` from `../lib/anatomyRegions`; `SYSTEMS, type BodySystem` from `../lib/anatomySystems`; `PageHeader` from `../components/ui/PageHeader`; `AdminRoute` from `../components/AdminRoute`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/pages/AdminAnatomyPage.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '../lib/i18n';
import { AdminAnatomyPage } from './AdminAnatomyPage';

const setAnatomyMeta = vi.fn(async () => {});
const setPrimaryImage = vi.fn(async () => {});
vi.mock('../data/anatomyAdmin', () => ({
  fetchAnatomyAdmin: vi.fn(async () => [
    {
      entry: { id: 'heart', hebrew: 'לב', hebrewNikud: 'לֵב', partOfSpeech: 'noun', level: 1,
        gender: 'ז', plural: null, root: null, everydaySynonym: null,
        translations: { en: 'heart' }, notes: null, category: null, topic: 'anatomy' },
      region: null, system: null,
      images: [
        { id: 'img1', url: 'https://example.test/heart-curated.png', source: 'curated', isPrimary: false, credit: 'Gray' },
        { id: 'img2', url: 'https://example.test/heart-ai.png', source: 'ai', isPrimary: false, credit: null },
      ],
    },
  ]),
  setAnatomyMeta: (...args: unknown[]) => setAnatomyMeta(...args),
  setPrimaryImage: (...args: unknown[]) => setPrimaryImage(...args),
}));

describe('AdminAnatomyPage', () => {
  it('shows coverage as 0/1 when the only term has no region/system/primary', async () => {
    render(<AdminAnatomyPage />);
    expect(await screen.findByText(/0.*1/)).toBeInTheDocument();
  });

  it('calls setPrimaryImage when "Set primary" is clicked on a candidate image', async () => {
    render(<AdminAnatomyPage />);
    await screen.findByText('heart');
    const buttons = await screen.findAllByRole('button', { name: /set primary|קבע כתמונה ראשית/i });
    await userEvent.click(buttons[0]);
    expect(setPrimaryImage).toHaveBeenCalledWith('img1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/AdminAnatomyPage.test.tsx`
Expected: FAIL — `Cannot find module './AdminAnatomyPage'`.

- [ ] **Step 3: Write the page**

```tsx
// src/pages/AdminAnatomyPage.tsx
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/ui/PageHeader';
import {
  fetchAnatomyAdmin, setAnatomyMeta, setPrimaryImage, type AnatomyAdminEntry,
} from '../data/anatomyAdmin';
import { REGIONS, type Region } from '../lib/anatomyRegions';
import { SYSTEMS, type BodySystem } from '../lib/anatomySystems';

export function AdminAnatomyPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<AnatomyAdminEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = () => fetchAnatomyAdmin().then(setRows);
  useEffect(() => { reload(); }, []);

  const readyCount = useMemo(
    () => rows.filter((r) => r.region && r.system && r.images.some((i) => i.isPrimary)).length,
    [rows],
  );

  const onMetaChange = async (entryId: string, region: Region | '', system: BodySystem | '') => {
    if (!region || !system) return;
    setError(null);
    try {
      await setAnatomyMeta(entryId, region, system);
      await reload();
    } catch (err) {
      setError(String((err as { message?: string })?.message ?? err));
    }
  };

  const onSetPrimary = async (imageId: string) => {
    setError(null);
    try {
      await setPrimaryImage(imageId);
      await reload();
    } catch (err) {
      setError(String((err as { message?: string })?.message ?? err));
    }
  };

  return (
    <div className="mx-auto max-w-2xl p-4">
      <PageHeader title={t('nav.anatomyAdmin')} />
      <p className="mt-3 text-sm text-ink-muted">
        {t('admin.anatomyCoverage', { ready: readyCount, total: rows.length })}
      </p>
      {error && <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <ul className="mt-4 divide-y divide-border">
        {rows.map((r) => (
          <li key={r.entry.id} className="py-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-lg font-bold text-ink">{r.entry.hebrewNikud}</span>
                <span className="ms-2 text-sm text-ink-muted">{r.entry.translations.en}</span>
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <label className="text-xs text-ink-muted">
                <span className="sr-only">{t('admin.anatomyRegionLabel')}</span>
                <select
                  aria-label={t('admin.anatomyRegionLabel')}
                  className="rounded border border-border px-1 py-0.5 text-xs"
                  value={r.region ?? ''}
                  onChange={(e) => onMetaChange(r.entry.id, e.target.value as Region, r.system ?? '')}
                >
                  <option value="">{t('admin.anatomyNoRegion')}</option>
                  {REGIONS.map((slug) => <option key={slug} value={slug}>{t(`regions.${slug}`)}</option>)}
                </select>
              </label>
              <label className="text-xs text-ink-muted">
                <span className="sr-only">{t('admin.anatomySystemLabel')}</span>
                <select
                  aria-label={t('admin.anatomySystemLabel')}
                  className="rounded border border-border px-1 py-0.5 text-xs"
                  value={r.system ?? ''}
                  onChange={(e) => onMetaChange(r.entry.id, r.region ?? '', e.target.value as BodySystem)}
                >
                  <option value="">{t('admin.anatomyNoSystem')}</option>
                  {SYSTEMS.map((slug) => <option key={slug} value={slug}>{t(`systems.${slug}`)}</option>)}
                </select>
              </label>
            </div>
            {r.images.length === 0 ? (
              <p className="mt-2 text-xs text-ink-muted">{t('admin.anatomyNoImages')}</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-2">
                {r.images.map((img) => (
                  <li key={img.id} className="w-28 rounded-md border border-border p-1">
                    <img src={img.url} alt="" className="aspect-square w-full rounded object-cover" />
                    <div className="mt-1 flex items-center justify-between text-[10px]">
                      <span className="rounded bg-primary-tint px-1 text-primary">
                        {img.source === 'curated' ? t('admin.anatomyCurated') : t('admin.anatomyAi')}
                      </span>
                      {img.isPrimary && <span className="font-semibold text-primary">{t('admin.anatomyPrimary')}</span>}
                    </div>
                    {!img.isPrimary && (
                      <button type="button" onClick={() => onSetPrimary(img.id)}
                        className="mt-1 w-full rounded border border-border text-[10px]">
                        {t('admin.anatomySetPrimary')}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/pages/AdminAnatomyPage.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire the route in `src/App.tsx`**

```tsx
import { AdminAnatomyPage } from './pages/AdminAnatomyPage';
```

```tsx
        <Route path="/admin/anatomy" element={<AdminRoute><AdminAnatomyPage /></AdminRoute>} />
```
(add after the `/admin/dictionary` route)

- [ ] **Step 6: Add the nav item in `src/components/AppShell.tsx`**

```tsx
        {isAdmin && (
          <NavLink to="/admin/anatomy" className={NAV_ITEM_CLASSES}>
            <ClipboardCheck className="size-4" />
            {t('nav.anatomyAdmin')}
          </NavLink>
        )}
```
(add right after the existing `isAdmin && <NavLink to="/admin/dictionary">` block)

- [ ] **Step 7: Run the full test suite and typecheck**

Run: `npx vitest run && npx tsc -b`
Expected: all tests pass, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/pages/AdminAnatomyPage.tsx src/pages/AdminAnatomyPage.test.tsx src/App.tsx src/components/AppShell.tsx
git commit -m "feat: add /admin/anatomy console for region/system tagging and primary-image selection"
```

---

### Task 9: AI-generation trial pipeline (staging only)

**Files:**
- Create: `scripts/generate-anatomy-images.ts`

**Interfaces:**
- Consumes: `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL` env vars (same pattern as `verify-rls.ts`); a pluggable `generateImage(term: string): Promise<Buffer>` — the actual image-model call is a placeholder function the operator wires up at run time (spec: "the image-generation tooling available at build time — pluggable"), everything around it (idempotency, upload, DB insert, never-auto-primary) is real and runnable today.

- [ ] **Step 1: Write the script**

```ts
// scripts/generate-anatomy-images.ts
// Trial AI-image pipeline for the anatomy tab. Stages `source='ai', is_primary=false`
// candidates for a fixed trial list of ~10-15 terms so an expert can compare them
// against curated images in /admin/anatomy. NEVER sets a primary — an AI image is
// published only by explicit admin action (medical-accuracy caveat, see spec).
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env.content' });

const url = process.env.VITE_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

// Trial set: 10-15 anatomy entry ids to compare AI generation against curated
// images before deciding whether to scale (spec: "curated-first ... trial set").
const TRIAL_ENTRY_IDS = [
  // Fill with real dictionary_entries.id values tagged topic='anatomy' before running,
  // e.g. 'heart', 'lung_left', 'femur', 'kidney', 'liver', ...
];

// Swap this for the actual image-generation call available at run time
// (spec: "pluggable"). Must return raw image bytes for one term.
async function generateImage(termEnglish: string): Promise<Buffer> {
  throw new Error(`generateImage() not wired up yet — no provider configured for "${termEnglish}"`);
}

async function main() {
  const regenerate = process.argv.includes('--regenerate');
  let staged = 0;
  let skipped = 0;

  for (const entryId of TRIAL_ENTRY_IDS) {
    const { data: entry, error: entryErr } = await admin
      .from('dictionary_entries').select('id, translations').eq('id', entryId).single();
    if (entryErr || !entry) { console.log(`SKIP  ${entryId} — not found`); skipped++; continue; }

    if (!regenerate) {
      const { data: existing } = await admin
        .from('anatomy_images').select('id').eq('entry_id', entryId).eq('source', 'ai').limit(1);
      if ((existing ?? []).length > 0) { console.log(`SKIP  ${entryId} — already has an ai candidate`); skipped++; continue; }
    }

    const termEnglish = (entry.translations as { en: string }).en;
    const bytes = await generateImage(termEnglish);
    const storagePath = `${entryId}/ai-${Date.now()}.png`;

    const { error: uploadErr } = await admin.storage.from('anatomy')
      .upload(storagePath, bytes, { contentType: 'image/png', upsert: regenerate });
    if (uploadErr) throw uploadErr;

    const { error: insertErr } = await admin.from('anatomy_images').insert({
      entry_id: entryId, storage_path: storagePath, source: 'ai', is_primary: false,
    });
    if (insertErr) throw insertErr;

    console.log(`STAGED ${entryId} -> ${storagePath}`);
    staged++;
  }

  console.log(`\n${staged} staged, ${skipped} skipped. No primary images were set — review in /admin/anatomy.`);
}
main();
```

- [ ] **Step 2: Register the npm script**

Modify `package.json` — add to `"scripts"` (alongside `"suggest:topics"`):

```json
    "generate:anatomy-images": "tsx scripts/generate-anatomy-images.ts"
```

- [ ] **Step 3: Verify it fails loudly with no provider wired up (expected — this is a staging harness, not a working generator yet)**

Run: `npm run generate:anatomy-images`
Expected: if `TRIAL_ENTRY_IDS` is still empty, prints `0 staged, 0 skipped.` and exits 0 (no-op). If IDs are filled in without wiring `generateImage`, throws `generateImage() not wired up yet ...` for the first id — this is correct: the script must fail rather than silently stage nothing.

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-anatomy-images.ts package.json
git commit -m "feat: add trial AI anatomy-image staging script (generate:anatomy-images)"
```

---

## Out of scope (per spec — do not build)

- Interactive labeled body SVG (tap-a-region figure).
- Audio pronunciation on anatomy cards.
- Scaling AI generation beyond the trial set — that's a follow-up decision after Task 9's comparison.
- Anatomy quizzing / FSRS practice integration.
- A manual "upload curated image" admin UI — curated images are seeded by a script from a vetted open-license set (not built in this plan; the spec only requires the AI trial script). If curated seeding is wanted next, it's a new small task: same upload+insert shape as Task 9 but `source: 'curated'` with a real `credit` and reading local image files instead of calling `generateImage`.
