-- Daily puzzles (sudoku and mini crossword) are a new card kind.
alter table public.cards drop constraint if exists cards_kind_check;
alter table public.cards add constraint cards_kind_check
  check (kind in ('news', 'code', 'stocks', 'history', 'chess', 'italian', 'watch', 'puzzle'));
