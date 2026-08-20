from flask import Blueprint, request
from utils.responses import json_response, error_response
from services.registration_service import register_participant
from services.supabase_client import get_supabase_client

registrations_bp = Blueprint("registrations", __name__)

@registrations_bp.route("/api/registrations", methods=["POST"])
def create_registration():
    data = request.get_json() or {}
    event_id = data.get("event_id")
    participant_id = data.get("participant_id")
    email = data.get("email")
    name = data.get("name") or data.get("full_name")
    regno = data.get("regno")

    if not event_id:
        return error_response("INVALID_REQUEST", "event_id is required", 400)

    result = register_participant(
        event_id=event_id,
        participant_id=participant_id,
        email=email,
        name=name,
        regno=regno
    )

    if not result.get("success"):
        error_code = result.get("error", "DATABASE_ERROR")
        status_code = 409 if error_code in ["EVENT_FULL", "ALREADY_REGISTERED"] else 400
        return error_response(error_code, result.get("message", "Registration failed"), status_code)

    return json_response(result, 201)

@registrations_bp.route("/api/registrations", methods=["DELETE"])
def delete_registration():
    data = request.get_json() or {}
    event_id = data.get("event_id")
    email = data.get("email")
    participant_id = data.get("participant_id")

    if not event_id:
        return error_response("INVALID_REQUEST", "event_id is required", 400)

    try:
        supabase = get_supabase_client()
        prof_id = participant_id
        if not prof_id and email:
            prof_res = supabase.from_("profiles").select("id").eq("email", email).limit(1).execute()
            if prof_res.data and len(prof_res.data) > 0:
                prof_id = prof_res.data[0]["id"]

        if prof_id:
            supabase.from_("registrations").delete().eq("event_id", event_id).eq("participant_id", prof_id).execute()
        else:
            supabase.from_("registrations").delete().eq("event_id", event_id).execute()

        return json_response({"success": True, "message": "Successfully unregistered from event"}, 200)
    except Exception as e:
        return error_response("DATABASE_ERROR", str(e), 500)
