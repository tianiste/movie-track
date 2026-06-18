const accountStatusText = document.getElementById('accountStatusText');
const syncStatusText = document.getElementById('syncStatusText');
const localStatusText = document.getElementById('localStatusText');
const trackingStatusText = document.getElementById('trackingStatusText');
const allowlistStatusText = document.getElementById('allowlistStatusText');
const signInBtn = document.getElementById('signInBtn');
const signOutBtn = document.getElementById('signOutBtn');
const syncLocalBtn = document.getElementById('syncLocalBtn');
const syncCloudBtn = document.getElementById('syncCloudBtn');
const deleteCloudBtn = document.getElementById('deleteCloudBtn');
const exportBtn = document.getElementById('exportBtn');
const clearLocalBtn = document.getElementById('clearLocalBtn');
const openPrivacyBtn = document.getElementById('openPrivacyBtn');
const openLibraryBtn = document.getElementById('openLibraryBtn');
const allowlistEnabledToggle = document.getElementById('allowlistEnabledToggle');
const addCurrentSiteBtn = document.getElementById('addCurrentSiteBtn');
const addSiteForm = document.getElementById('addSiteForm');
const siteInput = document.getElementById('siteInput');
const allowlistSitesEl = document.getElementById('allowlistSites');
let allRecords = [];
let isSignedIn = false;
let allowlistSites = [];
let currentAllowlistHostname = null;
function formatHours(records) {
    const seconds = records.reduce((sum, record) => sum + Math.max(0, record.durationSec || 0), 0);
    return (seconds / 3600).toFixed(1);
}
function getVisibleRecords() {
    return allRecords.filter((record) => !record.deletedAt);
}
function renderSyncSummary() {
    if (!isSignedIn) {
        syncStatusText.textContent = 'Signed out: local history only';
        return;
    }
    const pending = allRecords.filter((record) => record.syncStatus === 'pending' || record.syncStatus === 'syncing').length;
    const failed = allRecords.filter((record) => record.syncStatus === 'failed').length;
    if (failed > 0) {
        syncStatusText.textContent = `${failed} records failed to sync`;
        return;
    }
    if (pending > 0) {
        syncStatusText.textContent = `${pending} records waiting to sync`;
        return;
    }
    syncStatusText.textContent = 'Cloud sync is up to date';
}
function renderLocalSummary() {
    const visibleRecords = getVisibleRecords();
    const recordLabel = visibleRecords.length === 1 ? 'record' : 'records';
    localStatusText.textContent = `${visibleRecords.length} ${recordLabel}, ${formatHours(visibleRecords)} hours watched`;
}
function setAuthUiState(response) {
    isSignedIn = Boolean(response.signedIn);
    if (!response.configured) {
        accountStatusText.textContent = 'Supabase public config missing';
        signInBtn.disabled = true;
        signOutBtn.disabled = true;
        syncLocalBtn.disabled = true;
        syncCloudBtn.disabled = true;
        deleteCloudBtn.disabled = true;
        renderSyncSummary();
        return;
    }
    if (response.signedIn) {
        accountStatusText.textContent = response.user?.email || 'Signed in';
        signInBtn.hidden = true;
        signOutBtn.hidden = false;
        syncLocalBtn.disabled = false;
        syncCloudBtn.disabled = false;
        deleteCloudBtn.disabled = false;
        renderSyncSummary();
        return;
    }
    accountStatusText.textContent = 'Not signed in';
    signInBtn.hidden = false;
    signOutBtn.hidden = true;
    syncLocalBtn.disabled = true;
    syncCloudBtn.disabled = true;
    deleteCloudBtn.disabled = true;
    renderSyncSummary();
}
async function loadAuthStatus() {
    const response = (await chrome.runtime.sendMessage({ type: 'getAuthStatus' }));
    if (!response?.ok) {
        accountStatusText.textContent = response?.error || 'Auth status unavailable';
        signInBtn.disabled = true;
        signOutBtn.disabled = true;
        return;
    }
    setAuthUiState(response);
}
async function loadHistory() {
    const response = (await chrome.runtime.sendMessage({ type: 'getHistory' }));
    if (!response?.ok) {
        localStatusText.textContent = 'Local history unavailable';
        return;
    }
    allRecords = response.history || [];
    renderLocalSummary();
    renderSyncSummary();
}
async function loadPrivacyStatus() {
    const response = (await chrome.runtime.sendMessage({ type: 'getPrivacyStatus' }));
    if (!response?.ok) {
        trackingStatusText.textContent = response?.error || 'Tracking status unavailable';
        return;
    }
    if (!response.consentAccepted) {
        trackingStatusText.textContent = 'Privacy consent has not been accepted yet';
        return;
    }
    if (!response.hostAccessGranted) {
        trackingStatusText.textContent = 'Site access is not granted';
        return;
    }
    trackingStatusText.textContent = response.enabled ? 'Tracking is enabled' : 'Tracking is paused';
}
function renderAllowlistStatus(response) {
    allowlistSites = response.sites || [];
    currentAllowlistHostname = response.currentHostname;
    allowlistEnabledToggle.checked = Boolean(response.enabled);
    addCurrentSiteBtn.disabled = !Boolean(response.currentHostname);
    addCurrentSiteBtn.textContent = response.currentHostname ? `Add ${response.currentHostname}` : 'Add current site';
    allowlistStatusText.textContent = response.enabled
        ? `${allowlistSites.length} allowed ${allowlistSites.length === 1 ? 'site' : 'sites'}`
        : 'Allowlist is off';
    allowlistSitesEl.textContent = '';
    if (allowlistSites.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'empty-sites';
        empty.textContent = 'No sites added yet.';
        allowlistSitesEl.append(empty);
        return;
    }
    for (const site of allowlistSites) {
        const row = document.createElement('div');
        row.className = 'site-row';
        const label = document.createElement('span');
        label.textContent = site;
        const removeBtn = document.createElement('button');
        removeBtn.className = 'action-btn danger-btn';
        removeBtn.type = 'button';
        removeBtn.textContent = 'Remove';
        removeBtn.addEventListener('click', () => {
            void removeAllowlistSite(site);
        });
        row.append(label, removeBtn);
        allowlistSitesEl.append(row);
    }
}
async function loadAllowlistStatus() {
    const response = (await chrome.runtime.sendMessage({ type: 'getAllowlistStatus' }));
    if (!response?.ok) {
        allowlistStatusText.textContent = response?.error || 'Site allowlist unavailable';
        return;
    }
    renderAllowlistStatus(response);
}
async function setAllowlistEnabled(enabled) {
    const response = (await chrome.runtime.sendMessage({ type: 'setAllowlistEnabled', enabled }));
    if (!response?.ok) {
        allowlistEnabledToggle.checked = !enabled;
        allowlistStatusText.textContent = response?.error || 'Could not update allowlist';
        return;
    }
    renderAllowlistStatus(response);
}
async function addAllowlistSite(site) {
    const response = (await chrome.runtime.sendMessage({ type: 'addAllowlistSite', site }));
    if (!response?.ok) {
        allowlistStatusText.textContent = response?.error || 'Could not add site';
        return;
    }
    siteInput.value = '';
    renderAllowlistStatus(response);
}
async function removeAllowlistSite(site) {
    const response = (await chrome.runtime.sendMessage({ type: 'removeAllowlistSite', site }));
    if (!response?.ok) {
        allowlistStatusText.textContent = response?.error || 'Could not remove site';
        return;
    }
    renderAllowlistStatus(response);
}
async function signIn() {
    signInBtn.disabled = true;
    const response = (await chrome.runtime.sendMessage({ type: 'signIn' }));
    if (!response?.ok) {
        accountStatusText.textContent = response?.error || 'Sign-in failed';
        signInBtn.disabled = false;
        return;
    }
    await loadAuthStatus();
    await loadHistory();
}
async function signOut() {
    signOutBtn.disabled = true;
    await chrome.runtime.sendMessage({ type: 'signOut' });
    await loadAuthStatus();
    await loadHistory();
}
async function syncCloudToLocal() {
    if (!isSignedIn) {
        return;
    }
    syncCloudBtn.disabled = true;
    syncStatusText.textContent = 'Syncing cloud history...';
    const response = (await chrome.runtime.sendMessage({ type: 'syncCloudToLocal' }));
    if (response?.ok) {
        allRecords = response.history || [];
        renderLocalSummary();
        syncStatusText.textContent = 'Cloud history synced to this device';
    }
    else {
        syncStatusText.textContent = response?.error || 'Cloud sync failed';
    }
    syncCloudBtn.disabled = !isSignedIn;
}
async function syncLocalToCloud() {
    if (!isSignedIn) {
        return;
    }
    syncLocalBtn.disabled = true;
    syncStatusText.textContent = 'Syncing local history to cloud...';
    const response = (await chrome.runtime.sendMessage({ type: 'syncNow' }));
    if (response?.ok) {
        syncStatusText.textContent = `${response.synced ?? 0} local records synced to cloud`;
        await loadHistory();
    }
    else {
        syncStatusText.textContent = response?.error || 'Local sync failed';
    }
    syncLocalBtn.disabled = !isSignedIn;
}
async function deleteCloudData() {
    if (!isSignedIn) {
        return;
    }
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
        renderLocalSummary();
        renderSyncSummary();
    }
    else {
        syncStatusText.textContent = response?.error || 'Delete failed';
    }
    deleteCloudBtn.disabled = !isSignedIn;
}
function exportData() {
    const data = JSON.stringify(getVisibleRecords(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `movietrack-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
}
async function clearLocalData() {
    const shouldClear = confirm('Clear local MovieTrack history on this device? Cloud data stays in your account.');
    if (!shouldClear) {
        return;
    }
    const response = (await chrome.runtime.sendMessage({
        type: 'clearHistory',
        scope: 'local'
    }));
    if (response?.ok) {
        allRecords = [];
        renderLocalSummary();
        renderSyncSummary();
    }
    else {
        localStatusText.textContent = response?.error || 'Clear failed';
    }
}
signInBtn.addEventListener('click', () => {
    void signIn();
});
signOutBtn.addEventListener('click', () => {
    void signOut();
});
syncLocalBtn.addEventListener('click', () => {
    void syncLocalToCloud();
});
syncCloudBtn.addEventListener('click', () => {
    void syncCloudToLocal();
});
deleteCloudBtn.addEventListener('click', () => {
    void deleteCloudData();
});
exportBtn.addEventListener('click', exportData);
clearLocalBtn.addEventListener('click', () => {
    void clearLocalData();
});
openPrivacyBtn.addEventListener('click', () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL('privacy.html') });
});
openLibraryBtn.addEventListener('click', () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL('library.html') });
});
allowlistEnabledToggle.addEventListener('change', () => {
    void setAllowlistEnabled(allowlistEnabledToggle.checked);
});
addCurrentSiteBtn.addEventListener('click', () => {
    void addAllowlistSite(currentAllowlistHostname ?? undefined);
});
addSiteForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void addAllowlistSite(siteInput.value);
});
async function init() {
    await loadAuthStatus();
    await loadHistory();
    await loadPrivacyStatus();
    await loadAllowlistStatus();
}
void init();
export {};
//# sourceMappingURL=options.js.map