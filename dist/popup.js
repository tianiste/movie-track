const listEl = document.getElementById('list');
const template = document.getElementById('rowTemplate');
const totalItemsEl = document.getElementById('totalItems');
const totalHoursEl = document.getElementById('totalHours');
const filterEl = document.getElementById('typeFilter');
const exportBtn = document.getElementById('exportBtn');
const clearBtn = document.getElementById('clearBtn');
const enabledToggle = document.getElementById('enabledToggle');
const consentCard = document.getElementById('consentCard');
const acceptConsentBtn = document.getElementById('acceptConsentBtn');
const privacyLinkBtn = document.getElementById('privacyLinkBtn');
const authStatusTextEl = document.getElementById('authStatusText');
const syncStatusTextEl = document.getElementById('syncStatusText');
const signInBtn = document.getElementById('signInBtn');
const signOutBtn = document.getElementById('signOutBtn');
const syncCloudBtn = document.getElementById('syncCloudBtn');
const deleteCloudBtn = document.getElementById('deleteCloudBtn');
let allRecords = [];
let isSignedIn = false;
let hasPrivacyConsent = false;
let hasHostAccess = false;
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
    renderSyncSummary();
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
function renderSyncSummary() {
    if (!isSignedIn) {
        syncStatusTextEl.textContent = 'Signed out: local only';
        return;
    }
    const pending = allRecords.filter((record) => record.syncStatus === 'pending' || record.syncStatus === 'syncing').length;
    const failed = allRecords.filter((record) => record.syncStatus === 'failed').length;
    if (failed > 0) {
        syncStatusTextEl.textContent = `${failed} sync failed`;
        return;
    }
    if (pending > 0) {
        syncStatusTextEl.textContent = `${pending} sync pending`;
        return;
    }
    syncStatusTextEl.textContent = 'Synced';
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
async function loadPrivacyStatus() {
    const response = (await chrome.runtime.sendMessage({ type: 'getPrivacyStatus' }));
    if (!response?.ok) {
        return;
    }
    hasPrivacyConsent = Boolean(response.consentAccepted);
    hasHostAccess = Boolean(response.hostAccessGranted);
    consentCard.hidden = hasPrivacyConsent && hasHostAccess;
    enabledToggle.disabled = !hasPrivacyConsent || !hasHostAccess;
    enabledToggle.checked = Boolean(response.enabled);
}
async function requestHostAccess() {
    return chrome.permissions.request({ origins: ['<all_urls>'] });
}
async function acceptPrivacyConsent() {
    acceptConsentBtn.disabled = true;
    const hostAccessGranted = await requestHostAccess();
    if (!hostAccessGranted) {
        syncStatusTextEl.textContent = 'Site access required';
        acceptConsentBtn.disabled = false;
        return;
    }
    const response = (await chrome.runtime.sendMessage({ type: 'acceptPrivacyConsent' }));
    if (response?.ok) {
        hasPrivacyConsent = true;
        hasHostAccess = Boolean(response.hostAccessGranted);
        consentCard.hidden = hasHostAccess;
        enabledToggle.disabled = !hasHostAccess;
        enabledToggle.checked = Boolean(response.enabled);
        await loadData();
    }
    else {
        syncStatusTextEl.textContent = response?.error || 'Tracking unavailable';
    }
    acceptConsentBtn.disabled = false;
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
    const message = isSignedIn ? 'Clear cloud and local tracked history?' : 'Clear local tracked history?';
    const shouldClear = confirm(message);
    if (!shouldClear) {
        return;
    }
    const response = (await chrome.runtime.sendMessage({
        type: 'clearHistory',
        scope: isSignedIn ? 'cloudAndLocal' : 'local'
    }));
    if (response?.ok) {
        allRecords = [];
        render();
    }
}
async function setEnabled(enabled) {
    if (enabled && !hasPrivacyConsent) {
        enabledToggle.checked = false;
        consentCard.hidden = false;
        return;
    }
    const response = (await chrome.runtime.sendMessage({ type: 'setEnabled', enabled }));
    if (!response?.ok) {
        enabledToggle.checked = false;
        syncStatusTextEl.textContent = response?.error || 'Tracking unavailable';
    }
}
function setAuthUiState(response) {
    isSignedIn = Boolean(response.signedIn);
    signInBtn.hidden = isSignedIn;
    signOutBtn.hidden = !isSignedIn;
    syncCloudBtn.hidden = !isSignedIn;
    deleteCloudBtn.hidden = !isSignedIn;
    if (!response.configured) {
        authStatusTextEl.textContent = 'Set Supabase public config';
        syncStatusTextEl.textContent = 'Sync disabled';
        signInBtn.hidden = false;
        signOutBtn.hidden = true;
        syncCloudBtn.hidden = true;
        deleteCloudBtn.hidden = true;
        signInBtn.disabled = true;
        signOutBtn.disabled = true;
        syncCloudBtn.disabled = true;
        deleteCloudBtn.disabled = true;
        return;
    }
    if (response.signedIn) {
        authStatusTextEl.textContent = response.user?.email || 'Signed in';
        signInBtn.disabled = true;
        signOutBtn.disabled = false;
        syncCloudBtn.disabled = false;
        deleteCloudBtn.disabled = false;
        renderSyncSummary();
        return;
    }
    authStatusTextEl.textContent = 'Not signed in';
    signInBtn.disabled = false;
    signOutBtn.disabled = true;
    syncCloudBtn.disabled = true;
    deleteCloudBtn.disabled = true;
    renderSyncSummary();
}
async function loadAuthStatus() {
    const response = (await chrome.runtime.sendMessage({ type: 'getAuthStatus' }));
    if (!response?.ok) {
        authStatusTextEl.textContent = 'Auth status unavailable';
        signOutBtn.disabled = true;
        return;
    }
    setAuthUiState(response);
}
async function signIn() {
    signInBtn.disabled = true;
    const response = (await chrome.runtime.sendMessage({ type: 'signIn' }));
    if (!response?.ok) {
        authStatusTextEl.textContent = response?.error || 'Sign-in failed';
        signInBtn.disabled = false;
        return;
    }
    await loadAuthStatus();
    await loadData();
}
async function signOut() {
    signOutBtn.disabled = true;
    await chrome.runtime.sendMessage({ type: 'signOut' });
    await loadAuthStatus();
    await loadData();
}
async function syncCloudToLocal() {
    if (!isSignedIn) {
        return;
    }
    syncCloudBtn.disabled = true;
    syncStatusTextEl.textContent = 'Syncing cloud...';
    const response = (await chrome.runtime.sendMessage({ type: 'syncCloudToLocal' }));
    if (response?.ok) {
        allRecords = response.history || [];
        render();
        syncStatusTextEl.textContent = 'Cloud synced';
    }
    else {
        syncStatusTextEl.textContent = response?.error || 'Cloud sync failed';
    }
    syncCloudBtn.disabled = !isSignedIn;
}
async function deleteCloudData() {
    const shouldDelete = confirm('Delete all MovieTrack cloud data for this account and clear local history?');
    if (!shouldDelete) {
        return;
    }
    deleteCloudBtn.disabled = true;
    const response = (await chrome.runtime.sendMessage({
        type: 'clearHistory',
        scope: 'cloudAndLocal'
    }));
    if (response?.ok) {
        allRecords = [];
        render();
    }
    else {
        syncStatusTextEl.textContent = response?.error || 'Delete failed';
    }
    deleteCloudBtn.disabled = !isSignedIn;
}
filterEl.addEventListener('change', render);
exportBtn.addEventListener('click', exportData);
clearBtn.addEventListener('click', clearData);
enabledToggle.addEventListener('change', () => {
    void setEnabled(enabledToggle.checked);
});
signInBtn.addEventListener('click', () => {
    void signIn();
});
signOutBtn.addEventListener('click', () => {
    void signOut();
});
syncCloudBtn.addEventListener('click', () => {
    void syncCloudToLocal();
});
deleteCloudBtn.addEventListener('click', () => {
    void deleteCloudData();
});
acceptConsentBtn.addEventListener('click', () => {
    void acceptPrivacyConsent();
});
privacyLinkBtn.addEventListener('click', () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL('privacy.html') });
});
async function init() {
    await loadPrivacyStatus();
    await loadData();
    await loadAuthStatus();
}
void init();
export {};
//# sourceMappingURL=popup.js.map