from flask import Blueprint, request
from utils.responses import success_response, error_response
from services.supabase_client import get_supabase_client

auth_bp = Blueprint("auth", __name__)

@auth_bp.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    role = data.get("role", "participant")
    email = data.get("email")
    name = data.get("name") or data.get("full_name")
    regno = data.get("regno")
    password = data.get("password")

    if not email:
        return error_response("INVALID_REQUEST", "Email is required", 400)

    try:
        supabase = get_supabase_client()
        # Find or create profile
        prof_res = supabase.from_("profiles").select("*").eq("email", email).limit(1).execute()
        
        user_obj = None
        if prof_res.data and len(prof_res.data) > 0:
            user_obj = prof_res.data[0]
            if regno:
                supabase.from_("profiles").update({"regno": regno}).eq("id", user_obj["id"]).execute()
        else:
            # Create user profile
            import uuid
            new_id = str(uuid.uuid4())
            profile_data = {
                "id": new_id,
                "email": email,
                "full_name": name or email.split("@")[0],
                "role": role,
                "regno": regno
            }
            supabase.from_("profiles").insert(profile_data).execute()
            user_obj = profile_data

        user_payload = {
            "id": user_obj.get("id"),
            "email": user_obj.get("email"),
            "name": user_obj.get("full_name") or name or email.split("@")[0],
            "role": role,
            "regno": user_obj.get("regno") or regno
        }

        return success_response("Login successful", {"user": user_payload})
    except Exception as e:
        return error_response("DATABASE_ERROR", str(e), 500)
