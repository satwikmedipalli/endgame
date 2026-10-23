-- Milestone 5: watch ratings keep your one-line comment and the title's details (type, year, genres).
alter table public.ratings add column comment text;
alter table public.ratings add column meta jsonb;
