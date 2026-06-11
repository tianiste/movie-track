# MovieTrack Chrome Extension

Tracks what you watch using tab metadata (page title + URL) for anime/movie pages across different sites.

## What it does

- Runs in the background and watches the active tab.
- Detects likely anime/movie sessions based on URL + title patterns.
- Stores watch records locally (`chrome.storage.local`) first.
- Syncs records to Supabase when signed in.
- Shows records in popup UI.
- Lets you export records as JSON.

## TypeScript workflow

Chrome extensions still run JavaScript, so TypeScript is compiled into `dist/background.js` and `dist/popup.js`.

1. Install dependencies:
	- `npm install`
2. Build once:
	- `npm run build`
3. Or watch mode while developing:
	- `npm run watch`

TypeScript sources live in `src/background.ts` and `src/popup.ts`.

## Install (Developer mode)

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder (`MovieTrack`).
5. After TypeScript changes, run `npm run build` and click **Reload** on the extension card.

## Notes

- This tracks tab metadata plus generic `<video>` playback time when script injection is allowed.
- It logs a record after at least 10 seconds of watch time.
- Data stays local while signed out, then syncs to the user's Supabase account after Google login.

## Supabase Auth + Sync

The popup includes **Sign in with Google** and stores a Supabase session in `chrome.storage.local`.
Watch history is synced through Supabase Data API with Row Level Security.

1. Open `src/config.ts`.
2. Set only public config:
	- `SUPABASE_URL`
	- `SUPABASE_PUBLISHABLE_KEY`
3. Apply Supabase migrations:
	- `supabase link --project-ref wyeqtsnjlxixbpnkimmo`
	- `supabase db push`
4. In Supabase Dashboard:
	- Enable Google provider in **Authentication > Providers**.
	- Add this redirect URL in **Authentication > URL Configuration**:
		- `https://<your-extension-id>.chromiumapp.org/supabase-auth`
5. Build and reload extension.

Important:

- Never put a Supabase `service_role` key in the extension.
- Never put DB passwords or Google client secrets in the extension.
- User data security depends on RLS policies in `supabase/migrations`.
- No custom backend is required for current account sync.
