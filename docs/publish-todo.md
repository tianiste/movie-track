# MovieTrack TODO

Current state: extension works locally, Google sign-in works, Supabase sync works on at least two computers, and the repo has a Web Store package script.

Do not mark publish-ready until every required item below is done.

Use `docs/release-test-plan.md` to record final manual proof before submitting to Chrome Web Store.

## Must Do Before Chrome Web Store

- [x] Host privacy policy at a public URL.
  - Source content: `PRIVACY_POLICY.md`.
  - Public-hostable HTML page exists at `docs/privacy.html`.
  - GitHub Pages is enabled from `main` `/docs`.
  - Public URL:
    ```txt
    https://tianiste.github.io/movie-track/privacy.html
    ```
  - Verified HTTP 200 on June 12, 2026.
  - Add this URL in Chrome Web Store Developer Dashboard.

- [ ] Fill Chrome Web Store privacy practices.
  - Use `docs/chrome-web-store.md`.
  - Disclose browsing/video watch activity.
  - Disclose authentication/session data.
  - Say data is used only for watch progress and account sync.
  - Say data is not sold, not used for ads, not transferred for marketing.

- [ ] Verify two real users cannot see each other's data.
  - Record evidence in `docs/release-test-plan.md`.
  - Google account A: sign in, accept consent, watch video for 5+ seconds.
  - Confirm account A sees/syncs its own row.
  - Google account B in another Chrome profile/device: sign in.
  - Confirm account B cannot see account A records.
  - Account B watches video for 5+ seconds.
  - Confirm Supabase `watch_records` has separate `user_id` values.

- [x] Test logout.
  - Record evidence in `docs/release-test-plan.md`.
  - Sign in.
  - Confirm cloud sync works.
  - Code now calls Supabase `/auth/v1/logout` before clearing local session.
  - Click sign out.
  - Confirm popup is signed out.
  - Confirm local-only tracking still works after sign-out.

- [x] Test token expiry/refresh.
  - Record evidence in `docs/release-test-plan.md`.
  - Leave signed in long enough for refresh path, or manually invalidate session.
  - Code now clears local auth state for invalid/revoked refresh tokens.
  - Code keeps local watch records intact when refresh cannot complete.
  - Open popup.
  - Confirm no crash.
  - Confirm failed sync keeps pending local records.
  - Confirm signing in again resumes sync.

- [ ] Test final packaged install, not dev/unpacked source.
  - Record evidence in `docs/release-test-plan.md`.
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
  - [x] Confirm fresh install has no active required host permissions.
  - [x] Confirm `<all_urls>` is declared only as optional host access.
  - [x] Confirm first-run consent appears before tracking.
  - [x] Confirm clicking Allow tracking prompts for site access.
  - [x] Confirm Google login works from packaged install.
  - [x] Confirm watching YouTube/video creates Supabase row from packaged install.

## Security / Supabase

- [x] Re-run Supabase advisor before final submit.
  ```sh
  supabase db advisors --linked --level warn --fail-on error
  ```
  - Last run: June 12, 2026.
  - Current warnings only:
    - `pg_graphql_authenticated_table_exposed`
    - `auth_leaked_password_protection`

- [x] Decide final GraphQL warning handling.
  - Current warning:
    ```txt
    pg_graphql_authenticated_table_exposed
    ```
  - Decision: accepted/documented in `docs/publishing-security.md`.
  - Reason: RLS is enabled and forced; rows are owner-scoped by `user_id = auth.uid()`.
  - If a reviewer/security requirement demands zero warning later: disable GraphQL exposure in Supabase or move API table/view to dedicated exposed schema.

- [ ] Enable leaked password protection if email/password auth is enabled.
  - Low priority if app stays Google-login-only.

- [ ] Keep Supabase service role key out of extension forever.
  - Extension may contain public Supabase URL and publishable anon key.
  - Extension must never contain service role key, DB password, Google client secret, or private key.

## Permissions / Privacy

- [x] Keep or reduce `<all_urls>`.
  - `<all_urls>` is now optional host access, not a required install-time host permission.
  - It is requested only after the user accepts tracking.
  - If site access is revoked later, tracking is disabled and active sessions are finalized.
  - Current reason: extension tracks video across arbitrary user-selected video sites.
  - If Chrome rejects broad optional access, switch to a smaller site list.

- [x] Keep data minimal.
  - Strip query/hash from URLs.
  - Keep YouTube URL minimized to video ID.
  - Do not store page text, screenshots, cookies, or unrelated browsing history.

- [x] Make account/data deletion path clear.
  - In extension: delete cloud data button exists.
  - In privacy policy: explain deletion method.
  - In store listing: do not imply data is impossible to delete.

## Local Final Checks

- [x] Run one-command publish verification.
  ```sh
  npm run verify:publish
  ```
  Last run: June 12, 2026.
  Covers:
  - typecheck
  - Web Store package build
  - zip content verification
  - tracked secret-risk file check
  - private secret string scan in runtime source/migrations
  - manifest permission shape
  - consent and optional host-access flow invariants
  - active audible video-only tracking invariants
  - URL stripping and YouTube URL minimization invariants
  - Supabase RLS migration invariants
  - logout/refresh auth handling invariants
  - privacy/deletion disclosure phrases

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
- [ ] Add permission justifications from `docs/chrome-web-store.md`.
- [ ] Fill evidence in `docs/release-test-plan.md`.
- [ ] Submit for review.

## Already Working

- [x] Public Supabase key only in extension.
- [x] Supabase RLS enabled and forced for `watch_records`.
- [x] Google sign-in works after redirect URL fix.
- [x] Sync works on another computer.
- [x] Consent screen exists before tracking.
- [x] Delete cloud data button exists in Settings.
- [x] Runtime package script exists.
- [x] `node_modules`, `.env`, PEM, CRX, and Supabase temp files ignored.
