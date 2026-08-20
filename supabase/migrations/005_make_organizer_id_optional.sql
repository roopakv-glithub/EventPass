-- Make organizer_id optional on public.events table so public/demo event creation works without requiring pre-existing profiles
alter table public.events alter column organizer_id drop not null;
