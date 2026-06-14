# Changelog

All notable changes to MovieTrack are documented here.

## 0.1.4 - 2026-06-14

### Fixed

- Removed the local development `key` field from `manifest.json` so Chrome Web Store accepts the package upload.
- Added publish checks to reject future Web Store packages that include `manifest.key`.

## 0.1.3 - 2026-06-14

### Added

- Delete buttons for individual records directly in the popup.
- Separate popup group delete action for deleting grouped episode records.
- Paginated popup and Library history rendering with load-more controls.

### Changed

- Collapsed popup and Library groups now render episode rows lazily for faster large histories.

## 0.1.2 - 2026-06-13

### Added

- Full Library page with editable records and groups.
- Collapsible season/group views in popup and Library.
- Custom Library groups with drag-and-drop moves.
- Drag auto-scroll for long Library pages.
- GitHub Release packaging workflow for `movietrack.zip`.

### Fixed

- Improved anime/YouTube recognition and season/episode display.
- Fixed dragging records into auto-generated groups.
- Allowed empty custom groups to be deleted.

## 0.1.1 - 2026-06-13

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
