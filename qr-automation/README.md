# EventPass QR automation

This job is triggered once for each new registration by ActivePieces. It accepts only the `registration_id`, fetches that row with the Supabase service role, and creates an opaque QR validation URL. The database stores a SHA-256 hash for validation and the opaque payload for the participant's My QR view.

The operation is idempotent: a retry exits successfully when the registration already has QR data. A conditional update also prevents concurrent jobs from overwriting a token.

## GitHub Secrets

Create these repository secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `QR_VALIDATION_BASE_URL` (for example, the deployed app URL)

Never expose the service-role key in browser code, logs, or ActivePieces.

## Local run

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:SUPABASE_URL = 'https://your-project.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY = 'server-only-key'
$env:QR_VALIDATION_BASE_URL = 'https://your-app.example.com'
python generate_qr.py registration-uuid
```
