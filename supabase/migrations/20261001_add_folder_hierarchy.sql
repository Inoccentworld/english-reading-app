alter table public.folders
add column if not exists parent_id text null;

alter table public.folders
drop constraint if exists folders_parent_id_fkey;

alter table public.folders
alter column parent_id type text
using parent_id::text;

alter table public.folders
add constraint folders_parent_id_fkey
foreign key (parent_id)
references public.folders(id)
on delete cascade;

create index if not exists folders_parent_id_idx
on public.folders(parent_id);

alter table public.folders
drop constraint if exists folders_parent_not_self;

alter table public.folders
add constraint folders_parent_not_self
check (parent_id is null or parent_id <> id);

alter table public.units
drop constraint if exists units_folder_id_fkey;

alter table public.units
add constraint units_folder_id_fkey
foreign key (folder_id)
references public.folders(id)
on delete cascade;
