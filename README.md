# MovieTrack Chrome Extension

Tracks what you watch using tab metadata (page title + URL) for anime/movie pages across different sites.

## What it does

- Runs in the background and watches the active tab.
- Detects likely anime/movie sessions based on URL + title patterns.
- Stores watch records locally (`chrome.storage.local`).
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

- This tracks tab metadata only (no video player access, no page scraping).
- It logs a record after at least ~20 seconds of watch time.
- Data stays on your machine unless you export it.
