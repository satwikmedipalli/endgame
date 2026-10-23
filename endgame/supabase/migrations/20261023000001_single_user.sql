-- Endgame has exactly one account. Turning off signups in Auth settings is the
-- first lock; this trigger is the second, enforced by the database itself, so a
-- settings change or a missed toggle can never let a second account in.
create or replace function public.endgame_single_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from auth.users) then
    raise exception 'Endgame is single-user; signups are closed.';
  end if;
  return new;
end;
$$;

create trigger endgame_single_user
  before insert on auth.users
  for each row execute function public.endgame_single_user();

revoke execute on function public.endgame_single_user() from public, anon, authenticated;
