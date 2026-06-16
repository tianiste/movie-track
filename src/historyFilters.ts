import type { MediaType, WatchRecord, WatchStatus } from './types.js';

export interface HistoryQuery {
  type?: MediaType | 'all';
  status?: WatchStatus | 'all';
  search?: string;
  date?: string;
}

function toDateInputValue(timestamp: number): string {
  const dt = new Date(timestamp);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWatchRatio(record: WatchRecord): number | null {
  const watched = record.lastPlaybackTime ?? 0;
  const duration = record.videoDurationSec ?? 0;
  if (!Number.isFinite(watched) || !Number.isFinite(duration) || duration <= 0) {
    return null;
  }
  return Math.max(0, Math.min(1, watched / duration));
}

function isRecordComplete(record: WatchRecord): boolean {
  const ratio = getWatchRatio(record);
  const watched = record.lastPlaybackTime ?? 0;
  const duration = record.videoDurationSec ?? 0;
  if (ratio === null || duration < 30 || watched <= 0) {
    return false;
  }

  const remainingSec = Math.max(0, duration - watched);
  return ratio >= 0.9 || (ratio >= 0.85 && remainingSec <= 60);
}

function getWatchStatus(record: WatchRecord): WatchStatus {
  if (record.manualStatus === 'continue' || record.manualStatus === 'finished') {
    return record.manualStatus;
  }

  return isRecordComplete(record) ? 'finished' : 'continue';
}

function normalizeFilterText(value = ''): string {
  return value.trim().toLowerCase();
}

export function getFilteredHistory(history: WatchRecord[], query: HistoryQuery = {}): WatchRecord[] {
  const type = query.type ?? 'all';
  const status = query.status ?? 'all';
  const searchValue = normalizeFilterText(query.search ?? '');
  const dateValue = query.date ?? '';

  return history
    .filter((record) => !record.deletedAt)
    .filter((record) => {
      const mediaType = record.manualMediaType ?? record.mediaType;
      if (type !== 'all' && mediaType !== type) {
        return false;
      }

      if (status !== 'all' && getWatchStatus(record) !== status) {
        return false;
      }

      if (dateValue && toDateInputValue(record.startedAt) !== dateValue) {
        return false;
      }

      if (searchValue) {
        const haystack = normalizeFilterText([
          record.manualTitle,
          record.title,
          record.rawTitle,
          record.manualMediaType,
          record.hostname,
          record.url
        ].filter(Boolean).join(' '));

        if (!haystack.includes(searchValue)) {
          return false;
        }
      }

      return true;
    })
    .sort((a, b) => b.startedAt - a.startedAt);
}
