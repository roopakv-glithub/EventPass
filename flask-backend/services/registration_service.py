import uuid
from services.supabase_client import get_supabase_client

def register_participant(event_id: str, participant_id: str = None, email: str = None, name: str = None, regno: str = None):
    supabase = get_supabase_client()

    # Generate UUID for participant if missing
    if not participant_id:
        # Lookup existing profile by email
        if email:
            prof_res = supabase.from_("profiles").select("id").eq("email", email).limit(1).execute()
            if prof_res.data and len(prof_res.data) > 0:
                participant_id = prof_res.data[0]["id"]
        
        if not participant_id:
            participant_id = str(uuid.uuid4())

    # Try calling atomic PL/pgSQL RPC first
    try:
        rpc_res = supabase.rpc("register_participant_atomic", {
            "p_event_id": event_id,
            "p_participant_id": participant_id,
            "p_email": email,
            "p_full_name": name,
            "p_regno": regno
        }).execute()

        if rpc_res.data:
            result = rpc_res.data
            if isinstance(result, dict):
                return result
    except Exception as rpc_err:
        print(f"[RegistrationService] RPC fallback: {rpc_err}")

    # Fallback to direct Python/Supabase query with strict DB constraint checks
    try:
        # Check event capacity
        ev_res = supabase.from_("events").select("capacity, name").eq("id", event_id).single().execute()
        if not ev_res.data:
            return {"success": False, "error": "EVENT_NOT_FOUND", "message": "Event not found"}

        capacity = ev_res.data.get("capacity", 250)

        # Count current registrations
        count_res = supabase.from_("registrations").select("id", count="exact").eq("event_id", event_id).execute()
        current_count = count_res.count if count_res.count is not None else len(count_res.data or [])

        if current_count >= capacity:
            return {"success": False, "error": "EVENT_FULL", "message": "This event is full."}

        # Check existing registration
        existing_res = supabase.from_("registrations").select("id").eq("event_id", event_id).eq("participant_id", participant_id).execute()
        if existing_res.data and len(existing_res.data) > 0:
            return {"success": False, "error": "ALREADY_REGISTERED", "message": "You are already registered for this event."}

        # Create/update profile
        if email and name:
            supabase.from_("profiles").upsert({
                "id": participant_id,
                "full_name": name,
                "email": email,
                "role": "participant",
                "regno": regno
            }).execute()

        # Insert registration
        reg_res = supabase.from_("registrations").insert({
            "event_id": event_id,
            "participant_id": participant_id,
            "status": "registered"
        }).execute()

        if reg_res.data and len(reg_res.data) > 0:
            return {
                "success": True,
                "registration_id": reg_res.data[0]["id"],
                "message": "Registration successful"
            }
    except Exception as e:
        err_str = str(e).lower()
        if "unique" in err_str or "already" in err_str or "registrations_participant_event_key" in err_str:
            return {"success": False, "error": "ALREADY_REGISTERED", "message": "You are already registered for this event."}
        return {"success": False, "error": "DATABASE_ERROR", "message": str(e)}

    return {"success": False, "error": "DATABASE_ERROR", "message": "Registration failed"}
