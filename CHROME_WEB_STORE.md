# Chrome Web Store Submission Notes

Use this file while filling the Chrome Web Store listing and privacy practices.

## Privacy Policy URL

Host `PRIVACY_POLICY.md` as a public web page. Use that public URL in the Developer Dashboard.

Do not use a local file URL or GitHub private repo URL.

Prepared public-hostable page:

```txt
docs/privacy.html
```

If GitHub Pages is enabled for this repo from the `main` branch `/docs` folder, use:

```txt
https://tianiste.github.io/movie-track/privacy.html
```

## Single Purpose

MovieTrack tracks video watch progress in the active browser tab when the tab is audible and contains a readable video element, then syncs that progress to the user's account after Google sign-in.

## Permission Justifications

- `tabs`: required to read active tab title, URL, and audible state so MovieTrack can detect candidate watch sessions.
- `storage`: required for local history, privacy consent, tracking settings, and Supabase session storage.
- `alarms`: required for periodic active-tab checks while the MV3 service worker is running.
- `scripting`: required to read generic `<video>` playback time and resume playback on supported sites.
- `identity`: required for Google/Supabase sign-in.
- `<all_urls>`: required because MovieTrack works across user-selected video sites rather than one fixed domain list.

## Privacy Practices Answers

Data collected:

- Website content / browsing activity: yes.
- Authentication information: yes.
- Personally identifiable information: only Google account email/user ID from Supabase Auth.
- Financial/payment data: no.
- Health information: no.
- Personal communications: no.
- Location: no.

Data usage:

- App functionality: yes.
- Analytics: no.
- Advertising: no.
- Developer communications: no.
- Personalization outside watch progress: no.

Data sale/transfer:

- Data is not sold.
- Data is not used for ads.
- Data is not transferred for marketing.
- Data is processed by Supabase for authentication and database sync.

## Store Description Draft

MovieTrack saves your movie, anime, and video watch progress across sites. It records watch time only from the active audible tab with a readable video element, keeps history locally first, and syncs to your account after Google sign-in.

## Short Description Draft

Track movie, anime, and video watch progress across sites with optional Google account sync.

## Reviewer Notes

MovieTrack asks for broad host access because the extension's core purpose is cross-site video tracking. Tracking is disabled until the user accepts the in-extension privacy disclosure. A record is created only when the active audible tab exposes a readable `<video>` element. URLs are minimized before storage: hash/query data is removed, and YouTube records keep only the video ID.

Supabase access uses a public publishable key only. Row Level Security is enabled and forced on `watch_records`; each user can only access rows where `user_id = auth.uid()`.
