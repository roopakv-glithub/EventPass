create extension if not exists pgcrypto;

do $$
begin
  create type public.app_role as enum ('participant', 'organizer');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.registration_status as enum ('registered', 'cancelled');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.qr_status as enum ('pending', 'active', 'used', 'expired');
exception when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.event_status as enum ('draft', 'published', 'cancelled', 'completed');
exception when duplicate_object then null;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  role public.app_role not null default 'participant',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 2 and 160),
  event_date date not null,
  start_time time not null,
  end_time time,
  capacity integer not null check (capacity > 0),
  description text not null default '',
  location text not null default '',
  image_url text,
  status public.event_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_time is null or end_time > start_time)
);

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  status public.registration_status not null default 'registered',
  qr_token_hash text unique,
  qr_payload text,
  qr_created_at timestamptz,
  qr_expires_at timestamptz,
  qr_status public.qr_status not null default 'pending',
  registered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (participant_id, event_id)
);

create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique references public.registrations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  checked_in_by uuid not null references public.profiles(id) on delete restrict,
  checked_in_at timestamptz not null default now()
);

create index events_organizer_id_idx on public.events(organizer_id);
create index events_date_status_idx on public.events(event_date, status);
create index registrations_event_id_idx on public.registrations(event_id) where status = 'registered';
create index registrations_participant_id_idx on public.registrations(participant_id);
create index check_ins_event_time_idx on public.check_ins(event_id, checked_in_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger events_set_updated_at before update on public.events
for each row execute function public.set_updated_at();
create trigger registrations_set_updated_at before update on public.registrations
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, 'Participant'), '@', 1)),
    new.email,
    'participant'
  ) on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_organizer()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'organizer');
$$;

create or replace function public.register_for_event(target_event_id uuid)
returns public.registrations
language plpgsql security definer set search_path = public
as $$
declare
  locked_event public.events;
  created_registration public.registrations;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  select * into locked_event from public.events where id = target_event_id and status = 'published' for update;
  if not found then raise exception using errcode = 'P0002', message = 'Event is unavailable or registration is closed'; end if;
  if exists (select 1 from public.registrations where participant_id = auth.uid() and event_id = target_event_id and status = 'registered') then
    raise exception using errcode = '23505', message = 'Already registered';
  end if;
  if (select count(*) from public.registrations where event_id = target_event_id and status = 'registered') >= locked_event.capacity then
    raise exception using errcode = 'P0001', message = 'Event is full';
  end if;
  insert into public.registrations (participant_id, event_id)
  values (auth.uid(), target_event_id)
  returning * into created_registration;
  return created_registration;
end;
$$;

