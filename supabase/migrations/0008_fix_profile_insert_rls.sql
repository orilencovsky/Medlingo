-- supabase/migrations/0008_fix_profile_insert_rls.sql
--
-- Bug: allowlisted partners could not complete onboarding.
--
-- The BEFORE-INSERT trigger set_profile_admin_from_allowlist (0006) sets
-- new.is_admin := true when the account's email is on partner_allowlist. But
-- own_profile_insert (0002) required `with check (... and is_admin = false)`.
-- Postgres runs BEFORE triggers first, THEN evaluates the RLS WITH CHECK against
-- the final row, so for any allowlisted email the check fails and the insert is
-- rejected ("new row violates row-level security policy for table profiles").
--
-- The is_admin = false clause is redundant anyway: the SECURITY DEFINER trigger
-- unconditionally overwrites any client-supplied is_admin from the allowlist, so
-- a user cannot forge admin by sending is_admin = true.

drop policy own_profile_insert on public.profiles;
create policy own_profile_insert on public.profiles for insert to authenticated
  with check (user_id = auth.uid());
