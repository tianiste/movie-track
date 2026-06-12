# MovieTrack

[![Manifest V3](https://img.shields.io/badge/Chrome%20Extension-MV3-4285F4?logo=googlechrome&logoColor=white)](manifest.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](tsconfig.json)
[![Supabase](https://img.shields.io/badge/Supabase-auth%20%2B%20sync-3ECF8E?logo=supabase&logoColor=white)](supabase/migrations)
[![Privacy First](https://img.shields.io/badge/privacy-local--first-7C3AED)](PRIVACY_POLICY.md)

MovieTrack is a browser extension that remembers what you watched, where you stopped, and syncs that progress to your account.

Streaming progress is fragmented. YouTube has its own history. Anime sites have their own state. Movie sites often remember nothing. Browser history knows pages, but not useful watch progress. MovieTrack exists to make video progress portable without building a full streaming platform account system.

It watches only your active audible tab, detects a readable video element, saves a minimized record locally first, and syncs to Supabase after Google sign-in.

> Current status: early public-ready extension. Core local tracking, Google sign-in, Supabase sync, privacy consent, export, cloud delete, filters, and packaged Web Store verification exist. Chrome Web Store release still needs final store submission steps.

## Screenshots

Add these before public launch:

| Popup history | First-run privacy consent | Cross-device sync |
| --- | --- | --- |
| `docs/screenshots/popup-history.png` | `docs/screenshots/privacy-consent.png` | `docs/screenshots/sync-demo.gif` |

Suggested demo GIF:

1. Play a YouTube/anime/movie video.
2. Open MovieTrack popup.
3. Show watch record, media type, season/episode when detected, and progress.
4. Sign in on another browser profile.
5. Click **Sync cloud** and show same account history.

## Features

- Tracks active audible video tabs only.
- Detects YouTube, anime, movie, and unknown video sessions.
- Reads generic `<video>` playback time when browser site access allows it.
- Saves watch history locally first using `chrome.storage.local`.
- Syncs to Supabase after Google sign-in.
- Uses Supabase Row Level Security so users can access only their own records.
- Trims stored URLs. YouTube records keep only the video ID.
- Shows watch duration, playback progress, category, date, season, and episode hints.
- Supports search, date filter, and category filter.
- Exports filtered history as JSON.
- Opens records with YouTube resume parameters when possible.
- Lets signed-in users sync cloud history down to the current device.
- Lets signed-in users delete cloud data and clear local history.
- Requires explicit privacy consent before tracking starts.
- Requests broad site access only as optional permission after consent.

## Install

### Chrome Web Store

Not published yet. Release checklist lives in [docs/publish-todo.md](docs/publish-todo.md) and [docs/release-test-plan.md](docs/release-test-plan.md).

### Manual Install

1. Download or clone this repository.
2. Install dependencies:

   ```sh
   npm install
   ```

3. Build extension files:

   ```sh
   npm run build
   ```

4. Open `chrome://extensions` or `brave://extensions`.
5. Enable **Developer mode**.
6. Click **Load unpacked**.
7. Select this repository folder.

For GitHub Release distribution, see [docs/github-releases.md](docs/github-releases.md).

## Development

```sh
npm install
npm run typecheck
npm run build
npm run watch
```

Package and verify a Chrome Web Store ZIP:

```sh
npm run verify:publish
```

Output ZIP:

```txt
/tmp/movietrack-webstore.zip
```

## How It Works

MovieTrack is a Manifest V3 extension.

1. The background service worker checks the focused active tab on a heartbeat.
2. Tracking starts only when privacy consent is accepted, site access is granted, tracking is enabled, the tab is audible, and a readable `<video>` element exists.
3. The extension infers media type from URL, hostname, and title patterns.
4. Watch records are written locally first.
5. If signed in, pending records sync to Supabase through the REST API using the user's Supabase Auth token.
6. Supabase RLS restricts `watch_records` rows to `auth.uid() = user_id`.
7. The popup renders local/cloud history, sync status, filters, export, clear, sign-in, sign-out, and delete actions.

Core files:

- [manifest.json](manifest.json) defines MV3 permissions and extension entry points.
- [src/background.ts](src/background.ts) tracks sessions, auth, sync, URL minimization, and resume behavior.
- [src/popup.ts](src/popup.ts) renders history, filters, consent, auth, export, and cloud actions.
- [supabase/migrations](supabase/migrations) defines `watch_records` and RLS.
- [scripts/verify-publish-ready.js](scripts/verify-publish-ready.js) checks publish/security invariants.

## Supabase Setup

MovieTrack uses Supabase as the only backend:

- Supabase Auth for Google login.
- Supabase Postgres for cloud watch records.
- RLS for per-user access control.

Apply migrations:

```sh
supabase link --project-ref wyeqtsnjlxixbpnkimmo
supabase db push
```

In Supabase Dashboard:

1. Enable Google provider under **Authentication > Providers**.
2. Add extension redirect URL:

   ```txt
   https://lgocadpaahlplfilfmacphcfkfghfihl.chromiumapp.org/supabase-auth
   ```

3. Keep Google OAuth client secret and database credentials out of the extension.

Only public config belongs in [src/config.ts](src/config.ts):

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Never add a Supabase `service_role` key, database URL, Google client secret, `.env`, PEM, or CRX signing key to this repository.

## Privacy

MovieTrack handles sensitive watch-history data, so privacy is a product feature, not an afterthought.

MovieTrack collects:

- trimmed page URL
- hostname
- page/video title
- media category
- watch duration
- playback position
- video duration when available
- start/end timestamps
- Supabase user ID after Google sign-in

MovieTrack does not collect:

- passwords
- cookies
- form data
- screenshots
- payment data
- full page content
- inactive tab history
- audio-only playback

Records stay local while signed out. Signed-in records sync over HTTPS to Supabase. Users can clear local data or delete synced cloud data from the popup.

Read the full policy in [PRIVACY_POLICY.md](PRIVACY_POLICY.md). Public HTML policy lives in [docs/privacy.html](docs/privacy.html).

## Roadmap

- Publish first Chrome Web Store release.
- Add real screenshots and a short sync demo GIF.
- Add GitHub issue templates and contribution docs.
- Add automated tests for media inference and record merging.
- Add import from exported JSON.
- Improve season/episode parsing for more streaming site URL formats.
- Add optional site allowlist mode for users who do not want all-site access.
- Add Firefox/Edge install notes after manual compatibility testing.
- Add release automation for tagged ZIP builds.

## Contributing

Contributions are welcome, especially around site detection, privacy hardening, tests, and documentation.

Before opening a pull request:

```sh
npm install
npm run typecheck
npm run verify:publish
```

Keep changes scoped. Do not commit generated packages, secrets, browser signing keys, `.env` files, or `node_modules`.

Good first issues:

- Add tests for `inferMedia` edge cases.
- Improve anime/movie title cleanup.
- Add screenshot assets.
- Add issue and pull request templates.
- Split cloud sync helpers into a smaller module.

## FAQ

### Does MovieTrack need a custom backend?

No. Current sync uses Supabase Auth, Supabase Postgres, and RLS. The extension is a public client, so secrets must stay in Supabase/Google dashboards, not in extension code.

### Is the Supabase key in the extension secret?

No. `SUPABASE_PUBLISHABLE_KEY` is public. Security comes from Auth tokens plus RLS policies. Never put `service_role` or database credentials in the extension.

### Why does MovieTrack ask for broad site access?

Its purpose is to track videos across arbitrary sites. The permission is optional and requested only after consent. Tracking still requires an active audible tab and a readable video element.

### Does it track every page I visit?

No. A record is saved only for active audible tabs with video playback data and at least 5 seconds of watch time.

### Can I use it without signing in?

Yes. It works locally while signed out. Sign in with Google only if you want cloud sync across devices.

### Can I delete my data?

Yes. Use **Clear** for local history and **Delete cloud data** after sign-in for synced records.

### Does it support Brave?

Yes for manual development installs. Open `brave://extensions`, enable Developer mode, then load the unpacked folder.

### Where is the release checklist?

Use [docs/publish-todo.md](docs/publish-todo.md), [docs/chrome-web-store.md](docs/chrome-web-store.md), [docs/publishing-security.md](docs/publishing-security.md), and [docs/release-test-plan.md](docs/release-test-plan.md).

## Star The Project

If MovieTrack solves a problem you have, star the repo. It helps future users find it and makes it easier to prioritize browser support, site detection fixes, and release polish.
