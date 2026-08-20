from services.supabase_client import get_supabase_client

def get_event_analytics(event_id: str = None):
    supabase = get_supabase_client()

    events_res = supabase.from_("events").select("*").execute()
    events = events_res.data or []

    regs_res = supabase.from_("registrations").select("id, event_id, status").execute()
    regs = regs_res.data or []

    ci_res = supabase.from_("check_ins").select("id, registration_id, checked_in_at").execute()
    checkins = ci_res.data or []

    total_events = len(events)
    total_registrations = len(regs)
    total_checkins = len(checkins)

    checkin_rate = round((total_checkins / total_registrations * 100), 1) if total_registrations > 0 else 0.0

    return {
        "success": True,
        "analytics": {
            "total_events": total_events,
            "total_registrations": total_registrations,
            "total_checkins": total_checkins,
            "checkin_rate_percentage": checkin_rate,
            "events": events
        }
    }
