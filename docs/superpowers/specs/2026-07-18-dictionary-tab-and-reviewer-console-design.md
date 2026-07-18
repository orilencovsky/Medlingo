# MedLingo — Dictionary Tab & Reviewer Console

**Date:** 2026-07-18
**Status:** Approved design — ready for implementation plan
**Related:** [2026-07-17 MVP vision update](2026-07-17-medlingo-mvp-vision-update.md), [2026-07-10 pilot design](2026-07-10-medlingo-pilot-design.md), [2026-07-12 partner-admin flag](2026-07-12-partner-admin-flag-design.md)

## Purpose

Two connected surfaces built on the shared `dictionary_entries` data:

1. **Learner Dictionary tab** (`/dictionary`) — a read-only browse + search view of all
   approved words. Available to every signed-in learner.
2. **Reviewer console** (`/admin/dictionary`) — an in-app editing surface that replaces the
   current Excel/TSV round-trip, so the language expert can review the ~1187 words
   comfortably in the app. Every content change is a **pending draft** until the owner
   approves it.

The second surface directly unblocks the outstanding expert-review pass (the last gap on the
original MVP content scope): today the review sheet in Drive is empty because the Excel
workflow is clunky.

## Decisions (locked during brainstorming)

- Learner tab is **read-only**, approved words only.
- **Source of truth flips to the DB.** `import:content` becomes seed-only; a new
  `export:content` dumps DB → `content/dictionary.tsv` for git-versioned backup.
- Reviewer edits are **moderated**: they land as drafts and stay invisible to learners until
  the owner approves.
- Roles: reuse `profiles.is_admin` for **reviewer** access; add `can_approve` flag for the
  **owner** (just Ori for now). One reviewer initially; the model supports N.
- Reviewer change scope: **edit existing + flag-for-deletion + add new words** — all moderated.
- Track **per-word review status** (`unreviewed`/`reviewed`/`edit_pending`) with a progress
  count; seed a **priority** queue from `content/REVIEW_FLAGS.md`.
- Data model: **Approach 1** — a dedicated `entry_edits` staging table + status columns on
  the live table. The live table is untouched until approval, so the learner read path is
  unchanged.

## Architecture

### Data model

**`dictionary_entries`** (existing) — add ops-only columns (NOT part of the content TSV):

- `review_state text not null default 'unreviewed'` — check in
  (`unreviewed`, `reviewed`, `edit_pending`)
- `review_priority int not null default 0` — higher surfaces first; seeded from
  `REVIEW_FLAGS.md`
- `is_deprecated bool not null default false` — soft delete; approved delete-flags hide a word
  from learners while keeping the row

**`entry_edits`** (new staging table):

```
id            uuid pk default gen_random_uuid()
entry_id      text null references dictionary_entries(id)   -- null when change_type='create'
change_type   text not null check (change_type in ('create','update','delete'))
payload       jsonb not null       -- proposed full field set (create/update); {} for delete
editor_id     uuid not null references auth.users
editor_note   text null
status        text not null default 'pending'
              check (status in ('pending','approved','rejected'))
decided_by    uuid null references auth.users
decided_at    timestamptz null
created_at    timestamptz not null default now()
```

Partial unique index — at most one open pending edit per existing entry:
`unique (entry_id) where status = 'pending' and change_type <> 'create'`.

**`profiles`** — add `can_approve bool not null default false`. Owner profile seeded `true`
via migration.

### RLS & write path

- `dictionary_entries`: learners `select` where `is_deprecated = false`; `is_admin()` selects
  all. No client writes — all writes go through the approve RPC.
- `entry_edits`: `is_admin()` may `insert` (with `editor_id = auth.uid()`) and `select`;
  deciding (`update` to approved/rejected) only where `can_approve()`.
- `can_approve()` — new SQL helper mirroring the existing `is_admin()` helper (0002_rls.sql).
- **`apply_entry_edit(edit_id uuid, decision text)`** — `SECURITY DEFINER` RPC. Validates the
  caller `can_approve()`, then atomically:
  - `update` → writes `payload` onto the live entry, `review_state = 'reviewed'`
  - `delete` → sets `is_deprecated = true`, `review_state = 'reviewed'`
  - `create` → inserts a new live row from `payload`
  - on approve: stamps `status='approved'`, `decided_by`, `decided_at`
  - on reject: stamps `status='rejected'`; reverts the entry's `review_state`
  All content-mutation logic stays server-side and atomic.

