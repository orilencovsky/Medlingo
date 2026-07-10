# Supabase project configuration

Live project credentials for the MedLingo pilot, recorded after completing
Phase 1 plan Task 3 Step 1 (owner created the Supabase project).

## Client configuration (safe to share)

The anon key is a publishable key by design — all data access it grants is
gated by Row Level Security (Phase 1 plan Task 4).

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://uwhaswhtjcmsegfqyzit.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3aGFzd2h0amNtc2VnZnF5eml0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3MDQ1NzcsImV4cCI6MjA5OTI4MDU3N30.P6i-84zK8hkDahA9PPa_qlDr9-p9r47QGowBwN5quTQ` |

Project ref: `uwhaswhtjcmsegfqyzit`. Anon key JWT: role `anon`, issued
2026-07-10, expires 2099-07-09.

### Where these values go

- **Local dev:** copy into `.env.local` (gitignored — see Phase 1 plan Task 3 Step 2):

  ```
  VITE_SUPABASE_URL=https://uwhaswhtjcmsegfqyzit.supabase.co
  VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3aGFzd2h0amNtc2VnZnF5eml0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3MDQ1NzcsImV4cCI6MjA5OTI4MDU3N30.P6i-84zK8hkDahA9PPa_qlDr9-p9r47QGowBwN5quTQ
  ```

- **Cloudflare Pages:** add both variables under Settings → Environment
  variables for Production and Preview (Phase 1 plan Task 2 Step 3.4).

## Secret configuration (never commit)

These belong in `.env.content` (gitignored) and are **not** recorded here.
Copy them from the Supabase dashboard (Project Settings):

```
DATABASE_URL=postgresql://postgres:<password>@db.uwhaswhtjcmsegfqyzit.supabase.co:5432/postgres
SUPABASE_SERVICE_ROLE_KEY=<service_role key from Project Settings → API keys>
```

## Remaining manual checklist (Phase 1 plan Task 3 Step 1)

- [ ] Confirm project region is **EU Central (Frankfurt, eu-central-1)** —
      required by the spec (EU data residency); not verifiable from this
      environment.
- [ ] Authentication → URL Configuration: Site URL `https://medlingo.pages.dev`;
      Additional Redirect URLs `http://localhost:5173`.
