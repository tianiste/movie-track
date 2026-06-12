# MovieTrack Publish TODO

Remaining work before marking Chrome Web Store publication readiness complete.

## Required Manual Verification

- [ ] Host the privacy policy at a public URL.
  - Use the content from `PRIVACY_POLICY.md`.
  - Add the public URL in Chrome Web Store Developer Dashboard.
  - Make sure the store listing privacy disclosures match the policy.

- [ ] Verify two-user RLS isolation.
  - Sign in with Google account A.
  - Watch a video for 10+ seconds.
  - Confirm account A sees its row in MovieTrack.
  - Sign in with Google account B in another browser profile.
  - Confirm account B cannot see account A's records.
  - Watch a video as account B.
  - Confirm Supabase `watch_records` contains separate `user_id` values.

- [ ] Test logout behavior.
  - Sign in.
  - Confirm records sync.
  - Click Sign out.
  - Confirm popup returns to signed-out state.
  - Confirm local-only behavior still works after sign-out.

- [ ] Test token expiry/refresh behavior.
  - Leave extension signed in long enough for token refresh path to run, or manually invalidate session.
  - Open popup.
  - Confirm auth status and sync fail gracefully.
  - Confirm pending records remain local and are not lost.

- [ ] Test fresh packaged install.
  - Build with `npm run build`.
  - Package only runtime files, not repo root.
  - Load packaged build in a clean Chrome/Chromium profile.
  - Confirm extension ID is:
    ```txt
    lgocadpaahlplfilfmacphcfkfghfihl
    ```
  - Confirm first-run consent appears before tracking starts.
  - Confirm Google login works.
  - Confirm YouTube/video tracking syncs.

## Supabase / Security Follow-Up

- [ ] Decide final handling for Supabase GraphQL advisor warning.
  - Current state is documented accepted risk in `PUBLISHING_SECURITY.md`.
  - Warning:
    ```txt
    pg_graphql_authenticated_table_exposed
    ```
  - Acceptable because RLS is enabled + forced and rows are owner-scoped.
  - If Chrome review or security preference requires no warning, disable GraphQL exposure at Supabase project/API level or move the public REST shape to a dedicated exposed schema.

- [ ] Enable leaked password protection if email/password auth is ever enabled.
  - Supabase advisor currently warns this is disabled.
  - Low priority for Google-only login.

- [ ] Re-run Supabase advisors before final submission:
  ```sh
  supabase db advisors --linked --level warn --fail-on error
  ```

## Chrome Web Store Listing

- [ ] Fill Chrome Web Store privacy practices.
  - Disclose website content / browsing activity.
  - Disclose authentication/session data.
  - State data is used for watch history and cross-device sync only.
  - State data is not sold, not used for ads, and not transferred for marketing.

- [ ] Add permission justification.
  - `tabs`: read active tab URL/title/audible state.
  - `storage`: save local records, consent flag, settings, and session.
  - `alarms`: periodic active-tab heartbeat.
  - `scripting`: read generic video playback time and resume playback.
  - `identity`: Google/Supabase sign-in.
  - `<all_urls>`: support video tracking across user-selected video sites.

- [ ] Upload final package ZIP.
  - Do not include:
    - `node_modules/`
    - `.env`
    - `MovieTrack.pem`
    - `MovieTrack.crx`
    - `supabase/.temp/`
    - source maps
    - repo docs/checklists
    - private keys or secrets

## Final Local Checks

- [ ] Confirm no secrets are tracked:
  ```sh
  git ls-files | rg 'node_modules|MovieTrack\.pem|\.pem$|\.env|\.crx$|supabase/.temp'
  ```

- [ ] Confirm no private secrets in source/package:
  ```sh
  rg 'service_role|sb_secret|SUPABASE_SERVICE|SUPABASE_SECRET|GOOGLE_CLIENT_SECRET|client_secret|DATABASE_URL|postgres://|BEGIN PRIVATE|PRIVATE KEY' . --glob '!node_modules/**'
  ```

- [ ] Run extension checks:
  ```sh
  npm run typecheck
  npm run build
  ```

- [ ] Build final Web Store ZIP:
  ```sh
  npm run package:webstore
  ```

- [ ] Inspect ZIP contents:
  ```sh
  unzip -l /tmp/movietrack-webstore.zip
  ```