### Learner Dictionary tab

- Route `/dictionary` under `AppShell`; nav item (`Library`/`BookA` icon,
  `t('nav.dictionary')`) for all learners.
- `src/data/dictionary.ts` → `fetchDictionary()` = `select * where is_deprecated = false`.
  ~1187 rows load into memory (same pattern as `cards.ts:93`).
- `src/pages/DictionaryPage.tsx`:
  - Search box — client-side filter over `hebrew`, `hebrewNikud`, `everydaySynonym`,
    `translations.en` (+ ar/ru/fr by UI language).
  - Filter chips (optional): level (1/2/3), category, part-of-speech.
  - Results list, sorted Hebrew alpha, paged/virtualized. Row = headword + nikud + POS + en
    gloss.
  - Row → detail card: full entry (nikud, POS, level, gender, plural, root, everyday synonym,
    all translations, notes).
- Audio is out of scope here; the row/detail leave a seam for the future audio feature.

### Reviewer console

Route `/admin/dictionary`, gated `is_admin` (learners redirected). Nav item shown only when
`isAdmin`.

**Reviewer view (`is_admin`)**

- Word list sorted `review_priority desc, hebrew` (flagged-uncertain float to top). Progress
  header `N / 1187 reviewed`. Per-row `review_state` badge. Filters: state, level,
  priority-only.
- Row → edit form covering every field. Actions:
  - **Save draft** → `entry_edits` insert `change_type='update'`; live entry
    `review_state='edit_pending'`.
  - **Mark reviewed (no change)** → sets `review_state='reviewed'` directly. Bypasses
    moderation deliberately — it changes no content, only coverage status.
  - **Flag for deletion** → `entry_edits` `change_type='delete'` + note.
  - **Add new word** → blank form → `change_type='create'`.
- Reviewer sees their own `pending` edits and can withdraw one before a decision.

**Owner view (`can_approve`)**

- Same list plus a **review queue** of all `status='pending'` edits. Each shows a field-level
  diff (old → new) and the editor note.
- **Approve** → `apply_entry_edit(id, 'approved')`.
- **Reject** → `apply_entry_edit(id, 'rejected')` + optional note.

**Data**: `src/data/reviewConsole.ts` (fetch entries with state, fetch pending edits, insert
edit, mark-reviewed, approve/reject via RPC). Pages `AdminDictionaryPage.tsx` + a
`ReviewQueue` component.

### Export / import reconciliation

- **`scripts/export-content.ts`** (`npm run export:content`): reads live `dictionary_entries`
  (skipping `is_deprecated`), writes `content/dictionary.tsv` in the existing 15-column order,
  sorted by `id` for clean git diffs. Run after approval sessions; commit as versioned backup.
- **`import:content`** demoted to seed/bootstrap only. Add a loud console warning that it
  overwrites the DB from the TSV. No code-behavior change otherwise.
- **Round-trip integrity**: export → import is identity on the 15 content columns. The new
  ops columns (`review_state`, `review_priority`, `is_deprecated`) are DB-only and never
  appear in the TSV, so import never touches them.

## Testing

- **Unit**: `entry_edits` state machine (each `change_type` → approve/reject applies
  correctly); `apply_entry_edit` RPC per change type; export→import round-trip identity;
  dictionary search filter logic.
- **RLS** (extend `scripts/verify-rls.ts`): learner cannot read deprecated rows or write
  edits; reviewer can insert edits but cannot approve; approver can.
- **E2E** (Playwright): learner opens Dictionary, searches, opens an entry; reviewer edits a
  word → draft created; owner approves → learner sees the change; reviewer flags a word for
  deletion → owner approves → word disappears for the learner.

## Out of scope

- Audio/pronunciation on dictionary rows (future feature; seam left).
- Multiple simultaneous reviewers / per-reviewer assignment (model supports it; UI not built).
- Editing units/dialogue in-app (this covers `dictionary_entries` only).
- Rich diff/merge conflict handling beyond "one open pending edit per entry".
