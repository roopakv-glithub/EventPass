# ActivePieces registration webhook

Configure a Supabase database/webhook trigger for `public.registrations` on `INSERT`, then use an HTTP step to dispatch the GitHub workflow.

## Request

```http
POST https://api.github.com/repos/ORG/REPO/dispatches
Authorization: Bearer {{GITHUB_ACTIONS_DISPATCH_TOKEN}}
Accept: application/vnd.github+json
Content-Type: application/json
```

```json
{
  "event_type": "registration-created",
  "client_payload": {
    "registration_id": "{{trigger.record.id}}"
  }
}
```

Only send the registration UUID. Do not send names, emails, QR tokens, or the Supabase service-role key. Use an ActivePieces secret for the GitHub token, grant it only the minimum repository Actions permission, and keep the workflow secrets in GitHub Secrets.
