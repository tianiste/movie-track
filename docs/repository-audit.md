# MovieTrack Repository Audit

Date: June 12, 2026

Scope reviewed:

- All tracked repository files from `git ls-files`.
- Repo-owned untracked files before cleanup: `GITHUB_RELEASES.md`, `builds/movietrack-webstore.zip`, `supabase/.temp/cli-latest`.
- Ignored vendor/install output: `node_modules/`.
- Binary icon assets by file type, dimensions, and role.
- Generated `dist/*` files as TypeScript build output mapped back to `src/*`.

## Current Project

MovieTrack is a Manifest V3 Chrome-compatible extension. It tracks watch sessions from active audible tabs with readable video elements, stores records locally first, and syncs signed-in user records to Supabase.

Already made:

- MV3 extension manifest.
- Popup UI.
- Background tracking service worker.
- Google/Supabase Auth flow.
- Local-first watch history.
- Supabase sync and cloud-to-local sync.
- RLS-backed `watch_records` table.
- Privacy policy and local hosted HTML policy.
- Chrome Web Store notes and publish verifier.
- Web Store ZIP packaging script.
- Search, date, and category filters.
- Anime/movie/YouTube detection.
- Season/episode display.

## File Review

Keep:

- `.gitignore` - protects `node_modules`, `.env`, PEM, key, CRX, and Supabase temp files.
- `manifest.json` - required extension metadata and permissions.
- `package.json` - build, package, and verify scripts.
- `package-lock.json` - reproducible install.
- `tsconfig.json` - strict TypeScript compile config.
- `src/background.ts` - core tracking/auth/sync logic.
- `src/popup.ts` - popup UI logic.
- `src/types.ts` - shared types.
- `src/config.ts` - public Supabase config only.
- `popup.html` - extension popup markup.
- `popup.css` - extension popup styling.
- `icons/*.png` - required extension icons.
- `supabase/migrations/*.sql` - production schema and RLS history.
- `supabase/config.toml` - Supabase CLI local development config.
- `scripts/verify-publish-ready.js` - high-value publish/security invariant checker.
- `scripts/verify-webstore-package.js` - ZIP content and secret scanner.
- `PRIVACY_POLICY.md` - required privacy disclosure source.
- `privacy.html` - local in-extension privacy page.
- `docs/privacy.html` - public GitHub Pages privacy page.
- `docs/chrome-web-store.md` - listing/privacy answer source.
- `docs/publishing-security.md` - permission/RLS risk notes.
- `docs/release-test-plan.md` - manual release evidence checklist.
- `docs/publish-todo.md` - current publish-readiness checklist.
- `docs/github-releases.md` - useful alternate distribution guide.

Conditional keep:

- `dist/background.js`, `dist/config.js`, `dist/popup.js`, `dist/types.js` - runtime output required by unpacked extension after build. Keep if repo should be loadable without running build. Otherwise remove from git and rely on `npm run build`.
- `dist/*.map` - source maps. Useful for debugging, not needed in repo or Web Store package. Prefer delete from git and ignore.
- `docs/archive/supabase-only-plan.md` - historical implementation plan. Useful only as archive because implementation exists.

Delete or ignore:

- `builds/movietrack-webstore.zip` - generated release artifact, untracked. Do not commit. Prefer ignore `builds/`.
- `supabase/.temp/cli-latest` - generated Supabase CLI temp file, ignored. Do not commit.
- `node_modules/` - third-party install output, ignored. Do not commit.
- Any parent-folder `MovieTrack.pem` / `.crx` - private signing/local package files. Must never be committed.

## File Deletion List

Recommended now:

```txt
supabase/.temp/cli-latest
```

Recommended git cleanup later:

```txt
dist/background.js.map
dist/config.js.map
dist/popup.js.map
dist/types.js.map
```

Optional after docs consolidation:

```txt
docs/archive/supabase-only-plan.md
```

Do not delete unless build workflow changes:

```txt
dist/background.js
dist/config.js
dist/popup.js
dist/types.js
```

## Cleanup Plan

1. Keep `builds/` and `*.zip` ignored.
2. Keep final ZIP in `/tmp` or GitHub Releases.
3. Decide generated-file policy:
   - option A: keep `dist/*.js`, delete `dist/*.map`
   - option B: ignore all `dist/`, require `npm run build` before loading extension
4. Move old planning docs into `docs/archive/` or delete once README/CONTRIBUTING cover setup.
5. Add missing OSS files listed below.
6. Add screenshots under `docs/screenshots/`.
7. Add tests before bigger refactors.

