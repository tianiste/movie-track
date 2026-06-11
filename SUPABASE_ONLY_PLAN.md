# MovieTrack Supabase-Only Implementation Plan

Goal: Chrome extension tracks movies/anime/videos locally, syncs to Supabase per Google user, no custom backend.

Core rule: extension is public client. Never place DB password, Supabase `service_role`, Google client secret, or private API key in extension.

## Codex Goal Prompt

Use this goal text:

```txt
Implement MovieTrack Supabase-only account sync using SUPABASE_ONLY_PLAN.md. First add/login Supabase MCP for project_ref=wyeqtsnjlxixbpnkimmo, then use Supabase CLI/MCP to create schema + RLS. No custom backend. Keep extension local-first, sync watch records to Supabase after Google login, no secrets in extension except public Supabase URL/publishable key. Use existing MV3 TypeScript style, write readable typed code, run typecheck/build, commit/push in small parts with short messages like "feat: added supabase schema", "feat: added cloud sync". Use relevant Supabase/extension skills if available; otherwise follow this plan exactly.
```

## Target Stack

- Extension: existing Manifest V3 + TypeScript.
- Auth: Supabase Auth with Google OAuth.
- DB: Supabase Postgres.
- Security: Supabase Row Level Security.
- CLI: Supabase CLI for migrations and local dev.
- Local cache: `chrome.storage.local`.
- Cloud source: Supabase table `watch_records`.

## Final Data Flow

```txt
video plays
  -> background.ts detects audible tab
  -> creates/updates local WatchRecord
  -> if signed in, upsert record to Supabase
  -> popup loads local cache fast
  -> popup syncs with Supabase when signed in
```

Offline behavior:

```txt
not signed in/offline
  -> save local record with syncStatus="pending"
sign in/network back
  -> upload pending records
  -> mark syncStatus="synced"
```

## Supabase CLI Setup

Project ref:

```txt
wyeqtsnjlxixbpnkimmo
```

Add Supabase MCP server to Codex:

```sh
codex mcp add supabase --url https://mcp.supabase.com/mcp?project_ref=wyeqtsnjlxixbpnkimmo
```

Authenticate MCP:

```sh
codex mcp login supabase
```

Verify in Codex:

```txt
/mcp
```

Optional Supabase agent skills:

```sh
npx skills add supabase/agent-skills
```

If Supabase skill appears after install, use it for schema, RLS, migrations, and client code. If not available, continue with this file.

Install/login once:

```sh
npm install -g supabase
supabase login
```

From repo root:

```sh
supabase init
supabase link --project-ref wyeqtsnjlxixbpnkimmo
supabase db pull
```

Create migration:

```sh
supabase migration new create_watch_records
```

Apply remote:

```sh
supabase db push
```

Optional local dev:

```sh
supabase start
supabase db reset
```

## Supabase Auth Setup

In Supabase Dashboard:

1. Enable Google provider: `Authentication > Providers > Google`.
2. Add Chrome extension redirect:

```txt
https://lgocadpaahlplfilfmacphcfkfghfihl.chromiumapp.org/supabase-auth
```

3. Keep Google OAuth client secret only in Supabase Dashboard/Google Cloud, never extension.
4. Keep extension ID stable with manifest public `key`:

```txt
lgocadpaahlplfilfmacphcfkfghfihl
```

5. Keep extension config public-only:

```ts
const SUPABASE_URL = 'https://<project-ref>.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = '<public-publishable-key>';
```

## DB Migration

Create table:

```sql
create table public.watch_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_record_id text not null,
  url text not null,
  hostname text not null,
  raw_title text not null,
  title text not null,
  media_type text not null check (media_type in ('anime', 'movie', 'unknown')),
  season integer,
  episode integer,
  confidence integer not null default 0,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_sec integer not null default 0 check (duration_sec >= 0),
  last_playback_time integer,
  video_duration_sec integer,
  identity_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, identity_key)
);
```

Indexes:

```sql
create index watch_records_user_started_idx
  on public.watch_records (user_id, started_at desc);

create index watch_records_user_media_idx
  on public.watch_records (user_id, media_type);
```

Updated timestamp trigger:

```sql
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger watch_records_set_updated_at
before update on public.watch_records
for each row
execute function public.set_updated_at();
```

Enable RLS:

```sql
alter table public.watch_records enable row level security;
```

Policies:

```sql
create policy "watch_records_select_own"
on public.watch_records
for select
using (auth.uid() = user_id);

create policy "watch_records_insert_own"
on public.watch_records
for insert
with check (auth.uid() = user_id);

create policy "watch_records_update_own"
on public.watch_records
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "watch_records_delete_own"
on public.watch_records
for delete
using (auth.uid() = user_id);
```

Grant:

```sql
grant select, insert, update, delete
on public.watch_records
to authenticated;
```

## Extension Code Changes

### 1. Install Supabase Client

In `extension/`:

```sh
npm install @supabase/supabase-js
```

