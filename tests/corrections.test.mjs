import test from 'node:test';
import assert from 'node:assert/strict';

import { applyCorrectionRule, getCorrectionKey } from '../dist/corrections.js';

const record = {
  hostname: 'watch.example.com', title: 'Good Show Season 1 Episode 3', rawTitle: '',
  mediaType: 'unknown', season: 1
};

test('reuses series corrections without carrying a season correction into another season', () => {
  assert.equal(getCorrectionKey(record), 'watch.example.com|good show');

  const rule = { title: 'Good Show', mediaType: 'anime', season: 1, sourceSeason: 1 };
  assert.deepEqual(
    applyCorrectionRule(record, rule),
    { ...record, manualTitle: 'Good Show', manualMediaType: 'anime', manualSeason: 1 }
  );
  assert.equal(applyCorrectionRule({ ...record, season: 2 }, rule).manualSeason, null);
});
