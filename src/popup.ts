type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

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
  videoDurationSec?: number | null;
  syncStatus?: SyncStatus;
  syncError?: string;
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
}

const listEl = document.getElementById('list') as HTMLElement;
const template = document.getElementById('rowTemplate') as HTMLTemplateElement;
const totalItemsEl = document.getElementById('totalItems') as HTMLElement;
const totalHoursEl = document.getElementById('totalHours') as HTMLElement;
const filterEl = document.getElementById('typeFilter') as HTMLSelectElement;
const exportBtn = document.getElementById('exportBtn') as HTMLButtonElement;
const clearBtn = document.getElementById('clearBtn') as HTMLButtonElement;
const enabledToggle = document.getElementById('enabledToggle') as HTMLInputElement;
const consentCard = document.getElementById('consentCard') as HTMLElement;
const acceptConsentBtn = document.getElementById('acceptConsentBtn') as HTMLButtonElement;
const privacyLinkBtn = document.getElementById('privacyLinkBtn') as HTMLButtonElement;
const authStatusTextEl = document.getElementById('authStatusText') as HTMLElement;
const syncStatusTextEl = document.getElementById('syncStatusText') as HTMLElement;
const signInBtn = document.getElementById('signInBtn') as HTMLButtonElement;
const signOutBtn = document.getElementById('signOutBtn') as HTMLButtonElement;
const deleteCloudBtn = document.getElementById('deleteCloudBtn') as HTMLButtonElement;

let allRecords: WatchRecord[] = [];
let isSignedIn = false;
let hasPrivacyConsent = false;

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
    const node = template.content.firstElementChild?.cloneNode(true) as HTMLElement;

    const badgeEl = node.querySelector('.badge') as HTMLElement;
    const titleEl = node.querySelector('.card-title') as HTMLElement;
    const urlEl = node.querySelector('.card-url') as HTMLElement;
    const linkEl = node.querySelector('.open-btn') as HTMLAnchorElement;
    const metaContainer = node.querySelector('.card-meta') as HTMLElement;
    const progressBar = node.querySelector('.progress-bar') as HTMLElement;

    const mediaType = record.mediaType || 'unknown';
    const title = record.title || record.rawTitle || record.url;
    const watchedSeconds = Math.max(0, record.lastPlaybackTime ?? 0);
    const videoDurationSec = (record.videoDurationSec ?? 0) > 0 ? (record.videoDurationSec as number) : null;

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
      const metaText = metaItems[0].querySelector('.meta-text') as HTMLElement;
      metaText.textContent = `${watchedSeconds > 0 ? formatDuration(watchedSeconds) : '—'} elapsed`;
    }
    if (metaItems[1]) {
      const metaText = metaItems[1].querySelector('.meta-text') as HTMLElement;
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

function renderSyncSummary(): void {
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

async function loadData(): Promise<void> {
  const response = (await chrome.runtime.sendMessage({ type: 'getHistory' })) as GetHistoryResponse;
  if (!response?.ok) {
    return;
  }

  allRecords = response.history || [];
  enabledToggle.checked = Boolean(response.enabled);
  render();
}

async function loadPrivacyStatus(): Promise<void> {
  const response = (await chrome.runtime.sendMessage({ type: 'getPrivacyStatus' })) as PrivacyStatusResponse;
  if (!response?.ok) {
    return;
  }

  hasPrivacyConsent = Boolean(response.consentAccepted);
  consentCard.hidden = hasPrivacyConsent;
  enabledToggle.disabled = !hasPrivacyConsent;
  enabledToggle.checked = Boolean(response.enabled);
}

async function acceptPrivacyConsent(): Promise<void> {
  acceptConsentBtn.disabled = true;
  const response = (await chrome.runtime.sendMessage({ type: 'acceptPrivacyConsent' })) as PrivacyStatusResponse;
  if (response?.ok) {
    hasPrivacyConsent = true;
    consentCard.hidden = true;
    enabledToggle.disabled = false;
    enabledToggle.checked = Boolean(response.enabled);
    await loadData();
  }
  acceptConsentBtn.disabled = false;
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
  const message = isSignedIn ? 'Clear cloud and local tracked history?' : 'Clear local tracked history?';
  const shouldClear = confirm(message);
  if (!shouldClear) {
    return;
  }

  const response = (await chrome.runtime.sendMessage({
    type: 'clearHistory',
    scope: isSignedIn ? 'cloudAndLocal' : 'local'
  })) as { ok: boolean };
  if (response?.ok) {
    allRecords = [];
    render();
  }
}

async function setEnabled(enabled: boolean): Promise<void> {
  if (enabled && !hasPrivacyConsent) {
    enabledToggle.checked = false;
    consentCard.hidden = false;
    return;
  }

  const response = (await chrome.runtime.sendMessage({ type: 'setEnabled', enabled })) as { ok: boolean; error?: string };
  if (!response?.ok) {
    enabledToggle.checked = false;
    syncStatusTextEl.textContent = response?.error || 'Tracking unavailable';
  }
}

function setAuthUiState(response: AuthStatusResponse): void {
  isSignedIn = Boolean(response.signedIn);

  if (!response.configured) {
    authStatusTextEl.textContent = 'Set Supabase public config';
    syncStatusTextEl.textContent = 'Sync disabled';
    signInBtn.disabled = true;
    signOutBtn.disabled = true;
    deleteCloudBtn.disabled = true;
    return;
  }

  if (response.signedIn) {
    authStatusTextEl.textContent = response.user?.email || 'Signed in';
    signInBtn.disabled = true;
    signOutBtn.disabled = false;
    deleteCloudBtn.disabled = false;
    renderSyncSummary();
    return;
  }

  authStatusTextEl.textContent = 'Not signed in';
  signInBtn.disabled = false;
  signOutBtn.disabled = true;
  deleteCloudBtn.disabled = true;
  renderSyncSummary();
}

async function loadAuthStatus(): Promise<void> {
  const response = (await chrome.runtime.sendMessage({ type: 'getAuthStatus' })) as AuthStatusResponse;
  if (!response?.ok) {
    authStatusTextEl.textContent = 'Auth status unavailable';
    signOutBtn.disabled = true;
    return;
  }

  setAuthUiState(response);
}

async function signIn(): Promise<void> {
  signInBtn.disabled = true;
  const response = (await chrome.runtime.sendMessage({ type: 'signIn' })) as AuthStatusResponse;

  if (!response?.ok) {
    authStatusTextEl.textContent = response?.error || 'Sign-in failed';
    signInBtn.disabled = false;
    return;
  }

  await loadAuthStatus();
  await loadData();
}

async function signOut(): Promise<void> {
  signOutBtn.disabled = true;
  await chrome.runtime.sendMessage({ type: 'signOut' });
  await loadAuthStatus();
  await loadData();
}

async function deleteCloudData(): Promise<void> {
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
    render();
  } else {
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
deleteCloudBtn.addEventListener('click', () => {
  void deleteCloudData();
});
acceptConsentBtn.addEventListener('click', () => {
  void acceptPrivacyConsent();
});
privacyLinkBtn.addEventListener('click', () => {
  void chrome.tabs.create({ url: chrome.runtime.getURL('privacy.html') });
});

async function init(): Promise<void> {
  await loadPrivacyStatus();
  await loadData();
  await loadAuthStatus();
}

void init();

export {};
