interface WatchRecord {
  id: string;
  tabId: number;
  url: string;
  hostname: string;
  rawTitle: string;
  title: string;
  mediaType: 'anime' | 'movie' | 'unknown';
  season: number | null;
  episode: number | null;
  confidence: number;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  lastPlaybackTime?: number;
}

interface GetHistoryResponse {
  ok: boolean;
  history: WatchRecord[];
  enabled: boolean;
}

const listEl = document.getElementById('list') as HTMLElement;
const template = document.getElementById('rowTemplate') as HTMLTemplateElement;
const totalItemsEl = document.getElementById('totalItems') as HTMLElement;
const totalHoursEl = document.getElementById('totalHours') as HTMLElement;
const filterEl = document.getElementById('typeFilter') as HTMLSelectElement;
const exportBtn = document.getElementById('exportBtn') as HTMLButtonElement;
const clearBtn = document.getElementById('clearBtn') as HTMLButtonElement;
const enabledToggle = document.getElementById('enabledToggle') as HTMLInputElement;

let allRecords: WatchRecord[] = [];

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(timestamp: number): string {
  const dt = new Date(timestamp);
  return dt.toLocaleString();
}

function getFilteredRecords(): WatchRecord[] {
  const type = filterEl.value;
  const sorted = [...allRecords].sort((a, b) => b.startedAt - a.startedAt);
  if (type === 'all') {
    return sorted;
  }
  return sorted.filter((record) => record.mediaType === type);
}

function render(): void {
  const records = getFilteredRecords();
  listEl.textContent = '';

  const totalSeconds = records.reduce((sum, item) => sum + (item.durationSec || 0), 0);
  totalItemsEl.textContent = String(records.length);
  totalHoursEl.textContent = (totalSeconds / 3600).toFixed(1);

  if (records.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'No records yet.';
    empty.style.color = '#a4a4a4';
    empty.style.fontSize = '12px';
    listEl.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const record of records) {
    const node = template.content.firstElementChild?.cloneNode(true) as HTMLElement;

    const titleEl = node.querySelector('.title') as HTMLElement;
    const typeEl = node.querySelector('.type') as HTMLElement;
    const metaEl = node.querySelector('.meta') as HTMLElement;
    const linkEl = node.querySelector('.link') as HTMLAnchorElement;

    titleEl.textContent = record.title || record.rawTitle || record.url;
    typeEl.textContent = record.mediaType || 'unknown';

    const metaParts = [
      record.hostname || 'unknown',
      formatDuration(record.durationSec || 0),
      formatDate(record.startedAt)
    ];

    if (record.episode) {
      metaParts.push(`ep ${record.episode}`);
    }

    if (record.lastPlaybackTime) {
      metaParts.push(`↻ ${formatDuration(record.lastPlaybackTime)}`);
    }

    metaEl.textContent = metaParts.join(' • ');
    linkEl.href = record.url;

    fragment.append(node);
  }

  listEl.append(fragment);
}

async function loadData(): Promise<void> {
  const response = (await chrome.runtime.sendMessage({ type: 'getHistory' })) as GetHistoryResponse;
  if (!response?.ok) {
    return;
  }

  allRecords = response.history || [];
  enabledToggle.checked = Boolean(response.enabled);
  render();
}

function exportData(): void {
  const data = JSON.stringify(getFilteredRecords(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `movietrack-${Date.now()}.json`;
  a.click();

  URL.revokeObjectURL(url);
}

async function clearData(): Promise<void> {
  const shouldClear = confirm('Clear all tracked history?');
  if (!shouldClear) {
    return;
  }

  const response = (await chrome.runtime.sendMessage({ type: 'clearHistory' })) as { ok: boolean };
  if (response?.ok) {
    allRecords = [];
    render();
  }
}

async function setEnabled(enabled: boolean): Promise<void> {
  await chrome.runtime.sendMessage({ type: 'setEnabled', enabled });
}

filterEl.addEventListener('change', render);
exportBtn.addEventListener('click', exportData);
clearBtn.addEventListener('click', clearData);
enabledToggle.addEventListener('change', () => {
  void setEnabled(enabledToggle.checked);
});

void loadData();

export {};
