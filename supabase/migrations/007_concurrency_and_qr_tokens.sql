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
    WHERE event_id = p_event_id;

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
