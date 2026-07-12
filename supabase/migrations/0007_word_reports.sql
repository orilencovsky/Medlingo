create table public.word_reports (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id text not null references public.dictionary_entries(id),
  message text not null,
  created_at timestamptz not null default now()
);
create index word_reports_entry on public.word_reports (entry_id);

alter table public.word_reports enable row level security;

create policy own_reports_insert on public.word_reports for insert to authenticated
  with check (user_id = auth.uid());
create policy admin_reports_select on public.word_reports for select to authenticated
  using (public.is_admin());
