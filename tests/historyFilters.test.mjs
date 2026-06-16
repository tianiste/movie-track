import test from 'node:test';
import assert from 'node:assert/strict';

import { getFilteredHistory } from '../dist/historyFilters.js';

function record(overrides = {}) {
  return {
    id: 'record-' + Math.random().toString(16).slice(2),
    tabId: 1,
    url: 'https://example.com/watch',
    hostname: 'example.com',
    rawTitle: 'Example',
    title: 'Example',
    mediaType: 'unknown',
    season: null,
    episode: null,
    confidence: 0,
    startedAt: Date.UTC(2026, 0, 1, 12, 0, 0),
    endedAt: Date.UTC(2026, 0, 1, 12, 5, 0),
    durationSec: 300,
    ...overrides
  };
}

test('filters by effective media type before paging', () => {
  const history = [
    record({ id: 'movie', mediaType: 'movie' }),
    record({ id: 'manual-youtube', mediaType: 'unknown', manualMediaType: 'youtube' }),
    record({ id: 'anime', mediaType: 'anime' })
  ];

  const result = getFilteredHistory(history, { type: 'youtube' });

  assert.deepEqual(result.map((item) => item.id), ['manual-youtube']);
});

test('filters by manual and inferred watch status', () => {
  const history = [
    record({ id: 'manual-finished', manualStatus: 'finished' }),
    record({ id: 'inferred-finished', lastPlaybackTime: 91, videoDurationSec: 100 }),
    record({ id: 'continue', lastPlaybackTime: 10, videoDurationSec: 100 })
  ];

  const result = getFilteredHistory(history, { status: 'finished' });

  assert.deepEqual(result.map((item) => item.id), ['manual-finished', 'inferred-finished']);
});

test('filters deleted, search, date, and sorts newest first', () => {
  const oldMatch = record({
    id: 'old-match',
    title: 'Skyblock episode',
    startedAt: Date.UTC(2026, 5, 15, 10, 0, 0)
  });
  const newMatch = record({
    id: 'new-match',
    rawTitle: 'Minecraft Skyblock',
    startedAt: Date.UTC(2026, 5, 15, 12, 0, 0)
  });
  const wrongDate = record({
    id: 'wrong-date',
    title: 'Skyblock',
    startedAt: Date.UTC(2026, 5, 16, 12, 0, 0)
  });
  const deleted = record({
    id: 'deleted',
    title: 'Skyblock',
    startedAt: Date.UTC(2026, 5, 15, 13, 0, 0),
    deletedAt: Date.UTC(2026, 5, 15, 14, 0, 0)
  });

  const result = getFilteredHistory([oldMatch, newMatch, wrongDate, deleted], {
    search: 'skyblock',
    date: '2026-06-15'
  });

  assert.deepEqual(result.map((item) => item.id), ['new-match', 'old-match']);
});
