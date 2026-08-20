import hashlib
import logging
import os
import secrets
import sys
from datetime import datetime, timedelta, timezone

import qrcode
from supabase import Client, create_client

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("qr-automation")


def required_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def main(registration_id: str) -> int:
    if not registration_id:
        raise ValueError("registration_id is required")

    supabase: Client = create_client(
        required_env("SUPABASE_URL"), required_env("SUPABASE_SERVICE_ROLE_KEY")
    )
    result = (
        supabase.table("registrations")
        .select("id,event_id,qr_token_hash,qr_payload,qr_status")
        .eq("id", registration_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise LookupError("Registration was not found")

    registration = result.data[0]
    if registration.get("qr_token_hash") and registration.get("qr_payload"):
        logger.info("QR already exists for registration %s", registration_id)
        return 0

    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    validation_url = f"{required_env('QR_VALIDATION_BASE_URL').rstrip('/')}/check-in/{token}"
    qr_image = qrcode.make(validation_url)
    output_path = f"/tmp/{registration_id}.png"
    qr_image.save(output_path)

    # The payload is opaque and contains no participant information. The hash is used by validation.
    update = (
        supabase.table("registrations")
        .update(
            {
                "qr_token_hash": token_hash,
                "qr_payload": validation_url,
                "qr_created_at": datetime.now(timezone.utc).isoformat(),
                "qr_expires_at": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
                "qr_status": "active",
            }
        )
        .eq("id", registration_id)
        .is_("qr_token_hash", "null")
        .execute()
    )
    if not update.data:
        logger.info("QR was created by a concurrent retry for registration %s", registration_id)
        return 0

    logger.info("QR generated for registration %s", registration_id)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else ""))
    except Exception as error:  # noqa: BLE001
        logger.error("QR generation failed: %s", error)
        sys.exit(1)