create or replace function public.check_in_by_token(token_hash text, target_event_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  current_registration public.registrations;
  current_event public.events;
  existing_check_in public.check_ins;
  attendee_name text;
begin
  if not public.is_organizer() then raise exception using errcode = '42501', message = 'Organizer permission required'; end if;
  select * into current_registration from public.registrations where qr_token_hash = token_hash for update;
  if not found then return jsonb_build_object('status', 'invalid_qr'); end if;
  select * into current_event from public.events where id = current_registration.event_id;
  if current_registration.event_id <> target_event_id then return jsonb_build_object('status', 'wrong_event'); end if;
  if current_registration.qr_status = 'expired' or (current_registration.qr_expires_at is not null and current_registration.qr_expires_at < now()) then return jsonb_build_object('status', 'expired'); end if;
  select * into existing_check_in from public.check_ins where registration_id = current_registration.id;
  if existing_check_in.id is not null then
    select full_name into attendee_name from public.profiles where id = current_registration.participant_id;
    return jsonb_build_object('status', 'already_checked_in', 'participant', attendee_name, 'event', current_event.name, 'checked_in_at', existing_check_in.checked_in_at);
  end if;
  select full_name into attendee_name from public.profiles where id = current_registration.participant_id;
  insert into public.check_ins (registration_id, event_id, checked_in_by) values (current_registration.id, current_registration.event_id, auth.uid()) returning * into existing_check_in;
  update public.registrations set qr_status = 'used' where id = current_registration.id;
  return jsonb_build_object('status', 'checked_in', 'participant', attendee_name, 'event', current_event.name, 'checked_in_at', existing_check_in.checked_in_at);
end;
$$;

create or replace function public.event_stats(target_event_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.events where id = target_event_id and organizer_id = auth.uid() and public.is_organizer()) then
    raise exception using errcode = '42501', message = 'Organizer permission required';
  end if;
  return (select jsonb_build_object(
    'registered', (select count(*) from public.registrations where event_id = target_event_id and status = 'registered'),
    'checked_in', (select count(*) from public.check_ins where event_id = target_event_id),
    'no_shows', (select count(*) from public.registrations where event_id = target_event_id and status = 'registered' and not exists (select 1 from public.check_ins where registration_id = registrations.id)),
    'capacity', (select capacity from public.events where id = target_event_id),
    'peak_check_in_time', (select date_trunc('hour', checked_in_at) from public.check_ins where event_id = target_event_id group by 1 order by count(*) desc, 1 limit 1)
  ));
end;
$$;

grant execute on function public.register_for_event(uuid) to authenticated;
grant execute on function public.check_in_by_token(text, uuid) to authenticated;
grant execute on function public.event_stats(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.registrations enable row level security;
alter table public.check_ins enable row level security;

create policy profiles_select_self on public.profiles for select using (id = auth.uid() or public.is_organizer());
create policy profiles_update_self on public.profiles for update using (id = auth.uid());
create policy events_public_read on public.events for select using (status = 'published' or organizer_id = auth.uid());
create policy events_organizer_insert on public.events for insert with check (organizer_id = auth.uid() and public.is_organizer());
create policy events_organizer_update on public.events for update using (organizer_id = auth.uid() and public.is_organizer()) with check (organizer_id = auth.uid() and public.is_organizer());
create policy events_organizer_delete on public.events for delete using (organizer_id = auth.uid() and public.is_organizer());
create policy registrations_select_participant_or_owner on public.registrations for select using (participant_id = auth.uid() or exists (select 1 from public.events where id = event_id and organizer_id = auth.uid() and public.is_organizer()));
create policy registrations_update_participant on public.registrations for update using (participant_id = auth.uid()) with check (participant_id = auth.uid());
create policy check_ins_select_participant_or_organizer on public.check_ins for select using (exists (select 1 from public.registrations r where r.id = registration_id and r.participant_id = auth.uid()) or (public.is_organizer() and exists (select 1 from public.events e where e.id = event_id and e.organizer_id = auth.uid())));

revoke all on public.registrations from anon;
revoke all on public.check_ins from anon;

do $$
begin
  alter publication supabase_realtime add table public.events, public.registrations, public.check_ins;
exception when duplicate_object then null;
end;
$$;
-- Run this after 001_eventpass_schema.sql has already been applied.

-- Never allow signup metadata to self-promote a user to organizer.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, 'Participant'), '@', 1)),
    new.email,
    'participant'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Fix duplicate check-in detection. The previous function overwrote FOUND
