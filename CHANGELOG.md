# Changelog

All notable changes to MovieTrack are documented here.

## 0.1.0 - Unreleased

### Added

- Manifest V3 extension shell.
- Local-first watch tracking.
- Active audible tab and readable video-element tracking guard.
- Anime, movie, YouTube, and unknown media categorization.
- Season and episode hints.
- Google sign-in through Supabase Auth.
- Supabase watch-record sync with Row Level Security.
- Cloud-to-local sync button.
- Cloud data deletion path.
- Search, date, and category filters.
- JSON export.
- Privacy consent screen.
- Local and public privacy policy pages.
- Chrome Web Store packaging and publish verification scripts.

### Security

- Optional `<all_urls>` host access instead of required install-time host permission.
- URL minimization before storage.
- YouTube URL storage limited to video ID.
- Secret-risk file and package-content checks.
- RLS migrations with owner-scoped policies.
