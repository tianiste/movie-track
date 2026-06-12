# MovieTrack GitHub Releases Guide

Use this if you want a free distribution path instead of the Chrome Web Store.

## Maintainer flow

1. Build the extension.
   - `npm run build`
2. Package the release ZIP.
   - `npm run package:webstore`
3. Upload `/tmp/movietrack-webstore.zip` to a GitHub Release.
4. Add release notes with the version number and key changes.

## User install flow

1. Download the ZIP from the GitHub Release.
2. Unzip it to a folder on your computer.
3. Open Chrome and go to `chrome://extensions`.
4. Turn on **Developer mode**.
5. Click **Load unpacked**.
6. Select the unzipped MovieTrack folder.

## Notes

- This is free, but it is manual install rather than one-click Chrome Web Store install.
- Users must repeat the manual update flow when a new release is published.
- Do not include `MovieTrack.pem`, `.env`, or any private keys in the release ZIP.
- The same packaged ZIP can also be used as a release artifact for other browsers that support manual extension loading.