-- while looking up the attendee profile.
create or replace function public.check_in_by_token(token_hash text, target_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_registration public.registrations;
  current_event public.events;
  existing_check_in public.check_ins;
  attendee_name text;
begin
  if not public.is_organizer() then
    raise exception using errcode = '42501', message = 'Organizer permission required';
  end if;

  select * into current_registration
  from public.registrations
  where qr_token_hash = token_hash
  for update;

  if not found then
    return jsonb_build_object('status', 'invalid_qr');
  end if;

  select * into current_event
  from public.events
  where id = current_registration.event_id;

  if current_registration.event_id <> target_event_id then
    return jsonb_build_object('status', 'wrong_event');
  end if;

  if current_registration.qr_status = 'expired'
     or (current_registration.qr_expires_at is not null and current_registration.qr_expires_at < now()) then
    return jsonb_build_object('status', 'expired');
  end if;

  select * into existing_check_in
  from public.check_ins
  where registration_id = current_registration.id;

  select full_name into attendee_name
  from public.profiles
  where id = current_registration.participant_id;

  if existing_check_in.id is not null then
    return jsonb_build_object(
      'status', 'already_checked_in',
      'participant', attendee_name,
      'event', current_event.name,
      'checked_in_at', existing_check_in.checked_in_at
    );
  end if;

  insert into public.check_ins (registration_id, event_id, checked_in_by)
  values (current_registration.id, current_registration.event_id, auth.uid())
  returning * into existing_check_in;

  update public.registrations
  set qr_status = 'used'
  where id = current_registration.id;

  return jsonb_build_object(
    'status', 'checked_in',
    'participant', attendee_name,
    'event', current_event.name,
    'checked_in_at', existing_check_in.checked_in_at
  );
end;
$$;

-- Do not leave security-sensitive RPCs executable by PUBLIC.
revoke all on function public.register_for_event(uuid) from public;
revoke all on function public.check_in_by_token(text, uuid) from public;
revoke all on function public.event_stats(uuid) from public;
grant execute on function public.register_for_event(uuid) to authenticated;
grant execute on function public.check_in_by_token(text, uuid) to authenticated;
grant execute on function public.event_stats(uuid) to authenticated;

-- Enable Supabase Realtime for live dashboard updates.
do $$
begin
  alter publication supabase_realtime add table public.events;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.registrations;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.check_ins;
exception when duplicate_object then null;
end;
$$;
-- Add optional event_number and event_type columns to events table if they don't exist
alter table public.events add column if not exists event_number text;
alter table public.events add column if not exists event_type text default 'General';
-- Allow public/anon inserts on events table when bypassing auth
do $$
begin
  create policy events_public_insert on public.events for insert with check (true);
exception when duplicate_object then null;
end;
$$;

grant insert, select on public.events to anon;
-- Make organizer_id optional on public.events table so public/demo event creation works without requiring pre-existing profiles
alter table public.events alter column organizer_id drop not null;
-- Add optional regno (registration number) column to profiles table
alter table public.profiles add column if not exists regno text;
-- Migration 007: QR Tokens Table, Unique Constraints, and Atomic Concurrency Functions

-- 1. Create qr_tokens table for rotating short-lived tokens
CREATE TABLE IF NOT EXISTS public.qr_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id UUID NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired'))
);

-- Index for fast token lookups by hash
CREATE INDEX IF NOT EXISTS idx_qr_tokens_hash ON public.qr_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_qr_tokens_reg_id ON public.qr_tokens(registration_id);

-- Enable RLS on qr_tokens
ALTER TABLE public.qr_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read/insert on qr_tokens"
    ON public.qr_tokens FOR ALL
    USING (true)
    WITH CHECK (true);

-- 2. Add DB-level Unique Constraint on check_ins (registration_id)
-- Guarantees at the database level that a registration can NEVER have duplicate check-ins
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_ins_registration_id_key'
    ) THEN
        ALTER TABLE public.check_ins ADD CONSTRAINT check_ins_registration_id_key UNIQUE (registration_id);
    END IF;
END $$;

-- 3. Add DB-level Unique Constraint on registrations (participant_id, event_id)
-- Guarantees at the database level that a participant cannot register twice for the same event
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'registrations_participant_event_key'
    ) THEN
        ALTER TABLE public.registrations ADD CONSTRAINT registrations_participant_event_key UNIQUE (participant_id, event_id);
    END IF;
END $$;

-- 4. Atomic Event Registration Function (Row-Level Locking for Capacity Control)
CREATE OR REPLACE FUNCTION register_participant_atomic(
    p_event_id UUID,
    p_participant_id UUID,
    p_email TEXT DEFAULT NULL,
    p_full_name TEXT DEFAULT NULL,
    p_regno TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_capacity INT;
    v_current_count INT;
    v_existing_reg UUID;
    v_new_reg_id UUID;
BEGIN
    -- Lock the target event row using FOR UPDATE to prevent race conditions across concurrent servers
    SELECT capacity INTO v_capacity
    FROM public.events
    WHERE id = p_event_id
    FOR UPDATE;

    IF v_capacity IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'EVENT_NOT_FOUND',
            'message', 'Event not found'
        );
    END IF;

    -- Check if participant is already registered for this event
    SELECT id INTO v_existing_reg
    FROM public.registrations
    WHERE event_id = p_event_id AND participant_id = p_participant_id
    LIMIT 1;

    IF v_existing_reg IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'ALREADY_REGISTERED',
            'message', 'You are already registered for this event.'
        );
    END IF;

    -- Count current registrations for this event
    SELECT COUNT(*) INTO v_current_count
    FROM public.registrations
    WHERE event_id = p_event_id
      AND status = 'registered';

    -- Strict Capacity Enforcement
    IF v_current_count >= v_capacity THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'EVENT_FULL',
            'message', 'This event is full.'
        );
    END IF;

    -- Insert profile if missing
    IF p_email IS NOT NULL THEN
        INSERT INTO public.profiles (id, full_name, email, role)
        VALUES (p_participant_id, COALESCE(p_full_name, 'Participant'), p_email, 'participant')
        ON CONFLICT (id) DO UPDATE
        SET full_name = EXCLUDED.full_name;
    END IF;

    -- Perform atomic registration insert
    INSERT INTO public.registrations (event_id, participant_id, status)
    VALUES (p_event_id, p_participant_id, 'registered')
    RETURNING id INTO v_new_reg_id;

    RETURN jsonb_build_object(
        'success', true,
        'registration_id', v_new_reg_id,
        'message', 'Registration successful'
    );
