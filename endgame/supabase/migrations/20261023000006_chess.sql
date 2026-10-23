-- Milestone 6: your Chess.com games and the weekly Stockfish report.
create table public.chess_games (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  url text not null,
  end_time timestamptz not null,
  time_class text not null,
  color text not null check (color in ('w', 'b')),
  result text not null check (result in ('win', 'loss', 'draw')),
  my_rating int,
  opponent text,
  opp_rating int,
  eco text,
  opening text,
  pgn text not null,
  -- Stockfish findings per game, filled by the weekly analysis (null = not analysed yet).
  analysis jsonb,
  primary key (user_id, url)
);
create index chess_games_recent on public.chess_games (user_id, end_time desc);

alter table public.chess_games enable row level security;
create policy "owner only" on public.chess_games
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- The weekly report (openings by colour, results, typical mistakes) for the chess course.
alter table public.courses add column report jsonb;
