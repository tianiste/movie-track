# MovieTrack Release Test Plan

Use this before Chrome Web Store submission. Do not publish until every evidence line is filled.

## Build Evidence

- Commit tested:
- Date tested:
- Tester:
- Command:
  ```sh
  npm run verify:publish
  ```
- Result:
- Package uploaded:
  ```txt
  /tmp/movietrack-webstore.zip
  ```

## Packaged Extension Evidence

- Clean Chrome profile used:
- Extension loaded from extracted ZIP, not source folder:
- Extension ID:
  ```txt
  lgocadpaahlplfilfmacphcfkfghfihl
  ```
- First popup showed consent before tracking:
- Clicking `Allow tracking` showed Chrome site-access prompt:
- Fresh install had no required `<all_urls>` permission before consent:
- After granting site access, tracking toggle became usable:

## Google Login Evidence

- Supabase Google provider enabled:
- Google OAuth redirect URL configured:
  ```txt
  https://lgocadpaahlplfilfmacphcfkfghfihl.chromiumapp.org/supabase-auth
  ```
- Packaged extension sign-in worked:
- Popup showed signed-in Google email/account:
- No Google `redirect_uri_mismatch` error:

## Watch Sync Evidence

- Test site/video:
- Watched for at least 5 seconds in active audible tab:
- Popup showed new record:
- Supabase `watch_records` row appeared:
- Stored URL had no query/hash except YouTube `v` ID:
- No unrelated page text, cookies, screenshots, or form data stored:

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

- Signed in and synced row before logout:
- Clicked `Sign out`:
- Popup showed signed out:
- Local-only tracking still worked after logout:
- Re-sign-in resumed sync:

## Token Refresh / Expiry Evidence

- Method used: wait for expiry or revoke/invalidate session:
- Popup opened without crash:
- Invalid/revoked token cleared signed-in state:
- Temporary network/refresh failure kept local records:
- Signing in again resumed sync:

## Chrome Web Store Evidence

- Privacy policy URL entered:
  ```txt
  https://tianiste.github.io/movie-track/privacy.html
  ```
- Privacy practices match `CHROME_WEB_STORE.md`:
- Permission justifications copied from `CHROME_WEB_STORE.md`:
- Limited Use disclosure present:
- Reviewer notes mention optional broad site access and RLS:
- Uploaded ZIP:
- Submission date:

## Known Accepted Warnings

- Supabase advisor warning `pg_graphql_authenticated_table_exposed` accepted because RLS is enabled and forced.
- Supabase advisor warning `auth_leaked_password_protection` accepted only if email/password auth stays disabled.
