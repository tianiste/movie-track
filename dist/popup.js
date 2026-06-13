const listEl = document.getElementById('list');
const template = document.getElementById('rowTemplate');
const totalItemsEl = document.getElementById('totalItems');
const totalHoursEl = document.getElementById('totalHours');
const filtersToggleBtn = document.getElementById('filtersToggleBtn');
const filterDrawerEl = document.getElementById('filterDrawer');
const searchFilterEl = document.getElementById('searchFilter');
const dateFilterEl = document.getElementById('dateFilter');
const filterEl = document.getElementById('typeFilter');
const exportBtn = document.getElementById('exportBtn');
const clearBtn = document.getElementById('clearBtn');
const libraryBtn = document.getElementById('libraryBtn');
const settingsBtn = document.getElementById('settingsBtn');
const enabledToggle = document.getElementById('enabledToggle');
const consentCard = document.getElementById('consentCard');
const acceptConsentBtn = document.getElementById('acceptConsentBtn');
const privacyLinkBtn = document.getElementById('privacyLinkBtn');
const authStatusTextEl = document.getElementById('authStatusText');
const syncStatusTextEl = document.getElementById('syncStatusText');
let allRecords = [];
let isSignedIn = false;
let hasPrivacyConsent = false;
let hasHostAccess = false;
let isFilterDrawerOpen = false;
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
function toDateInputValue(timestamp) {
    const dt = new Date(timestamp);
    const year = dt.getFullYear();
    const month = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
function formatEpisodeLabel(season, episode) {
    if (season !== null && episode !== null) {
        return `S${season} E${episode}`;
    }
    if (episode !== null) {
        return `Ep ${episode}`;
    }
    if (season !== null) {
        return `Season ${season}`;
    }
    return '';
}
function formatSeasonLabel(season) {
    if (season === null) {
        return '';
    }
    return `S${season}`;
}
function formatEpisodeNumberLabel(episode) {
    if (episode === null) {
        return '';
    }
    return `E${episode}`;
}
function parseSeasonHint(text) {
    const seasonPatterns = [
        /\b(?:season|series|seas)\s*[:#._\-/]?\s*(\d{1,2})(?:st|nd|rd|th)?\b/i,
        /\b(?:season|series)\s*[-_\/\s]*(\d{1,2})(?:st|nd|rd|th)?\b/i,
        /\bs(?:eason)?\s*[:#._\-/]?\s*(\d{1,2})(?:st|nd|rd|th)?\b/i,
        /\bs(\d{1,2})(?:\b|[-_\/])/i,
        /\b(\d{1,2})(?:st|nd|rd|th)?\s*(?:season|series)\b/i
    ];
    for (const pattern of seasonPatterns) {
        const match = text.match(pattern);
        if (match) {
            return Number(match[1]);
        }
    }
    return null;
}
function parseEpisodeHint(text) {
    const episodePatterns = [
        /\b(?:episode|ep|e)\s*[:#._\-/]?\s*(\d{1,4})(?:st|nd|rd|th)?\b/i,
        /\b(?:part|pt)\s*[:#._\-/]?\s*(\d{1,4})(?:st|nd|rd|th)?\b/i,
        /\b(?:ova|ona|specials?|extras?)\s*[:#._\-/]?\s*(\d{1,4})(?:st|nd|rd|th)?\b/i,
        /\b#\s*(\d{1,4})\b/i,
        /\b(\d{1,4})\s*(?:vostfr|sub|dub|dubbed|subbed)\b/i
    ];
    for (const pattern of episodePatterns) {
        const match = text.match(pattern);
        if (match) {
            return Number(match[1]);
        }
    }
    return null;
}
function parseSeasonEpisodeFromUrl(urlString) {
    try {
        const url = new URL(urlString);
        const parts = [url.pathname, url.hash];
        url.searchParams.forEach((value, key) => {
            const normalizedKey = key.toLowerCase();
            if (['s', 'season', 'seasonno', 'season_num', 'seasonnumber', 'seasonid'].includes(normalizedKey)) {
                parts.push(`season ${value}`);
            }
            if (['e', 'ep', 'episode', 'episodeid', 'episode_num', 'episodenumber'].includes(normalizedKey)) {
                parts.push(`episode ${value}`);
            }
            parts.push(value);
        });
        const text = parts.join(' ');
        return {
            season: parseSeasonHint(text),
            episode: parseEpisodeHint(text)
        };
    }
    catch {
        return { season: null, episode: null };
    }
}
function normalizeFilterText(value) {
    return value.trim().toLowerCase();
}
function setFilterDrawerOpen(open) {
    isFilterDrawerOpen = open;
    filterDrawerEl.classList.toggle('open', open);
    filterDrawerEl.setAttribute('aria-hidden', String(!open));
    filtersToggleBtn.setAttribute('aria-expanded', String(open));
}
function getFilteredRecords() {
    const type = filterEl.value;
    const searchValue = normalizeFilterText(searchFilterEl.value);
    const dateValue = dateFilterEl.value;
    const sorted = allRecords
        .filter((record) => !record.deletedAt)
        .sort((a, b) => b.startedAt - a.startedAt);
    return sorted.filter((record) => {
        const mediaType = record.manualMediaType ?? record.mediaType;
        if (type !== 'all' && mediaType !== type) {
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
    });
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
        empty.textContent = allRecords.length === 0 ? 'No records yet.' : 'No records match your filters.';
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
        const mediaType = record.manualMediaType ?? record.mediaType ?? 'unknown';
        const title = record.manualTitle || record.title || record.rawTitle || record.url;
        const watchedSeconds = Math.max(0, record.lastPlaybackTime ?? 0);
        const videoDurationSec = (record.videoDurationSec ?? 0) > 0 ? record.videoDurationSec : null;
        const fallbackText = [record.title, record.rawTitle, record.hostname, record.url].filter(Boolean).join(' ');
        const urlHint = parseSeasonEpisodeFromUrl(record.url);
        const seasonValue = record.manualSeason ?? record.season ?? parseSeasonHint(fallbackText) ?? urlHint.season;
        const episodeValue = record.manualEpisode ?? record.episode ?? parseEpisodeHint(fallbackText) ?? urlHint.episode;
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
        if (metaItems[2]) {
            const metaItem = metaItems[2];
            const metaText = metaItem.querySelector('.meta-text');
            const seasonLabel = formatSeasonLabel(seasonValue);
            metaItem.hidden = !seasonLabel;
            metaText.textContent = seasonLabel;
        }
        if (metaItems[3]) {
            const metaItem = metaItems[3];
            const metaText = metaItem.querySelector('.meta-text');
            const episodeLabel = formatEpisodeNumberLabel(episodeValue);
            metaItem.hidden = !episodeLabel;
            metaText.textContent = episodeLabel;
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
    const shouldClear = confirm('Clear local tracked history on this device? Cloud data can be deleted from Settings.');
    if (!shouldClear) {
        return;
    }
    const response = (await chrome.runtime.sendMessage({
        type: 'clearHistory',
        scope: 'local'
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
    if (!response.configured) {
        authStatusTextEl.textContent = 'Set Supabase public config';
        syncStatusTextEl.textContent = 'Sync disabled';
        return;
    }
    if (response.signedIn) {
        authStatusTextEl.textContent = response.user?.email || 'Signed in';
        renderSyncSummary();
        return;
    }
    authStatusTextEl.textContent = 'Not signed in';
    renderSyncSummary();
}
async function loadAuthStatus() {
    const response = (await chrome.runtime.sendMessage({ type: 'getAuthStatus' }));
    if (!response?.ok) {
        authStatusTextEl.textContent = 'Auth status unavailable';
        return;
    }
    setAuthUiState(response);
}
filterEl.addEventListener('change', render);
searchFilterEl.addEventListener('input', render);
dateFilterEl.addEventListener('change', render);
filtersToggleBtn.addEventListener('click', () => {
    setFilterDrawerOpen(!isFilterDrawerOpen);
});
exportBtn.addEventListener('click', exportData);
clearBtn.addEventListener('click', clearData);
enabledToggle.addEventListener('change', () => {
    void setEnabled(enabledToggle.checked);
});
settingsBtn.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
        void chrome.runtime.openOptionsPage();
        return;
    }
    void chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
});
libraryBtn.addEventListener('click', () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL('library.html') });
});
acceptConsentBtn.addEventListener('click', () => {
    void acceptPrivacyConsent();
});
privacyLinkBtn.addEventListener('click', () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL('privacy.html') });
});
async function init() {
    setFilterDrawerOpen(false);
    await loadPrivacyStatus();
    await loadData();
    await loadAuthStatus();
}
void init();
export {};
//# sourceMappingURL=popup.js.map