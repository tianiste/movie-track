const accountStatusText = document.getElementById('accountStatusText');
const syncStatusText = document.getElementById('syncStatusText');
const localStatusText = document.getElementById('localStatusText');
const trackingStatusText = document.getElementById('trackingStatusText');
const signInBtn = document.getElementById('signInBtn');
const signOutBtn = document.getElementById('signOutBtn');
const syncCloudBtn = document.getElementById('syncCloudBtn');
const deleteCloudBtn = document.getElementById('deleteCloudBtn');
const exportBtn = document.getElementById('exportBtn');
const clearLocalBtn = document.getElementById('clearLocalBtn');
const openPrivacyBtn = document.getElementById('openPrivacyBtn');
let allRecords = [];
let isSignedIn = false;
function formatHours(records) {
    const seconds = records.reduce((sum, record) => sum + Math.max(0, record.durationSec || 0), 0);
    return (seconds / 3600).toFixed(1);
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
    const recordLabel = allRecords.length === 1 ? 'record' : 'records';
    localStatusText.textContent = `${allRecords.length} ${recordLabel}, ${formatHours(allRecords)} hours watched`;
}
function setAuthUiState(response) {
    isSignedIn = Boolean(response.signedIn);
    if (!response.configured) {
        accountStatusText.textContent = 'Supabase public config missing';
        signInBtn.disabled = true;
        signOutBtn.disabled = true;
        syncCloudBtn.disabled = true;
        deleteCloudBtn.disabled = true;
        renderSyncSummary();
        return;
    }
    if (response.signedIn) {
        accountStatusText.textContent = response.user?.email || 'Signed in';
        signInBtn.hidden = true;
        signOutBtn.hidden = false;
        syncCloudBtn.disabled = false;
        deleteCloudBtn.disabled = false;
        renderSyncSummary();
        return;
    }
    accountStatusText.textContent = 'Not signed in';
    signInBtn.hidden = false;
    signOutBtn.hidden = true;
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
    const data = JSON.stringify(allRecords, null, 2);
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
async function init() {
    await loadAuthStatus();
    await loadHistory();
    await loadPrivacyStatus();
}
void init();
export {};
//# sourceMappingURL=options.js.map