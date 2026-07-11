create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select is_admin from public.profiles where user_id = auth.uid()), false) $$;

alter table public.dictionary_entries enable row level security;
alter table public.units enable row level security;
alter table public.unit_items enable row level security;
alter table public.profiles enable row level security;
alter table public.user_card_state enable row level security;
alter table public.review_logs enable row level security;
alter table public.unit_progress enable row level security;
alter table public.drill_usage enable row level security;

create policy read_dictionary on public.dictionary_entries for select to authenticated using (true);

create policy read_units on public.units for select to authenticated
  using (status = 'published' or public.is_admin());

create policy read_unit_items on public.unit_items for select to authenticated
  using (exists (select 1 from public.units u where u.slug = unit_items.unit_slug
                 and (u.status = 'published' or public.is_admin())));

create policy own_profile_select on public.profiles for select to authenticated using (user_id = auth.uid());
create policy own_profile_insert on public.profiles for insert to authenticated
  with check (user_id = auth.uid() and is_admin = false);
create policy own_profile_update on public.profiles for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
              and is_admin = (select p.is_admin from public.profiles p where p.user_id = auth.uid()));

create policy own_cards on public.user_card_state for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy own_logs_insert on public.review_logs for insert to authenticated with check (user_id = auth.uid());
create policy own_logs_select on public.review_logs for select to authenticated using (user_id = auth.uid());

create policy own_unit_progress on public.unit_progress for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
