import argparse
import sys
from flask import Flask, jsonify
from flask_cors import CORS
from config import Config

from routes.auth import auth_bp
from routes.events import events_bp
from routes.registrations import registrations_bp
from routes.qr import qr_bp
from routes.checkin import checkin_bp
from routes.analytics import analytics_bp

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    # Enable CORS
    CORS(app, resources={r"/api/*": {"origins": Config.CORS_ORIGIN}})

    # Register Blueprints
    app.register_blueprint(auth_bp)
    app.register_blueprint(events_bp)
    app.register_blueprint(registrations_bp)
    app.register_blueprint(qr_bp)
    app.register_blueprint(checkin_bp)
    app.register_blueprint(analytics_bp)

    @app.route("/", methods=["GET"])
    def root():
        return jsonify({
            "status": "online",
            "message": "EventPass Flask Backend API is running",
            "health": "/health",
            "version": "1.0.0"
        }), 200

    @app.route("/health", methods=["GET"])
    def health():
        return jsonify({"status": "healthy", "service": "event-pass-flask-backend"}), 200

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"success": False, "error": "NOT_FOUND", "message": "Endpoint not found"}), 404

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({"success": False, "error": "SERVER_ERROR", "message": "Internal server error"}), 500

    return app

app = create_app()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run EventPass Flask Backend")
    parser.add_argument("--port", type=int, default=5000, help="Port to listen on (default: 5000)")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host address to bind to")
    args = parser.parse_args()

    print(f"🚀 Starting EventPass Flask Server on http://{args.host}:{args.port}")
    app.run(host=args.host, port=args.port, debug=False, threaded=True)

