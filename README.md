# MovieTrack Chrome Extension

Tracks what you watch using tab metadata (page title + URL) for anime/movie pages across different sites.

## What it does

- Runs in the background and watches the active tab.
- Detects likely anime/movie sessions based on URL + title patterns.
- Stores watch records locally (`chrome.storage.local`).
- Shows records in popup UI.
- Lets you export records as JSON.

## Install (Developer mode)

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder (`MovieTrack`).

## Notes

- This tracks tab metadata only (no video player access, no page scraping).
- It logs a record after at least ~20 seconds of watch time.
- Data stays on your machine unless you export it.
