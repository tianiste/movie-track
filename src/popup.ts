type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';
type WatchStatus = 'continue' | 'finished';
const POPUP_PAGE_SIZE = 20;
const POPUP_HISTORY_LIMIT = 50;

interface WatchRecord {
  id: string;
  tabId: number;
  url: string;
  hostname: string;
  rawTitle: string;
  title: string;
  mediaType: 'anime' | 'movie' | 'youtube' | 'unknown';
  season: number | null;
  episode: number | null;
  confidence: number;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  lastPlaybackTime?: number;
  videoDurationSec?: number | null;
  manualTitle?: string | null;
  manualMediaType?: 'anime' | 'movie' | 'youtube' | 'unknown' | null;
  manualSeason?: number | null;
  manualEpisode?: number | null;
  manualGroupTitle?: string | null;
  manualStatus?: WatchStatus | null;
  deletedAt?: number | null;
  syncStatus?: SyncStatus;
  syncError?: string;
}

type RecordPatch = Partial<Pick<WatchRecord, 'manualTitle' | 'manualMediaType' | 'manualSeason' | 'manualEpisode' | 'manualStatus'>>;

interface DisplayRecord {
  record: WatchRecord;
  mediaType: WatchRecord['mediaType'];
  title: string;
  season: number | null;
  episode: number | null;
}

interface PopupGroup {
  key: string;
  title: string;
  mediaType: WatchRecord['mediaType'];
  records: DisplayRecord[];
  latestAt: number;
}

