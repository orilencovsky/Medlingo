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
