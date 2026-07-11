create table public.dictionary_entries (
  id text primary key,
  hebrew text not null,
  hebrew_nikud text not null,
  part_of_speech text not null check (part_of_speech in ('noun','verb','adjective','phrase','abbreviation')),
  level int not null check (level between 1 and 3),
  gender text check (gender in ('ז','נ')),
  plural text,
  root text,
  everyday_synonym text,
  translations jsonb not null check (translations ? 'en'),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.units (
  slug text primary key,
  level int not null check (level between 1 and 3),
  display_order int not null,
  status text not null default 'draft' check (status in ('draft','published')),
  title jsonb not null check (title ? 'en'),
  dialogue jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.unit_items (
  unit_slug text not null references public.units(slug) on delete cascade,
  entry_id text not null references public.dictionary_entries(id),
  display_order int not null,
  context_sentences jsonb not null,
  primary key (unit_slug, entry_id)
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  ui_language text not null default 'en',
  is_admin boolean not null default false,
  streak_current int not null default 0,
  streak_longest int not null default 0,
  last_active_date date,
  created_at timestamptz not null default now()
);

create table public.user_card_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id text not null references public.dictionary_entries(id),
  due timestamptz not null,
  stability real not null,
  difficulty real not null,
  reps int not null default 0,
  lapses int not null default 0,
  learning_steps int not null default 0,
  state text not null check (state in ('new','learning','review','relearning')),
  last_review timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, entry_id)
);

create table public.review_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_id text not null references public.dictionary_entries(id),
  reviewed_at timestamptz not null default now(),
  practice_form text not null check (practice_form in ('flashcard_recognition','flashcard_recall','cloze','drill')),
  rating text not null check (rating in ('again','good','easy')),
  latency_ms int,
  counts_for_scheduling boolean not null default true
);
create index review_logs_user_time on public.review_logs (user_id, reviewed_at);

create table public.unit_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  unit_slug text not null references public.units(slug),
  status text not null default 'not_started' check (status in ('not_started','in_progress','completed')),
  completed_at timestamptz,
  primary key (user_id, unit_slug)
);

create table public.drill_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  sessions_started int not null default 0,
  primary key (user_id, usage_date)
);
