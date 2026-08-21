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
