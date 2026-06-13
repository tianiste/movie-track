const groupsEl = document.getElementById('groups');
const statusTextEl = document.getElementById('statusText');
const groupTemplate = document.getElementById('groupTemplate');
const recordTemplate = document.getElementById('recordTemplate');
const searchInput = document.getElementById('searchInput');
const typeFilter = document.getElementById('typeFilter');
const settingsBtn = document.getElementById('settingsBtn');
const editDialog = document.getElementById('editDialog');
const editForm = document.getElementById('editForm');
const dialogTitle = document.getElementById('dialogTitle');
const dialogHint = document.getElementById('dialogHint');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const resetManualBtn = document.getElementById('resetManualBtn');
const titleInput = document.getElementById('titleInput');
const mediaTypeInput = document.getElementById('mediaTypeInput');
const groupInput = document.getElementById('groupInput');
const groupNameOptions = document.getElementById('groupNameOptions');
const seasonInput = document.getElementById('seasonInput');
const episodeInput = document.getElementById('episodeInput');
let allRecords = [];
let editorMode = null;
const expandedGroupKeys = new Set();
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
    return title || null;
}
function normalizeText(value) {
    return value.trim().toLowerCase();
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
    return season === null ? 'No season' : `Season ${season}`;
}
function recordMeta(record) {
    const season = displaySeason(record);
    const episode = displayEpisode(record);
    const meta = [
        formatDuration(record.lastPlaybackTime ?? record.durationSec),
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
    const customTitle = displayGroupTitle(record);
    if (customTitle) {
        return { title: customTitle, custom: true };
    }
    if (displaySeason(record) === null) {
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
        const key = `${groupInfo.custom ? 'custom' : mediaType}:${normalizeText(groupInfo.title)}`;
        const existing = byKey.get(key);
        if (existing) {
            existing.records.push(record);
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
    const response = (await chrome.runtime.sendMessage({ type: 'getHistory' }));
    if (!response?.ok) {
        statusTextEl.textContent = response?.error || 'Could not load library.';
        return;
    }
    allRecords = response.history || [];
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
function formatGroupMeta(group) {
    const seasons = [...new Set(group.records.map(displaySeason).filter((season) => season !== null))]
        .sort((a, b) => a - b);
    const seasonLabel = seasons.length === 0
        ? 'Custom group'
        : seasons.length === 1
            ? `Season ${seasons[0]}`
            : `Seasons ${seasons.join(', ')}`;
    return `${seasonLabel} · ${group.records.length} records · latest ${formatDate(group.latestAt)}`;
}
function renderSingleSection(records) {
    const section = document.createElement('section');
    section.className = 'single-section';
    const heading = document.createElement('h2');
    heading.className = 'section-heading';
    heading.textContent = 'Ungrouped';
    section.append(heading);
    for (const record of records) {
        section.append(renderRecord(record));
    }
    return section;
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
function render() {
    const records = getFilteredRecords();
    const { groups, singles } = groupRecords(records);
    groupsEl.textContent = '';
    if (records.length === 0) {
        statusTextEl.textContent = allRecords.length === 0 ? 'No tracked records yet.' : 'No records match these filters.';
        return;
    }
    statusTextEl.textContent = `${records.length} records · ${groups.length} groups · ${singles.length} ungrouped`;
    const fragment = document.createDocumentFragment();
    const entries = [
        ...groups.map((group) => ({ type: 'group', latestAt: group.latestAt, group })),
        ...singles.map((record) => ({ type: 'single', latestAt: record.startedAt, record }))
    ].sort((a, b) => b.latestAt - a.latestAt);
    let pendingSingles = [];
    const flushSingles = () => {
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
            manualGroupTitle: null
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
    if (!confirm(`Delete ${group.records.length} records in "${group.title}"?`)) {
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
searchInput.addEventListener('input', render);
typeFilter.addEventListener('change', render);
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
editForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void saveEditor();
});
resetManualBtn.addEventListener('click', () => {
    void saveEditor(true);
});
void loadHistory();
export {};
//# sourceMappingURL=library.js.map