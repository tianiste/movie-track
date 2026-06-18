type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

interface WatchRecord {
  id: string;
  title: string;
  rawTitle: string;
  hostname: string;
  url: string;
  durationSec: number;
  deletedAt?: number | null;
  syncStatus?: SyncStatus;
}

interface GetHistoryResponse {
  ok: boolean;
  history: WatchRecord[];
  enabled: boolean;
}

interface AuthUser {
  id: string;
  email?: string;
}

interface AuthStatusResponse {
  ok: boolean;
  configured: boolean;
  signedIn: boolean;
  user?: AuthUser | null;
  error?: string;
}

interface PrivacyStatusResponse {
  ok: boolean;
  consentAccepted: boolean;
  enabled: boolean;
  hostAccessGranted: boolean;
  error?: string;
}

interface AllowlistStatusResponse {
  ok: boolean;
  enabled: boolean;
  sites: string[];
  currentHostname: string | null;
  currentAllowed: boolean;
  error?: string;
}

const accountStatusText = document.getElementById('accountStatusText') as HTMLElement;
const syncStatusText = document.getElementById('syncStatusText') as HTMLElement;
const localStatusText = document.getElementById('localStatusText') as HTMLElement;
const trackingStatusText = document.getElementById('trackingStatusText') as HTMLElement;
const allowlistStatusText = document.getElementById('allowlistStatusText') as HTMLElement;
const signInBtn = document.getElementById('signInBtn') as HTMLButtonElement;
const signOutBtn = document.getElementById('signOutBtn') as HTMLButtonElement;
const syncLocalBtn = document.getElementById('syncLocalBtn') as HTMLButtonElement;
const syncCloudBtn = document.getElementById('syncCloudBtn') as HTMLButtonElement;
const deleteCloudBtn = document.getElementById('deleteCloudBtn') as HTMLButtonElement;
const exportBtn = document.getElementById('exportBtn') as HTMLButtonElement;
const clearLocalBtn = document.getElementById('clearLocalBtn') as HTMLButtonElement;
const openPrivacyBtn = document.getElementById('openPrivacyBtn') as HTMLButtonElement;
const openLibraryBtn = document.getElementById('openLibraryBtn') as HTMLButtonElement;
const allowlistEnabledToggle = document.getElementById('allowlistEnabledToggle') as HTMLInputElement;
const trackMutedToggle = document.getElementById('trackMutedToggle') as HTMLInputElement;
const addCurrentSiteBtn = document.getElementById('addCurrentSiteBtn') as HTMLButtonElement;
const addSiteForm = document.getElementById('addSiteForm') as HTMLFormElement;
const siteInput = document.getElementById('siteInput') as HTMLInputElement;
const allowlistSitesEl = document.getElementById('allowlistSites') as HTMLElement;

let allRecords: WatchRecord[] = [];
let isSignedIn = false;
let allowlistSites: string[] = [];
let currentAllowlistHostname: string | null = null;

function formatHours(records: WatchRecord[]): string {
  const seconds = records.reduce((sum, record) => sum + Math.max(0, record.durationSec || 0), 0);
  return (seconds / 3600).toFixed(1);
}

function getVisibleRecords(): WatchRecord[] {
  return allRecords.filter((record) => !record.deletedAt);
}

