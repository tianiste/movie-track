#!/usr/bin/env node

const { mkdirSync, rmSync, copyFileSync, cpSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const mode = process.argv[2] || 'webstore';
const root = process.cwd();
const tempDir = join('/tmp', `movietrack-${mode}-package`);
const outputPath = mode === 'github' ? '/tmp/movietrack-github.zip' : '/tmp/movietrack-webstore.zip';
const releaseKey = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvZhqcC0W2LatxrsYxWOSTaco7ad4tHRgG/4LPkN00ZDC41Z4Eq3wGTTdNSkEjVOuyD1mDU/s22+3V1cICUMb5aNEs2+wybwZ/rlcKEMQe8HqLZdy2RAmAmEPJ7d7diwn7Rx1qWIX+GMUN2yU0qsQkiRN7dwGO2kwbyR3oJniqARTvYCQ2Mz/08MN84hlDqUNpOJX2XiyEcVLlqVbwM4ybqsJnvT0h+3bZBD6pNUdzuQkKXGpB5Z0eX6bctJsOxo+nC0nZNZdosAy2eC2LZRPGFaskxLs93t9IVlEPjGOgu3c8WzUps7F4BhbRKa6yuP1HDAM/pQ52JwFCLXAxHItdQIDAQAB';

const files = [
  'manifest.json',
  'popup.html',
  'popup.css',
  'options.html',
  'options.css',
  'library.html',
  'library.css',
  'privacy.html'
];

const dirs = ['icons', 'dist'];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    encoding: 'utf8',
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

if (!['webstore', 'github'].includes(mode)) {
  console.error('Usage: node scripts/package-extension.js webstore|github');
  process.exit(1);
}

run('npm', ['run', 'build']);

rmSync(tempDir, { recursive: true, force: true });
rmSync(outputPath, { force: true });
mkdirSync(tempDir, { recursive: true });

for (const file of files) {
  copyFileSync(join(root, file), join(tempDir, file));
}

for (const dir of dirs) {
  cpSync(join(root, dir), join(tempDir, dir), { recursive: true });
}

if (mode === 'github') {
  const manifestPath = join(tempDir, 'manifest.json');
  const manifest = require(manifestPath);
  manifest.key = releaseKey;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}

run('zip', [
  '-r',
  outputPath,
  'manifest.json',
  'popup.html',
  'popup.css',
  'options.html',
  'options.css',
  'library.html',
  'library.css',
  'privacy.html',
  'icons',
  'dist/background.js',
  'dist/popup.js',
  'dist/options.js',
  'dist/library.js',
  'dist/historyFilters.js',
  'dist/config.js',
  'dist/types.js'
], { cwd: tempDir });
