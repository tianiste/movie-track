type MediaType = 'anime' | 'movie' | 'youtube' | 'unknown';
type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';
const CUSTOM_GROUPS_KEY = 'libraryCustomGroups';
const UNGROUPED_GROUP_TITLE = '__movietrack_ungrouped__';

interface WatchRecord {
  id: string;
  url: string;
  hostname: string;
  rawTitle: string;
  title: string;
  mediaType: MediaType;
  season: number | null;
  episode: number | null;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  lastPlaybackTime?: number;
  videoDurationSec?: number | null;
  manualTitle?: string | null;
  manualMediaType?: MediaType | null;
  manualSeason?: number | null;
  manualEpisode?: number | null;
  manualGroupTitle?: string | null;
  deletedAt?: number | null;
  syncStatus?: SyncStatus;
}

interface WatchGroup {
  key: string;
  title: string;
  mediaType: MediaType;
  latestAt: number;
  custom: boolean;
  records: WatchRecord[];
}

interface CustomGroupDefinition {
  title: string;
  mediaType: MediaType;
  createdAt: number;
}

type EditorMode = { type: 'record'; record: WatchRecord } | { type: 'group'; group: WatchGroup } | null;
type RecordPatch = Partial<Pick<WatchRecord, 'manualTitle' | 'manualMediaType' | 'manualSeason' | 'manualEpisode' | 'manualGroupTitle'>>;

const groupsEl = document.getElementById('groups') as HTMLElement;
const statusTextEl = document.getElementById('statusText') as HTMLElement;
const groupTemplate = document.getElementById('groupTemplate') as HTMLTemplateElement;
const recordTemplate = document.getElementById('recordTemplate') as HTMLTemplateElement;
const searchInput = document.getElementById('searchInput') as HTMLInputElement;
const typeFilter = document.getElementById('typeFilter') as HTMLSelectElement;
const newGroupBtn = document.getElementById('newGroupBtn') as HTMLButtonElement;
const settingsBtn = document.getElementById('settingsBtn') as HTMLButtonElement;
const editDialog = document.getElementById('editDialog') as HTMLDialogElement;
const editForm = document.getElementById('editForm') as HTMLFormElement;
const groupDialog = document.getElementById('groupDialog') as HTMLDialogElement;
const groupForm = document.getElementById('groupForm') as HTMLFormElement;
const dialogTitle = document.getElementById('dialogTitle') as HTMLElement;
const dialogHint = document.getElementById('dialogHint') as HTMLElement;
const cancelEditBtn = document.getElementById('cancelEditBtn') as HTMLButtonElement;
const cancelGroupBtn = document.getElementById('cancelGroupBtn') as HTMLButtonElement;
const resetManualBtn = document.getElementById('resetManualBtn') as HTMLButtonElement;
const titleInput = document.getElementById('titleInput') as HTMLInputElement;
const mediaTypeInput = document.getElementById('mediaTypeInput') as HTMLSelectElement;
const groupInput = document.getElementById('groupInput') as HTMLInputElement;
const groupNameOptions = document.getElementById('groupNameOptions') as HTMLDataListElement;
const newGroupNameInput = document.getElementById('newGroupNameInput') as HTMLInputElement;
const newGroupTypeInput = document.getElementById('newGroupTypeInput') as HTMLSelectElement;
const seasonInput = document.getElementById('seasonInput') as HTMLInputElement;
const episodeInput = document.getElementById('episodeInput') as HTMLInputElement;

let allRecords: WatchRecord[] = [];
let customGroups: CustomGroupDefinition[] = [];
let editorMode: EditorMode = null;
const expandedGroupKeys = new Set<string>();
let draggedRecordId: string | null = null;

function displayTitle(record: WatchRecord): string {
  return record.manualTitle || record.title || record.rawTitle || record.url;
}

function displayMediaType(record: WatchRecord): MediaType {
  return record.manualMediaType || record.mediaType || 'unknown';
}

