const HISTORY_KEY = 'watchHistory';
const ENABLED_KEY = 'trackingEnabled';
const HEARTBEAT_ALARM = 'heartbeat';
const MIN_DURATION_SEC = 10;
const MERGE_GAP_MS = 5 * 60 * 1000;
const HEARTBEAT_MINUTES = 0.08;
async function restorePlaybackInTab(tabId, resumeAtSec) {
    if (!Number.isFinite(resumeAtSec) || resumeAtSec <= 0) {
        return;
    }
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            args: [Math.round(resumeAtSec)],
            func: (targetSecond) => {
                const target = Math.max(0, targetSecond || 0);
                let attempts = 0;
                const maxAttempts = 120;
                const pickVideo = () => {
                    const videos = Array.from(document.querySelectorAll('video'));
                    if (videos.length === 0) {
                        return null;
                    }
                    return videos
                        .sort((a, b) => {
                        const scoreA = (a.paused ? 0 : 100000) + a.clientWidth * a.clientHeight;
                        const scoreB = (b.paused ? 0 : 100000) + b.clientWidth * b.clientHeight;
                        return scoreB - scoreA;
                    })[0] ?? null;
                };
                const applySeek = () => {
                    attempts += 1;
                    const video = pickVideo();
                    if (!video) {
                        return attempts >= maxAttempts;
                    }
                    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
                    const seekTarget = duration ? Math.min(target, Math.max(0, Math.floor(duration - 1))) : target;
                    try {
                        video.currentTime = seekTarget;
                    }
                    catch {
                        return false;
                    }
                    try {
                        if (video.paused) {
                            void video.play().catch(() => undefined);
                        }
                    }
                    catch {
                        // ignore autoplay restrictions
                    }
                    return true;
                };
                if (applySeek()) {
                    return;
                }
                const timer = window.setInterval(() => {
                    const done = applySeek();
                    if (done) {
                        window.clearInterval(timer);
                    }
                }, 500);
            }
        });
    }
    catch {
        // ignore sites where script injection is blocked
    }
}
async function openUrlWithResume(url, resumeAtSec) {
    const targetUrl = withResumeParam(url, resumeAtSec);
    const tab = await chrome.tabs.create({ url: targetUrl, active: true });
    if (typeof tab.id !== 'number') {
        return;
    }
    const tabId = tab.id;
    const resume = Math.max(0, Math.round(resumeAtSec || 0));
    const injectResume = async () => {
        await restorePlaybackInTab(tabId, resume);
    };
    if (tab.status === 'complete') {
        await injectResume();
        return;
    }
    const onUpdated = (updatedTabId, changeInfo) => {
        if (updatedTabId !== tabId || changeInfo.status !== 'complete') {
            return;
        }
        chrome.tabs.onUpdated.removeListener(onUpdated);
        void injectResume();
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    setTimeout(() => chrome.tabs.onUpdated.removeListener(onUpdated), 120000);
}
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
function parseUrl(urlString) {
    try {
        return new URL(urlString);
    }
    catch {
        return null;
    }
}
function getYouTubeVideoId(urlString) {
    const url = parseUrl(urlString);
    if (!url) {
        return null;
    }
    const host = url.hostname.replace(/^www\./i, '').toLowerCase();
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
        if (url.pathname === '/watch') {
            const id = url.searchParams.get('v');
            return id && id.trim() ? id.trim() : null;
        }
        if (url.pathname.startsWith('/shorts/')) {
            return url.pathname.split('/')[2] || null;
        }
        if (url.pathname.startsWith('/embed/')) {
            return url.pathname.split('/')[2] || null;
        }
    }
    if (host === 'youtu.be') {
        const id = url.pathname.replace(/^\//, '').split('/')[0];
        return id || null;
    }
    return null;
}
function withResumeParam(urlString, resumeAtSec) {
    if (resumeAtSec <= 0) {
        return urlString;
    }
    const url = parseUrl(urlString);
    if (!url) {
        return urlString;
    }
    const videoId = getYouTubeVideoId(urlString);
    if (!videoId) {
        return urlString;
    }
    const sec = Math.max(0, Math.round(resumeAtSec));
    url.searchParams.set('t', `${sec}s`);
    url.searchParams.set('start', String(sec));
    return url.toString();
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
    // Try to classify as anime or movie based on keywords
    const animeIndicators = [
        /\banime\b|\bepisode\b|\bep\s*\d+\b/i,
        /\bsub\b|\bdub\b|dubbed|subtitled/i,
        /season\s*\d+|s\d+e\d+/i,
        /animekai|crunchyroll|9anime|animixplay|gogoanime|zoro|hianime/i
    ];
    const movieIndicators = [
        /\bmovie\b|\bfilm\b|\bcinema\b/i,
        /1080p|720p|webrip|bluray|hdtv|dvdrip/i,
        /fmovies|putlocker|123movies|primewire|soap2day|flixtor/i,
        /youtube\.com|youtu\.be/i
    ];
    const animeScore = animeIndicators.reduce((score, re) => score + (re.test(combined) ? 1 : 0), 0);
    const movieScore = movieIndicators.reduce((score, re) => score + (re.test(combined) ? 1 : 0), 0);
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
        confidence: animeScore + movieScore
    };
}
function buildRecord(session) {
    const endTime = session.endTime ?? Date.now();
    const durationSec = Math.max(0, Math.round((endTime - session.startTime) / 1000));
    const lastPlaybackTime = session.lastPlaybackTime ?? durationSec;
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
        durationSec,
        lastPlaybackTime,
        videoDurationSec: session.videoDurationSec ?? null
    };
}
async function getVideoPlaybackInfo(tabId) {
    try {
        const [injection] = await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: () => {
                const videos = Array.from(document.querySelectorAll('video'));
                if (videos.length === 0) {
                    return null;
                }
                const bestVideo = videos
                    .filter((video) => Number.isFinite(video.currentTime))
                    .sort((a, b) => {
                    const scoreA = (a.paused ? 0 : 100000) + a.clientWidth * a.clientHeight;
                    const scoreB = (b.paused ? 0 : 100000) + b.clientWidth * b.clientHeight;
                    return scoreB - scoreA;
                })[0];
                if (!bestVideo) {
                    return null;
                }
                const currentTimeSec = Math.max(0, Math.round(bestVideo.currentTime || 0));
                const hasFiniteDuration = Number.isFinite(bestVideo.duration) && bestVideo.duration > 0;
                const durationSec = hasFiniteDuration ? Math.round(bestVideo.duration) : null;
                return { currentTimeSec, durationSec };
            }
        });
        return injection?.result ?? null;
    }
    catch {
        return null;
    }
}
async function isTrackingEnabled() {
    return await getStorage(ENABLED_KEY, true);
}
function getRecordIdentity(record) {
    const youtubeVideoId = getYouTubeVideoId(record.url);
    if (youtubeVideoId) {
        return `youtube|${youtubeVideoId}`;
    }
    const normalizedTitle = normalizeTitle(record.title || record.rawTitle || '').toLowerCase();
    const season = record.season ?? 'x';
    const episode = record.episode ?? 'x';
    const mediaType = record.mediaType ?? 'unknown';
    const hostnamePart = mediaType === 'unknown' ? `|${record.hostname}` : '';
    return `${mediaType}|${normalizedTitle}|${season}|${episode}${hostnamePart}`;
}
function mergeIntoRecord(base, incoming) {
    base.startedAt = Math.min(base.startedAt, incoming.startedAt);
    base.endedAt = Math.max(base.endedAt, incoming.endedAt);
    base.durationSec += incoming.durationSec;
    base.lastPlaybackTime = Math.max(base.lastPlaybackTime ?? 0, incoming.lastPlaybackTime ?? 0);
    const mergedVideoDuration = Math.max(base.videoDurationSec ?? 0, incoming.videoDurationSec ?? 0);
    base.videoDurationSec = mergedVideoDuration > 0 ? mergedVideoDuration : null;
    if (base.mediaType === 'unknown' && incoming.mediaType !== 'unknown') {
        base.mediaType = incoming.mediaType;
    }
    if (base.season === null && incoming.season !== null) {
        base.season = incoming.season;
    }
    if (base.episode === null && incoming.episode !== null) {
        base.episode = incoming.episode;
    }
    if ((base.title || '').length < (incoming.title || '').length) {
        base.title = incoming.title;
    }
    if ((base.rawTitle || '').length < (incoming.rawTitle || '').length) {
        base.rawTitle = incoming.rawTitle;
    }
    base.url = incoming.url;
    base.hostname = incoming.hostname;
    base.confidence = Math.max(base.confidence, incoming.confidence);
    return base;
}
function compactHistory(history) {
    const byKey = new Map();
    const orderedKeys = [];
    const sorted = [...history].sort((a, b) => a.startedAt - b.startedAt);
    for (const record of sorted) {
        const key = getRecordIdentity(record);
        const existing = byKey.get(key);
        if (!existing) {
            byKey.set(key, { ...record });
            orderedKeys.push(key);
        }
        else {
            mergeIntoRecord(existing, record);
        }
    }
    return orderedKeys.map((key) => byKey.get(key));
}
async function saveRecord(record) {
    if (record.durationSec < MIN_DURATION_SEC) {
        console.debug(`[MovieTrack] Skipped record (${record.durationSec}s < ${MIN_DURATION_SEC}s):`, record.title);
        return;
    }
    console.debug(`[MovieTrack] Saving record (${record.durationSec}s):`, record.title);
    const history = await getStorage(HISTORY_KEY, []);
    history.push(record);
    const compacted = compactHistory(history);
    if (compacted.length > 5000) {
        compacted.splice(0, compacted.length - 5000);
    }
    await setStorage(HISTORY_KEY, compacted);
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
    // Primary detection: tab is playing audio (bulletproof for any streaming site)
    const isAudible = tab.audible === true;
    const existing = activeSessions.get(tab.id);
    console.debug('[MovieTrack] Tab', tab.id, 'audible:', isAudible, 'title:', tab.title);
    if (!isAudible) {
        if (existing) {
            console.debug('[MovieTrack] Audio stopped; ending session');
            await finalizeSession(tab.id, now);
        }
        return;
    }
    // Audio is playing; classify content type for metadata
    const inferred = inferMedia(tab);
    console.debug('[MovieTrack] Inferred:', inferred);
    if (existing && existing.url === tab.url && existing.title === (tab.title ?? '')) {
        // Session continuing; update playback from page video element if available
        const playback = await getVideoPlaybackInfo(tab.id);
        if (playback) {
            existing.lastPlaybackTime = playback.currentTimeSec;
            if (playback.durationSec && playback.durationSec > 0) {
                existing.videoDurationSec = playback.durationSec;
            }
        }
        else {
            existing.lastPlaybackTime = Math.round((now - existing.startTime) / 1000);
        }
        return;
    }
    if (existing) {
        await finalizeSession(tab.id, now);
    }
    const playback = await getVideoPlaybackInfo(tab.id);
    console.debug('[MovieTrack] Starting new session for tab', tab.id);
    activeSessions.set(tab.id, {
        tabId: tab.id,
        url: tab.url ?? '',
        title: tab.title ?? '',
        cleanedTitle: inferred?.cleanedTitle ?? (tab.title ?? ''),
        mediaType: inferred?.mediaType ?? 'unknown',
        season: inferred?.season ?? null,
        episode: inferred?.episode ?? null,
        confidence: inferred?.confidence ?? 0,
        startTime: now,
        lastPlaybackTime: playback?.currentTimeSec,
        videoDurationSec: playback?.durationSec ?? null
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
            const compacted = compactHistory(history);
            const changed = compacted.length !== history.length;
            if (changed) {
                await setStorage(HISTORY_KEY, compacted);
            }
            sendResponse({ ok: true, history: compacted, enabled });
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
        if (payload?.type === 'openWithResume') {
            const url = typeof payload.url === 'string' ? payload.url : '';
            const resumeAtSecRaw = payload.resumeAtSec;
            const resumeAtSec = typeof resumeAtSecRaw === 'number' ? resumeAtSecRaw : 0;
            if (!url || !/^https?:\/\//i.test(url)) {
                sendResponse({ ok: false, error: 'Invalid URL' });
                return;
            }
            await openUrlWithResume(url, resumeAtSec);
            sendResponse({ ok: true });
            return;
        }
        sendResponse({ ok: false, error: 'Unknown action' });
    })();
    return true;
});
export {};
//# sourceMappingURL=background.js.map