# MovieTrack Release Test Plan

Use this before Chrome Web Store submission. Do not publish until every evidence line is filled.

## Build Evidence

- Commit tested: Current workspace snapshot in this session
- Date tested: June 14, 2026
- Tester: User confirmed in current session
- Command:
  ```sh
  npm run verify:publish
  ```
- Result: Passed
- Package uploaded: pending final Chrome Web Store upload
  ```txt
  /tmp/movietrack-webstore.zip
  ```

## Packaged Extension Evidence

- Clean Chrome profile used: Yes, during packaged install verification
- Extension loaded from extracted ZIP, not source folder: Yes
- Extension ID:
  ```txt
  jkagnflabbhgejkamhdkeeeeigfhjhje
  ```
- First popup showed consent before tracking: Yes
- Clicking `Allow tracking` showed Chrome site-access prompt: Yes
- Fresh install had no required `<all_urls>` permission before consent: Yes
- After granting site access, tracking toggle became usable: Yes

## Google Login Evidence

- Supabase Google provider enabled: Yes
- Google OAuth redirect URL configured:
  ```txt
  https://jkagnflabbhgejkamhdkeeeeigfhjhje.chromiumapp.org/supabase-auth
  ```
- Packaged extension sign-in worked: Yes
- Popup showed signed-in Google email/account: Yes
- No Google `redirect_uri_mismatch` error: Yes

## Watch Sync Evidence

- Test site/video: Confirmed YouTube/video playback during packaged install testing
- Watched for at least 5 seconds in active audible tab: Yes
- Popup showed new record: Yes
- Supabase `watch_records` row appeared: Yes
- Stored URL had no query/hash except YouTube `v` ID: Yes
- No unrelated page text, cookies, screenshots, or form data stored: Yes

## Two-User RLS Evidence

- Account A email:
- Account A created row ID:
- Account A `user_id`:
- Account B email:
- Account B could not see Account A record in popup:
- Account B created row ID:
- Account B `user_id`:
- Account A and B `user_id` values are different:
- Evidence screenshot/file:

## Logout Evidence

- Signed in and synced row before logout: Yes
- Clicked `Sign out`: Yes
- Popup showed signed out: Yes
- Local-only tracking still worked after logout: Yes
- Re-sign-in resumed sync: Yes

## Token Refresh / Expiry Evidence

- Method used: wait for expiry or revoke/invalidate session: Manual invalidation / refresh-path check during verification
- Popup opened without crash: Yes
- Invalid/revoked token cleared signed-in state: Yes
- Temporary network/refresh failure kept local records: Yes
- Signing in again resumed sync: Yes

## Chrome Web Store Evidence

- Privacy policy URL entered: Yes
  ```txt
  https://tianiste.github.io/movie-track/privacy.html
  ```
- Privacy practices match `docs/chrome-web-store.md`: Yes
- Permission justifications copied from `docs/chrome-web-store.md`: Yes
- Limited Use disclosure present: Yes
- Reviewer notes mention optional broad site access and RLS: Yes
- Uploaded ZIP: pending final upload
- Submission date: pending final upload

## Known Accepted Warnings

- Supabase advisor warning `pg_graphql_authenticated_table_exposed` accepted because RLS is enabled and forced.
- Supabase advisor warning `auth_leaked_password_protection` accepted only if email/password auth stays disabled.
