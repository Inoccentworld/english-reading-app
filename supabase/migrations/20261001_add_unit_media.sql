alter table public.units
add column if not exists audio_path text null,
add column if not exists audio_name text null,
add column if not exists alignment_path text null,
add column if not exists alignment_name text null,
add column if not exists alignment_data jsonb null;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'unit-media',
  'unit-media',
  true,
  104857600,
  array[
    'application/json',
    'text/plain',
    'audio/mpeg',
    'audio/wav',
    'audio/x-wav',
    'audio/mp4',
    'audio/x-m4a',
    'audio/flac',
    'audio/x-flac',
    'audio/ogg'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public unit media insert" on storage.objects;
create policy "Public unit media insert"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'unit-media');

drop policy if exists "Public unit media update" on storage.objects;
create policy "Public unit media update"
on storage.objects for update
to anon, authenticated
using (bucket_id = 'unit-media')
with check (bucket_id = 'unit-media');

drop policy if exists "Public unit media delete" on storage.objects;
create policy "Public unit media delete"
on storage.objects for delete
to anon, authenticated
using (bucket_id = 'unit-media');

drop policy if exists "Public unit media select" on storage.objects;
create policy "Public unit media select"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'unit-media');
