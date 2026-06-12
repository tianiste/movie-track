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
  'privacy.html',
  'src/background.ts',
  'src/config.ts',
  'src/popup.ts',
  'src/types.ts',
  'supabase/migrations/20260611224728_create_watch_records.sql',
  'supabase/migrations/20260611224833_harden_watch_records_functions.sql'
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
    'does not sell'
  ]) {
    if (!content.includes(phrase)) {
      fail(`${name} missing privacy phrase: ${phrase}`);
    }
  }
}

console.log('Publish verify passed');
