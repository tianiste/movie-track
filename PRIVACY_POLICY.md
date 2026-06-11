# MovieTrack Privacy Policy

Last updated: June 12, 2026

MovieTrack records watch progress for videos you play in your active browser tab.

## Data Collected

- Trimmed page URL
- Site hostname
- Page/video title
- Media category: anime, movie, or unknown
- Watch duration
- Playback position
- Video duration when available
- Start and end timestamps
- Supabase user ID after Google sign-in

MovieTrack does not collect passwords, cookies, form data, screenshots, payment data, full page content, or data from inactive tabs. URLs are trimmed before saving to reduce query parameters, fragments, and tracking data.

## Use

MovieTrack uses this data only to show watch history, resume progress, and sync progress across devices for the signed-in user.

MovieTrack does not sell data, use data for ads, or transfer data for marketing.

## Storage

Records are saved locally in Chrome extension storage first. After Google sign-in, records sync to Supabase over HTTPS. Supabase Row Level Security restricts each user to their own records.

## Deletion

Use **Delete cloud data** in the popup to delete synced watch records and clear local history. Use **Clear** while signed out to clear local-only history.

For account deletion beyond watch-record deletion, contact the publisher through the Chrome Web Store support channel.

## Permissions

MovieTrack uses broad host access because its purpose is to track watch progress across video sites. The extension uses tab metadata and generic video element playback time only when tracking is enabled and consent has been accepted.
