#!/usr/bin/env node

const { existsSync, readFileSync } = require('node:fs');
const { inflateRawSync } = require('node:zlib');

const zipPath = process.argv[2] || '/tmp/movietrack-webstore.zip';

const requiredFiles = new Set([
  'manifest.json',
  'popup.html',
  'popup.css',
  'privacy.html',
  'dist/background.js',
  'dist/popup.js',
  'dist/config.js',
  'dist/types.js'
]);

const forbiddenPatterns = [
  /^node_modules\//,
  /^src\//,
  /^supabase\//,
  /^scripts\//,
  /^\.env(?:\.|$)/,
  /\.map$/,
  /\.md$/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.crx$/i,
  /MovieTrack\.pem$/i,
  /package(?:-lock)?\.json$/,
  /tsconfig\.json$/
];

const forbiddenContent = [
  /service_role/i,
  /sb_secret/i,
  /SUPABASE_SERVICE/i,
  /SUPABASE_SECRET/i,
  /GOOGLE_CLIENT_SECRET/i,
  /client_secret/i,
  /DATABASE_URL/i,
  /postgres:\/\//i,
  /BEGIN (?:RSA |EC |OPENSSH |)?PRIVATE KEY/i
];

function fail(message) {
  console.error(`Package verify failed: ${message}`);
  process.exit(1);
}

function readZip(path) {
  const buffer = readFileSync(path);
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const entries = new Map();

  let offset = centralDirectoryOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      fail('invalid zip central directory');
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString('utf8', offset + 46, offset + 46 + fileNameLength);

    entries.set(name, {
      compressionMethod,
      compressedSize,
      localHeaderOffset
    });

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return { buffer, entries };
}

function findEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 65557);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }
  fail('invalid zip: missing end of central directory');
}

function readZipEntry(zip, entryName) {
  const entry = zip.entries.get(entryName);
  if (!entry) {
    fail(`missing zip entry ${entryName}`);
  }

  const offset = entry.localHeaderOffset;
  if (zip.buffer.readUInt32LE(offset) !== 0x04034b50) {
    fail(`invalid local header for ${entryName}`);
  }

  const fileNameLength = zip.buffer.readUInt16LE(offset + 26);
  const extraLength = zip.buffer.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + fileNameLength + extraLength;
  const compressed = zip.buffer.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    return compressed.toString('utf8');
  }
  if (entry.compressionMethod === 8) {
    return inflateRawSync(compressed).toString('utf8');
  }

  fail(`unsupported compression method ${entry.compressionMethod} for ${entryName}`);
}

if (!existsSync(zipPath)) {
  fail(`missing zip ${zipPath}`);
}

const zip = readZip(zipPath);
const entries = [...zip.entries.keys()];
const files = entries.filter((entry) => !entry.endsWith('/'));

for (const file of requiredFiles) {
  if (!files.includes(file)) {
    fail(`missing required file ${file}`);
  }
}

for (const file of files) {
  const forbidden = forbiddenPatterns.find((pattern) => pattern.test(file));
  if (forbidden) {
    fail(`forbidden file in zip: ${file}`);
  }
}

for (const file of files.filter((entry) => /\.(?:js|html|css|json)$/i.test(entry))) {
  const content = readZipEntry(zip, file);
  const secret = forbiddenContent.find((pattern) => pattern.test(content));
  if (secret) {
    fail(`secret-like content in ${file}: ${secret}`);
  }
}

const manifest = JSON.parse(readZipEntry(zip, 'manifest.json'));
if (manifest.host_permissions?.includes('<all_urls>')) {
  fail('manifest must not require <all_urls>; use optional_host_permissions');
}
if (!manifest.optional_host_permissions?.includes('<all_urls>')) {
  fail('manifest must declare optional <all_urls> for user-granted cross-site tracking');
}

console.log(`Package verify passed: ${zipPath}`);
