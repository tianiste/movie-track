#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const root = process.cwd();

const trackedFileRisks = [
  /(^|\/)node_modules\//,
  /(^|\/)MovieTrack\.pem$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.crx$/i,
  /(^|\/)\.env(?:\.|$)/,
  /(^|\/)supabase\/\.temp\//
];

const privateSecretPatterns = [
  /service_role/i,
  /sb_secret_/i,
  /SUPABASE_SERVICE/i,
  /SUPABASE_SECRET/i,
  /GOOGLE_CLIENT_SECRET/i,
  /client_secret/i,
  /DATABASE_URL/i,
  /postgres:\/\//i,
  /BEGIN (?:RSA |EC |OPENSSH |)?PRIVATE KEY/i
];

const sourceGlobs = [
  'manifest.json',
  'popup.html',
  'options.html',
  'options.css',
  'library.html',
  'library.css',
  'privacy.html',
  'src/background.ts',
  'src/config.ts',
  'src/library.ts',
  'src/options.ts',
  'src/popup.ts',
  'src/types.ts',
  'supabase/migrations/20260611224728_create_watch_records.sql',
  'supabase/migrations/20260611224833_harden_watch_records_functions.sql',
  'supabase/migrations/20260612154927_add_youtube_media_type.sql',
  'supabase/migrations/20260613185715_add_watch_record_overrides.sql',
  'supabase/migrations/20260613192133_add_watch_record_group_overrides.sql'
];

const migrationFiles = [
  'supabase/migrations/20260611224728_create_watch_records.sql',
  'supabase/migrations/20260611224833_harden_watch_records_functions.sql',
  'supabase/migrations/20260612154927_add_youtube_media_type.sql',
  'supabase/migrations/20260613185715_add_watch_record_overrides.sql',
  'supabase/migrations/20260613192133_add_watch_record_group_overrides.sql'
];

function fail(message) {
  console.error(`Publish verify failed: ${message}`);
  process.exit(1);
}

function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), 'utf8'));
}

function readText(path) {
  return readFileSync(join(root, path), 'utf8');
}

function gitLsFiles() {
  const result = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0 && !result.stdout) {
    fail(`git ls-files failed: ${result.stderr || result.error?.message || 'unknown error'}`);
  }

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

const trackedFiles = gitLsFiles();
const riskyTrackedFile = trackedFiles.find((file) => trackedFileRisks.some((pattern) => pattern.test(file)));
if (riskyTrackedFile) {
  fail(`tracked local/secret-risk file: ${riskyTrackedFile}`);
}

for (const file of sourceGlobs) {
  if (!existsSync(join(root, file))) {
    fail(`missing expected source file: ${file}`);
  }

  const content = readText(file);
  const secret = privateSecretPatterns.find((pattern) => pattern.test(content));
  if (secret) {
    fail(`secret-like content in ${file}: ${secret}`);
  }
}

const manifest = readJson('manifest.json');
if ('key' in manifest) {
  fail('manifest must not include key; Chrome Web Store rejects it');
}
if (manifest.options_page !== 'options.html') {
  fail('manifest must expose options.html as the settings page');
}

const requiredPermissions = new Set(manifest.permissions || []);
for (const permission of ['tabs', 'storage', 'alarms', 'scripting', 'identity']) {
  if (!requiredPermissions.has(permission)) {
    fail(`manifest missing required API permission: ${permission}`);
  }
}

if (manifest.host_permissions?.includes('<all_urls>')) {
  fail('manifest must not require <all_urls>; keep it optional');
}
if (!manifest.optional_host_permissions?.includes('<all_urls>')) {
  fail('manifest must declare optional <all_urls>');
}

const migrations = migrationFiles.map(readText).join('\n').toLowerCase();
for (const phrase of [
  'alter table public.watch_records enable row level security',
  'alter table public.watch_records force row level security',
  'revoke all on table public.watch_records from anon',
  'grant select, insert, update, delete',
  'to authenticated',
  'using ((select auth.uid()) = user_id)',
  'with check ((select auth.uid()) = user_id)'
]) {
  if (!migrations.includes(phrase)) {
    fail(`RLS migration missing invariant: ${phrase}`);
  }
}

if (!migrations.includes("'youtube'")) {
  fail('RLS migrations must allow youtube media_type');
}

