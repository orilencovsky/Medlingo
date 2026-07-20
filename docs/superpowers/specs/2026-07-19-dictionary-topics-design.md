# MedLingo — Dictionary Topics

**Date:** 2026-07-19
**Status:** Approved design — ready for implementation plan
**Related:** [2026-07-18 dictionary tab + reviewer console](2026-07-18-dictionary-tab-and-reviewer-console-design.md) (this builds on the shipped `/dictionary` tab and reviewer console)

## Purpose

Organize the ~1187-word dictionary by clinical **subject**, so learners can browse by topic
(a grid of topic cards → filtered word list) and reviewers can confirm each word's topic in the
existing console. Each word carries exactly one topic. This is also the foundation the separate
**anatomy tab** builds on (`topic = 'anatomy'`).

## Decisions (locked during brainstorming)

- **One topic per word** — a single nullable `topic` column, not a many-to-many join, not an
  overload of the existing `category` (which stays the loanword/study-area axis).
- **Assignment = AI-suggest → reviewer sets directly.** A pipeline proposes one topic per word;
  the reviewer confirms/corrects it inline in the console. Topic is low-stakes browse metadata,
  so it is written **directly** (no owner-approval draft cycle, unlike content edits).
- **Learner browse = topic-grid landing** — `/dictionary` opens as a grid of topic cards
  (icon + localized name + word count); tapping a card drills into that topic's word list.
- **Controlled vocabulary** of 19 slugs (below), enforced by a DB `CHECK` and mirrored in the
  pipeline and the UI label map.

## Controlled vocabulary (19 topics)

`anatomy, symptoms, cardiology, respiratory, gastro, neuro, msk, genitourinary, endocrine,
dermatology, medications, procedures, lab_imaging, emergency, mental_health, obgyn, pediatrics,
infectious, general`

Slugs are stable identifiers; display names are localized (see i18n below). The set is refinable
during spec review — changing it means updating the CHECK, the pipeline enum, and the label map
together.

## Architecture

### Data model & write path

- `dictionary_entries.topic text` — nullable (null = untagged), `check (topic in (<19 slugs>))`.
  Migration `0012_dictionary_topic.sql`.
- **Direct write, not moderated.** `topic` is deliberately **omitted** from the
  `guard_entry_content_update` trigger's blocked-column list, so a reviewer (`is_admin`) can
  update it directly through the existing `admin_update_entries` policy — no `entry_edits` draft,
  no owner approval. This mirrors how `review_state` ("mark reviewed") is already a direct write.
- Learners read `topic` through the existing `read_dictionary` select policy (no change).
- A `setTopic(entryId, topic)` data function, sibling to `markReviewed`, issues the direct update.

### i18n

- A slug→label map per locale so topics never render as raw english slugs. Add a `topics` block
  to all five locale files (`src/locales/{en,he,ar,ru,fr}.json`) with one key per slug (e.g.
  `topics.cardiology` → he "קרדיולוגיה"). Learner grid + reviewer select + word rows all read
  from this map.

### AI-suggest pipeline

- `scripts/suggest-topics.ts` (`npm run suggest:topics`): pages all entries (must use the
  `fetchAllRows` pattern / direct-DB read — the PostgREST 1000-row cap applies), and for each
  **untagged** word sends `hebrew + en + notes` to Claude with the fixed 19-slug vocabulary,
  forcing exactly one slug as output. Writes the suggestion to `dictionary_entries.topic`.
  Re-runnable: only touches rows where `topic is null`, so it's safe to run again as new words
  arrive. One bulk pass seeds all 1187; reviewers then confirm/correct.
- Anti-fabrication: the model must return one of the 19 slugs verbatim; any other output is
  rejected and that row is left null (logged) rather than guessed.

### Reviewer console

- `AdminDictionaryPage` each row gains a topic control: the current topic as a localized badge,
  and a `<select>` (localized labels, plus an "— untagged —" option) that calls
  `setTopic(entryId, topic)` immediately on change. No draft, no approve — direct.
- The progress header gains a second counter beside review coverage: **topic coverage**
  (`N / total tagged`).

### Learner browse-by-topic (grid landing)

- `/dictionary` becomes a **topic grid**: ~19 cards, each = a lucide icon + localized topic name +
  live word count (non-deprecated, topic-tagged). A lucide icon is mapped per slug in a constant
  (fallback: a generic `Tag` icon); the exact icon choices are refinable.
- Tapping a card navigates to `/dictionary/:topic` — the existing searchable word list, pre-filtered
  to that topic (search still works within the topic). A back affordance returns to the grid.
- An "all words" / untagged affordance remains reachable so nothing is stranded while tagging is
  in progress (a card for untagged, or an "all" card).
- Word rows continue to show nikud-primary Hebrew + gloss (unchanged from the shipped tab); the
  topic label is implicit from the drill-in context.

## Testing

- **Migration:** `topic` CHECK rejects an invalid slug; `guard_entry_content_update` does NOT
  block a `topic`-only update by a reviewer (extend `verify-rls.ts`: reviewer can set topic
  directly, but still cannot change content columns).
- **Pipeline:** `suggest-topics` maps a mocked Claude response to a valid slug; a non-vocab
  response leaves the row null and is logged (no fabrication).
- **Console:** changing the topic select calls `setTopic` with the right slug; coverage counter
  reflects tagged count.
- **Learner grid:** grid renders one card per topic with correct counts; tapping routes to the
  filtered list; the filtered list shows only that topic's words; i18n label parity across all
  five locales (every slug has a label in every locale).

## Out of scope

- Many-to-many topics (a word in several topics) — revisit only if single-topic proves limiting.
- Topic assignment for the anatomy images/interactivity — that's the separate anatomy-tab spec;
  this spec only establishes `topic = 'anatomy'` as one of the 19.
- Moderating topic changes through the approve/reject queue — deliberately direct-write.
- Reordering/curating topic display order beyond a fixed sensible sequence.
