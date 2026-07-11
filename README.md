# MedLingo

_[קרא בעברית](README.he.md)_

Teaches medical Hebrew to immigrant clinicians (olim physicians/nurses) working in Israeli
healthcare. Learners work through realistic clinical scenarios ("units"), then keep vocabulary
fresh with spaced-repetition review (FSRS) on a daily streak.

**Live:** [medlingo.pages.dev](https://medlingo.pages.dev) — continuously deployed from `main`.

New to the project? Start with [docs/ONBOARDING.md](docs/ONBOARDING.md) (idea, stack, current
status, where to plug in), then the full spec at
[docs/superpowers/specs/2026-07-10-medlingo-pilot-design.md](docs/superpowers/specs/2026-07-10-medlingo-pilot-design.md).

## Stack

Vite + React + TypeScript · Supabase (Postgres + RLS + auth) · Cloudflare Pages · `ts-fsrs` for
scheduling. Content is authored as git-versioned TSVs (`content/`) and imported into Supabase —
see [docs/ONBOARDING.md](docs/ONBOARDING.md) for the content pipeline.

## Setup

```bash
npm install
cp .env.example .env.local            # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
cp .env.content.example .env.content  # fill in DATABASE_URL / SUPABASE_SERVICE_ROLE_KEY (content import only)
npm run dev
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server |
| `npm test` | Unit/integration tests (vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright) |
| `npm run import:content` | Import `content/` TSVs into Supabase |
| `npm run metrics` | Pilot retention SQL views |
| `npm run verify:rls` | Check Row Level Security policies |