if (/grant\s+.+\s+on\s+table\s+public\.watch_records\s+to\s+anon/i.test(migrations)) {
  fail('watch_records must not grant table access to anon');
}
if (/auth\.role\s*\(/i.test(migrations)) {
  fail('RLS policies must use TO clauses instead of auth.role()');
}
if (/security\s+definer/i.test(migrations)) {
  fail('public watch_records migrations must not add SECURITY DEFINER');
}

const background = readText('src/background.ts');
const options = readText('src/options.ts');
const optionsHtml = readText('options.html');
const library = readText('src/library.ts');
const libraryHtml = readText('library.html');
const popup = readText('src/popup.ts');
const popupHtml = readText('popup.html');
for (const phrase of [
  '/auth/v1/logout',
  'finally',
  'await clearSupabaseSession()',
  'response.status === 400 || response.status === 401 || response.status === 403',
  'return null',
  'refresh_token: session.refreshToken'
]) {
  if (!background.includes(phrase)) {
    fail(`auth/session handling missing invariant: ${phrase}`);
  }
}

for (const phrase of [
  'id="consentCard"',
  'hidden',
  'site access before tracking',
  'active audible tab',
  'readable video element',
  'URLs are trimmed',
  'id="acceptConsentBtn"',
  'id="privacyLinkBtn"'
]) {
  if (!popupHtml.includes(phrase)) {
    fail(`popup consent disclosure missing invariant: ${phrase}`);
  }
}

for (const phrase of [
  'id="signInBtn"',
  'id="signOutBtn"',
  'id="syncCloudBtn"',
  'id="deleteCloudBtn"',
  'Delete cloud data'
]) {
  if (!optionsHtml.includes(phrase)) {
    fail(`options account/cloud controls missing invariant: ${phrase}`);
  }
}

for (const phrase of [
  "chrome.permissions.request({ origins: ['<all_urls>'] })",
  'enabledToggle.disabled = !hasPrivacyConsent || !hasHostAccess',
  "chrome.runtime.sendMessage({ type: 'acceptPrivacyConsent' })"
]) {
  if (!popup.includes(phrase)) {
    fail(`popup permission flow missing invariant: ${phrase}`);
  }
}

if (!options.includes("chrome.runtime.sendMessage({ type: 'syncCloudToLocal' })")) {
  fail('options cloud-to-local sync button is not wired');
}

for (const phrase of [
  'id="groupTemplate"',
  'id="recordTemplate"',
  'id="editDialog"',
  'id="groupInput"',
  'id="groupDialog"',
  'id="newGroupBtn"',
  'draggable="true"',
  'Edit group',
  'Delete group'
]) {
  if (!libraryHtml.includes(phrase)) {
    fail(`library UI missing invariant: ${phrase}`);
  }
}

for (const phrase of [
  "type: 'updateRecord'",
  "type: 'deleteRecord'",
  'function groupRecords',
  'function openRecordEditor',
  'function openGroupEditor',
  'function createCustomGroup',
  'function moveRecordToGroup',
  'manualGroupTitle'
]) {
  if (!library.includes(phrase)) {
    fail(`library edit/delete flow missing invariant: ${phrase}`);
  }
}

for (const phrase of [
  'chrome.permissions.contains({ origins: [REQUIRED_HOST_PERMISSION] })',
  'enabled && consentAccepted && hostAccessGranted',
  'tab.audible === true',
  'target: { tabId, allFrames: true }',
  "document.querySelectorAll('video')",
  'function getStoredWatchUrl',
  "url.hash = '';",
  "url.search = '';",
  "new URL('https://www.youtube.com/watch')",
  "safeUrl.searchParams.set('v', youtubeVideoId)",
  'chrome.permissions.onRemoved.addListener',
  'await setStorage(ENABLED_KEY, false)'
]) {
  if (!background.includes(phrase)) {
    fail(`tracking privacy guard missing invariant: ${phrase}`);
  }
}

if (!background.includes("payload?.type === 'syncCloudToLocal'") || !background.includes('const history = await refreshHistoryFromCloud()')) {
  fail('background cloud-to-local sync handler is missing');
}
if (!background.includes("payload?.type === 'getHistoryPage'")) {
  fail('background paged history handler is missing');
}
if (!popup.includes("type: 'getHistoryPage'")) {
  fail('popup must use paged history loading');
}

const privacyPolicy = readText('PRIVACY_POLICY.md');
const hostedPrivacy = readText('docs/privacy.html');
const localPrivacy = readText('privacy.html');

for (const [name, content] of [
  ['PRIVACY_POLICY.md', privacyPolicy],
  ['docs/privacy.html', hostedPrivacy],
  ['privacy.html', localPrivacy]
]) {
  for (const phrase of [
    'Delete cloud data',
    'Supabase',
    'Google sign-in',
    'URLs are trimmed',
    'does not sell',
    'limited to its single purpose'
  ]) {
    if (!content.includes(phrase)) {
      fail(`${name} missing privacy phrase: ${phrase}`);
    }
  }
}

console.log('Publish verify passed');
