-- Endgame schema. Single user, but every row is owned by auth.uid() and
-- row-level security means only that login can read or write it.

-- A day's feed. Building a day is idempotent: one row per (user, day).
create table public.days (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  built_at timestamptz not null default now(),
  primary key (user_id, day)
);

-- Cards in a day. Card ids are stable content identities: the same id on two
-- days means the same lesson carried over, so chat is keyed by card id alone.
create table public.cards (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  day date not null,
  id text not null,
  position int not null,
  kind text not null check (kind in ('news', 'code', 'stocks', 'history', 'chess', 'italian', 'watch')),
  course text,
  status text not null default 'open' check (status in ('open', 'done', 'skip')),
  opened_at timestamptz,
  continued boolean not null default false,
  -- title, hook, tag, cta, sources, blocks, preview
  content jsonb not null,
  watch jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, day, id),
  foreign key (user_id, day) references public.days (user_id, day) on delete cascade
);
create index cards_user_id_id on public.cards (user_id, id);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  card_id text not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  text text not null,
  created_at timestamptz not null default now()
);
create index chat_messages_card on public.chat_messages (user_id, card_id, created_at);

-- One row per course: the stored syllabus, where you are in it, and a rolling
-- summary that DONE condenses each lesson's chat into. Filled from milestone 4.
create table public.courses (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  course text not null,
  syllabus jsonb not null default '[]'::jsonb,
  pointer int not null default 0,
  level text,
  summary text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, course)
);

-- No-repeat memory: history topics, watch titles, news stories already shown.
create table public.seen (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null,
  key text not null,
  meta jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, key)
);

-- Watch/read taste profile.
create table public.ratings (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title_key text not null,
  title text not null,
  interested boolean,
  will_watch boolean,
  rating int check (rating between 1 and 10),
  updated_at timestamptz not null default now(),
  primary key (user_id, title_key)
);

-- Work for the Mac helper (Sync, chat replies). The phone inserts, the Mac
-- claims and completes. Realtime lets the Mac hear new jobs instantly.
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  type text not null check (type in ('sync', 'chat', 'condense')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index jobs_queue on public.jobs (user_id, status, created_at);

-- Row-level security: owner only, on every table.
do $$
declare t text;
begin
  foreach t in array array['days', 'cards', 'chat_messages', 'courses', 'seen', 'ratings', 'jobs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "owner only" on public.%I for all to authenticated
         using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t
    );
  end loop;
end $$;

alter publication supabase_realtime add table public.jobs, public.chat_messages;
