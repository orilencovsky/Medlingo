-- Anatomy tab: region/system tagging + dual-source (curated/ai) images for
-- dictionary_entries where topic='anatomy'. Reuses dictionary_entries as the
-- source of truth (spec: "reuse, don't fork") — these two tables hold only
-- anatomy-specific metadata, so region/system stay off the other ~1186 words.

create table public.anatomy_terms (
  entry_id      text primary key references public.dictionary_entries(id),
  region        text not null check (region in ('head_neck', 'chest', 'abdomen', 'limbs', 'skeleton')),
  system        text not null check (system in (
                  'cardiovascular', 'respiratory', 'gastrointestinal', 'musculoskeletal',
                  'nervous', 'genitourinary', 'endocrine', 'integumentary', 'lymphatic')),
  display_order int not null default 0
);

create table public.anatomy_images (
  id           uuid primary key default gen_random_uuid(),
  entry_id     text not null references public.dictionary_entries(id),
  storage_path text not null,
  source       text not null check (source in ('curated', 'ai')),
  is_primary   boolean not null default false,
  credit       text,
  created_at   timestamptz not null default now(),
  constraint anatomy_images_curated_has_credit check (source <> 'curated' or credit is not null)
);

-- At most one primary image per term.
create unique index anatomy_images_one_primary_per_entry
  on public.anatomy_images (entry_id) where is_primary;

alter table public.anatomy_terms enable row level security;
alter table public.anatomy_images enable row level security;

-- Learner read: any authenticated user (matches dictionary_entries' open read).
create policy anatomy_terms_read on public.anatomy_terms for select to authenticated using (true);
create policy anatomy_images_read on public.anatomy_images for select to authenticated using (true);

-- Admin write, mirroring admin_update_entries from 0010_reviewer_console.sql.
create policy anatomy_terms_admin_insert on public.anatomy_terms for insert to authenticated
  with check (public.is_admin());
create policy anatomy_terms_admin_update on public.anatomy_terms for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy anatomy_terms_admin_delete on public.anatomy_terms for delete to authenticated
  using (public.is_admin());

create policy anatomy_images_admin_insert on public.anatomy_images for insert to authenticated
  with check (public.is_admin());
create policy anatomy_images_admin_update on public.anatomy_images for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy anatomy_images_admin_delete on public.anatomy_images for delete to authenticated
  using (public.is_admin());

-- Primary-image selection is a single atomic RPC, not two client-side updates,
-- so the "exactly one primary per entry" invariant can't be violated by a race
-- between "unset old primary" and "set new primary" landing out of order.
create function public.set_primary_anatomy_image(image_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare target_entry text;
begin
  if not public.is_admin() then
    raise exception 'not authorized to set a primary anatomy image';
  end if;
  select entry_id into target_entry from public.anatomy_images where id = image_id;
  if target_entry is null then
    raise exception 'anatomy image % not found', image_id;
  end if;
  update public.anatomy_images set is_primary = false where entry_id = target_entry and is_primary;
  update public.anatomy_images set is_primary = true where id = image_id;
end $$;

-- Storage: public bucket for anatomy images, admin-only write.
insert into storage.buckets (id, name, public)
values ('anatomy', 'anatomy', true)
on conflict (id) do nothing;

create policy anatomy_bucket_public_read on storage.objects for select
  using (bucket_id = 'anatomy');
create policy anatomy_bucket_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'anatomy' and public.is_admin());
create policy anatomy_bucket_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'anatomy' and public.is_admin())
  with check (bucket_id = 'anatomy' and public.is_admin());
create policy anatomy_bucket_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'anatomy' and public.is_admin());
