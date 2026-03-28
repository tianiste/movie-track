const HISTORY_KEY = 'watchHistory';
const ENABLED_KEY = 'trackingEnabled';
const HEARTBEAT_ALARM = 'heartbeat';
const MIN_DURATION_SEC = 20;
const MERGE_GAP_MS = 5 * 60 * 1000;
const HEARTBEAT_MINUTES = 0.25;
const activeSessions = new Map();
let currentActiveTabId = null;
async function getStorage(key, fallback) {
    const data = await chrome.storage.local.get(key);
    return data[key] ?? fallback;
}
async function setStorage(key, value) {
    await chrome.storage.local.set({ [key]: value });
}
function getHostname(urlString) {
    try {
        return new URL(urlString).hostname;
    }
    catch {
        return 'unknown';
    }
}
function normalizeTitle(title = '') {
    return title
        .replace(/\s*\|\s*[^|]+$/g, '')
        .replace(/\s+-\s+[^-]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}
function parseEpisodeHint(text) {
    const episodeMatch = text.match(/\b(?:episode|ep)\s*(\d{1,4})\b/i);
    const seasonEpisodeMatch = text.match(/\bs(\d{1,2})\s*e(\d{1,3})\b/i);
    if (seasonEpisodeMatch) {
        return {
            season: Number(seasonEpisodeMatch[1]),
            episode: Number(seasonEpisodeMatch[2])
        };
    }
    if (episodeMatch) {
        return {
            season: null,
            episode: Number(episodeMatch[1])
        };
    }
    return { season: null, episode: null };
}
function inferMedia(tab) {
    const title = tab.title ?? '';
    const url = tab.url ?? '';
    const combined = `${title} ${url}`.toLowerCase();
    if (!url || !/^https?:\/\//i.test(url)) {
        return null;
    }
    const animeSignals = [
        /\banime\b/i,
        /\bepisode\b/i,
        /\bsub\b|\bdub\b/i,
        /\/anime\//i,
        /one\s*piece|naruto|bleach|aot|attack\s*on\s*titan|jujutsu\s*kaisen/i
    ];
    const movieSignals = [
        /\bmovie\b|\bfilm\b/i,
        /\/movies?\//i,
        /\b1080p\b|\b720p\b|\bwebrip\b|\bbluray\b/i
    ];
    const watchSignals = [
        /\bwatch\b/i,
        /\/watch/i,
        /\/player/i,
        /\/stream/i,
        /\bfull\s*screen\b/i,
        /\btrailer\b/i
    ];
    const animeScore = animeSignals.reduce((score, re) => score + (re.test(combined) ? 1 : 0), 0);
    const movieScore = movieSignals.reduce((score, re) => score + (re.test(combined) ? 1 : 0), 0);
    const watchScore = watchSignals.reduce((score, re) => score + (re.test(combined) ? 1 : 0), 0);
    if (animeScore === 0 && movieScore === 0 && watchScore === 0) {
        return null;
    }
    let mediaType = 'unknown';
    if (animeScore >= movieScore && animeScore > 0) {
        mediaType = 'anime';
    }
    else if (movieScore > animeScore && movieScore > 0) {
        mediaType = 'movie';
    }
    const cleanedTitle = normalizeTitle(title) || title || url;
    const { season, episode } = parseEpisodeHint(`${title} ${url}`);
    return {
        mediaType,
        cleanedTitle,
        season,
        episode,
        confidence: animeScore + movieScore + watchScore
    };
}
function buildRecord(session) {
    const endTime = session.endTime ?? Date.now();
    const durationSec = Math.max(0, Math.round((endTime - session.startTime) / 1000));
    return {
        id: `${session.tabId}-${session.startTime}`,
        tabId: session.tabId,
        url: session.url,
        hostname: getHostname(session.url),
        rawTitle: session.title,
        title: session.cleanedTitle,
        mediaType: session.mediaType,
        season: session.season,
        episode: session.episode,
        confidence: session.confidence,
        startedAt: session.startTime,
        endedAt: endTime,
        durationSec
    };
}
async function isTrackingEnabled() {
    return await getStorage(ENABLED_KEY, true);
}
async function saveRecord(record) {
    if (record.durationSec < MIN_DURATION_SEC) {
        return;
    }
    const history = await getStorage(HISTORY_KEY, []);
    const last = history[history.length - 1];
    if (last &&
        last.url === record.url &&
        last.title === record.title &&
        record.startedAt - last.endedAt <= MERGE_GAP_MS) {
        last.endedAt = record.endedAt;
        last.durationSec += record.durationSec;
        history[history.length - 1] = last;
    }
    else {
        history.push(record);
    }
    if (history.length > 5000) {
        history.splice(0, history.length - 5000);
    }
    await setStorage(HISTORY_KEY, history);
}
async function finalizeSession(tabId, endTime = Date.now()) {
    const session = activeSessions.get(tabId);
    if (!session) {
        return;
    }
    activeSessions.delete(tabId);
    session.endTime = endTime;
    await saveRecord(buildRecord(session));
}
async function startOrUpdateSession(tab, now = Date.now()) {
    if (!(await isTrackingEnabled())) {
        return;
    }
    if (typeof tab.id !== 'number') {
        return;
    }
    const inferred = inferMedia(tab);
    const existing = activeSessions.get(tab.id);
    if (!inferred) {
        if (existing) {
            await finalizeSession(tab.id, now);
        }
        return;
    }
    if (existing && existing.url === tab.url && existing.title === (tab.title ?? '')) {
        return;
    }
    if (existing) {
        await finalizeSession(tab.id, now);
    }
    activeSessions.set(tab.id, {
        tabId: tab.id,
        url: tab.url ?? '',
        title: tab.title ?? '',
        cleanedTitle: inferred.cleanedTitle,
        mediaType: inferred.mediaType,
        season: inferred.season,
        episode: inferred.episode,
        confidence: inferred.confidence,
        startTime: now
    });
}
async function getActiveTabInFocusedWindow() {
    const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return tabs[0] ?? null;
}
async function onActiveTabChanged(tabId) {
    const now = Date.now();
    if (currentActiveTabId !== null && currentActiveTabId !== tabId) {
        await finalizeSession(currentActiveTabId, now);
    }
    currentActiveTabId = tabId;
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (tab) {
        await startOrUpdateSession(tab, now);
    }
}
async function heartbeat() {
    const activeTab = await getActiveTabInFocusedWindow();
    if (!activeTab || typeof activeTab.id !== 'number') {
        if (currentActiveTabId !== null) {
            await finalizeSession(currentActiveTabId, Date.now());
            currentActiveTabId = null;
        }
        return;
    }
    if (currentActiveTabId !== activeTab.id) {
        await onActiveTabChanged(activeTab.id);
    }
    else {
        await startOrUpdateSession(activeTab, Date.now());
    }
}
chrome.runtime.onInstalled.addListener(async () => {
    const enabled = await getStorage(ENABLED_KEY, null);
    if (enabled === null) {
        await setStorage(ENABLED_KEY, true);
    }
    chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: HEARTBEAT_MINUTES });
    await heartbeat();
});
chrome.runtime.onStartup.addListener(async () => {
    chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: HEARTBEAT_MINUTES });
    await heartbeat();
});
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === HEARTBEAT_ALARM) {
        await heartbeat();
    }
});
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    await onActiveTabChanged(tabId);
});
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (tabId !== currentActiveTabId) {
        return;
    }
    if (changeInfo.url || changeInfo.title || changeInfo.status === 'complete') {
        await startOrUpdateSession(tab, Date.now());
    }
});
chrome.tabs.onRemoved.addListener(async (tabId) => {
    await finalizeSession(tabId, Date.now());
    if (currentActiveTabId === tabId) {
        currentActiveTabId = null;
    }
});
chrome.windows.onFocusChanged.addListener(async (windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        if (currentActiveTabId !== null) {
            await finalizeSession(currentActiveTabId, Date.now());
            currentActiveTabId = null;
        }
        return;
    }
    const activeTab = await getActiveTabInFocusedWindow();
    if (activeTab && typeof activeTab.id === 'number') {
        await onActiveTabChanged(activeTab.id);
    }
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    (async () => {
        const payload = message;
        if (payload?.type === 'getHistory') {
            const [history, enabled] = await Promise.all([
                getStorage(HISTORY_KEY, []),
                getStorage(ENABLED_KEY, true)
            ]);
            sendResponse({ ok: true, history, enabled });
            return;
        }
        if (payload?.type === 'setEnabled') {
            const enabled = Boolean(payload.enabled);
            await setStorage(ENABLED_KEY, enabled);
            if (!enabled) {
                for (const tabId of activeSessions.keys()) {
                    await finalizeSession(tabId, Date.now());
                }
                currentActiveTabId = null;
            }
            else {
                await heartbeat();
            }
            sendResponse({ ok: true, enabled });
            return;
        }
        if (payload?.type === 'clearHistory') {
            await setStorage(HISTORY_KEY, []);
            sendResponse({ ok: true });
            return;
        }
        sendResponse({ ok: false, error: 'Unknown action' });
    })();
    return true;
});
export {};
//# sourceMappingURL=background.js.map