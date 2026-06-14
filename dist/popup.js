const POPUP_PAGE_SIZE = 20;
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
const expandedGroupKeys = new Set();
let visibleEntryCount = POPUP_PAGE_SIZE;
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
function getWatchRatio(record) {
    const watched = record.lastPlaybackTime ?? 0;
    const duration = record.videoDurationSec ?? 0;
    if (!Number.isFinite(watched) || !Number.isFinite(duration) || duration <= 0) {
        return null;
    }
    return Math.max(0, Math.min(1, watched / duration));
}
function isRecordComplete(record) {
    const ratio = getWatchRatio(record);
    const watched = record.lastPlaybackTime ?? 0;
    const duration = record.videoDurationSec ?? 0;
    if (ratio === null || duration < 30 || watched <= 0) {
        return false;
    }
    const remainingSec = Math.max(0, duration - watched);
    return ratio >= 0.9 || (ratio >= 0.85 && remainingSec <= 60);
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
function getDisplayRecord(record) {
    const fallbackText = [record.title, record.rawTitle, record.hostname, record.url].filter(Boolean).join(' ');
    const urlHint = parseSeasonEpisodeFromUrl(record.url);
    return {
        record,
        mediaType: record.manualMediaType ?? record.mediaType ?? 'unknown',
        title: record.manualTitle || record.title || record.rawTitle || record.url,
        season: record.manualSeason ?? record.season ?? parseSeasonHint(fallbackText) ?? urlHint.season,
        episode: record.manualEpisode ?? record.episode ?? parseEpisodeHint(fallbackText) ?? urlHint.episode
    };
}
function inferGroupTitle(item) {
    const title = item.title
        .replace(/\bS\d{1,2}\s*E\d{1,4}\b/gi, '')
        .replace(/\bSeason\s*\d{1,2}\b/gi, '')
        .replace(/\bEpisode\s*\d{1,4}\b/gi, '')
        .replace(/\bEp\s*\d{1,4}\b/gi, '')
        .replace(/\bWatch\s+(?:All\s+)?Episodes?\b/gi, '')
        .replace(/\bWatch\s+Online(?:\s+Free)?\b/gi, '')
        .replace(/\bin\s+HD\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    return title || item.title;
}
function groupSeasonRecords(items) {
    const groupsByKey = new Map();
    const singles = [];
    for (const item of items) {
        if (item.season === null) {
            singles.push(item);
            continue;
        }
        const groupTitle = inferGroupTitle(item);
        const key = `${item.mediaType}:${normalizeFilterText(groupTitle)}`;
        const existing = groupsByKey.get(key);
        if (existing) {
            existing.records.push(item);
            existing.latestAt = Math.max(existing.latestAt, item.record.startedAt);
        }
        else {
            groupsByKey.set(key, {
                key,
                title: groupTitle,
                mediaType: item.mediaType,
                records: [item],
                latestAt: item.record.startedAt
            });
        }
    }
    return {
        groups: [...groupsByKey.values()].sort((a, b) => b.latestAt - a.latestAt),
        singles
    };
}
function groupBySeason(items) {
    const bySeason = new Map();
    for (const item of items) {
        const key = item.season === null ? 'unknown' : String(item.season).padStart(4, '0');
        const existing = bySeason.get(key) || [];
        existing.push(item);
        bySeason.set(key, existing);
    }
    for (const seasonItems of bySeason.values()) {
        seasonItems.sort((a, b) => {
            const episodeA = a.episode ?? Number.MAX_SAFE_INTEGER;
            const episodeB = b.episode ?? Number.MAX_SAFE_INTEGER;
            return episodeA - episodeB || b.record.startedAt - a.record.startedAt;
        });
    }
    return new Map([...bySeason.entries()].sort(([a], [b]) => a.localeCompare(b)));
}
function formatGroupSeasonSummary(group) {
    const seasons = [...new Set(group.records.map((item) => item.season).filter((season) => season !== null))]
        .sort((a, b) => a - b);
    const latest = [...group.records].sort((a, b) => b.record.startedAt - a.record.startedAt)[0];
    const latestEpisode = latest?.episode !== null && latest?.episode !== undefined ? `latest E${latest.episode}` : '';
    const seasonLabel = seasons.length === 0
        ? 'No season'
        : seasons.length === 1
            ? `Season ${seasons[0]}`
            : `Seasons ${seasons.join(', ')}`;
    return [seasonLabel, latestEpisode, `${group.records.length} records`].filter(Boolean).join(' · ');
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
async function deleteRecord(record, ask = true) {
    if (ask && !confirm(`Delete "${record.manualTitle || record.title || record.rawTitle || record.url}"?`)) {
        return false;
    }
    const response = (await chrome.runtime.sendMessage({
        type: 'deleteRecord',
        id: record.id
    }));
    if (!response?.ok) {
        syncStatusTextEl.textContent = response?.error || 'Delete failed';
        return false;
    }
    allRecords = response.history || allRecords.filter((item) => item.id !== record.id);
    return true;
}
async function deleteGroup(group) {
    if (!confirm(`Delete ${group.records.length} records in "${group.title}"?`)) {
        return;
    }
    for (const item of group.records) {
        const deleted = await deleteRecord(item.record, false);
        if (!deleted) {
            return;
        }
    }
    expandedGroupKeys.delete(group.key);
    render();
}
function renderRecordCard(item) {
    const record = item.record;
    const node = template.content.firstElementChild?.cloneNode(true);
    const badgeEl = node.querySelector('.badge');
    const titleEl = node.querySelector('.card-title');
    const urlEl = node.querySelector('.card-url');
    const linkEl = node.querySelector('.open-btn');
    const deleteBtn = node.querySelector('.delete-record-btn');
    const metaContainer = node.querySelector('.card-meta');
    const progressBar = node.querySelector('.progress-bar');
    const mediaType = item.mediaType;
    const watchedSeconds = Math.max(0, record.lastPlaybackTime ?? 0);
    const videoDurationSec = (record.videoDurationSec ?? 0) > 0 ? record.videoDurationSec : null;
    const isComplete = isRecordComplete(record);
    badgeEl.textContent = mediaType.toUpperCase();
    badgeEl.className = `badge ${mediaType}`;
    titleEl.textContent = item.title;
    urlEl.textContent = (record.hostname || record.url).substring(0, 40);
    linkEl.href = record.url;
    linkEl.title = isComplete ? 'Open from start' : watchedSeconds > 0 ? `Continue from ${formatDuration(watchedSeconds)}` : 'Open';
    linkEl.addEventListener('click', (event) => {
        event.preventDefault();
        void chrome.runtime.sendMessage({
            type: 'openWithResume',
            url: record.url,
            resumeAtSec: isComplete ? 0 : watchedSeconds
        });
    });
    deleteBtn.addEventListener('click', () => {
        void deleteRecord(record).then((deleted) => {
            if (deleted) {
                render();
            }
        });
    });
    const metaItems = metaContainer.querySelectorAll('.meta-item');
    if (metaItems[0]) {
        const metaText = metaItems[0].querySelector('.meta-text');
        metaText.textContent = isComplete ? 'Finished' : `${watchedSeconds > 0 ? formatDuration(watchedSeconds) : '—'} elapsed`;
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
        const seasonLabel = formatSeasonLabel(item.season);
        metaItem.hidden = !seasonLabel;
        metaText.textContent = seasonLabel;
    }
    if (metaItems[3]) {
        const metaItem = metaItems[3];
        const metaText = metaItem.querySelector('.meta-text');
        const episodeLabel = formatEpisodeNumberLabel(item.episode);
        metaItem.hidden = !episodeLabel;
        metaText.textContent = episodeLabel;
    }
    const progressPercent = isComplete
        ? 100
        : videoDurationSec
            ? Math.min(100, Math.round((watchedSeconds / videoDurationSec) * 100))
            : 0;
    progressBar.style.width = progressPercent + '%';
    node.classList.add(mediaType);
    node.classList.toggle('complete', isComplete);
    return node;
}
function renderSeasonGroup(group) {
    const groupEl = document.createElement('article');
    groupEl.className = `popup-group ${group.mediaType}`;
    const isExpanded = expandedGroupKeys.has(group.key);
    groupEl.classList.toggle('expanded', isExpanded);
    const headerEl = document.createElement('header');
    headerEl.className = 'popup-group-header';
    const badgeEl = document.createElement('span');
    badgeEl.className = `badge ${group.mediaType}`;
    badgeEl.textContent = group.mediaType.toUpperCase();
    const headingWrap = document.createElement('div');
    headingWrap.className = 'popup-group-title-wrap';
    const titleEl = document.createElement('h3');
    titleEl.className = 'popup-group-title';
    titleEl.textContent = group.title;
    const metaEl = document.createElement('p');
    metaEl.className = 'popup-group-meta';
    metaEl.textContent = formatGroupSeasonSummary(group);
    headingWrap.append(titleEl, metaEl);
    const expandBtn = document.createElement('button');
    expandBtn.className = 'icon-btn popup-group-toggle';
    expandBtn.type = 'button';
    expandBtn.setAttribute('aria-expanded', String(isExpanded));
    expandBtn.title = isExpanded ? 'Collapse episodes' : 'Show episodes';
    const expandIcon = document.createElement('span');
    expandIcon.className = 'material-symbols-outlined';
    expandIcon.textContent = 'expand_more';
    expandBtn.append(expandIcon);
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'icon-btn popup-group-delete';
    deleteBtn.type = 'button';
    deleteBtn.title = 'Delete group';
    const deleteIcon = document.createElement('span');
    deleteIcon.className = 'material-symbols-outlined';
    deleteIcon.textContent = 'delete';
    deleteBtn.append(deleteIcon);
    expandBtn.addEventListener('click', () => {
        if (expandedGroupKeys.has(group.key)) {
            expandedGroupKeys.delete(group.key);
        }
        else {
            expandedGroupKeys.add(group.key);
        }
        render();
    });
    deleteBtn.addEventListener('click', () => {
        void deleteGroup(group);
    });
    const actionsEl = document.createElement('div');
    actionsEl.className = 'popup-group-actions';
    actionsEl.append(deleteBtn, expandBtn);
    headerEl.append(badgeEl, headingWrap, actionsEl);
    groupEl.append(headerEl);
    const bodyEl = document.createElement('div');
    bodyEl.className = 'popup-group-body';
    bodyEl.hidden = !isExpanded;
    if (isExpanded) {
        for (const [seasonKey, seasonRecords] of groupBySeason(group.records)) {
            const seasonEl = document.createElement('section');
            seasonEl.className = 'popup-season';
            const seasonTitle = document.createElement('p');
            seasonTitle.className = 'popup-season-title';
            seasonTitle.textContent = seasonKey === 'unknown' ? 'No season' : `Season ${Number(seasonKey)}`;
            seasonEl.append(seasonTitle);
            for (const item of seasonRecords) {
                seasonEl.append(renderRecordCard(item));
            }
            bodyEl.append(seasonEl);
        }
    }
    groupEl.append(bodyEl);
    return groupEl;
}
function renderLoadMore(remainingCount) {
    const button = document.createElement('button');
    button.className = 'load-more-btn';
    button.type = 'button';
    button.textContent = `Load more (${remainingCount} left)`;
    button.addEventListener('click', () => {
        visibleEntryCount += POPUP_PAGE_SIZE;
        render();
    });
    return button;
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
    const displayRecords = records.map(getDisplayRecord);
    const { groups, singles } = groupSeasonRecords(displayRecords);
    const entries = [
        ...groups.map((group) => ({ type: 'group', latestAt: group.latestAt, group })),
        ...singles.map((item) => ({ type: 'single', latestAt: item.record.startedAt, item }))
    ].sort((a, b) => b.latestAt - a.latestAt);
    const visibleEntries = entries.slice(0, visibleEntryCount);
    const remainingEntries = entries.length - visibleEntries.length;
    const fragment = document.createDocumentFragment();
    for (const entry of visibleEntries) {
        fragment.append(entry.type === 'group' ? renderSeasonGroup(entry.group) : renderRecordCard(entry.item));
    }
    if (remainingEntries > 0) {
        fragment.append(renderLoadMore(remainingEntries));
    }
    listEl.append(fragment);
}
function resetPagination() {
    visibleEntryCount = POPUP_PAGE_SIZE;
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
filterEl.addEventListener('change', () => {
    resetPagination();
    render();
});
searchFilterEl.addEventListener('input', () => {
    resetPagination();
    render();
});
dateFilterEl.addEventListener('change', () => {
    resetPagination();
    render();
});
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