function displaySeason(record: WatchRecord): number | null {
  return record.manualSeason ?? record.season ?? null;
}

function displayEpisode(record: WatchRecord): number | null {
  return record.manualEpisode ?? record.episode ?? null;
}

function displayGroupTitle(record: WatchRecord): string | null {
  const title = record.manualGroupTitle?.trim();
  if (!title || title === UNGROUPED_GROUP_TITLE) {
    return null;
  }
  return title;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function inferGroupTitle(record: WatchRecord): string {
  const title = displayTitle(record)
    .replace(/\bS\d{1,2}\s*E\d{1,4}\b/gi, '')
    .replace(/\bSeason\s*\d{1,2}\b/gi, '')
    .replace(/\bEpisode\s*\d{1,4}\b/gi, '')
    .replace(/\bEp\s*\d{1,4}\b/gi, '')
    .replace(/\bWatch\s+(?:All\s+)?Episodes?\b/gi, '')
    .replace(/\bWatch\s+Online(?:\s+Free)?\b/gi, '')
    .replace(/\bin\s+HD\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return title || displayTitle(record);
}

function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.round(seconds || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const rest = safeSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${rest}s`;
  return `${rest}s`;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString();
}

function formatSeasonHeading(season: number | null): string {
  return season === null ? 'No season' : `Season ${season}`;
}

function recordMeta(record: WatchRecord): string[] {
  const season = displaySeason(record);
  const episode = displayEpisode(record);
  const meta = [
    formatDuration(record.lastPlaybackTime ?? record.durationSec),
    formatDate(record.startedAt),
    record.syncStatus === 'failed' ? 'Sync failed' : ''
  ];

  if (season !== null) meta.push(`S${season}`);
  if (episode !== null) meta.push(`E${episode}`);

  return meta.filter(Boolean);
}

function getFilteredRecords(): WatchRecord[] {
  const query = normalizeText(searchInput.value);
  const selectedType = typeFilter.value;

  return allRecords
    .filter((record) => !record.deletedAt)
    .filter((record) => selectedType === 'all' || displayMediaType(record) === selectedType)
    .filter((record) => {
      if (!query) return true;
      const haystack = normalizeText([
        displayTitle(record),
        record.title,
        record.rawTitle,
        record.hostname,
        record.url,
        displayMediaType(record)
      ].join(' '));
      return haystack.includes(query);
    })
    .sort((a, b) => b.startedAt - a.startedAt);
}

function getGroupTitle(record: WatchRecord): { title: string; custom: boolean } | null {
  if (record.manualGroupTitle === UNGROUPED_GROUP_TITLE) {
    return null;
  }

  const customTitle = displayGroupTitle(record);
  if (customTitle) {
    return { title: customTitle, custom: true };
  }

  if (displaySeason(record) === null) {
    return null;
  }

  return { title: inferGroupTitle(record), custom: false };
}

function groupRecords(records: WatchRecord[]): { groups: WatchGroup[]; singles: WatchRecord[] } {
  const byKey = new Map<string, WatchGroup>();
  const singles: WatchRecord[] = [];

  for (const record of records) {
    const mediaType = displayMediaType(record);
    const groupInfo = getGroupTitle(record);
    if (!groupInfo) {
      singles.push(record);
      continue;
    }

    const key = `${groupInfo.custom ? 'custom' : mediaType}:${normalizeText(groupInfo.title)}`;
    const existing = byKey.get(key);

    if (existing) {
      existing.records.push(record);
      existing.latestAt = Math.max(existing.latestAt, record.startedAt);
    } else {
      byKey.set(key, {
        key,
        title: groupInfo.title,
        mediaType,
        custom: groupInfo.custom,
        latestAt: record.startedAt,
        records: [record]
      });
    }
  }

  for (const customGroup of customGroups) {
    const key = `custom:${normalizeText(customGroup.title)}`;
    if (byKey.has(key)) {
      continue;
    }
    if (typeFilter.value !== 'all' && customGroup.mediaType !== typeFilter.value) {
      continue;
    }
    const query = normalizeText(searchInput.value);
    if (query && !normalizeText(customGroup.title).includes(query)) {
      continue;
    }

    byKey.set(key, {
      key,
      title: customGroup.title,
      mediaType: customGroup.mediaType,
      custom: true,
      latestAt: customGroup.createdAt,
      records: []
    });
  }

  return {
    groups: [...byKey.values()].sort((a, b) => b.latestAt - a.latestAt),
    singles
  };
}

function groupedBySeason(records: WatchRecord[]): Map<string, WatchRecord[]> {
  const bySeason = new Map<string, WatchRecord[]>();

  for (const record of records) {
    const season = displaySeason(record);
    const key = season === null ? 'unknown' : String(season).padStart(4, '0');
    const existing = bySeason.get(key) || [];
    existing.push(record);
    bySeason.set(key, existing);
  }

  for (const recordsInSeason of bySeason.values()) {
    recordsInSeason.sort((a, b) => {
      const episodeA = displayEpisode(a) ?? Number.MAX_SAFE_INTEGER;
      const episodeB = displayEpisode(b) ?? Number.MAX_SAFE_INTEGER;
      return episodeA - episodeB || b.startedAt - a.startedAt;
    });
  }

  return new Map([...bySeason.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

async function loadHistory(): Promise<void> {
  const [response, customGroupData] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'getHistory' }) as Promise<{
      ok: boolean;
      history?: WatchRecord[];
      error?: string;
    }>,
    chrome.storage.local.get(CUSTOM_GROUPS_KEY) as Promise<Record<string, CustomGroupDefinition[] | undefined>>
  ]);

  const customGroupValue = customGroupData[CUSTOM_GROUPS_KEY];
  customGroups = Array.isArray(customGroupValue) ? customGroupValue : [];

  if (!response?.ok) {
    statusTextEl.textContent = response?.error || 'Could not load library.';
    return;
  }

  allRecords = response.history || [];
  render();
}

async function saveCustomGroups(): Promise<void> {
  await chrome.storage.local.set({ [CUSTOM_GROUPS_KEY]: customGroups });
}

function clearDragTargets(): void {
  document.querySelectorAll('.drag-over').forEach((element) => element.classList.remove('drag-over'));
}

function getDraggedRecordId(event: DragEvent): string | null {
  return draggedRecordId || event.dataTransfer?.getData('text/plain') || null;
}

function getDropTarget(event: DragEvent): HTMLElement | null {
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>('.drop-target') : null;
  if (!target || !groupsEl.contains(target)) {
    return null;
  }
  return target;
}

async function moveRecordToGroup(recordId: string, groupTitle: string | null, forceUngroup = false): Promise<void> {
  const record = allRecords.find((item) => item.id === recordId);
  if (!record) {
    return;
  }

  const manualGroupTitle = forceUngroup ? UNGROUPED_GROUP_TITLE : groupTitle;
  const response = (await chrome.runtime.sendMessage({
    type: 'updateRecord',
    id: record.id,
    patch: { manualGroupTitle }
  })) as { ok: boolean; history?: WatchRecord[]; error?: string };

  if (!response?.ok) {
    statusTextEl.textContent = response?.error || 'Move failed';
    return;
  }

  allRecords = response.history || allRecords;
  if (groupTitle) {
    expandedGroupKeys.add(`custom:${normalizeText(groupTitle)}`);
  }
  render();
}

async function createCustomGroup(): Promise<void> {
  const title = newGroupNameInput.value.trim();
  if (!title) {
    return;
  }

  const existing = customGroups.find((group) => normalizeText(group.title) === normalizeText(title));
  if (!existing) {
    customGroups = [
      ...customGroups,
      {
        title,
        mediaType: newGroupTypeInput.value as MediaType,
        createdAt: Date.now()
      }
    ];
    await saveCustomGroups();
  }

  expandedGroupKeys.add(`custom:${normalizeText(title)}`);
  groupDialog.close();
  groupForm.reset();
  render();
}

function renderRecord(record: WatchRecord): HTMLElement {
  const node = recordTemplate.content.firstElementChild?.cloneNode(true) as HTMLElement;
  const title = node.querySelector('h3') as HTMLElement;
  const site = node.querySelector('p') as HTMLElement;
  const meta = node.querySelector('.record-meta') as HTMLElement;
  const openBtn = node.querySelector('.open-record-btn') as HTMLButtonElement;
  const editBtn = node.querySelector('.edit-record-btn') as HTMLButtonElement;
  const deleteBtn = node.querySelector('.delete-record-btn') as HTMLButtonElement;

  node.dataset.recordId = record.id;
  node.addEventListener('dragstart', (event) => {
    draggedRecordId = record.id;
    node.classList.add('dragging');
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', record.id);
      event.dataTransfer.effectAllowed = 'move';
    }
  });
  node.addEventListener('dragend', () => {
    draggedRecordId = null;
    node.classList.remove('dragging');
    clearDragTargets();
  });

  title.textContent = displayTitle(record);
  site.textContent = record.hostname || record.url;
  meta.textContent = recordMeta(record).join(' · ');

  openBtn.addEventListener('click', () => {
    void chrome.runtime.sendMessage({
      type: 'openWithResume',
      url: record.url,
      resumeAtSec: record.lastPlaybackTime ?? 0
    });
  });
  editBtn.addEventListener('click', () => openRecordEditor(record));
  deleteBtn.addEventListener('click', () => {
    void deleteRecord(record);
  });

  return node;
}

function formatGroupMeta(group: WatchGroup): string {
  const seasons = [...new Set(group.records.map(displaySeason).filter((season): season is number => season !== null))]
    .sort((a, b) => a - b);
  const seasonLabel = seasons.length === 0
    ? 'Custom group'
    : seasons.length === 1
      ? `Season ${seasons[0]}`
      : `Seasons ${seasons.join(', ')}`;

  return `${seasonLabel} · ${group.records.length} records · latest ${formatDate(group.latestAt)}`;
}

function renderSingleSection(records: WatchRecord[]): HTMLElement {
  const section = document.createElement('section');
  section.className = 'single-section drop-target';
  section.dataset.ungroup = 'true';

  const heading = document.createElement('h2');
  heading.className = 'section-heading';
  heading.textContent = 'Ungrouped';
  section.append(heading);

  for (const record of records) {
    section.append(renderRecord(record));
  }

  return section;
}

function renderUngroupDropZone(): HTMLElement {
  const dropZone = document.createElement('section');
  dropZone.className = 'ungroup-drop-zone drop-target';
  dropZone.dataset.ungroup = 'true';
  dropZone.textContent = 'Drop here to remove from groups';
  return dropZone;
}

function renderGroup(group: WatchGroup): HTMLElement {
  const node = groupTemplate.content.firstElementChild?.cloneNode(true) as HTMLElement;
  const badge = node.querySelector('.badge') as HTMLElement;
  const title = node.querySelector('h2') as HTMLElement;
  const meta = node.querySelector('.group-meta') as HTMLElement;
  const editBtn = node.querySelector('.edit-group-btn') as HTMLButtonElement;
  const toggleBtn = node.querySelector('.toggle-group-btn') as HTMLButtonElement;
  const deleteBtn = node.querySelector('.delete-group-btn') as HTMLButtonElement;
  const seasonList = node.querySelector('.season-list') as HTMLElement;
  const isExpanded = expandedGroupKeys.has(group.key);
  node.classList.add('drop-target');
  node.dataset.groupTitle = group.title;

  badge.textContent = group.mediaType.toUpperCase();
  badge.classList.add(group.mediaType);
  title.textContent = group.title;
  meta.textContent = formatGroupMeta(group);
  node.classList.toggle('expanded', isExpanded);
  seasonList.hidden = !isExpanded;
  toggleBtn.setAttribute('aria-expanded', String(isExpanded));
  toggleBtn.title = isExpanded ? 'Hide episodes' : 'Show episodes';

  editBtn.addEventListener('click', () => openGroupEditor(group));
  toggleBtn.addEventListener('click', () => {
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

  for (const [seasonKey, records] of groupedBySeason(group.records)) {
    const seasonBlock = document.createElement('section');
    seasonBlock.className = 'season-block';

    const heading = document.createElement('h3');
    heading.className = 'season-heading';
    heading.textContent = formatSeasonHeading(seasonKey === 'unknown' ? null : Number(seasonKey));
    seasonBlock.append(heading);

    for (const record of records) {
      seasonBlock.append(renderRecord(record));
    }

    seasonList.append(seasonBlock);
  }

  return node;
}

function render(): void {
  const records = getFilteredRecords();
  const { groups, singles } = groupRecords(records);
  groupsEl.textContent = '';

  if (records.length === 0) {
    statusTextEl.textContent = allRecords.length === 0 ? 'No tracked records yet.' : 'No records match these filters.';
    return;
  }

  statusTextEl.textContent = `${records.length} records · ${groups.length} groups · ${singles.length} ungrouped`;

  const fragment = document.createDocumentFragment();
  fragment.append(renderUngroupDropZone());
  const entries = [
    ...groups.map((group) => ({ type: 'group' as const, latestAt: group.latestAt, group })),
    ...singles.map((record) => ({ type: 'single' as const, latestAt: record.startedAt, record }))
  ].sort((a, b) => b.latestAt - a.latestAt);

  let pendingSingles: WatchRecord[] = [];
  const flushSingles = (): void => {
    if (pendingSingles.length === 0) {
      return;
    }
    fragment.append(renderSingleSection(pendingSingles));
    pendingSingles = [];
  };

  for (const entry of entries) {
    if (entry.type === 'single') {
      pendingSingles.push(entry.record);
      continue;
    }

    flushSingles();
    fragment.append(renderGroup(entry.group));
  }
  flushSingles();

  groupNameOptions.textContent = '';
  for (const group of groups) {
    const option = document.createElement('option');
    option.value = group.title;
    groupNameOptions.append(option);
  }

  groupsEl.append(fragment);
}

function parseNumberInput(input: HTMLInputElement): number | null {
  if (!input.value.trim()) {
    return null;
  }
  const value = Number(input.value);
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

function setDialogValues(title: string, mediaType: MediaType, groupTitle: string | null, season: number | null, episode: number | null): void {
  titleInput.value = title;
  mediaTypeInput.value = mediaType;
  groupInput.value = groupTitle ?? '';
  seasonInput.value = season === null ? '' : String(season);
  episodeInput.value = episode === null ? '' : String(episode);
}

function openRecordEditor(record: WatchRecord): void {
  editorMode = { type: 'record', record };
  dialogTitle.textContent = 'Record';
  dialogHint.textContent = 'Set Group to move this record into a custom group. Empty uses season auto-grouping only.';
  setDialogValues(displayTitle(record), displayMediaType(record), displayGroupTitle(record), displaySeason(record), displayEpisode(record));
  editDialog.showModal();
}

function openGroupEditor(group: WatchGroup): void {
  editorMode = { type: 'group', group };
  dialogTitle.textContent = 'Group';
  dialogHint.textContent = 'Changing Group moves every item here into that custom group. Title changes are not applied to every episode.';
  setDialogValues('', group.mediaType, group.title, null, null);
  editDialog.showModal();
}

async function updateRecord(record: WatchRecord, reset = false): Promise<void> {
  let patch: RecordPatch = reset
    ? {
        manualTitle: null,
        manualMediaType: null,
        manualSeason: null,
        manualEpisode: null,
        manualGroupTitle: null
      }
    : {
        manualTitle: titleInput.value,
        manualMediaType: mediaTypeInput.value as MediaType,
        manualSeason: parseNumberInput(seasonInput),
        manualEpisode: parseNumberInput(episodeInput),
        manualGroupTitle: groupInput.value
      };

  if (!reset && editorMode?.type === 'group') {
    patch = {
      manualMediaType: mediaTypeInput.value as MediaType,
      manualGroupTitle: groupInput.value
    };
  }

  const response = (await chrome.runtime.sendMessage({
    type: 'updateRecord',
    id: record.id,
    patch
  })) as { ok: boolean; history?: WatchRecord[]; error?: string };

  if (!response?.ok) {
    throw new Error(response?.error || 'Update failed');
  }

  allRecords = response.history || allRecords;
}

async function saveEditor(reset = false): Promise<void> {
  if (!editorMode) {
    return;
  }

  try {
    if (editorMode.type === 'record') {
      await updateRecord(editorMode.record, reset);
    } else {
      for (const record of editorMode.group.records) {
        await updateRecord(record, reset);
      }
    }
    editDialog.close();
    editorMode = null;
    render();
  } catch (error) {
    dialogHint.textContent = error instanceof Error ? error.message : 'Save failed';
  }
}

async function deleteRecord(record: WatchRecord): Promise<void> {
  if (!confirm(`Delete "${displayTitle(record)}"?`)) {
    return;
  }

  const response = (await chrome.runtime.sendMessage({
    type: 'deleteRecord',
    id: record.id
  })) as { ok: boolean; history?: WatchRecord[]; error?: string };

  if (!response?.ok) {
    statusTextEl.textContent = response?.error || 'Delete failed';
    return;
  }

  allRecords = response.history || allRecords;
  render();
}

async function deleteGroup(group: WatchGroup): Promise<void> {
  if (!confirm(`Delete ${group.records.length} records in "${group.title}"?`)) {
    return;
  }

  for (const record of group.records) {
    const response = (await chrome.runtime.sendMessage({
      type: 'deleteRecord',
      id: record.id
    })) as { ok: boolean; history?: WatchRecord[]; error?: string };

    if (!response?.ok) {
      statusTextEl.textContent = response?.error || 'Delete failed';
      return;
    }
    allRecords = response.history || allRecords;
  }

  render();
}

searchInput.addEventListener('input', render);
typeFilter.addEventListener('change', render);
newGroupBtn.addEventListener('click', () => {
  newGroupNameInput.value = '';
  newGroupTypeInput.value = typeFilter.value === 'all' ? 'anime' : typeFilter.value;
  groupDialog.showModal();
});
settingsBtn.addEventListener('click', () => {
  if (chrome.runtime.openOptionsPage) {
    void chrome.runtime.openOptionsPage();
    return;
  }
  void chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
});
cancelEditBtn.addEventListener('click', () => {
  editDialog.close();
  editorMode = null;
});
cancelGroupBtn.addEventListener('click', () => {
  groupDialog.close();
});
editForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void saveEditor();
});
resetManualBtn.addEventListener('click', () => {
  void saveEditor(true);
});
groupForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void createCustomGroup();
});
document.addEventListener('dragover', (event) => {
  if (!getDraggedRecordId(event)) {
    return;
  }

  const target = getDropTarget(event);
  if (!target) {
    return;
  }

  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
  clearDragTargets();
  target.classList.add('drag-over');
});
document.addEventListener('drop', (event) => {
  const recordId = getDraggedRecordId(event);
  const target = getDropTarget(event);
  if (!recordId || !target) {
    return;
  }

  event.preventDefault();
  clearDragTargets();
  draggedRecordId = null;
  const forceUngroup = target.dataset.ungroup === 'true';
  const groupTitle = forceUngroup ? null : target.dataset.groupTitle || null;
  void moveRecordToGroup(recordId, groupTitle, forceUngroup);
});

void loadHistory();

export {};
