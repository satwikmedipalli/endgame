-- "Newer wins" enforced by the database: an upsert carrying an older updated_at
-- than the stored card (a phone pushing a stale copy over a lesson the Mac just
-- wrote) is skipped instead of overwriting it.
create function public.keep_newer_card() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.updated_at < old.updated_at then
    return null;
  end if;
  return new;
end;
$$;

create trigger cards_keep_newer
  before update on public.cards
  for each row execute function public.keep_newer_card();