Keep `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in one file:

```txt
extension/src/config.ts
```

Only public config allowed.

### 2. Add Shared Types

Create:

```txt
extension/src/types.ts
```

Move `WatchRecord`, `AuthUser`, `AuthSession`, `MediaType` there.

Add:

```ts
type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';
```

Extend local record:

```ts
syncStatus?: SyncStatus;
syncError?: string;
cloudId?: string;
updatedAt?: number;
identityKey?: string;
```

### 3. Add Supabase Client Module

Create:

```txt
extension/src/supabase.ts
```

Responsibilities:

- create Supabase client with public publishable key
- set session from stored access/refresh token
- fetch current user
- select watch records
- upsert watch records
- delete watch records

No service role. No DB password.

### 4. Improve Record Identity

Keep existing `getRecordIdentity`.

Store result as `identityKey`.

Rules:

- YouTube: `youtube|<video-id>`
- Known anime/movie: `<mediaType>|<normalized-title>|<season>|<episode>`
- Unknown: `<mediaType>|<normalized-title>|<season>|<episode>|<hostname>`

This prevents duplicate rows across devices.

### 5. Save Local First

Change `saveRecord`:

1. validate duration >= `MIN_DURATION_SEC`
2. compute `identityKey`
3. merge into local history
4. mark as `pending`
5. write `chrome.storage.local`
6. call `syncPendingRecords` if signed in

Never block tracking on network.

### 6. Cloud Upsert Logic

Upsert by:

```txt
user_id + identity_key
```

Cloud merge rules:

- `started_at`: min
- `ended_at`: max
- `duration_sec`: max or accumulated carefully; prefer max for same identity to avoid double-count across devices
- `last_playback_time`: max
- `video_duration_sec`: max non-null
- `title`: longest useful title
- `url`: latest URL
- `confidence`: max

Use RPC if SQL merge gets complex. Otherwise select existing then update.

Best first version: extension-side merge:

```txt
select existing row by identity_key
if exists -> merge + update
else -> insert
```

### 7. Sync Pending Records

Add message:

```ts
{ type: 'syncNow' }
```

Background handler:

1. get valid Supabase session
2. get local records
3. find `pending` or `failed`
4. upload one-by-one or small batches
5. mark synced
6. store result

Use retry-safe behavior:

- network fail -> `failed`
- auth fail -> keep `pending`
- RLS fail -> show clear error

### 8. Load Cloud Records

On popup open:

1. render local records immediately
2. ask background `syncNow`
3. ask background `getHistory`
4. render merged local/cloud records

Background `getHistory`:

- if signed out: local only
- if signed in: fetch cloud, merge into local, return merged

### 9. Clear Behavior

Current clear only local. Decide UX:

- signed out: clear local only
- signed in: confirm "Clear cloud and local history?"

Implement:

```ts
{ type: 'clearHistory', scope: 'local' | 'cloudAndLocal' }
```

Default signed-in behavior: cloud + local, because user expects account history gone.

### 10. Popup UI

Add small sync state text:

```txt
Synced
Sync pending
Sync failed
Signed out: local only
```

Do not spam UI. One status line enough.

## Security Checklist

- No `service_role` key in extension.
- No DB password in extension.
- No Google client secret in extension.
- RLS enabled before production data.
- All policies use `auth.uid() = user_id`.
- Extension inserts `user_id` from authenticated user only.
- Validate `media_type`.
- Validate duration non-negative.
- Never trust client data for shared/public features.
- Keep host permissions broad only if product needs any-site tracking.

## Testing Checklist

Manual extension tests:

1. Load unpacked extension.
2. Sign out.
3. Play YouTube 20+ seconds.
4. Confirm local record appears.
5. Sign in with Google.
6. Confirm pending local record syncs to Supabase.
7. Reload extension.
8. Confirm cloud record appears.
9. Install extension in another Chrome profile.
10. Sign in same Google account.
11. Confirm same record appears.
12. Watch same video more.
13. Confirm record updates, not duplicates.
14. Clear history signed in.
15. Confirm local + Supabase row deleted.

CLI checks:

```sh
cd extension
npm run typecheck
npm run build
```

Supabase checks:

```sh
supabase db push
supabase db lint
```

RLS verification:

- anon signed out cannot read rows
- user A cannot read user B rows
- user A can insert only own `user_id`

## Commit / Push Plan

Use small commits. Push after each stable chunk.

Commit style should match repo history: short, `feat:` prefix.

Part 1:

```sh
git add supabase
git commit -m "feat: added supabase schema"
git push
```

Part 2:

```sh
git add extension/src/config.ts extension/src/types.ts extension/package.json extension/package-lock.json
git commit -m "feat: added supabase client setup"
git push
```

Part 3:

```sh
git add extension/src/background.ts extension/dist/background.js extension/dist/background.js.map
git commit -m "feat: added cloud sync"
git push
```

Part 4:

```sh
git add extension/src/popup.ts extension/popup.html extension/popup.css extension/dist/popup.js extension/dist/popup.js.map
git commit -m "feat: added sync status"
git push
```

Part 5:

```sh
git add extension/README.md SUPABASE_ONLY_PLAN.md
git commit -m "feat: added supabase setup docs"
git push
```

If generated `dist/` is committed in this repo, always run build before commit. If not, remove `dist/` from commit plan.

## Cheap Token / Safe Code Rules

- Keep one plan file: this file.
- Ask agent to implement one part per prompt.
- Use focused prompts: "Implement Part 1 only."
- Run typecheck/build after each part.
- Avoid full repo rewrites.
- Avoid backend folder for now.
- Avoid new framework migration until sync works.
- Do not add Plasmo/WXT yet; migration costs tokens and risk.
- Direct Supabase + existing MV3 code is cheapest.
- Refactor only shared types/config first.
- Keep sync code in one module, not scattered.
- Prefer typed mapper functions over ad-hoc object literals everywhere.
- Prefer `upsertWatchRecord(record)` and `fetchWatchRecords()` APIs.
- Keep DB schema stable before UI polish.

## Proposed Extra Improvements

1. Add `.gitignore` for `node_modules/`, `.env`, Supabase temp files.
2. Remove committed `node_modules` later if repo allows.
3. Move public config to `src/config.ts`; document values are public.
4. Add `syncStatus` so user never loses records during auth/network failure.
5. Keep local-first architecture forever; tracking must work offline.
6. Add RLS tests before trusting production.
7. Delay WXT/Plasmo migration until product works.
