# Chrome Web Store Submission Notes

Use this file while filling the Chrome Web Store listing and privacy practices.

Official policy cross-check used on June 14, 2026:

- https://developer.chrome.com/docs/webstore/program-policies/user-data-faq
- https://developer.chrome.com/docs/webstore/cws-dashboard-privacy

Important matching points:

- Browsing/video history and Google sign-in count as sensitive user data.
- A privacy policy is required even if data is stored locally.
- Data handling must match the privacy policy, dashboard disclosures, and extension behavior.
- Permissions must be the narrowest set needed for the current user-facing feature.
- User data and browser permissions must be used only for the extension's single purpose.

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

## Chrome Web Store Item

```txt
jkagnflabbhgejkamhdkeeeeigfhjhje
```

OAuth redirect URL:

```txt
https://jkagnflabbhgejkamhdkeeeeigfhjhje.chromiumapp.org/supabase-auth
```

## Single Purpose

MovieTrack tracks video watch progress in the active browser tab when the tab is audible and contains a readable video element, then syncs that progress to the user's account after Google sign-in.

## Permission Justifications

- `tabs`: required to read active tab title, URL, and audible state so MovieTrack can detect candidate watch sessions.
- `storage`: required for local history, privacy consent, tracking settings, optional allowed-site rules, and Supabase session storage.
- `alarms`: required for periodic active-tab checks while the MV3 service worker is running.
- `scripting`: required to read generic `<video>` playback time and resume playback on supported sites.
- `identity`: required for Google/Supabase sign-in.
- Optional `<all_urls>` host access: requested only after the user accepts tracking because MovieTrack works across user-selected video sites rather than one fixed domain list.

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

Limited Use disclosure:

MovieTrack's use of browser permissions and user data is limited to its single purpose: tracking and syncing video watch progress for the user.

## Store Description Draft

MovieTrack is a privacy-conscious watch progress tracker for videos, anime, movies, and YouTube. It helps you keep a simple history of what you watched, where you watched it, and how far you got. MovieTrack works locally by default, can limit tracking to sites you allow, and can optionally sign in with Google to sync your progress through your Supabase account.

## Short Description Draft

Automatically track movies, anime, YouTube videos, and watch progress across devices.

## Reviewer Notes

MovieTrack asks for broad host access only after the user accepts tracking because the extension's core purpose is cross-site video tracking. Tracking is disabled until the user accepts the in-extension privacy disclosure and grants site access. Users can turn on site allowlist mode to limit tracking to chosen domains. A record is created only when the active audible tab exposes a readable `<video>` element and, when allowlist mode is enabled, the active site is allowed. URLs are minimized before storage: hash/query data is removed, and YouTube records keep only the video ID.

Supabase access uses a public publishable key only. Row Level Security is enabled and forced on `watch_records`; each user can only access rows where `user_id = auth.uid()`.
