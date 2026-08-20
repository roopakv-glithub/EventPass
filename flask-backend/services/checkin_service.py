from datetime import datetime, timezone
from services.supabase_client import get_supabase_client
from utils.security import hash_token

def process_checkin(event_id: str, raw_token: str, scanned_by: str = None):
    supabase = get_supabase_client()

    if not raw_token or not event_id:
        return {"success": False, "error": "INVALID_REQUEST", "message": "event_id and token are required"}

    token_hashed = hash_token(raw_token)

    # 1. Try atomic RPC function process_checkin_atomic
    try:
        rpc_res = supabase.rpc("process_checkin_atomic", {
            "p_event_id": event_id,
            "p_token_hash": token_hashed,
            "p_scanned_by": scanned_by
        }).execute()

        if rpc_res.data:
            result = rpc_res.data
            if isinstance(result, dict):
                return result
    except Exception as rpc_err:
        print(f"[CheckinService] RPC fallback: {rpc_err}")

    # 2. Fallback check-in processing logic
    try:
        # Find token
        token_res = supabase.from_("qr_tokens").select("*").eq("token_hash", token_hashed).limit(1).execute()
        if not token_res.data or len(token_res.data) == 0:
            return {"success": False, "error": "TOKEN_NOT_FOUND", "message": "Invalid QR code."}

        token_obj = token_res.data[0]

        # Check expiration
        expires_at_dt = datetime.fromisoformat(token_obj["expires_at"].replace("Z", "+00:00"))
        now_dt = datetime.now(timezone.utc)

        if expires_at_dt < now_dt:
            return {"success": False, "error": "TOKEN_EXPIRED", "message": "QR code has expired. Please refresh the QR code."}

        # Check if used
        if token_obj.get("used_at") or token_obj.get("status") == "used":
            return {"success": False, "error": "TOKEN_ALREADY_USED", "message": "This QR code has already been scanned."}

        reg_id = token_obj["registration_id"]

        # Find registration
        reg_res = supabase.from_("registrations").select("id, event_id").eq("id", reg_id).single().execute()
        if not reg_res.data:
            return {"success": False, "error": "REGISTRATION_NOT_FOUND", "message": "Registration record not found."}

        reg_obj = reg_res.data

        # Check event match
        if str(reg_obj["event_id"]) != str(event_id):
            return {"success": False, "error": "WRONG_EVENT", "message": "This ticket is for a different event."}

        # Check if already checked in
        ci_res = supabase.from_("check_ins").select("id, checked_in_at").eq("registration_id", reg_id).limit(1).execute()
        if ci_res.data and len(ci_res.data) > 0:
            existing_ci = ci_res.data[0]
            dt_str = existing_ci.get("checked_in_at", "")
            time_formatted = "earlier"
            if dt_str:
                try:
                    dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
                    time_formatted = dt.strftime("%I:%M %p")
                except Exception:
                    pass

            return {
                "success": False,
                "error": "ALREADY_CHECKED_IN",
                "message": f"Already checked in at {time_formatted}",
                "checked_in_at": dt_str
            }

        # Perform check-in
        insert_ci = supabase.from_("check_ins").insert({
            "registration_id": reg_id,
            "checked_in_at": now_dt.isoformat(),
            "scanned_by": scanned_by
        }).execute()

        # Mark token as used
        supabase.from_("qr_tokens").update({
            "used_at": now_dt.isoformat(),
            "status": "used"
        }).eq("id", token_obj["id"]).execute()

        if insert_ci.data and len(insert_ci.data) > 0:
            return {
                "success": True,
                "message": "Check-in successful",
                "checkin_id": insert_ci.data[0]["id"],
                "checked_in_at": now_dt.isoformat()
            }
    except Exception as e:
        err_str = str(e).lower()
        if "unique" in err_str or "check_ins_registration_id_key" in err_str or "already" in err_str:
            return {
                "success": False,
                "error": "ALREADY_CHECKED_IN",
                "message": "Already checked in"
            }
        return {"success": False, "error": "DATABASE_ERROR", "message": str(e)}

    return {"success": False, "error": "DATABASE_ERROR", "message": "Check-in failed"}