function renderSyncSummary(): void {
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

function renderLocalSummary(): void {
  const visibleRecords = getVisibleRecords();
  const recordLabel = visibleRecords.length === 1 ? 'record' : 'records';
  localStatusText.textContent = `${visibleRecords.length} ${recordLabel}, ${formatHours(visibleRecords)} hours watched`;
}

function setAuthUiState(response: AuthStatusResponse): void {
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

async function loadAuthStatus(): Promise<void> {
  const response = (await chrome.runtime.sendMessage({ type: 'getAuthStatus' })) as AuthStatusResponse;
  if (!response?.ok) {
    accountStatusText.textContent = response?.error || 'Auth status unavailable';
    signInBtn.disabled = true;
    signOutBtn.disabled = true;
    return;
  }

  setAuthUiState(response);
}

async function loadHistory(): Promise<void> {
  const response = (await chrome.runtime.sendMessage({ type: 'getHistory' })) as GetHistoryResponse;
  if (!response?.ok) {
    localStatusText.textContent = 'Local history unavailable';
    return;
  }

  allRecords = response.history || [];
  renderLocalSummary();
  renderSyncSummary();
}

async function loadPrivacyStatus(): Promise<void> {
  const response = (await chrome.runtime.sendMessage({ type: 'getPrivacyStatus' })) as PrivacyStatusResponse;
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

async function loadMutedTrackingStatus(): Promise<void> {
  const response = (await chrome.runtime.sendMessage({ type: 'getMutedTrackingStatus' })) as { ok: boolean; enabled: boolean };
  trackMutedToggle.checked = Boolean(response?.ok && response.enabled);
}

function renderAllowlistStatus(response: AllowlistStatusResponse): void {
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

async function loadAllowlistStatus(): Promise<void> {
  const response = (await chrome.runtime.sendMessage({ type: 'getAllowlistStatus' })) as AllowlistStatusResponse;
  if (!response?.ok) {
    allowlistStatusText.textContent = response?.error || 'Site allowlist unavailable';
    return;
  }

  renderAllowlistStatus(response);
}

async function setAllowlistEnabled(enabled: boolean): Promise<void> {
  const response = (await chrome.runtime.sendMessage({ type: 'setAllowlistEnabled', enabled })) as AllowlistStatusResponse;
  if (!response?.ok) {
    allowlistEnabledToggle.checked = !enabled;
    allowlistStatusText.textContent = response?.error || 'Could not update allowlist';
    return;
  }

  renderAllowlistStatus(response);
}

async function addAllowlistSite(site?: string): Promise<void> {
  const response = (await chrome.runtime.sendMessage({ type: 'addAllowlistSite', site })) as AllowlistStatusResponse;
  if (!response?.ok) {
    allowlistStatusText.textContent = response?.error || 'Could not add site';
    return;
  }

  siteInput.value = '';
  renderAllowlistStatus(response);
}

async function removeAllowlistSite(site: string): Promise<void> {
  const response = (await chrome.runtime.sendMessage({ type: 'removeAllowlistSite', site })) as AllowlistStatusResponse;
  if (!response?.ok) {
    allowlistStatusText.textContent = response?.error || 'Could not remove site';
    return;
  }

  renderAllowlistStatus(response);
}

async function signIn(): Promise<void> {
  signInBtn.disabled = true;
  const response = (await chrome.runtime.sendMessage({ type: 'signIn' })) as AuthStatusResponse;

  if (!response?.ok) {
    accountStatusText.textContent = response?.error || 'Sign-in failed';
    signInBtn.disabled = false;
    return;
  }

  await loadAuthStatus();
  await loadHistory();
}

async function signOut(): Promise<void> {
  signOutBtn.disabled = true;
  await chrome.runtime.sendMessage({ type: 'signOut' });
  await loadAuthStatus();
  await loadHistory();
}

async function syncCloudToLocal(): Promise<void> {
  if (!isSignedIn) {
    return;
  }

  syncCloudBtn.disabled = true;
  syncStatusText.textContent = 'Syncing cloud history...';

  const response = (await chrome.runtime.sendMessage({ type: 'syncCloudToLocal' })) as {
    ok: boolean;
    history?: WatchRecord[];
    error?: string;
  };

  if (response?.ok) {
    allRecords = response.history || [];
    renderLocalSummary();
    syncStatusText.textContent = 'Cloud history synced to this device';
  } else {
    syncStatusText.textContent = response?.error || 'Cloud sync failed';
  }

  syncCloudBtn.disabled = !isSignedIn;
}

async function syncLocalToCloud(): Promise<void> {
  if (!isSignedIn) {
    return;
  }

  syncLocalBtn.disabled = true;
  syncStatusText.textContent = 'Syncing local history to cloud...';

  const response = (await chrome.runtime.sendMessage({ type: 'syncNow' })) as {
    ok: boolean;
    synced?: number;
    failed?: number;
    error?: string;
  };

  if (response?.ok) {
    syncStatusText.textContent = `${response.synced ?? 0} local records synced to cloud`;
    await loadHistory();
  } else {
    syncStatusText.textContent = response?.error || 'Local sync failed';
  }

  syncLocalBtn.disabled = !isSignedIn;
}

async function deleteCloudData(): Promise<void> {
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
  })) as { ok: boolean; error?: string };

  if (response?.ok) {
    allRecords = [];
    renderLocalSummary();
    renderSyncSummary();
  } else {
    syncStatusText.textContent = response?.error || 'Delete failed';
  }

  deleteCloudBtn.disabled = !isSignedIn;
}

function exportData(): void {
  const data = JSON.stringify(getVisibleRecords(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `movietrack-${Date.now()}.json`;
  a.click();

  URL.revokeObjectURL(url);
}

async function clearLocalData(): Promise<void> {
  const shouldClear = confirm('Clear local MovieTrack history on this device? Cloud data stays in your account.');
  if (!shouldClear) {
    return;
  }

  const response = (await chrome.runtime.sendMessage({
    type: 'clearHistory',
    scope: 'local'
  })) as { ok: boolean; error?: string };

  if (response?.ok) {
    allRecords = [];
    renderLocalSummary();
    renderSyncSummary();
  } else {
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
trackMutedToggle.addEventListener('change', async () => {
  const enabled = trackMutedToggle.checked;
  const response = (await chrome.runtime.sendMessage({ type: 'setMutedTrackingEnabled', enabled })) as { ok: boolean };
  if (!response?.ok) {
    trackMutedToggle.checked = !enabled;
  }
});
addCurrentSiteBtn.addEventListener('click', () => {
  void addAllowlistSite(currentAllowlistHostname ?? undefined);
});
addSiteForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void addAllowlistSite(siteInput.value);
});

async function init(): Promise<void> {
  await loadAuthStatus();
  await loadHistory();
  await loadPrivacyStatus();
  await loadMutedTrackingStatus();
  await loadAllowlistStatus();
}

void init();

export {};
