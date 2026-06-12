# MovieTrack TODO

Current state: extension works locally, Google sign-in works, Supabase sync works on at least two computers, and the repo has a Web Store package script.

Do not mark publish-ready until every required item below is done.

## Must Do Before Chrome Web Store

- [ ] Host privacy policy at a public URL.
  - Source content: `PRIVACY_POLICY.md`.
  - Public URL must not be a local file or private repo URL.
  - Add this URL in Chrome Web Store Developer Dashboard.

- [ ] Fill Chrome Web Store privacy practices.
  - Use `CHROME_WEB_STORE.md`.
  - Disclose browsing/video watch activity.
  - Disclose authentication/session data.
  - Say data is used only for watch progress and account sync.
  - Say data is not sold, not used for ads, not transferred for marketing.

- [ ] Verify two real users cannot see each other's data.
  - Google account A: sign in, accept consent, watch video for 10+ seconds.
  - Confirm account A sees/syncs its own row.
  - Google account B in another Chrome profile/device: sign in.
  - Confirm account B cannot see account A records.
  - Account B watches video for 10+ seconds.
  - Confirm Supabase `watch_records` has separate `user_id` values.

- [ ] Test logout.
  - Sign in.
  - Confirm cloud sync works.
  - Click sign out.
  - Confirm popup is signed out.
  - Confirm local-only tracking still works after sign-out.

- [ ] Test token expiry/refresh.
  - Leave signed in long enough for refresh path, or manually invalidate session.
  - Open popup.
  - Confirm no crash.
  - Confirm failed sync keeps pending local records.
  - Confirm signing in again resumes sync.

- [ ] Test final packaged install, not dev/unpacked source.
  - [x] Run:
    ```sh
    npm run package:webstore
    ```
  - [x] Load `/tmp/movietrack-webstore.zip` contents in clean Chromium profile.
  - [x] Confirm extension ID is:
    ```txt
    lgocadpaahlplfilfmacphcfkfghfihl
    ```
  - [x] Confirm service worker starts from packaged files.
  - [ ] Confirm first-run consent appears before tracking.
  - [ ] Confirm Google login works from packaged install.
  - [ ] Confirm watching YouTube/video creates Supabase row from packaged install.

## Security / Supabase

- [ ] Re-run Supabase advisor before final submit.
  ```sh
  supabase db advisors --linked --level warn --fail-on error
  ```

- [ ] Decide final GraphQL warning handling.
  - Current warning:
    ```txt
    pg_graphql_authenticated_table_exposed
    ```
  - Current decision: accepted/documented in `PUBLISHING_SECURITY.md`.
  - Reason: RLS is enabled and forced; rows are owner-scoped by `user_id = auth.uid()`.
  - If you want zero warning: disable GraphQL exposure in Supabase or move API table/view to dedicated exposed schema.

- [ ] Enable leaked password protection if email/password auth is enabled.
  - Low priority if app stays Google-login-only.

- [ ] Keep Supabase service role key out of extension forever.
  - Extension may contain public Supabase URL and publishable anon key.
  - Extension must never contain service role key, DB password, Google client secret, or private key.

## Permissions / Privacy

- [ ] Keep or reduce `<all_urls>`.
  - Current reason: extension tracks video across arbitrary user-selected video sites.
  - If Chrome rejects broad access, switch to optional host permissions or a smaller site list.

- [ ] Keep data minimal.
  - Strip query/hash from URLs.
  - Keep YouTube URL minimized to video ID.
  - Do not store page text, screenshots, cookies, or unrelated browsing history.

- [ ] Make account/data deletion path clear.
  - In extension: delete cloud data button exists.
  - In privacy policy: explain deletion method.
  - In store listing: do not imply data is impossible to delete.

## Local Final Checks

- [ ] Check git status.
  ```sh
  git status --short
  ```

- [ ] Check tracked secret-risk files.
  ```sh
  git ls-files | rg 'node_modules|MovieTrack\.pem|\.pem$|\.env|\.crx$|supabase/.temp'
  ```
  Expected: no output.

- [ ] Search for private secrets.
  ```sh
  rg 'service_role|sb_secret|SUPABASE_SERVICE|SUPABASE_SECRET|GOOGLE_CLIENT_SECRET|client_secret|DATABASE_URL|postgres://|BEGIN PRIVATE|PRIVATE KEY' . --glob '!node_modules/**'
  ```
  Expected: no real secrets. Documentation-only mentions are OK.

- [ ] Run typecheck.
  ```sh
  npm run typecheck
  ```

- [ ] Build extension.
  ```sh
  npm run build
  ```

- [ ] Build Web Store zip.
  ```sh
  npm run package:webstore
  ```

- [x] Verify zip contents.
  ```sh
  npm run verify:webstore
  ```
  Must not include:
  - `node_modules/`
  - `.env`
  - `MovieTrack.pem`
  - `MovieTrack.crx`
  - `supabase/.temp/`
  - source maps
  - repo docs/checklists
  - secrets/private keys

## Upload

- [ ] Upload `/tmp/movietrack-webstore.zip` to Chrome Web Store.
- [ ] Add privacy policy URL.
- [ ] Add permission justifications from `CHROME_WEB_STORE.md`.
- [ ] Submit for review.

## Already Working

- [x] Public Supabase key only in extension.
- [x] Supabase RLS enabled and forced for `watch_records`.
- [x] Google sign-in works after redirect URL fix.
- [x] Sync works on another computer.
- [x] Consent screen exists before tracking.
- [x] Delete cloud data button exists.
- [x] Runtime package script exists.
- [x] `node_modules`, `.env`, PEM, CRX, and Supabase temp files ignored.
