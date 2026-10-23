-- Milestone 3: the Mac helper.

-- Who built a day: the phone's fallback ('app') or the Mac's Sync ('sync').
-- A Sync-built day replaces the phone's fallback copy when they merge.
alter table public.days
  add column source text not null default 'app' check (source in ('app', 'sync'));

-- Heartbeat so the phone can show "Mac connected".
create table public.helper_status (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  last_seen timestamptz not null default now(),
  version text,
  busy text
);
alter table public.helper_status enable row level security;
create policy "owner only" on public.helper_status for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- The phone hears new days (after Sync) and heartbeats live.
alter publication supabase_realtime add table public.days, public.helper_status;
