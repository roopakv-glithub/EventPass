-- Add optional regno (registration number) column to profiles table
alter table public.profiles add column if not exists regno text;
