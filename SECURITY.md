# Security Policy

MovieTrack handles sensitive watch-history data. Report security issues privately first.

## Supported Versions

| Version | Supported |
| --- | --- |
| `0.1.x` | Yes |

## Report A Vulnerability

Use GitHub private vulnerability reporting if enabled. If it is not enabled, contact the maintainer through the Chrome Web Store support channel or open a GitHub issue with no exploit details and request a private contact path.

Do not post public proof-of-concept code for:

- Supabase RLS bypasses.
- Cross-account data exposure.
- Token/session leakage.
- Extension permission abuse.
- Secrets accidentally committed to the repository.
- Data deletion failures.

## Security Model

- The extension is a public client.
- Supabase publishable key is public.
- Supabase `service_role`, database URLs, Google client secrets, PEM files, and CRX signing keys must never be committed.
- User isolation depends on Supabase Auth plus RLS on `public.watch_records`.
- Tracking is gated by privacy consent, optional site access, active audible tab state, and readable video playback data.

## Sensitive Data

MovieTrack may store trimmed URLs, hostnames, titles, watch timestamps, playback progress, media category, and Supabase user IDs. Treat all watch history as sensitive.

## Maintainer Checklist

- Run `npm run verify:publish` before release.
- Re-run Supabase advisors before release.
- Complete two-user RLS testing before Chrome Web Store submission.
- Verify packaged ZIP does not contain source maps, secrets, `.env`, PEM, CRX, `node_modules`, or Supabase temp files.
