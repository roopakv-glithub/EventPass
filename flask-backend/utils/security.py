import hashlib
import secrets

def generate_secure_token() -> str:
    """Generate a cryptographically secure random token."""
    return secrets.token_urlsafe(32)

def hash_token(raw_token: str) -> str:
    """Hash the raw token using SHA-256 for secure DB storage."""
    return hashlib.sha256(raw_token.encode('utf-8')).hexdigest()