## Structure Review

Current structure is workable for a small MV3 extension, but docs and generated files are mixed at root.

Recommended structure:

```txt
.
├── README.md
├── LICENSE
├── CONTRIBUTING.md
├── SECURITY.md
├── CHANGELOG.md
├── CODE_OF_CONDUCT.md
├── manifest.json
├── popup.html
├── popup.css
├── privacy.html
├── package.json
├── package-lock.json
├── tsconfig.json
├── src/
│   ├── background.ts
│   ├── config.ts
│   ├── popup.ts
│   └── types.ts
├── dist/
│   ├── background.js
│   ├── config.js
│   ├── popup.js
│   └── types.js
├── icons/
├── docs/
│   ├── privacy.html
│   ├── screenshots/
│   ├── chrome-web-store.md
│   ├── publishing-security.md
│   ├── publish-todo.md
│   ├── release-test-plan.md
│   └── repository-audit.md
├── scripts/
│   ├── verify-publish-ready.js
│   └── verify-webstore-package.js
├── supabase/
│   ├── config.toml
│   └── migrations/
└── .github/
    ├── ISSUE_TEMPLATE/
    └── pull_request_template.md
```

## Missing Open Source Files

Add:

- `LICENSE` - added MIT license.
- `CONTRIBUTING.md` - added setup, build, verification, PR style, no-secrets rule.
- `SECURITY.md` - added vulnerability reporting and sensitive data scope.
- `CHANGELOG.md` - added release history starting at `0.1.0`.
- `CODE_OF_CONDUCT.md` - standard contributor expectations.
- `.github/ISSUE_TEMPLATE/bug_report.yml`
- `.github/ISSUE_TEMPLATE/feature_request.yml`
- `.github/pull_request_template.md`
- `docs/screenshots/` - popup/history/consent/sync images.
- Basic tests for title/media inference and record merge logic.

Improve `.gitignore`:

```gitignore
builds/
*.zip
dist/*.map
```

Add `dist/` only if you decide generated JS should not be tracked.

## User View

Why user installs:

- Solves fragmented watch progress across sites.
- Works locally without account.
- Sync is optional.
- Clear privacy disclosure.
- Delete/export controls exist.

Blockers for user trust:

- Needs screenshots.
- Needs published Web Store link.
- Needs clear license.
- Needs visible support/security contact.

## Contributor View

Why contributor helps:

- Small TypeScript codebase.
- Clear problem.
- Easy site-detection improvements.
- Supabase schema is simple.

Contributor blockers:

- No CONTRIBUTING.
- No tests.
- Generated `dist/` adds diff noise.
- Core `background.ts` is large; sync/auth/tracking could be split later.

## GitHub Visitor View

Why visitor stars:

- Clear "portable watch progress" problem.
- Privacy-first architecture.
- Supabase-only backend, cheap to run.
- Usable early product.

What improves stars:

- Strong README hero section.
- Screenshots/GIF.
- Chrome Web Store link.
- Topics and description.
- Good first issues.
- Clean release notes.

## Marketing Review

Repository description:

```txt
Chrome extension that tracks movie, anime, and YouTube watch progress across sites with local-first storage and optional Supabase sync.
```

GitHub topics:

```txt
chrome-extension
manifest-v3
typescript
supabase
watch-progress
movie-tracker
anime-tracker
youtube
privacy
local-first
browser-extension
google-auth
rls
open-source
```

Best screenshots:

- First-run consent screen.
- Popup with mixed anime/movie/YouTube records.
- Filters drawer with search/date/category.
- Signed-in sync state.
- Delete/export controls.
- Supabase row-level security diagram, optional for developer docs.

Logo idea:

- Purple clapperboard + progress ring.
- Simple enough for 16px icon.
- Avoid text in icon.

Adoption improvements:

- Publish Chrome Web Store listing.
- Add one short GIF in README.
- Add "works without account" near top.
- Add exact privacy claims near top.
- Add "No custom backend required" developer note.
- Add issues labeled `good first issue`.

## Publish Readiness

Code looks close for technical publish readiness. Remaining public-release work is mostly evidence and repo presentation:

- Complete two-user RLS evidence.
- Finish Chrome Web Store dashboard submission.
- Add license.
- Add screenshots/GIF.
- Remove/ignore generated ZIP.
- Decide source-map tracking.

Do not publish as polished open source until license, screenshots, and contribution/security docs exist.
