const listEl = document.getElementById('list');
const template = document.getElementById('rowTemplate');
const totalItemsEl = document.getElementById('totalItems');
const totalHoursEl = document.getElementById('totalHours');
const filterEl = document.getElementById('typeFilter');
const exportBtn = document.getElementById('exportBtn');
const clearBtn = document.getElementById('clearBtn');
const enabledToggle = document.getElementById('enabledToggle');

let allRecords = [];

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(timestamp) {
  const dt = new Date(timestamp);
  return dt.toLocaleString();
}

function getFilteredRecords() {
  const type = filterEl.value;
  const sorted = [...allRecords].sort((a, b) => b.startedAt - a.startedAt);
  if (type === 'all') {
    return sorted;
  }
  return sorted.filter((record) => record.mediaType === type);
}

function render() {
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
    const node = template.content.firstElementChild.cloneNode(true);

    node.querySelector('.title').textContent = record.title || record.rawTitle || record.url;
    node.querySelector('.type').textContent = record.mediaType || 'unknown';

    const metaParts = [
      record.hostname || 'unknown',
      formatDuration(record.durationSec || 0),
      formatDate(record.startedAt)
    ];

    if (record.episode) {
      metaParts.push(`ep ${record.episode}`);
    }

    node.querySelector('.meta').textContent = metaParts.join(' • ');

    const link = node.querySelector('.link');
    link.href = record.url;

    fragment.append(node);
  }

  listEl.append(fragment);
}

async function loadData() {
  const response = await chrome.runtime.sendMessage({ type: 'getHistory' });
  if (!response?.ok) {
    return;
  }

  allRecords = response.history || [];
  enabledToggle.checked = Boolean(response.enabled);
  render();
}

function exportData() {
  const data = JSON.stringify(getFilteredRecords(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `movietrack-${Date.now()}.json`;
  a.click();

  URL.revokeObjectURL(url);
}

async function clearData() {
  const shouldClear = confirm('Clear all tracked history?');
  if (!shouldClear) {
    return;
  }

  const response = await chrome.runtime.sendMessage({ type: 'clearHistory' });
  if (response?.ok) {
    allRecords = [];
    render();
  }
}

async function setEnabled(enabled) {
  await chrome.runtime.sendMessage({ type: 'setEnabled', enabled });
}

filterEl.addEventListener('change', render);
exportBtn.addEventListener('click', exportData);
clearBtn.addEventListener('click', clearData);
enabledToggle.addEventListener('change', () => {
  setEnabled(enabledToggle.checked);
});

loadData();
