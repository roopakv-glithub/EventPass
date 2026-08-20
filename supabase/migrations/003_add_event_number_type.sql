-- Add optional event_number and event_type columns to events table if they don't exist
alter table public.events add column if not exists event_number text;
alter table public.events add column if not exists event_type text default 'General';
