-- Milestone 4: "lesson" jobs write a lesson when you tap Explain.
alter table public.jobs drop constraint jobs_type_check;
alter table public.jobs add constraint jobs_type_check check (type in ('sync', 'chat', 'condense', 'lesson'));
