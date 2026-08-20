from flask import Blueprint, request
from utils.responses import json_response, error_response
from services.analytics_service import get_event_analytics

analytics_bp = Blueprint("analytics", __name__)

@analytics_bp.route("/api/analytics", methods=["GET"])
def analytics():
    event_id = request.args.get("event_id")
    result = get_event_analytics(event_id)
    return json_response(result, 200)
