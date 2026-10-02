alter table public.units
add column if not exists updated_at timestamptz;

-- Existing edit times are unknown; use the creation time as the initial value.
update public.units
set updated_at = created_at
where updated_at is null;

alter table public.units
alter column updated_at set default now();

create or replace function public.set_unit_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists units_set_updated_at on public.units;
create trigger units_set_updated_at
before update on public.units
for each row execute function public.set_unit_updated_at();
