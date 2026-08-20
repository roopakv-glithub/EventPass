from flask import Blueprint, request
from utils.responses import success_response, error_response
from services.supabase_client import get_supabase_client

events_bp = Blueprint("events", __name__)

@events_bp.route("/api/events", methods=["GET"])
def get_events():
    try:
        supabase = get_supabase_client()
        res = supabase.from_("events").select("*").order("created_at", desc=True).execute()
        return success_response("Events fetched successfully", {"events": res.data or []})
    except Exception as e:
        return error_response("DATABASE_ERROR", str(e), 500)

@events_bp.route("/api/events", methods=["POST"])
def create_event():
    data = request.get_json() or {}
    name = data.get("name") or data.get("title")
    event_date = data.get("event_date") or data.get("date")
    capacity = data.get("capacity") or 250

    if not name or not event_date:
        return error_response("INVALID_REQUEST", "Event name and date are required", 400)

    try:
        supabase = get_supabase_client()
        payload = {
            "name": name,
            "event_date": event_date,
            "start_time": data.get("start_time", "09:00"),
            "end_time": data.get("end_time", "17:00"),
            "location": data.get("location", "Main Hall"),
            "capacity": int(capacity),
            "event_type": data.get("event_type", "Conference"),
            "event_number": data.get("event_number", f"EV-2026-{name[:3].upper()}"),
            "description": data.get("description", "Event created via API")
        }
        res = supabase.from_("events").insert(payload).execute()
        if res.data and len(res.data) > 0:
            return success_response("Event created successfully", {"event": res.data[0]}, 201)
        return error_response("DATABASE_ERROR", "Failed to insert event", 500)
    except Exception as e:
        return error_response("DATABASE_ERROR", str(e), 500)
