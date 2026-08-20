# Supabase setup

1. Create a Supabase project and copy the URL and anon key into `.env.local` using `.env.example`.
2. Open the Supabase SQL Editor and run `supabase/migrations/001_eventpass_schema.sql` once.
3. Enable email/password Auth. Keep email confirmation enabled outside local development.
4. Create the first organizer through Auth, then promote its `profiles.role` to `organizer` in the SQL editor.
5. Configure a database webhook for `public.registrations` `INSERT` and send only `record.id` to ActivePieces as documented in `docs/activepieces-registration-webhook.md`.
6. Add the three GitHub Secrets listed in `qr-automation/README.md`.
7. Set `.env.local` values and run the app.

The browser uses only the anon key. The service-role key is used only by the QR GitHub Action. Registration capacity and duplicate prevention are enforced by `register_for_event`; check-in duplication and token validation are enforced by `check_in_by_token`.
