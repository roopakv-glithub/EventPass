from datetime import datetime, timedelta, timezone
from services.supabase_client import get_supabase_client
from utils.security import generate_secure_token, hash_token
from config import Config

def generate_qr_token(event_id: str, participant_id: str = None, email: str = None):
    supabase = get_supabase_client()

    # 1. Find registration for this participant and event
    reg_id = None
    if participant_id:
        reg_res = supabase.from_("registrations").select("id").eq("event_id", event_id).eq("participant_id", participant_id).limit(1).execute()
        if reg_res.data and len(reg_res.data) > 0:
            reg_id = reg_res.data[0]["id"]

    if not reg_id and email:
        prof_res = supabase.from_("profiles").select("id").eq("email", email).limit(1).execute()
        if prof_res.data and len(prof_res.data) > 0:
            p_id = prof_res.data[0]["id"]
            reg_res = supabase.from_("registrations").select("id").eq("event_id", event_id).eq("participant_id", p_id).limit(1).execute()
            if reg_res.data and len(reg_res.data) > 0:
                reg_id = reg_res.data[0]["id"]

    # Fallback to general registration lookup for event
    if not reg_id:
        reg_res = supabase.from_("registrations").select("id").eq("event_id", event_id).limit(1).execute()
        if reg_res.data and len(reg_res.data) > 0:
            reg_id = reg_res.data[0]["id"]

    if not reg_id:
        return {"success": False, "error": "REGISTRATION_NOT_FOUND", "message": "No valid registration found for this event."}

    # 2. Generate secure token
    raw_token = generate_secure_token()
    token_hashed = hash_token(raw_token)

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=Config.TOKEN_LIFETIME_SECONDS)
    expires_at_iso = expires_at.isoformat()

    # 3. Store hashed token in DB
    try:
        supabase.from_("qr_tokens").insert({
            "registration_id": reg_id,
            "token_hash": token_hashed,
            "created_at": now.isoformat(),
            "expires_at": expires_at_iso,
            "status": "active"
        }).execute()
    except Exception as e:
        print(f"[QRService] Store error: {e}")

    # 4. Generate QR Code Image (Base64)
    qr_base64 = None
    try:
        import io
        import base64
        import qrcode

        qr = qrcode.QRCode(version=1, box_size=10, border=4)
        qr.add_data(raw_token)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        qr_base64 = f"data:image/png;base64,{base64.b64encode(buffer.getvalue()).decode('utf-8')}"
    except Exception as e:
        print(f"[QRService] Image generation error: {e}")

    # Return raw token and base64 QR image to frontend
    return {
        "success": True,
        "token": raw_token,
        "qr_image_base64": qr_base64,
        "registration_id": reg_id,
        "expires_at": expires_at_iso,
        "expires_in_seconds": Config.TOKEN_LIFETIME_SECONDS
    }

def generate_qr_image_bytes(data_string: str) -> bytes:
    import io
    import qrcode

    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(data_string)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()

