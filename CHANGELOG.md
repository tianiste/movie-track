# Changelog

All notable changes to MovieTrack are documented here.

## 0.1.5 - 2026-06-15

### Added

- Continue, Finished, and All status filters in the popup and Library.
- Manual watch status controls to move records between Continue and Finished.
- Episode-only grouping for shows without seasons.
- Popup record editing controls.

### Changed

- Current active watch sessions are saved while watching, so records appear sooner.
- Popup and Library history render with pagination for better performance.
- Title cleanup handles site-prefixed pages like AnimeSalt.
- Duplicate watch records merge more accurately.

### Fixed

- Restored cloud history fallback when local history is empty.
- Fixed GitHub/manual package builds so they keep a stable extension ID.
- Fixed AnimeSalt title detection for pages like `AnimeSalt - Monster Eater Watch Anime Online`.

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
