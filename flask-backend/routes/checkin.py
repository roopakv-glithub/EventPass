from flask import Blueprint, request
from utils.responses import json_response, error_response
from services.checkin_service import process_checkin

checkin_bp = Blueprint("checkin", __name__)

@checkin_bp.route("/api/check-in", methods=["POST"])
def check_in():
    data = request.get_json() or {}
    event_id = data.get("event_id")
    token = data.get("token")
    scanned_by = data.get("scanned_by")

    if not event_id or not token:
        return error_response("INVALID_REQUEST", "event_id and token are required", 400)

    result = process_checkin(event_id=event_id, raw_token=token, scanned_by=scanned_by)

    if not result.get("success"):
        error_code = result.get("error", "CHECKIN_FAILED")
        status_code = 409 if error_code in ["ALREADY_CHECKED_IN", "TOKEN_ALREADY_USED", "TOKEN_EXPIRED"] else 400
        return error_response(error_code, result.get("message", "Check-in failed"), status_code, extra=result)

    return json_response(result, 200)
