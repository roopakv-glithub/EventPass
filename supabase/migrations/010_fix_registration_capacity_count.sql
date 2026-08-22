-- Count only active registrations when enforcing event capacity.
-- Run this migration in the Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.register_participant_atomic(
    p_event_id UUID,
    p_participant_id UUID,
    p_email TEXT DEFAULT NULL,
    p_full_name TEXT DEFAULT NULL,
    p_regno TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_capacity INT;
    v_current_count INT;
    v_existing_reg UUID;
    v_new_reg_id UUID;
BEGIN
    SELECT capacity INTO v_capacity
    FROM public.events
    WHERE id = p_event_id
    FOR UPDATE;

    IF v_capacity IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'EVENT_NOT_FOUND', 'message', 'Event not found');
    END IF;

    SELECT id INTO v_existing_reg
    FROM public.registrations
    WHERE event_id = p_event_id AND participant_id = p_participant_id
    LIMIT 1;

    IF v_existing_reg IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'ALREADY_REGISTERED', 'message', 'You are already registered for this event.');
    END IF;

    SELECT COUNT(*) INTO v_current_count
    FROM public.registrations
    WHERE event_id = p_event_id AND status = 'registered';

    IF v_current_count >= v_capacity THEN
        RETURN jsonb_build_object('success', false, 'error', 'EVENT_FULL', 'message', 'This event is full.');
    END IF;

    IF p_email IS NOT NULL THEN
        INSERT INTO public.profiles (id, full_name, email, role)
        VALUES (p_participant_id, COALESCE(p_full_name, 'Participant'), p_email, 'participant')
        ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;
    END IF;

    INSERT INTO public.registrations (event_id, participant_id, status)
    VALUES (p_event_id, p_participant_id, 'registered')
    RETURNING id INTO v_new_reg_id;

    RETURN jsonb_build_object('success', true, 'registration_id', v_new_reg_id, 'message', 'Registration successful');
EXCEPTION
    WHEN unique_violation THEN
        RETURN jsonb_build_object('success', false, 'error', 'ALREADY_REGISTERED', 'message', 'You are already registered for this event.');
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', 'DATABASE_ERROR', 'message', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_participant_atomic(UUID, UUID, TEXT, TEXT, TEXT)
TO anon, authenticated, service_role;