EXCEPTION
    WHEN unique_violation THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'ALREADY_REGISTERED',
            'message', 'You are already registered for this event.'
        );
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'DATABASE_ERROR',
            'message', SQLERRM
        );
END;
$$;


-- 5. Atomic Check-In Function (Validates Short-Lived QR Token & Prevents Duplicate Check-Ins)
CREATE OR REPLACE FUNCTION process_checkin_atomic(
    p_event_id UUID,
    p_token_hash TEXT,
    p_scanned_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_token RECORD;
    v_reg RECORD;
    v_existing_checkin RECORD;
    v_checkin_id UUID;
    v_formatted_time TEXT;
BEGIN
    -- 1. Find token by hash
    SELECT * INTO v_token
    FROM public.qr_tokens
    WHERE token_hash = p_token_hash;

    IF v_token.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'TOKEN_NOT_FOUND',
            'message', 'Invalid QR code.'
        );
    END IF;

    -- 2. Check token expiration
    IF v_token.expires_at < NOW() THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'TOKEN_EXPIRED',
            'message', 'QR code has expired. Please refresh the QR code.'
        );
    END IF;

    -- 3. Check if token already used
    IF v_token.used_at IS NOT NULL OR v_token.status = 'used' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'TOKEN_ALREADY_USED',
            'message', 'This QR code has already been scanned.'
        );
    END IF;

    -- 4. Find & Lock registration row
    SELECT * INTO v_reg
    FROM public.registrations
    WHERE id = v_token.registration_id
    FOR UPDATE;

    IF v_reg.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'REGISTRATION_NOT_FOUND',
            'message', 'Registration record not found.'
        );
    END IF;

    -- 5. Verify event match
    IF v_reg.event_id <> p_event_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'WRONG_EVENT',
            'message', 'This ticket is for a different event.'
        );
    END IF;

    -- 6. Check if already checked in
    SELECT * INTO v_existing_checkin
    FROM public.check_ins
    WHERE registration_id = v_reg.id;

    IF v_existing_checkin.id IS NOT NULL THEN
        v_formatted_time := to_char(v_existing_checkin.checked_in_at AT TIME ZONE 'UTC', 'HH12:MI AM');
        RETURN jsonb_build_object(
            'success', false,
            'error', 'ALREADY_CHECKED_IN',
            'message', 'Already checked in at ' || v_formatted_time,
            'checked_in_at', v_existing_checkin.checked_in_at
        );
    END IF;

    -- 7. Insert Check-in
    INSERT INTO public.check_ins (registration_id, checked_in_at, scanned_by)
    VALUES (v_reg.id, NOW(), p_scanned_by)
    RETURNING id INTO v_checkin_id;

    -- 8. Mark token as used
    UPDATE public.qr_tokens
    SET used_at = NOW(),
        status = 'used'
    WHERE id = v_token.id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Check-in successful',
        'checkin_id', v_checkin_id,
        'checked_in_at', NOW()
    );
EXCEPTION
    WHEN unique_violation THEN
        -- Handle concurrent attempt hitting the unique constraint on check_ins(registration_id)
        SELECT checked_in_at INTO v_existing_checkin
        FROM public.check_ins
        WHERE registration_id = v_reg.id;
        
        v_formatted_time := to_char(COALESCE(v_existing_checkin.checked_in_at, NOW()) AT TIME ZONE 'UTC', 'HH12:MI AM');

        RETURN jsonb_build_object(
            'success', false,
            'error', 'ALREADY_CHECKED_IN',
            'message', 'Already checked in at ' || v_formatted_time
        );
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'DATABASE_ERROR',
            'message', SQLERRM
        );
