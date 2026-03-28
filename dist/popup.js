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
    if (h > 0)
        return `${h}h ${m}m`;
    if (m > 0)
        return `${m}m ${s}s`;
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
        const node = template.content.firstElementChild?.cloneNode(true);
        const badgeEl = node.querySelector('.badge');
        const titleEl = node.querySelector('.card-title');
        const urlEl = node.querySelector('.card-url');
        const linkEl = node.querySelector('.open-btn');
        const metaContainer = node.querySelector('.card-meta');
        const progressBar = node.querySelector('.progress-bar');
        const mediaType = record.mediaType || 'unknown';
        const title = record.title || record.rawTitle || record.url;
        const watchedSeconds = Math.max(0, record.lastPlaybackTime ?? 0);
        const videoDurationSec = (record.videoDurationSec ?? 0) > 0 ? record.videoDurationSec : null;
        // Badge
        badgeEl.textContent = mediaType.toUpperCase();
        badgeEl.className = `badge ${mediaType}`;
        // Title and URL
        titleEl.textContent = title;
        urlEl.textContent = (record.hostname || record.url).substring(0, 40);
        linkEl.href = record.url;
        linkEl.title = watchedSeconds > 0 ? `Continue from ${formatDuration(watchedSeconds)}` : 'Open';
        linkEl.addEventListener('click', (event) => {
            event.preventDefault();
            void chrome.runtime.sendMessage({
                type: 'openWithResume',
                url: record.url,
                resumeAtSec: watchedSeconds
            });
        });
        // Meta info: Schedule and Calendar
        const metaItems = metaContainer.querySelectorAll('.meta-item');
        if (metaItems[0]) {
            const metaText = metaItems[0].querySelector('.meta-text');
            metaText.textContent = `${watchedSeconds > 0 ? formatDuration(watchedSeconds) : '—'} elapsed`;
        }
        if (metaItems[1]) {
            const metaText = metaItems[1].querySelector('.meta-text');
            const today = new Date();
            const recordDate = new Date(record.startedAt);
            const isToday = today.toDateString() === recordDate.toDateString();
            metaText.textContent = isToday ? 'Today' : recordDate.toLocaleDateString();
        }
        // Progress bar width (percentage of video watched)
        const progressPercent = videoDurationSec
            ? Math.min(100, Math.round((watchedSeconds / videoDurationSec) * 100))
            : 0;
        progressBar.style.width = progressPercent + '%';
        // Add media type class for card styling
        node.classList.add(mediaType);
        fragment.append(node);
    }
    listEl.append(fragment);
}
async function loadData() {
    const response = (await chrome.runtime.sendMessage({ type: 'getHistory' }));
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
    const response = (await chrome.runtime.sendMessage({ type: 'clearHistory' }));
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
    void setEnabled(enabledToggle.checked);
});
void loadData();
export {};
//# sourceMappingURL=popup.js.map