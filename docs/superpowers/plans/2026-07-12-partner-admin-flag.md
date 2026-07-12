# Partner login → admin flag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-grant/revoke `profiles.is_admin` based on an editable email allowlist, so partners get admin access without a manual DB edit per person.

**Architecture:** One new table (`partner_allowlist`) plus two SECURITY DEFINER triggers: one fires on `profiles` insert (covers onboarding when already allowlisted), one fires on `auth.users` update of `last_sign_in_at` (covers every login — grants and auto-revokes). No app/client code changes.

**Tech Stack:** Supabase Postgres (SQL migrations), applied via the Supabase MCP `apply_migration` tool against project `uwhaswhtjcmsegfqyzit`.

## Global Constraints

- Migration file goes in `supabase/migrations/`, next sequence number after `0005_extend_pos.sql` → `0006_partner_allowlist.sql`.
- Follow existing SQL style: lowercase keywords, `security definer` + `set search_path = public` on functions that need elevated access (matches `public.is_admin()` in `0002_rls.sql`).
- Every table gets RLS enabled, per existing convention (all tables in `0002_rls.sql`).
- Email matching is case-insensitive (`lower(email)`).
- No client/app code changes — this is DB-only (spec: `docs/superpowers/specs/2026-07-12-partner-admin-flag-design.md`).

---

### Task 1: Migration — partner_allowlist table + sync triggers

**Files:**
- Create: `supabase/migrations/0006_partner_allowlist.sql`

**Interfaces:**
- Produces: table `public.partner_allowlist(email text primary key, added_at timestamptz, note text)`; function `public.set_profile_admin_from_allowlist()` (trigger fn); function `public.sync_profile_admin_on_login()` (trigger fn). No other task depends on these — this is the only task in the plan.

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/0006_partner_allowlist.sql

create table public.partner_allowlist (
  email text primary key,
  added_at timestamptz not null default now(),
  note text
);

alter table public.partner_allowlist enable row level security;

-- Grants admin on profile creation if the account's email is already allowlisted
-- (covers a partner added to the allowlist before they finish onboarding).
create function public.set_profile_admin_from_allowlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_email text;
begin
  select email into user_email from auth.users where id = new.user_id;
  new.is_admin := exists (
    select 1 from public.partner_allowlist where lower(email) = lower(user_email)
  );
  return new;
end;
$$;

create trigger profiles_set_admin_from_allowlist
  before insert on public.profiles
  for each row execute function public.set_profile_admin_from_allowlist();

-- Grants/revokes admin on every login (auth.users.last_sign_in_at is bumped by
-- Supabase on every sign-in). No-op if the profile row doesn't exist yet.
create function public.sync_profile_admin_on_login()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set is_admin = exists (
    select 1 from public.partner_allowlist where lower(email) = lower(new.email)
  )
  where user_id = new.id;
  return new;
end;
$$;

create trigger users_sync_admin_on_login
  after update of last_sign_in_at on auth.users
  for each row execute function public.sync_profile_admin_on_login();
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Call `mcp__325f0869-4953-41cf-9f13-4dfcf6543ac6__apply_migration` with:
- `project_id`: `uwhaswhtjcmsegfqyzit`
- `name`: `partner_allowlist`
- `query`: the full SQL from Step 1

Expected: tool returns success, no error. Then call `mcp__325f0869-4953-41cf-9f13-4dfcf6543ac6__list_migrations` with the same `project_id` and confirm `0006_partner_allowlist` (or equivalent generated name/timestamp) appears in the list.

- [ ] **Step 3: Verify grant-on-login using the owner's own account**

Using `mcp__325f0869-4953-41cf-9f13-4dfcf6543ac6__execute_sql` against `project_id` `uwhaswhtjcmsegfqyzit`, run in sequence:

```sql
-- 1. Confirm current state (should be false unless already admin)
select p.user_id, u.email, p.is_admin
from public.profiles p join auth.users u on u.id = p.user_id
where u.email = 'ori.lencovsky@gmail.com';
```

```sql
-- 2. Add to allowlist
insert into public.partner_allowlist (email, note) values ('ori.lencovsky@gmail.com', 'verification test');
```

```sql
-- 3. Simulate a login by touching last_sign_in_at (fires the AFTER UPDATE trigger)
update auth.users set last_sign_in_at = now() where email = 'ori.lencovsky@gmail.com';
```

```sql
-- 4. Confirm is_admin flipped true
select p.user_id, u.email, p.is_admin
from public.profiles p join auth.users u on u.id = p.user_id
where u.email = 'ori.lencovsky@gmail.com';
```

Expected: `is_admin` is `true` in step 4.

- [ ] **Step 4: Verify auto-revoke**

```sql
-- 5. Remove from allowlist
delete from public.partner_allowlist where email = 'ori.lencovsky@gmail.com';
```

```sql
-- 6. Simulate another login
update auth.users set last_sign_in_at = now() where email = 'ori.lencovsky@gmail.com';
```

```sql
-- 7. Confirm is_admin flipped back to false (unless it was true for another reason before step 2 — compare against step 1's result)
select p.user_id, u.email, p.is_admin
from public.profiles p join auth.users u on u.id = p.user_id
where u.email = 'ori.lencovsky@gmail.com';
```

Expected: `is_admin` matches the value observed in Step 3's query 1 (i.e., back to baseline — `false` if the owner wasn't already a manually-set admin).

- [ ] **Step 5: Commit**

```bash
cd /Users/ori/Desktop/Medlingo
git add supabase/migrations/0006_partner_allowlist.sql
git commit -m "feat: add partner allowlist with auto grant/revoke of admin flag"
```

---

## Self-Review

**Spec coverage:** allowlist table ✓ (Step 1), grant-on-signup-if-already-listed ✓ (trigger 1), grant/revoke-on-every-login ✓ (trigger 2), no app code changes ✓ (none included), manual test procedure ✓ (Steps 3-4 match spec's testing section exactly).

**Placeholder scan:** none — every step has literal SQL/commands and a project_id.

**Type consistency:** single task, no cross-task interfaces to drift.
