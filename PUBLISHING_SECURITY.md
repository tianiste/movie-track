# MovieTrack Publishing Security Notes

## Chrome Web Store Data Disclosure

MovieTrack handles sensitive user data under Chrome Web Store policy because it records browsing/video watch activity and uses Google login. The listing must disclose:

- Website content / browsing activity: trimmed video URL, hostname, title, watch timestamps, progress.
- Authentication information: Google/Supabase session used for account sync.
- Purpose: watch history and cross-device progress sync only.
- No sale, ads, or marketing transfer.

## Permission Justification

Required permissions:

- `tabs`: read active tab URL/title/audible state for candidate watch sessions.
- `storage`: save local records, consent flag, tracking setting, and Supabase session.
- `alarms`: run periodic active-tab heartbeat.
- `scripting`: read generic `<video>` playback time and resume progress when allowed by site.
- `identity`: run Google/Supabase sign-in flow.
- Optional `<all_urls>`: support video tracking across user-selected streaming/video sites after user consent.

`<all_urls>` is broad but directly tied to MovieTrack's single purpose. It is optional host access, not a required install-time host permission. The popup gates tracking behind explicit consent plus a user-granted site-access prompt, and records are only created for active audible tabs with readable `<video>` playback data. If site access is later revoked, MovieTrack disables tracking and finalizes any active local session.

## Supabase GraphQL Advisor

Current decision: accept the `pg_graphql_authenticated_table_exposed` advisor warning for now.

Reason:

- MovieTrack needs `authenticated` `SELECT` on `public.watch_records` for Supabase REST/Data API sync.
- RLS is enabled and forced.
- Policies restrict every operation to `(select auth.uid()) = user_id`.
- `anon` has no table grants.

If future publishing review requires removing the warning, disable GraphQL exposure at the Supabase project/API level or move the public REST API shape to a dedicated exposed schema while keeping GraphQL unavailable.

Latest advisor run after the `youtube` media type migration: June 12, 2026. Warnings only:

- `pg_graphql_authenticated_table_exposed`
- `auth_leaked_password_protection`

## Auth Session Handling

- Sign-in uses Supabase Google OAuth through `chrome.identity.launchWebAuthFlow`.
- Supabase access and refresh tokens are stored in `chrome.storage.local`.
- Token refresh runs before sync/auth checks when the token is near expiry.
- Invalid or revoked refresh tokens clear the local signed-in state.
- Temporary refresh/network failures leave local watch records intact and sync can resume after sign-in.
- Sign-out calls Supabase `/auth/v1/logout` to revoke the server-side session when possible, then clears local session storage even if the network logout fails.

## Publish Checklist

- Privacy policy URL added in Chrome Web Store Developer Dashboard.
- Privacy practices form matches `PRIVACY_POLICY.md`.
- No `MovieTrack.pem`, `.env`, service role key, DB password, or Google secret committed.
- Fresh install tested from packaged ZIP.
- Two-account RLS test completed.
- Logout/token-expiry behavior tested.