interface GetHistoryResponse {
  ok: boolean;
  history: WatchRecord[];
  enabled: boolean;
  total?: number;
  totalDurationSec?: number;
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

const listEl = document.getElementById('list') as HTMLElement;
const template = document.getElementById('rowTemplate') as HTMLTemplateElement;
const totalItemsEl = document.getElementById('totalItems') as HTMLElement;
const totalHoursEl = document.getElementById('totalHours') as HTMLElement;
const filtersToggleBtn = document.getElementById('filtersToggleBtn') as HTMLButtonElement;
const filterDrawerEl = document.getElementById('filterDrawer') as HTMLElement;
const searchFilterEl = document.getElementById('searchFilter') as HTMLInputElement;
const dateFilterEl = document.getElementById('dateFilter') as HTMLInputElement;
const filterEl = document.getElementById('typeFilter') as HTMLSelectElement;
const statusFilterEl = document.getElementById('statusFilter') as HTMLSelectElement;
const exportBtn = document.getElementById('exportBtn') as HTMLButtonElement;
const clearBtn = document.getElementById('clearBtn') as HTMLButtonElement;
const libraryBtn = document.getElementById('libraryBtn') as HTMLButtonElement;
const settingsBtn = document.getElementById('settingsBtn') as HTMLButtonElement;
const enabledToggle = document.getElementById('enabledToggle') as HTMLInputElement;
const consentCard = document.getElementById('consentCard') as HTMLElement;
const acceptConsentBtn = document.getElementById('acceptConsentBtn') as HTMLButtonElement;
const privacyLinkBtn = document.getElementById('privacyLinkBtn') as HTMLButtonElement;
const authStatusTextEl = document.getElementById('authStatusText') as HTMLElement;
const syncStatusTextEl = document.getElementById('syncStatusText') as HTMLElement;
const editDialog = document.getElementById('editDialog') as HTMLDialogElement;
const editForm = document.getElementById('editForm') as HTMLFormElement;
const cancelEditBtn = document.getElementById('cancelEditBtn') as HTMLButtonElement;
const resetEditBtn = document.getElementById('resetEditBtn') as HTMLButtonElement;
const titleInput = document.getElementById('titleInput') as HTMLInputElement;
const mediaTypeInput = document.getElementById('mediaTypeInput') as HTMLSelectElement;
const seasonInput = document.getElementById('seasonInput') as HTMLInputElement;
const episodeInput = document.getElementById('episodeInput') as HTMLInputElement;
const editStatus = document.getElementById('editStatus') as HTMLElement;

let allRecords: WatchRecord[] = [];
let totalRecordCount: number | null = null;
let totalDurationSec: number | null = null;
let editingRecord: WatchRecord | null = null;
let isSignedIn = false;
let hasPrivacyConsent = false;
let hasHostAccess = false;
let isFilterDrawerOpen = false;
const expandedGroupKeys = new Set<string>();
let visibleEntryCount = POPUP_PAGE_SIZE;

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

function toDateInputValue(timestamp: number): string {
  const dt = new Date(timestamp);
  const year = dt.getFullYear();
  const month = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatEpisodeLabel(season: number | null, episode: number | null): string {
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

function formatSeasonLabel(season: number | null): string {
  if (season === null) {
    return '';
  }

  return `S${season}`;
}

function formatEpisodeNumberLabel(episode: number | null): string {
  if (episode === null) {
    return '';
  }

  return `E${episode}`;
}

function getWatchRatio(record: WatchRecord): number | null {
  const watched = record.lastPlaybackTime ?? 0;
  const duration = record.videoDurationSec ?? 0;
  if (!Number.isFinite(watched) || !Number.isFinite(duration) || duration <= 0) {
    return null;
  }
  return Math.max(0, Math.min(1, watched / duration));
}

function isRecordComplete(record: WatchRecord): boolean {
  const ratio = getWatchRatio(record);
  const watched = record.lastPlaybackTime ?? 0;
  const duration = record.videoDurationSec ?? 0;
  if (ratio === null || duration < 30 || watched <= 0) {
    return false;
  }

  const remainingSec = Math.max(0, duration - watched);
  return ratio >= 0.9 || (ratio >= 0.85 && remainingSec <= 60);
}

function getWatchStatus(record: WatchRecord): WatchStatus {
  if (record.manualStatus === 'continue' || record.manualStatus === 'finished') {
    return record.manualStatus;
  }

  return isRecordComplete(record) ? 'finished' : 'continue';
}

function parseSeasonHint(text: string): number | null {
  const seasonPatterns: RegExp[] = [
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

function parseEpisodeHint(text: string): number | null {
  const episodePatterns: RegExp[] = [
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

function parseSeasonEpisodeFromUrl(urlString: string): { season: number | null; episode: number | null } {
  try {
    const url = new URL(urlString);
    const parts: string[] = [url.pathname, url.hash];

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
  } catch {
    return { season: null, episode: null };
  }
}

function normalizeFilterText(value: string): string {
  return value.trim().toLowerCase();
}

function getDisplayRecord(record: WatchRecord): DisplayRecord {
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

function parseNumberInput(input: HTMLInputElement): number | null {
  if (!input.value.trim()) {
    return null;
  }
  const value = Number(input.value);
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

function openRecordEditor(record: WatchRecord): void {
  editingRecord = record;
  editStatus.textContent = '';
  titleInput.value = record.manualTitle || record.title || record.rawTitle || record.url;
  mediaTypeInput.value = record.manualMediaType ?? record.mediaType ?? 'unknown';
  const season = record.manualSeason ?? record.season;
  const episode = record.manualEpisode ?? record.episode;
  seasonInput.value = season === null ? '' : String(season);
  episodeInput.value = episode === null ? '' : String(episode);
  editDialog.showModal();
}

async function updateRecord(record: WatchRecord, reset = false): Promise<boolean> {
  const patch: RecordPatch = reset
    ? {
        manualTitle: null,
        manualMediaType: null,
        manualSeason: null,
        manualEpisode: null,
        manualStatus: null
      }
    : {
        manualTitle: titleInput.value,
        manualMediaType: mediaTypeInput.value as WatchRecord['mediaType'],
        manualSeason: parseNumberInput(seasonInput),
        manualEpisode: parseNumberInput(episodeInput)
      };

  const response = (await chrome.runtime.sendMessage({
    type: 'updateRecord',
    id: record.id,
    patch
  })) as { ok: boolean; history?: WatchRecord[]; error?: string };

  if (!response?.ok) {
    editStatus.textContent = response?.error || 'Save failed';
    return false;
  }

  allRecords = response.history || allRecords;
  totalRecordCount = null;
  totalDurationSec = null;
  return true;
}

function inferGroupTitle(item: DisplayRecord): string {
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

function groupSeasonRecords(items: DisplayRecord[]): { groups: PopupGroup[]; singles: DisplayRecord[] } {
  const groupsByKey = new Map<string, PopupGroup>();
  const singles: DisplayRecord[] = [];

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
    } else {
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

function groupBySeason(items: DisplayRecord[]): Map<string, DisplayRecord[]> {
  const bySeason = new Map<string, DisplayRecord[]>();

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

function formatGroupSeasonSummary(group: PopupGroup): string {
  const seasons = [...new Set(group.records.map((item) => item.season).filter((season): season is number => season !== null))]
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

function setFilterDrawerOpen(open: boolean): void {
  isFilterDrawerOpen = open;
  filterDrawerEl.classList.toggle('open', open);
  filterDrawerEl.setAttribute('aria-hidden', String(!open));
  filtersToggleBtn.setAttribute('aria-expanded', String(open));
}

function getFilteredRecords(): WatchRecord[] {
  const type = filterEl.value;
  const status = statusFilterEl.value;
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

    if (status !== 'all' && getWatchStatus(record) !== status) {
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

function hasActiveFilters(): boolean {
  return filterEl.value !== 'all' || statusFilterEl.value !== 'all' || Boolean(searchFilterEl.value.trim()) || Boolean(dateFilterEl.value);
}

async function updateRecordStatus(record: WatchRecord, status: WatchStatus | null): Promise<boolean> {
  const response = (await chrome.runtime.sendMessage({
    type: 'updateRecord',
    id: record.id,
    patch: { manualStatus: status }
  })) as { ok: boolean; history?: WatchRecord[]; error?: string };

  if (!response?.ok) {
    syncStatusTextEl.textContent = response?.error || 'Status update failed';
    return false;
  }

  allRecords = response.history || allRecords;
  totalRecordCount = null;
  totalDurationSec = null;
  return true;
}

async function deleteRecord(record: WatchRecord, ask = true): Promise<boolean> {
  if (ask && !confirm(`Delete "${record.manualTitle || record.title || record.rawTitle || record.url}"?`)) {
    return false;
  }

  const response = (await chrome.runtime.sendMessage({
    type: 'deleteRecord',
    id: record.id
  })) as { ok: boolean; history?: WatchRecord[]; error?: string };

  if (!response?.ok) {
    syncStatusTextEl.textContent = response?.error || 'Delete failed';
    return false;
  }

  allRecords = response.history || allRecords.filter((item) => item.id !== record.id);
  totalRecordCount = null;
  totalDurationSec = null;
  return true;
}

async function deleteGroup(group: PopupGroup): Promise<void> {
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

function renderRecordCard(item: DisplayRecord): HTMLElement {
  const record = item.record;
  const node = template.content.firstElementChild?.cloneNode(true) as HTMLElement;

  const badgeEl = node.querySelector('.badge') as HTMLElement;
  const titleEl = node.querySelector('.card-title') as HTMLElement;
  const urlEl = node.querySelector('.card-url') as HTMLElement;
  const linkEl = node.querySelector('.open-btn') as HTMLAnchorElement;
  const editBtn = node.querySelector('.edit-record-btn') as HTMLButtonElement;
  const statusBtn = node.querySelector('.status-record-btn') as HTMLButtonElement;
  const deleteBtn = node.querySelector('.delete-record-btn') as HTMLButtonElement;
  const metaContainer = node.querySelector('.card-meta') as HTMLElement;
  const progressBar = node.querySelector('.progress-bar') as HTMLElement;

  const mediaType = item.mediaType;
  const watchedSeconds = Math.max(0, record.lastPlaybackTime ?? 0);
  const videoDurationSec = (record.videoDurationSec ?? 0) > 0 ? (record.videoDurationSec as number) : null;
  const watchStatus = getWatchStatus(record);
  const isComplete = watchStatus === 'finished';

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
  editBtn.addEventListener('click', () => openRecordEditor(record));
  statusBtn.title = isComplete ? 'Move to Continue' : 'Mark finished';
  statusBtn.classList.toggle('finished', isComplete);
  const statusIcon = statusBtn.querySelector('.material-symbols-outlined') as HTMLElement;
  statusIcon.textContent = isComplete ? 'replay' : 'done_all';
  statusBtn.addEventListener('click', () => {
    void updateRecordStatus(record, isComplete ? 'continue' : 'finished').then((updated) => {
      if (updated) {
        render();
      }
    });
  });

  const metaItems = metaContainer.querySelectorAll('.meta-item');
  if (metaItems[0]) {
    const metaText = metaItems[0].querySelector('.meta-text') as HTMLElement;
    metaText.textContent = isComplete ? 'Finished' : `${watchedSeconds > 0 ? formatDuration(watchedSeconds) : '—'} elapsed`;
  }
  if (metaItems[1]) {
    const metaText = metaItems[1].querySelector('.meta-text') as HTMLElement;
    const today = new Date();
    const recordDate = new Date(record.startedAt);
    const isToday = today.toDateString() === recordDate.toDateString();
    metaText.textContent = isToday ? 'Today' : recordDate.toLocaleDateString();
  }
  if (metaItems[2]) {
    const metaItem = metaItems[2] as HTMLElement;
    const metaText = metaItem.querySelector('.meta-text') as HTMLElement;
    const seasonLabel = formatSeasonLabel(item.season);
    metaItem.hidden = !seasonLabel;
    metaText.textContent = seasonLabel;
  }
  if (metaItems[3]) {
    const metaItem = metaItems[3] as HTMLElement;
    const metaText = metaItem.querySelector('.meta-text') as HTMLElement;
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

function renderSeasonGroup(group: PopupGroup): HTMLElement {
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
    } else {
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

function renderLoadMore(remainingCount: number): HTMLElement {
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

function render(): void {
  const records = getFilteredRecords();
  listEl.textContent = '';

  const usePagedTotals = !hasActiveFilters() && totalRecordCount !== null;
  const totalSeconds = usePagedTotals && totalDurationSec !== null
    ? totalDurationSec
    : records.reduce((sum, item) => sum + (item.durationSec || 0), 0);
  totalItemsEl.textContent = String(usePagedTotals ? totalRecordCount : records.length);
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
    ...groups.map((group) => ({ type: 'group' as const, latestAt: group.latestAt, group })),
    ...singles.map((item) => ({ type: 'single' as const, latestAt: item.record.startedAt, item }))
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

function resetPagination(): void {
  visibleEntryCount = POPUP_PAGE_SIZE;
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
  let response = (await chrome.runtime.sendMessage({
    type: 'getHistoryPage',
    offset: 0,
    limit: POPUP_HISTORY_LIMIT
  })) as GetHistoryResponse | undefined;

  if (!response?.ok) {
    response = (await chrome.runtime.sendMessage({ type: 'getHistory' })) as GetHistoryResponse | undefined;
  }

  if (!response?.ok) {
    return;
  }

  allRecords = response.history || [];
  totalRecordCount = typeof response.total === 'number' ? response.total : allRecords.filter((record) => !record.deletedAt).length;
  totalDurationSec = typeof response.totalDurationSec === 'number' ? response.totalDurationSec : allRecords.reduce((sum, record) => sum + Math.max(0, record.durationSec || 0), 0);
  enabledToggle.checked = Boolean(response.enabled);
  render();
}

async function loadPrivacyStatus(): Promise<void> {
  const response = (await chrome.runtime.sendMessage({ type: 'getPrivacyStatus' })) as PrivacyStatusResponse;
  if (!response?.ok) {
    return;
  }

  hasPrivacyConsent = Boolean(response.consentAccepted);
  hasHostAccess = Boolean(response.hostAccessGranted);
  consentCard.hidden = hasPrivacyConsent && hasHostAccess;
  enabledToggle.disabled = !hasPrivacyConsent || !hasHostAccess;
  enabledToggle.checked = Boolean(response.enabled);
}

async function requestHostAccess(): Promise<boolean> {
  return chrome.permissions.request({ origins: ['<all_urls>'] });
}

async function acceptPrivacyConsent(): Promise<void> {
  acceptConsentBtn.disabled = true;
  const hostAccessGranted = await requestHostAccess();
  if (!hostAccessGranted) {
    syncStatusTextEl.textContent = 'Site access required';
    acceptConsentBtn.disabled = false;
    return;
  }

  const response = (await chrome.runtime.sendMessage({ type: 'acceptPrivacyConsent' })) as PrivacyStatusResponse;
  if (response?.ok) {
    hasPrivacyConsent = true;
    hasHostAccess = Boolean(response.hostAccessGranted);
    consentCard.hidden = hasHostAccess;
    enabledToggle.disabled = !hasHostAccess;
    enabledToggle.checked = Boolean(response.enabled);
    await loadData();
  } else {
    syncStatusTextEl.textContent = response?.error || 'Tracking unavailable';
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
  const shouldClear = confirm('Clear local tracked history on this device? Cloud data can be deleted from Settings.');
  if (!shouldClear) {
    return;
  }

  const response = (await chrome.runtime.sendMessage({
    type: 'clearHistory',
    scope: 'local'
  })) as { ok: boolean };
  if (response?.ok) {
    allRecords = [];
    totalRecordCount = 0;
    totalDurationSec = 0;
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

async function loadAuthStatus(): Promise<void> {
  const response = (await chrome.runtime.sendMessage({ type: 'getAuthStatus' })) as AuthStatusResponse;
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
statusFilterEl.addEventListener('change', () => {
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
cancelEditBtn.addEventListener('click', () => {
  editDialog.close();
  editingRecord = null;
});
editForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!editingRecord) {
    return;
  }
  void updateRecord(editingRecord).then((saved) => {
    if (!saved) {
      return;
    }
    editDialog.close();
    editingRecord = null;
    render();
  });
});
resetEditBtn.addEventListener('click', () => {
  if (!editingRecord) {
    return;
  }
  void updateRecord(editingRecord, true).then((saved) => {
    if (!saved) {
      return;
    }
    editDialog.close();
    editingRecord = null;
    render();
  });
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

async function init(): Promise<void> {
  setFilterDrawerOpen(false);
  await loadPrivacyStatus();
  await loadData();
  await loadAuthStatus();
}

void init();

export {};
