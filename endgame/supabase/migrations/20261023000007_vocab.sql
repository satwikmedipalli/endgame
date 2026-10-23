-- Milestone 7: your Italian words with their spaced-repetition state (SM-2).
create table public.vocab (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  lang text not null default 'it',
  id text not null,
  it text not null,
  en text not null,
  note text,
  -- The lesson (topic id) that taught it.
  topic text,
  ease real not null default 2.5,
  interval int not null default 0,
  reps int not null default 0,
  lapses int not null default 0,
  due date not null,
  last_review timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, lang, id)
);
create index vocab_due on public.vocab (user_id, lang, due);

alter table public.vocab enable row level security;
create policy "owner only" on public.vocab
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
