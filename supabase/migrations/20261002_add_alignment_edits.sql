-- Original MFA-derived alignment_data stays untouched.
alter table public.units
add column if not exists alignment_edits jsonb null;
