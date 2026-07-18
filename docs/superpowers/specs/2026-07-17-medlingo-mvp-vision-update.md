# MedLingo — MVP Vision Update

**Date:** 2026-07-17
**Status:** Direction note — captures the owner's revised MVP framing; not yet a per-feature implementation plan

## Why this exists

The owner authored a new MVP note (Google Drive, `MVP -`, 2026-07-15) that widens
the product vision beyond the original [2026-07-10 pilot design](2026-07-10-medlingo-pilot-design.md).
This document records that revised direction, reconciles it with what is already
built, and re-sorts the roadmap. The 2026-07-10 spec stays the source of truth for
everything already shipped; this note layers the new intent on top and marks which
items graduate from "out of scope" to "planned".

## The revised product statement

> A product that takes the learner from a basic level to a level where they can hold
> a basic **professional conversation**.

The emphasis shifts from "learn + review vocabulary in context" (still the core) toward
**producing spoken professional Hebrew** — voice and audio move from the roadmap into the
headline experience, and light game mechanics join streaks as motivation.

## Elements in the new MVP note

From the owner's note, mapped to current build status:

| Element (owner's note) | Status in the project today |
|---|---|
| Dictionary of ~3,000 words (authored as a spreadsheet) | **Built** — content pipeline live; ~1,100 entries imported so far, scaling toward 3,000 across 3 levels |
| Sort by level | **Built** — `dictionary_entries.level` (1–3), used by unit ordering and form selection |
| Free AI conversation on medical scenarios (situation + interlocutor) | **Built** — the `drill` Edge Function (Claude plays a patient; learner is the clinician) |
| Spaced repetition / "repetition" as a learning technique | **Built** — FSRS scheduling, flashcard + cloze forms |
| **Hearing the word (audio / pronunciation)** | **New** — was explicitly out of scope in the 2026-07-10 design |
| **Voice conversation** (learning flow opens with a spoken exchange + on-screen text) | **New** — voice simulation was a roadmap seam only |
| **Game mechanics — Wordle, Scrabble, prizes/rewards** | **New** — the pilot deliberately shipped only streaks + progress |

### The revised unit learning flow (owner's note)

Start a unit → **voice conversation + text the learner follows along with** → review the
words → AI converses. Compared with the shipped flow (read scenario → introduce vocab →
immediate tap-based practice → complete), the new intent front-loads a **spoken/audio
scenario** before the word introduction, and positions the AI conversation as a recurring
part of the unit rather than a separate Phase 2 mode.

## What this changes vs. the 2026-07-10 design

The original spec listed these under "Explicitly out of pilot scope (roadmap, seams
designed in)". The new note **pulls the first three into the product vision**:

- Audio / listening (word pronunciation) — now a headline feature.
- Voice simulation of the clinical exchange — now the opening beat of a unit.
- Game mechanics (Wordle-style, Scrabble-style, rewards) — now motivation alongside streaks.

Still out of scope / unchanged from the original roadmap: social practice between learners,
non-English UI (kept i18n-ready), typed Hebrew input with forgiving matching, SEO/marketing
pages.

The existing architecture was designed with these seams in mind (see 2026-07-10 §11), so
these are **additive**, not a rewrite:

- **Audio** — pronunciation clips per dictionary entry (pre-generated TTS or recorded),
  served as static assets; an optional nullable `audio` reference on `dictionary_entries` /
  unit dialogue lines. No schema-breaking change.
- **Voice conversation** — the drill handler is already framework-agnostic; voice is a
  browser ↔ voice-API path (WebRTC + ephemeral tokens minted by an Edge Function, or a small
  companion service), reusing the same auth + quota pattern.
- **Games** — new self-contained practice/motivation surfaces that read existing
  `dictionary_entries` + `user_card_state`; rewards extend the `profiles` gamification fields.

## Research track (owner's note)

The note also lists non-engineering research to run in parallel — not code, but recorded here
so it is not lost:

- **Audience characterization** — origin languages, motivation, current Hebrew level.
- **Market size.**
- **Voice conversation** — feasibility / approach exploration.

## Reconciling with reality

Per the interim status note (Drive, 2026-07-15) and the repo, the build is **ahead of the
original MVP**: 4 units published (vs. 1 planned), and Phase 2 (drill) appears fully built
(Edge Function, streaming, UI, e2e) — pending confirmation that it is enabled in production
(`VITE_ENABLE_DRILL`). The remaining gap on the *original* scope is **content**, not
engineering: the language-expert review pass on the dictionary is still outstanding.

Against this revised vision, the open build work is the three **new** capabilities above
(audio, voice, games), each of which warrants its own dated implementation plan under
[docs/superpowers/plans/](../plans/) before work starts.

## Suggested next steps (not yet planned in detail)

1. Confirm the drill Edge Function is deployed and `VITE_ENABLE_DRILL` is on in production.
2. Close the original content gap: apply the language-expert dictionary review, publish the
   remaining draft units.
3. Write a per-feature plan for **audio/pronunciation** (smallest new surface, unblocks the
   revised unit flow's "hear the word").
4. Write a per-feature plan for **voice conversation** (largest new surface; depends on the
   research track's voice feasibility work).
5. Scope one **game** (Wordle-style word guess is the closest fit to existing data) as a
   motivation surface.
6. Run the research track (audience, market size) alongside the build.
