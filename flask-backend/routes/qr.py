from flask import Blueprint, request
from utils.responses import json_response, error_response
from services.qr_service import generate_qr_token

qr_bp = Blueprint("qr", __name__)

@qr_bp.route("/api/qr/token", methods=["POST"])
def get_qr_token():
    data = request.get_json() or {}
    event_id = data.get("event_id")
    participant_id = data.get("participant_id")
    email = data.get("email")

    if not event_id:
        return error_response("INVALID_REQUEST", "event_id is required", 400)

    result = generate_qr_token(event_id=event_id, participant_id=participant_id, email=email)

    if not result.get("success"):
        return error_response(result.get("error", "TOKEN_ERROR"), result.get("message", "Failed to generate token"), 400)

    return json_response(result, 200)

@qr_bp.route("/api/qr/image", methods=["GET"])
def get_qr_image():
    from flask import Response
    from services.qr_service import generate_qr_image_bytes

    data_str = request.args.get("data") or request.args.get("token") or "event-pass-valid"
    img_bytes = generate_qr_image_bytes(data_str)
    return Response(img_bytes, mimetype="image/png")

