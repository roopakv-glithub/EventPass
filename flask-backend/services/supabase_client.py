import os
from supabase import create_client, Client
from config import Config

def get_supabase_client() -> Client:
    url = Config.SUPABASE_URL
    key = Config.SUPABASE_SERVICE_ROLE_KEY or Config.SUPABASE_ANON_KEY
    if not url or not key:
        raise ValueError("Supabase URL and Key must be provided in environment variables")
    return create_client(url, key)
