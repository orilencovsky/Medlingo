-- Reviewer console: moderated in-app editing of dictionary_entries.
-- Live table stays the source of truth; edits are staged in entry_edits and
-- applied only when an approver (can_approve) accepts them via apply_entry_edit.

-- 1. Ops-only columns on the live table (NOT part of the content TSV).
alter table public.dictionary_entries
  add column review_state text not null default 'unreviewed'
    check (review_state in ('unreviewed', 'reviewed', 'edit_pending')),
  add column review_priority int not null default 0,
  add column is_deprecated boolean not null default false;

-- 2. Approver flag. Reviewer access reuses profiles.is_admin.
alter table public.profiles
  add column can_approve boolean not null default false;

-- 3. Staging table for proposed changes.
create table public.entry_edits (
  id           uuid primary key default gen_random_uuid(),
  entry_id     text references public.dictionary_entries(id),
  change_type  text not null check (change_type in ('create', 'update', 'delete')),
  payload      jsonb not null,
  editor_id    uuid not null references auth.users(id),
  editor_note  text,
  status       text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected')),
  decided_by   uuid references auth.users(id),
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);

-- At most one open pending edit per existing entry (creates are exempt: entry_id is null).
create unique index entry_edits_one_open_per_entry
  on public.entry_edits (entry_id)
  where status = 'pending' and change_type <> 'create';

alter table public.entry_edits enable row level security;

-- 4. Approver helper, mirroring is_admin() from 0002_rls.sql.
create function public.can_approve() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select can_approve from public.profiles where user_id = auth.uid()), false) $$;

-- 5. Learner read path hides deprecated rows; admins still see everything.
drop policy read_dictionary on public.dictionary_entries;
create policy read_dictionary on public.dictionary_entries for select to authenticated
  using (is_deprecated = false or public.is_admin());

-- 6. entry_edits RLS: reviewers insert/read; only approvers decide.
create policy edits_admin_select on public.entry_edits for select to authenticated
  using (public.is_admin());
create policy edits_admin_insert on public.entry_edits for insert to authenticated
  with check (public.is_admin() and editor_id = auth.uid());
-- Reviewer may withdraw their own still-pending edit.
create policy edits_owner_withdraw on public.entry_edits for update to authenticated
  using (editor_id = auth.uid() and status = 'pending')
  with check (status = 'rejected');
-- Approver decisions flow only through apply_entry_edit (SECURITY DEFINER); no broad update policy.

-- 7. Reviewer may update dictionary_entries (needed for "mark reviewed" and the
--    review_state=edit_pending flag), but a trigger keeps content columns locked
--    to approvers only — reviewers can change ONLY the ops columns. RLS cannot
--    restrict columns, so the guard is a trigger.
create policy admin_update_entries on public.dictionary_entries for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create function public.guard_entry_content_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- SECURITY DEFINER callers (apply_entry_edit) and approvers may change content.
  if public.can_approve() then return new; end if;
  if new.hebrew is distinct from old.hebrew
     or new.hebrew_nikud is distinct from old.hebrew_nikud
     or new.part_of_speech is distinct from old.part_of_speech
     or new.level is distinct from old.level
     or new.gender is distinct from old.gender
     or new.plural is distinct from old.plural
     or new.root is distinct from old.root
     or new.everyday_synonym is distinct from old.everyday_synonym
     or new.translations is distinct from old.translations
     or new.notes is distinct from old.notes
     or new.category is distinct from old.category
     or new.is_deprecated is distinct from old.is_deprecated then
    raise exception 'content changes must go through apply_entry_edit';
  end if;
  return new;
end $$;

create trigger guard_entry_content
  before update on public.dictionary_entries
  for each row execute function public.guard_entry_content_update();

-- 8. Apply-or-reject RPC. All content mutation is server-side and atomic.
create function public.apply_entry_edit(edit_id uuid, decision text)
returns void language plpgsql security definer set search_path = public as $$
declare e public.entry_edits;
begin
  if not public.can_approve() then
    raise exception 'not authorized to decide edits';
  end if;
  if decision not in ('approved', 'rejected') then
    raise exception 'decision must be approved or rejected';
  end if;

  select * into e from public.entry_edits where id = edit_id and status = 'pending';
  if not found then
    raise exception 'edit % not found or already decided', edit_id;
  end if;

  if decision = 'approved' then
    if e.change_type = 'update' then
      update public.dictionary_entries set
        hebrew           = coalesce(e.payload->>'hebrew', hebrew),
        hebrew_nikud     = coalesce(e.payload->>'hebrew_nikud', hebrew_nikud),
        part_of_speech   = coalesce(e.payload->>'part_of_speech', part_of_speech),
        level            = coalesce((e.payload->>'level')::int, level),
        gender           = nullif(e.payload->>'gender', ''),
        plural           = nullif(e.payload->>'plural', ''),
        root             = nullif(e.payload->>'root', ''),
        everyday_synonym = nullif(e.payload->>'everyday_synonym', ''),
        translations     = coalesce(e.payload->'translations', translations),
        notes            = nullif(e.payload->>'notes', ''),
        category         = nullif(e.payload->>'category', ''),
        review_state     = 'reviewed',
        updated_at       = now()
      where id = e.entry_id;
    elsif e.change_type = 'delete' then
      update public.dictionary_entries
        set is_deprecated = true, review_state = 'reviewed', updated_at = now()
      where id = e.entry_id;
    elsif e.change_type = 'create' then
      insert into public.dictionary_entries
        (id, hebrew, hebrew_nikud, part_of_speech, level, gender, plural, root,
         everyday_synonym, translations, notes, category, review_state)
      values (
        e.payload->>'id', e.payload->>'hebrew', e.payload->>'hebrew_nikud',
        e.payload->>'part_of_speech', (e.payload->>'level')::int,
        nullif(e.payload->>'gender', ''), nullif(e.payload->>'plural', ''),
        nullif(e.payload->>'root', ''), nullif(e.payload->>'everyday_synonym', ''),
        e.payload->'translations', nullif(e.payload->>'notes', ''),
        nullif(e.payload->>'category', ''), 'reviewed');
    end if;
  else
    -- rejected: revert the entry's pending flag if this was the reason it was set.
    if e.entry_id is not null then
      update public.dictionary_entries
        set review_state = 'unreviewed', updated_at = now()
      where id = e.entry_id and review_state = 'edit_pending';
    end if;
  end if;

  update public.entry_edits
    set status = decision, decided_by = auth.uid(), decided_at = now()
  where id = edit_id;
end $$;

-- 9. Seed the owner as approver (idempotent; no-op until that profile exists).
update public.profiles p set can_approve = true
from auth.users u where u.id = p.user_id and u.email = 'ori.lencovsky@gmail.com';
