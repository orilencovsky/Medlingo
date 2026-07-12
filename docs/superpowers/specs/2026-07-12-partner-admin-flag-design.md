# Partner login → admin flag

## Problem

Partners need admin access (`profiles.is_admin`) without a manual DB edit per person, and without building an admin UI yet. The column already exists (`supabase/migrations/0001_schema.sql`) and is already read by RLS (`public.is_admin()`, `0002_rls.sql`) and by the client (`Profile.isAdmin`, `src/lib/types.ts`). No client write path exists — RLS forces `is_admin = false` on self-insert and blocks self-update.

## Design

### 1. `partner_allowlist` table

```sql
create table public.partner_allowlist (
  email text primary key,
  added_at timestamptz not null default now(),
  note text
);
```

Managed directly via Supabase SQL editor/dashboard — no in-app UI. Matching is case-insensitive (`lower(email)`).

### 2. Grant/revoke triggers (SECURITY DEFINER, bypass RLS)

**`BEFORE INSERT ON public.profiles`** — sets `NEW.is_admin` by checking `auth.users.email` (via `NEW.user_id`) against `partner_allowlist`. Overrides the client-forced `is_admin = false` on onboarding insert, so a partner added to the allowlist *before* finishing onboarding still gets admin on profile creation.

**`AFTER UPDATE OF last_sign_in_at ON auth.users`** — if a `profiles` row already exists for that user, sets `is_admin = (email in allowlist)`. `last_sign_in_at` is bumped by Supabase on every sign-in, so this fires on every login — granting newly-added partners on their next login, and auto-revoking anyone removed from the allowlist on their next login.

### 3. No app code changes

`isAdmin` is already surfaced end-to-end (`getProfile()` → `Profile.isAdmin`). Existing RLS already branches on it. This spec only makes the flag self-maintaining from the allowlist.

## Out of scope

- Admin UI / admin-only routes (tracked separately — "flag mechanism only" was the explicit scope decision)
- Report-problem button for admins (separate feature, queued next)
- Invite-code or self-serve partner signup flow

## Testing

No JS surface. Manual verification:
1. Insert a test email into `partner_allowlist`.
2. Sign in with that email → confirm `profiles.is_admin` becomes `true`.
3. Delete the row from `partner_allowlist`.
4. Sign in again → confirm `profiles.is_admin` becomes `false`.

## Migration file

`supabase/migrations/0006_partner_allowlist.sql`