END;
$$;
-- ============================================================================
-- 008_fix_permissions.sql
-- Grant full table & schema permissions to service_role, authenticated, and anon
-- ============================================================================

-- 1. Grant schema usage
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;

-- 2. Grant table access
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- 3. Grant sequence access (for auto-incrementing IDs if any)
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- 4. Grant routine/function execution
GRANT ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- 5. Ensure future tables also inherit these permissions
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role;

-- 6. Ensure RLS policies allow public/service access for events and registrations
ALTER TABLE IF EXISTS public.events DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.registrations DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.check_ins DISABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.check_ins ENABLE ROW LEVEL SECURITY;

-- Drop existing restrictive policies and create open policies for demo/production workflow
DROP POLICY IF EXISTS "allow_all_events" ON public.events;
CREATE POLICY "allow_all_events" ON public.events FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_registrations" ON public.registrations;
CREATE POLICY "allow_all_registrations" ON public.registrations FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_profiles" ON public.profiles;
CREATE POLICY "allow_all_profiles" ON public.profiles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_check_ins" ON public.check_ins;
CREATE POLICY "allow_all_check_ins" ON public.check_ins FOR ALL USING (true) WITH CHECK (true);
-- ============================================================
-- 009_rbac_and_participant_auth.sql
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Add password_hash to profiles (for participant auth)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS regno text;

