# Contributing

Thanks for improving MovieTrack. Keep contributions focused on watch tracking, privacy, sync reliability, browser compatibility, and documentation.

## Setup

```bash
npm install
npm run typecheck
npm run build
```

Load the extension from this folder in `chrome://extensions` or `brave://extensions` with Developer mode enabled.

## Before A Pull Request

Run:

```bash
npm run verify:publish
```

This checks TypeScript, Web Store packaging, secret-risk files, manifest permissions, privacy guards, auth/session handling, URL minimization, and Supabase RLS invariants.

## Code Rules

- Keep the extension local-first. Tracking must work while signed out or offline.
- Never add a custom backend unless there is a clear product need.
- Never commit `.env`, PEM files, CRX files, database URLs, Google client secrets, Supabase `service_role` keys, or private API keys.
- Public Supabase URL and publishable key are allowed in `src/config.ts`.
- Keep RLS policies owner-scoped with `auth.uid() = user_id`.
- Prefer small typed functions over large untyped object manipulation.
- Keep browser permissions as narrow as the feature allows.

## Good First Contributions

- Add tests for media detection and URL cleanup.
- Improve anime/movie title parsing.
- Add screenshots and a short demo GIF.
- Improve docs for Chrome, Brave, Edge, and Firefox compatibility.
- Split background sync/auth/tracking code into smaller modules.

## Commit Style

Use short conventional commits:

```txt
feat: add site filter
fix: detect iframe videos
docs: update privacy notes
chore: verify package
```

## Pull Request Checklist

- Explain what changed and why.
- Include screenshots for popup UI changes.
- Confirm `npm run verify:publish` passes.
- Mention any new permissions or data collection changes.
- Update `README.md`, `PRIVACY_POLICY.md`, and `docs/chrome-web-store.md` if behavior changes.
