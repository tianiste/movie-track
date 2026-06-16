import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getUrlAllowlistHost,
  isUrlAllowedByAllowlist,
  normalizeAllowlist,
  normalizeAllowlistHost
} from '../dist/siteAllowlist.js';

test('normalizes allowlist hosts from domains and urls', () => {
  assert.equal(normalizeAllowlistHost('https://www.youtube.com/watch?v=abc'), 'youtube.com');
  assert.equal(normalizeAllowlistHost('  EXAMPLE.com/path  '), 'example.com');
  assert.equal(getUrlAllowlistHost('https://m.youtube.com/watch?v=abc'), 'm.youtube.com');
  assert.equal(getUrlAllowlistHost('chrome-extension://abc/options.html'), '');
});

test('deduplicates and sorts allowlist hosts', () => {
  assert.deepEqual(normalizeAllowlist(['www.youtube.com', 'anime.example', 'youtube.com']), [
    'anime.example',
    'youtube.com'
  ]);
});

test('allows exact hosts and subdomains only when enabled', () => {
  assert.equal(isUrlAllowedByAllowlist('https://video.example.com/watch', true, ['example.com']), true);
  assert.equal(isUrlAllowedByAllowlist('https://badexample.com/watch', true, ['example.com']), false);
  assert.equal(isUrlAllowedByAllowlist('https://anywhere.test/watch', false, []), true);
});
