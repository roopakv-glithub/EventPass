from flask import jsonify

def json_response(data: dict, status_code: int = 200):
    return jsonify(data), status_code

def error_response(error_code: str, message: str, status_code: int = 400, extra: dict = None):
    payload = {
        "success": False,
        "error": error_code,
        "message": message
    }
    if extra:
        payload.update(extra)
    return jsonify(payload), status_code

def success_response(message: str, data: dict = None, status_code: int = 200):
    payload = {
        "success": True,
        "message": message
    }
    if data:
        payload.update(data)
    return jsonify(payload), status_code