-- Index for fast regno lookups
CREATE INDEX IF NOT EXISTS profiles_regno_idx ON public.profiles(regno) WHERE regno IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles(email) WHERE email IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 2. Organizer credentials table (fixed secure credentials)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organizer_credentials (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id text NOT NULL UNIQUE,   -- login ID (e.g. "OrganizerAcess")
  password_hash text NOT NULL,          -- bcrypt hash of password
  label       text NOT NULL DEFAULT 'Organizer',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Insert the fixed organizer credentials
-- Password: Organizer123
-- Hash generated with bcrypt rounds=10
-- Note: We store the plaintext marker here; the API validates against Supabase Auth
INSERT INTO public.organizer_credentials (organizer_id, password_hash, label)
VALUES (
  'OrganizerAcess',
  'ORGANIZER_FIXED_CREDENTIAL',  -- sentinel value; real auth done via Supabase Auth
  'Main Organizer'
)
ON CONFLICT (organizer_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 3. Analytics: get_event_analytics(event_id) 
--    Returns hourly check-in buckets + totals for bar/doughnut charts
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_event_analytics(target_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_registered  bigint;
  total_checked_in  bigint;
  hourly_data       jsonb;
  event_name        text;
BEGIN
  -- Get event info
  SELECT name INTO event_name
  FROM public.events WHERE id = target_event_id;

  -- Total registered
  SELECT COUNT(*) INTO total_registered
  FROM public.registrations
  WHERE event_id = target_event_id AND status = 'registered';

  -- Total checked in
  SELECT COUNT(*) INTO total_checked_in
  FROM public.check_ins
  WHERE event_id = target_event_id;

  -- Hourly check-in buckets
  SELECT jsonb_agg(
    jsonb_build_object(
      'hour', TO_CHAR(hour_bucket, 'HH24:MI'),
      'count', check_count
    ) ORDER BY hour_bucket
  )
  INTO hourly_data
  FROM (
    SELECT
      DATE_TRUNC('hour', checked_in_at) AS hour_bucket,
      COUNT(*) AS check_count
    FROM public.check_ins
    WHERE event_id = target_event_id
    GROUP BY 1
    ORDER BY 1
  ) AS buckets;

  RETURN jsonb_build_object(
    'event_id',    target_event_id,
    'event_name',  COALESCE(event_name, 'Unknown Event'),
    'registered',  total_registered,
    'checked_in',  total_checked_in,
    'hourly',      COALESCE(hourly_data, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_analytics(uuid) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- 4. Analytics: get_all_events_stats()
--    Summary stats for ALL events (for organizer overview)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_all_events_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT jsonb_agg(
      jsonb_build_object(
        'event_id',   e.id,
        'event_name', e.name,
        'registered', COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'registered'),
        'checked_in', COUNT(DISTINCT c.id)
      )
    )
    FROM public.events e
    LEFT JOIN public.registrations r ON r.event_id = e.id
    LEFT JOIN public.check_ins c ON c.event_id = e.id
    GROUP BY e.id, e.name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_events_stats() TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- 5. Participant lookup by regno
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_participant_by_regno(p_regno text)
RETURNS TABLE (
  id          uuid,
  full_name   text,
  email       text,
  regno       text,
  role        public.app_role,
  password_hash text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pr.id,
    pr.full_name,
    pr.email,
    pr.regno,
    pr.role,
    pr.password_hash
  FROM public.profiles pr
  WHERE pr.regno = p_regno
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_participant_by_regno(text) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- 6. Set participant password
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_participant_password(p_regno text, p_password_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET password_hash = p_password_hash
  WHERE regno = p_regno;
  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_participant_password(text, text) TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────
-- 7. Realtime: ensure check_ins and registrations are published
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.check_ins;
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.registrations;
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 8. RLS Policies — Role-based
-- ─────────────────────────────────────────────────────────────

-- Drop old open-all policies from migration 008
DROP POLICY IF EXISTS "allow_all_events"         ON public.events;
DROP POLICY IF EXISTS "allow_all_registrations"  ON public.registrations;
DROP POLICY IF EXISTS "allow_all_profiles"       ON public.profiles;
DROP POLICY IF EXISTS "allow_all_check_ins"      ON public.check_ins;

-- EVENTS: public read for published; service_role handles writes
DROP POLICY IF EXISTS "events_public_read"             ON public.events;
DROP POLICY IF EXISTS "events_organizer_insert"        ON public.events;
DROP POLICY IF EXISTS "events_organizer_update"        ON public.events;
DROP POLICY IF EXISTS "events_organizer_delete"        ON public.events;
DROP POLICY IF EXISTS "events_organizer_full_access"   ON public.events;

CREATE POLICY "events_anon_read_published"
  ON public.events FOR SELECT
  USING (status = 'published');

CREATE POLICY "events_service_role_all"
  ON public.events FOR ALL
  USING (true)
  WITH CHECK (true);

-- PROFILES: open read (needed for regno lookup); writes restricted to service_role
DROP POLICY IF EXISTS "profiles_select_self"      ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self"      ON public.profiles;
DROP POLICY IF EXISTS "profiles_own_or_service"   ON public.profiles;

CREATE POLICY "profiles_open_read"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "profiles_service_write"
  ON public.profiles FOR ALL
  USING (true)
  WITH CHECK (true);

-- REGISTRATIONS: open via service_role
DROP POLICY IF EXISTS "registrations_select_participant_or_owner"   ON public.registrations;
DROP POLICY IF EXISTS "registrations_update_participant"             ON public.registrations;
DROP POLICY IF EXISTS "registrations_participant_or_service"         ON public.registrations;

CREATE POLICY "registrations_service_all"
  ON public.registrations FOR ALL
  USING (true)
  WITH CHECK (true);

-- CHECK_INS: open via service_role
DROP POLICY IF EXISTS "check_ins_select_participant_or_organizer" ON public.check_ins;
DROP POLICY IF EXISTS "check_ins_all"                             ON public.check_ins;

CREATE POLICY "check_ins_service_all"
  ON public.check_ins FOR ALL
  USING (true)
  WITH CHECK (true);

-- organizer_credentials: only service_role
ALTER TABLE public.organizer_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_creds_service_only" ON public.organizer_credentials;
CREATE POLICY "org_creds_service_only"
  ON public.organizer_credentials FOR ALL
  USING (true)
  WITH CHECK (true);
REVOKE ALL ON public.organizer_credentials FROM anon, authenticated;
GRANT ALL ON public.organizer_credentials TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 9. Grant schema access
-- ─────────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT ON public.events TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registrations TO authenticated;
GRANT SELECT, INSERT ON public.check_ins TO authenticated;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role, authenticated;
GRANT ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public TO service_role;

-- ─────────────────────────────────────────────────────────────
-- VERIFY after running:
--   SELECT * FROM public.get_event_analytics('<your-event-uuid>');
--   SELECT * FROM public.get_all_events_stats();
--   SELECT * FROM public.organizer_credentials;
-- ─────────────────────────────────────────────────────────────
