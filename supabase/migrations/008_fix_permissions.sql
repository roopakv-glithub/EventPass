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
