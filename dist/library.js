const CUSTOM_GROUPS_KEY = 'libraryCustomGroups';
const UNGROUPED_GROUP_TITLE = '__movietrack_ungrouped__';
const PAGE_SIZE = 30;
const groupsEl = document.getElementById('groups');
const statusTextEl = document.getElementById('statusText');
const groupTemplate = document.getElementById('groupTemplate');
const recordTemplate = document.getElementById('recordTemplate');
const searchInput = document.getElementById('searchInput');
const typeFilter = document.getElementById('typeFilter');
const statusTabBtns = Array.from(document.querySelectorAll('[data-status-tab]'));
const newGroupBtn = document.getElementById('newGroupBtn');
const settingsBtn = document.getElementById('settingsBtn');
const editDialog = document.getElementById('editDialog');
const editForm = document.getElementById('editForm');
const groupDialog = document.getElementById('groupDialog');
const groupForm = document.getElementById('groupForm');
const dialogTitle = document.getElementById('dialogTitle');
const dialogHint = document.getElementById('dialogHint');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const cancelGroupBtn = document.getElementById('cancelGroupBtn');
const resetManualBtn = document.getElementById('resetManualBtn');
const titleInput = document.getElementById('titleInput');
const mediaTypeInput = document.getElementById('mediaTypeInput');
const groupInput = document.getElementById('groupInput');
const groupNameOptions = document.getElementById('groupNameOptions');
const newGroupNameInput = document.getElementById('newGroupNameInput');
const newGroupTypeInput = document.getElementById('newGroupTypeInput');
const seasonInput = document.getElementById('seasonInput');
const episodeInput = document.getElementById('episodeInput');
let allRecords = [];
let customGroups = [];
let editorMode = null;
const expandedGroupKeys = new Set();
let draggedRecordId = null;
let dragScrollSpeed = 0;
let dragScrollFrame = null;
let visibleEntryCount = PAGE_SIZE;
let selectedStatus = 'continue';
function displayTitle(record) {
    return record.manualTitle || record.title || record.rawTitle || record.url;
}
function displayMediaType(record) {
    return record.manualMediaType || record.mediaType || 'unknown';
}
function displaySeason(record) {
    return record.manualSeason ?? record.season ?? null;
}
function displayEpisode(record) {
    return record.manualEpisode ?? record.episode ?? null;
}
function displayGroupTitle(record) {
    const title = record.manualGroupTitle?.trim();
    if (!title || title === UNGROUPED_GROUP_TITLE) {
        return null;
    }
    return title;
}
function normalizeText(value) {
    return value.trim().toLowerCase();
}
function getGroupKey(mediaType, title) {
    return `${mediaType}:${normalizeText(title)}`;
}
function inferGroupTitle(record) {
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
function formatDuration(seconds) {
    const safeSeconds = Math.max(0, Math.round(seconds || 0));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const rest = safeSeconds % 60;
    if (hours > 0)
        return `${hours}h ${minutes}m`;
    if (minutes > 0)
        return `${minutes}m ${rest}s`;
    return `${rest}s`;
}
function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString();
}
function formatSeasonHeading(season) {
    return season === null ? 'Episodes' : `Season ${season}`;
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
function getWatchStatus(record) {
    if (record.manualStatus === 'continue' || record.manualStatus === 'finished') {
        return record.manualStatus;
    }
    return isRecordComplete(record) ? 'finished' : 'continue';
}
function recordMeta(record) {
    const season = displaySeason(record);
    const episode = displayEpisode(record);
    const meta = [
        getWatchStatus(record) === 'finished' ? 'Finished' : formatDuration(record.lastPlaybackTime ?? record.durationSec),
        formatDate(record.startedAt),
        record.syncStatus === 'failed' ? 'Sync failed' : ''
    ];
    if (season !== null)
        meta.push(`S${season}`);
    if (episode !== null)
        meta.push(`E${episode}`);
    return meta.filter(Boolean);
}
function getFilteredRecords() {
    const query = normalizeText(searchInput.value);
    const selectedType = typeFilter.value;
    return allRecords
        .filter((record) => !record.deletedAt)
        .filter((record) => selectedType === 'all' || displayMediaType(record) === selectedType)
        .filter((record) => selectedStatus === 'all' || getWatchStatus(record) === selectedStatus)
        .filter((record) => {
        if (!query)
            return true;
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
function getGroupTitle(record) {
    if (record.manualGroupTitle === UNGROUPED_GROUP_TITLE) {
        return null;
    }
    const customTitle = displayGroupTitle(record);
    if (customTitle) {
        return { title: customTitle, custom: true };
    }
    if (displaySeason(record) === null && displayEpisode(record) === null) {
        return null;
    }
    return { title: inferGroupTitle(record), custom: false };
}
function groupRecords(records) {
    const byKey = new Map();
    const singles = [];
    for (const record of records) {
        const mediaType = displayMediaType(record);
        const groupInfo = getGroupTitle(record);
        if (!groupInfo) {
            singles.push(record);
            continue;
        }
        const key = getGroupKey(mediaType, groupInfo.title);
        const existing = byKey.get(key);
        if (existing) {
            existing.records.push(record);
            existing.custom = existing.custom || groupInfo.custom;
            existing.latestAt = Math.max(existing.latestAt, record.startedAt);
        }
        else {
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
        const key = getGroupKey(customGroup.mediaType, customGroup.title);
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
function groupedBySeason(records) {
    const bySeason = new Map();
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
async function loadHistory() {
    const [response, customGroupData] = await Promise.all([
        chrome.runtime.sendMessage({ type: 'getHistory' }),
        chrome.storage.local.get(CUSTOM_GROUPS_KEY)
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
async function saveCustomGroups() {
    await chrome.storage.local.set({ [CUSTOM_GROUPS_KEY]: customGroups });
}
function clearDragTargets() {
    document.querySelectorAll('.drag-over').forEach((element) => element.classList.remove('drag-over'));
}
function stopDragAutoScroll() {
    dragScrollSpeed = 0;
    if (dragScrollFrame !== null) {
        window.cancelAnimationFrame(dragScrollFrame);
        dragScrollFrame = null;
    }
}
function tickDragAutoScroll() {
    if (!dragScrollSpeed || !draggedRecordId) {
        stopDragAutoScroll();
        return;
    }
    window.scrollBy({ top: dragScrollSpeed, behavior: 'auto' });
    dragScrollFrame = window.requestAnimationFrame(tickDragAutoScroll);
}
function updateDragAutoScroll(clientY) {
    const edgeSize = 96;
    const maxSpeed = 18;
    const viewportHeight = window.innerHeight;
    let nextSpeed = 0;
    if (clientY < edgeSize) {
        nextSpeed = -Math.ceil(((edgeSize - clientY) / edgeSize) * maxSpeed);
    }
    else if (clientY > viewportHeight - edgeSize) {
        nextSpeed = Math.ceil(((clientY - (viewportHeight - edgeSize)) / edgeSize) * maxSpeed);
    }
    dragScrollSpeed = nextSpeed;
    if (dragScrollSpeed && dragScrollFrame === null) {
        dragScrollFrame = window.requestAnimationFrame(tickDragAutoScroll);
    }
    else if (!dragScrollSpeed) {
        stopDragAutoScroll();
    }
}
function getDraggedRecordId(event) {
    return draggedRecordId || event.dataTransfer?.getData('text/plain') || null;
}
function getDropTarget(event) {
    const target = event.target instanceof Element ? event.target.closest('.drop-target') : null;
    if (!target || !groupsEl.contains(target)) {
        return null;
    }
    return target;
}
async function moveRecordToGroup(recordId, groupTitle, groupMediaType, forceUngroup = false) {
    const record = allRecords.find((item) => item.id === recordId);
    if (!record) {
        return;
    }
    const manualGroupTitle = forceUngroup ? UNGROUPED_GROUP_TITLE : groupTitle;
    const patch = forceUngroup
        ? { manualGroupTitle }
        : {
            manualGroupTitle,
            manualMediaType: groupMediaType ?? displayMediaType(record)
        };
    const response = (await chrome.runtime.sendMessage({
        type: 'updateRecord',
        id: record.id,
        patch
    }));
    if (!response?.ok) {
        statusTextEl.textContent = response?.error || 'Move failed';
        return;
    }
    allRecords = response.history || allRecords;
    if (groupTitle && groupMediaType) {
        expandedGroupKeys.add(getGroupKey(groupMediaType, groupTitle));
    }
    render();
}
async function createCustomGroup() {
    const title = newGroupNameInput.value.trim();
    if (!title) {
        return;
    }
    const mediaType = newGroupTypeInput.value;
    const existing = customGroups.find((group) => group.mediaType === mediaType && normalizeText(group.title) === normalizeText(title));
    if (!existing) {
        customGroups = [
            ...customGroups,
            {
                title,
                mediaType,
                createdAt: Date.now()
            }
        ];
        await saveCustomGroups();
    }
    expandedGroupKeys.add(getGroupKey(mediaType, title));
    groupDialog.close();
    groupForm.reset();
    render();
}
function renderRecord(record) {
    const node = recordTemplate.content.firstElementChild?.cloneNode(true);
    const title = node.querySelector('h3');
    const site = node.querySelector('p');
    const meta = node.querySelector('.record-meta');
    const openBtn = node.querySelector('.open-record-btn');
    const editBtn = node.querySelector('.edit-record-btn');
    const deleteBtn = node.querySelector('.delete-record-btn');
    const statusBtn = node.querySelector('.status-record-btn');
    const watchStatus = getWatchStatus(record);
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
        stopDragAutoScroll();
        clearDragTargets();
    });
    title.textContent = displayTitle(record);
    site.textContent = record.hostname || record.url;
    meta.textContent = recordMeta(record).join(' · ');
    openBtn.addEventListener('click', () => {
        const resumeAtSec = getWatchStatus(record) === 'finished' ? 0 : record.lastPlaybackTime ?? 0;
        void chrome.runtime.sendMessage({
            type: 'openWithResume',
            url: record.url,
            resumeAtSec
        });
    });
    editBtn.addEventListener('click', () => openRecordEditor(record));
    statusBtn.title = watchStatus === 'finished' ? 'Move to Continue' : 'Mark finished';
    statusBtn.classList.toggle('finished', watchStatus === 'finished');
    const statusIcon = statusBtn.querySelector('.material-symbols-outlined');
    statusIcon.textContent = watchStatus === 'finished' ? 'replay' : 'done_all';
    statusBtn.addEventListener('click', () => {
        void updateRecordWatchStatus(record, watchStatus === 'finished' ? 'continue' : 'finished');
    });
    deleteBtn.addEventListener('click', () => {
        void deleteRecord(record);
    });
    return node;
}
function formatGroupMeta(group) {
    const seasons = [...new Set(group.records.map(displaySeason).filter((season) => season !== null))]
        .sort((a, b) => a - b);
    const hasEpisodeOnlyRecords = group.records.some((record) => displaySeason(record) === null && displayEpisode(record) !== null);
    const seasonLabel = seasons.length === 0
        ? group.custom && !hasEpisodeOnlyRecords ? 'Custom group' : 'Episodes only'
        : seasons.length === 1
            ? `Season ${seasons[0]}`
            : `Seasons ${seasons.join(', ')}`;
    const finishedCount = group.records.filter((record) => getWatchStatus(record) === 'finished').length;
    const continueCount = group.records.length - finishedCount;
    const counts = selectedStatus === 'all'
        ? `${continueCount} continue · ${finishedCount} finished`
        : `${group.records.length} records`;
    return `${seasonLabel} · ${counts} · latest ${formatDate(group.latestAt)}`;
}
function renderSingleSection(records) {
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
function renderUngroupDropZone() {
    const dropZone = document.createElement('section');
    dropZone.className = 'ungroup-drop-zone drop-target';
    dropZone.dataset.ungroup = 'true';
    dropZone.textContent = 'Drop here to remove from groups';
    return dropZone;
}
function renderLoadMore(remainingCount) {
    const wrapper = document.createElement('div');
    wrapper.className = 'load-more-wrap';
    const button = document.createElement('button');
    button.className = 'action-btn load-more-btn';
    button.type = 'button';
    button.textContent = `Load more (${remainingCount} left)`;
    button.addEventListener('click', () => {
        visibleEntryCount += PAGE_SIZE;
        render();
    });
    wrapper.append(button);
    return wrapper;
}
function renderGroup(group) {
    const node = groupTemplate.content.firstElementChild?.cloneNode(true);
    const badge = node.querySelector('.badge');
    const title = node.querySelector('h2');
    const meta = node.querySelector('.group-meta');
    const editBtn = node.querySelector('.edit-group-btn');
    const toggleBtn = node.querySelector('.toggle-group-btn');
    const deleteBtn = node.querySelector('.delete-group-btn');
    const seasonList = node.querySelector('.season-list');
    const isExpanded = expandedGroupKeys.has(group.key);
    node.classList.add('drop-target');
    node.dataset.groupTitle = group.title;
    node.dataset.groupMediaType = group.mediaType;
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
        }
        else {
            expandedGroupKeys.add(group.key);
        }
        render();
    });
    deleteBtn.addEventListener('click', () => {
        void deleteGroup(group);
    });
    if (isExpanded) {
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
    }
    return node;
}
function render() {
    const records = getFilteredRecords();
    const { groups, singles } = groupRecords(records);
    groupsEl.textContent = '';
    if (records.length === 0) {
        statusTextEl.textContent = allRecords.length === 0 ? 'No tracked records yet.' : 'No records match these filters.';
        return;
    }
    const fragment = document.createDocumentFragment();
    fragment.append(renderUngroupDropZone());
    const entries = [
        ...groups.map((group) => ({ type: 'group', latestAt: group.latestAt, group })),
        ...singles.map((record) => ({ type: 'single', latestAt: record.startedAt, record }))
    ].sort((a, b) => b.latestAt - a.latestAt);
    const visibleEntries = entries.slice(0, visibleEntryCount);
    const remainingEntries = entries.length - visibleEntries.length;
    statusTextEl.textContent = [
        `${records.length} records`,
        `${groups.length} groups`,
        `${singles.length} ungrouped`,
        remainingEntries > 0 ? `showing ${visibleEntries.length} of ${entries.length}` : ''
    ].filter(Boolean).join(' · ');
    let pendingSingles = [];
    const flushSingles = () => {
        if (pendingSingles.length === 0) {
            return;
        }
        fragment.append(renderSingleSection(pendingSingles));
        pendingSingles = [];
    };
    for (const entry of visibleEntries) {
        if (entry.type === 'single') {
            pendingSingles.push(entry.record);
            continue;
        }
        flushSingles();
        fragment.append(renderGroup(entry.group));
    }
    flushSingles();
    if (remainingEntries > 0) {
        fragment.append(renderLoadMore(remainingEntries));
    }
    groupNameOptions.textContent = '';
    for (const group of groups) {
        const option = document.createElement('option');
        option.value = group.title;
        groupNameOptions.append(option);
    }
    groupsEl.append(fragment);
}
function resetPagination() {
    visibleEntryCount = PAGE_SIZE;
}
function parseNumberInput(input) {
    if (!input.value.trim()) {
        return null;
    }
    const value = Number(input.value);
    return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}
function setDialogValues(title, mediaType, groupTitle, season, episode) {
    titleInput.value = title;
    mediaTypeInput.value = mediaType;
    groupInput.value = groupTitle ?? '';
    seasonInput.value = season === null ? '' : String(season);
    episodeInput.value = episode === null ? '' : String(episode);
}
function openRecordEditor(record) {
    editorMode = { type: 'record', record };
    dialogTitle.textContent = 'Record';
    dialogHint.textContent = 'Set Group to move this record into a custom group. Empty uses season auto-grouping only.';
    setDialogValues(displayTitle(record), displayMediaType(record), displayGroupTitle(record), displaySeason(record), displayEpisode(record));
    editDialog.showModal();
}
function openGroupEditor(group) {
    editorMode = { type: 'group', group };
    dialogTitle.textContent = 'Group';
    dialogHint.textContent = 'Changing Group moves every item here into that custom group. Title changes are not applied to every episode.';
    setDialogValues('', group.mediaType, group.title, null, null);
    editDialog.showModal();
}
async function updateRecord(record, reset = false) {
    let patch = reset
        ? {
            manualTitle: null,
            manualMediaType: null,
            manualSeason: null,
            manualEpisode: null,
            manualGroupTitle: null,
            manualStatus: null
        }
        : {
            manualTitle: titleInput.value,
            manualMediaType: mediaTypeInput.value,
            manualSeason: parseNumberInput(seasonInput),
            manualEpisode: parseNumberInput(episodeInput),
            manualGroupTitle: groupInput.value
        };
    if (!reset && editorMode?.type === 'group') {
        patch = {
            manualMediaType: mediaTypeInput.value,
            manualGroupTitle: groupInput.value
        };
    }
    const response = (await chrome.runtime.sendMessage({
        type: 'updateRecord',
        id: record.id,
        patch
    }));
    if (!response?.ok) {
        throw new Error(response?.error || 'Update failed');
    }
    allRecords = response.history || allRecords;
}
async function saveEditor(reset = false) {
    if (!editorMode) {
        return;
    }
    try {
        if (editorMode.type === 'record') {
            await updateRecord(editorMode.record, reset);
        }
        else {
            for (const record of editorMode.group.records) {
                await updateRecord(record, reset);
            }
        }
        editDialog.close();
        editorMode = null;
        render();
    }
    catch (error) {
        dialogHint.textContent = error instanceof Error ? error.message : 'Save failed';
    }
}
async function updateRecordWatchStatus(record, status) {
    const response = (await chrome.runtime.sendMessage({
        type: 'updateRecord',
        id: record.id,
        patch: { manualStatus: status }
    }));
    if (!response?.ok) {
        statusTextEl.textContent = response?.error || 'Status update failed';
        return;
    }
    allRecords = response.history || allRecords;
    render();
}
async function deleteRecord(record) {
    if (!confirm(`Delete "${displayTitle(record)}"?`)) {
        return;
    }
    const response = (await chrome.runtime.sendMessage({
        type: 'deleteRecord',
        id: record.id
    }));
    if (!response?.ok) {
        statusTextEl.textContent = response?.error || 'Delete failed';
        return;
    }
    allRecords = response.history || allRecords;
    render();
}
async function deleteGroup(group) {
    const isEmptyCustomGroup = group.custom && group.records.length === 0;
    const message = isEmptyCustomGroup
        ? `Delete empty group "${group.title}"?`
        : `Delete ${group.records.length} records in "${group.title}"?`;
    if (!confirm(message)) {
        return;
    }
    if (isEmptyCustomGroup) {
        customGroups = customGroups.filter((item) => normalizeText(item.title) !== normalizeText(group.title));
        await saveCustomGroups();
        expandedGroupKeys.delete(group.key);
        render();
        return;
    }
    for (const record of group.records) {
        const response = (await chrome.runtime.sendMessage({
            type: 'deleteRecord',
            id: record.id
        }));
        if (!response?.ok) {
            statusTextEl.textContent = response?.error || 'Delete failed';
            return;
        }
        allRecords = response.history || allRecords;
    }
    render();
}
searchInput.addEventListener('input', () => {
    resetPagination();
    render();
});
typeFilter.addEventListener('change', () => {
    resetPagination();
    render();
});
for (const button of statusTabBtns) {
    button.addEventListener('click', () => {
        selectedStatus = button.dataset.statusTab;
        for (const tab of statusTabBtns) {
            tab.classList.toggle('active', tab === button);
        }
        resetPagination();
        render();
    });
}
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
    updateDragAutoScroll(event.clientY);
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
    stopDragAutoScroll();
    const forceUngroup = target.dataset.ungroup === 'true';
    const groupTitle = forceUngroup ? null : target.dataset.groupTitle || null;
    const groupMediaType = forceUngroup ? null : target.dataset.groupMediaType || null;
    void moveRecordToGroup(recordId, groupTitle, groupMediaType, forceUngroup);
});
document.addEventListener('dragend', stopDragAutoScroll);
void loadHistory();
export {};
//# sourceMappingURL=library.js.map