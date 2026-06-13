import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config.js';
const HISTORY_KEY = 'watchHistory';
const ENABLED_KEY = 'trackingEnabled';
const HEARTBEAT_ALARM = 'heartbeat';
const AUTH_SESSION_KEY = 'supabaseAuthSession';
const PRIVACY_CONSENT_KEY = 'privacyConsentAccepted';
const REQUIRED_HOST_PERMISSION = '<all_urls>';
const MIN_DURATION_SEC = 5;
const MERGE_GAP_MS = 5 * 60 * 1000;
const HEARTBEAT_MINUTES = 0.08;
async function restorePlaybackInTab(tabId, resumeAtSec) {
    if (!Number.isFinite(resumeAtSec) || resumeAtSec <= 0) {
        return;
    }
    try {
        await chrome.scripting.executeScript({
            target: { tabId, allFrames: true },
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
async function hasRequiredHostAccess() {
    return chrome.permissions.contains({ origins: [REQUIRED_HOST_PERMISSION] });
}
function isSupabaseAuthConfigured() {
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
        return false;
    }
    return /^https?:\/\//i.test(SUPABASE_URL);
}
function parseOAuthCallbackFragment(callbackUrl) {
    const hashIndex = callbackUrl.indexOf('#');
    if (hashIndex < 0) {
        return {};
    }
    const fragment = callbackUrl.slice(hashIndex + 1);
    const params = new URLSearchParams(fragment);
    const output = {};
    params.forEach((value, key) => {
        output[key] = value;
    });
    return output;
}
async function fetchSupabaseUser(accessToken) {
    if (!isSupabaseAuthConfigured()) {
        return undefined;
    }
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        method: 'GET',
        headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${accessToken}`
        }
    });
    if (!response.ok) {
        return undefined;
    }
    const data = (await response.json());
    if (!data?.id) {
        return undefined;
    }
    return {
        id: data.id,
        email: data.email
    };
}
async function signInWithGoogle() {
    if (!isSupabaseAuthConfigured()) {
        throw new Error('Supabase auth is not configured in background.ts');
    }
    const extensionRedirectUrl = chrome.identity.getRedirectURL('supabase-auth');
    const authUrl = new URL(`${SUPABASE_URL}/auth/v1/authorize`);
    authUrl.searchParams.set('provider', 'google');
    authUrl.searchParams.set('redirect_to', extensionRedirectUrl);
    const callbackUrl = await chrome.identity.launchWebAuthFlow({
        url: authUrl.toString(),
        interactive: true
    });
    if (!callbackUrl) {
        throw new Error('Authentication was cancelled');
    }
    const params = parseOAuthCallbackFragment(callbackUrl);
    const accessToken = params.access_token;
    const refreshToken = params.refresh_token;
    const expiresIn = Number(params.expires_in || 0);
    if (!accessToken) {
        throw new Error('No access token returned by Supabase');
    }
    const expiresAt = Date.now() + Math.max(0, expiresIn) * 1000;
    const user = await fetchSupabaseUser(accessToken);
    const session = {
        accessToken,
        refreshToken,
        expiresAt,
        tokenType: params.token_type,
        user
    };
    await setStorage(AUTH_SESSION_KEY, session);
    return session;
}
async function refreshSupabaseSessionIfNeeded(session) {
    if (!isSupabaseAuthConfigured()) {
        return null;
    }
    const now = Date.now();
    if (session.expiresAt > now + 60_000) {
        return session;
    }
    if (!session.refreshToken) {
        await clearSupabaseSession();
        return null;
    }
    let response;
    try {
        response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
            method: 'POST',
            headers: {
                apikey: SUPABASE_PUBLISHABLE_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ refresh_token: session.refreshToken })
        });
    }
    catch {
        return null;
    }
    if (!response.ok) {
        if (response.status === 400 || response.status === 401 || response.status === 403) {
            await clearSupabaseSession();
        }
        return null;
    }
    const data = (await response.json());
    if (!data?.access_token) {
        await clearSupabaseSession();
        return null;
    }
    const refreshed = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? session.refreshToken,
        expiresAt: Date.now() + Math.max(0, Number(data.expires_in ?? 0)) * 1000,
        tokenType: data.token_type ?? session.tokenType,
        user: await fetchSupabaseUser(data.access_token)
    };
    await setStorage(AUTH_SESSION_KEY, refreshed);
    return refreshed;
}
async function getValidSupabaseSession() {
    const stored = await getStorage(AUTH_SESSION_KEY, null);
    if (!stored?.accessToken) {
        return null;
    }
    const maybeRefreshed = await refreshSupabaseSessionIfNeeded(stored);
    if (!maybeRefreshed) {
        return null;
    }
    return maybeRefreshed;
}
async function revokeSupabaseSession(session) {
    if (!isSupabaseAuthConfigured()) {
        return;
    }
    const response = await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: getSupabaseHeaders(session, {
            'Content-Type': 'application/json'
        })
    });
    if (!response.ok && response.status !== 401) {
        throw new Error(`Supabase logout failed: ${response.status}`);
    }
}
async function clearSupabaseSession() {
    await setStorage(AUTH_SESSION_KEY, null);
}
async function signOutOfSupabase() {
    const session = await getValidSupabaseSession();
    try {
        if (session) {
            await revokeSupabaseSession(session);
        }
        return { ok: true };
    }
    catch (error) {
        return {
            ok: false,
            warning: error instanceof Error ? error.message : 'Supabase logout failed'
        };
    }
    finally {
        await clearSupabaseSession();
    }
}
function getSupabaseHeaders(session, extra) {
    return {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session.accessToken}`,
        ...extra
    };
}
function dateFromMillis(timestamp) {
    return new Date(timestamp).toISOString();
}
function millisFromDate(value) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : Date.now();
}
function ensureRecordIdentity(record) {
    const identityKey = record.identityKey || getRecordIdentity(record);
    return {
        ...record,
        identityKey,
        syncStatus: record.syncStatus ?? 'pending',
        updatedAt: record.updatedAt ?? Date.now()
    };
}
function toCloudRecord(record, userId) {
    const withIdentity = ensureRecordIdentity(record);
    return {
        user_id: userId,
        client_record_id: withIdentity.id,
        url: withIdentity.url,
        hostname: withIdentity.hostname,
        raw_title: withIdentity.rawTitle,
        title: withIdentity.title,
        media_type: withIdentity.mediaType,
        season: withIdentity.season,
        episode: withIdentity.episode,
        confidence: withIdentity.confidence,
        started_at: dateFromMillis(withIdentity.startedAt),
        ended_at: dateFromMillis(withIdentity.endedAt),
        duration_sec: Math.max(0, withIdentity.durationSec || 0),
        last_playback_time: withIdentity.lastPlaybackTime ?? null,
        video_duration_sec: withIdentity.videoDurationSec ?? null,
        manual_title: withIdentity.manualTitle ?? null,
        manual_media_type: withIdentity.manualMediaType ?? null,
        manual_season: withIdentity.manualSeason ?? null,
        manual_episode: withIdentity.manualEpisode ?? null,
        deleted_at: withIdentity.deletedAt ? dateFromMillis(withIdentity.deletedAt) : null,
        identity_key: withIdentity.identityKey
    };
}
function fromCloudRecord(record) {
    return {
        id: record.client_record_id || record.id,
        tabId: -1,
        url: record.url,
        hostname: record.hostname,
        rawTitle: record.raw_title,
        title: record.title,
        mediaType: record.media_type,
        season: record.season,
        episode: record.episode,
        confidence: record.confidence,
        startedAt: millisFromDate(record.started_at),
        endedAt: millisFromDate(record.ended_at),
        durationSec: Math.max(0, record.duration_sec || 0),
        lastPlaybackTime: record.last_playback_time ?? undefined,
        videoDurationSec: record.video_duration_sec,
        manualTitle: record.manual_title,
        manualMediaType: record.manual_media_type,
        manualSeason: record.manual_season,
        manualEpisode: record.manual_episode,
        deletedAt: record.deleted_at ? millisFromDate(record.deleted_at) : null,
        identityKey: record.identity_key,
        syncStatus: 'synced',
        cloudId: record.id,
        updatedAt: millisFromDate(record.updated_at)
    };
}
function mergeForCloud(base, incoming) {
    const output = { ...ensureRecordIdentity(base) };
    const next = ensureRecordIdentity(incoming);
    output.startedAt = Math.min(output.startedAt, next.startedAt);
    output.endedAt = Math.max(output.endedAt, next.endedAt);
    output.durationSec = Math.max(output.durationSec || 0, next.durationSec || 0);
    output.lastPlaybackTime = Math.max(output.lastPlaybackTime ?? 0, next.lastPlaybackTime ?? 0);
    const mergedVideoDuration = Math.max(output.videoDurationSec ?? 0, next.videoDurationSec ?? 0);
    output.videoDurationSec = mergedVideoDuration > 0 ? mergedVideoDuration : null;
    if (output.mediaType === 'unknown' && next.mediaType !== 'unknown') {
        output.mediaType = next.mediaType;
    }
    if (output.season === null && next.season !== null) {
        output.season = next.season;
    }
    if (output.episode === null && next.episode !== null) {
        output.episode = next.episode;
    }
    if ((output.title || '').length < (next.title || '').length) {
        output.title = next.title;
    }
    if ((output.rawTitle || '').length < (next.rawTitle || '').length) {
        output.rawTitle = next.rawTitle;
    }
    const outputUpdated = output.updatedAt ?? 0;
    const nextUpdated = next.updatedAt ?? 0;
    if (nextUpdated >= outputUpdated) {
        output.manualTitle = next.manualTitle ?? null;
        output.manualMediaType = next.manualMediaType ?? null;
        output.manualSeason = next.manualSeason ?? null;
        output.manualEpisode = next.manualEpisode ?? null;
        output.deletedAt = next.deletedAt ?? null;
    }
    output.url = next.url || output.url;
    output.hostname = next.hostname || output.hostname;
    output.confidence = Math.max(output.confidence || 0, next.confidence || 0);
    output.cloudId = next.cloudId ?? output.cloudId;
    output.syncStatus = next.syncStatus === 'failed' ? 'failed' : output.syncStatus;
    output.syncError = next.syncError ?? output.syncError;
    output.updatedAt = Math.max(output.updatedAt ?? 0, next.updatedAt ?? 0) || Date.now();
    return output;
}
function mergeCloudAndLocal(localHistory, cloudHistory) {
    const byKey = new Map();
    for (const record of [...cloudHistory, ...localHistory]) {
        const withIdentity = ensureRecordIdentity(record);
        const key = withIdentity.identityKey;
        const existing = byKey.get(key);
        byKey.set(key, existing ? mergeForCloud(existing, withIdentity) : withIdentity);
    }
    return [...byKey.values()].sort((a, b) => a.startedAt - b.startedAt);
}
async function fetchCloudRecords(session) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/watch_records?select=*&order=started_at.desc`, {
        method: 'GET',
        headers: getSupabaseHeaders(session)
    });
    if (!response.ok) {
        throw new Error(`Cloud history fetch failed: ${response.status}`);
    }
    const rows = (await response.json());
    return rows.map(fromCloudRecord);
}
async function fetchCloudRecordByIdentity(session, identityKey) {
    const filter = `identity_key=eq.${encodeURIComponent(identityKey)}`;
    const response = await fetch(`${SUPABASE_URL}/rest/v1/watch_records?select=*&${filter}&limit=1`, {
        method: 'GET',
        headers: getSupabaseHeaders(session)
    });
    if (!response.ok) {
        throw new Error(`Cloud record fetch failed: ${response.status}`);
    }
    const rows = (await response.json());
    return rows[0] ? fromCloudRecord(rows[0]) : null;
}
async function upsertCloudRecord(session, record) {
    if (!session.user?.id) {
        throw new Error('Cannot sync without a Supabase user');
    }
    const local = ensureRecordIdentity(record);
    const existing = await fetchCloudRecordByIdentity(session, local.identityKey);
    const merged = existing ? mergeForCloud(existing, local) : local;
    const body = toCloudRecord(merged, session.user.id);
    const target = existing?.cloudId
        ? `${SUPABASE_URL}/rest/v1/watch_records?id=eq.${encodeURIComponent(existing.cloudId)}`
        : `${SUPABASE_URL}/rest/v1/watch_records`;
    const response = await fetch(target, {
        method: existing ? 'PATCH' : 'POST',
        headers: getSupabaseHeaders(session, {
            'Content-Type': 'application/json',
            Prefer: 'return=representation'
        }),
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        throw new Error(`Cloud record sync failed: ${response.status}`);
    }
    const rows = (await response.json());
    return rows[0] ? fromCloudRecord(rows[0]) : { ...merged, syncStatus: 'synced' };
}
async function deleteCloudRecords(session) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/watch_records?id=not.is.null`, {
        method: 'DELETE',
        headers: getSupabaseHeaders(session)
    });
    if (!response.ok) {
        throw new Error(`Cloud clear failed: ${response.status}`);
    }
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
function getStoredWatchUrl(urlString) {
    const url = parseUrl(urlString);
    if (!url) {
        return urlString;
    }
    url.hash = '';
    const youtubeVideoId = getYouTubeVideoId(urlString);
    if (youtubeVideoId) {
        const safeUrl = new URL('https://www.youtube.com/watch');
        safeUrl.searchParams.set('v', youtubeVideoId);
        return safeUrl.toString();
    }
    url.search = '';
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
    const seasonEpisodePatterns = [
        /\b(?:season|series|seas)\s*[:#._\-/]?\s*(\d{1,2})(?:st|nd|rd|th)?\b\D{0,16}(?:episode|ep|e)\s*[:#._\-/]?\s*(\d{1,3})(?:st|nd|rd|th)?\b/i,
        /\b(?:s(?:eason)?|series)\s*[:#._\-/]?\s*(\d{1,2})(?:st|nd|rd|th)?\b\D{0,16}(?:episode|ep|e)\s*[:#._\-/]?\s*(\d{1,3})(?:st|nd|rd|th)?\b/i,
        /\b(?:season|series)\s*[-_\/\s]*(\d{1,2})(?:st|nd|rd|th)?\b\D{0,16}(?:episode|ep|e)\s*[:#._\-/]?\s*(\d{1,3})(?:st|nd|rd|th)?\b/i,
        /\b(\d{1,2})\s*x\s*(\d{1,3})\b/i,
        /\bs(\d{1,2})e(\d{1,3})\b/i
    ];
    const episodePatterns = [
        /\b(?:episode|ep|e)\s*[:#._\-/]?\s*(\d{1,4})(?:st|nd|rd|th)?\b/i,
        /\b(?:part|pt)\s*[:#._\-/]?\s*(\d{1,4})(?:st|nd|rd|th)?\b/i,
        /\b(?:ova|ona|specials?|extras?)\s*[:#._\-/]?\s*(\d{1,4})(?:st|nd|rd|th)?\b/i,
        /\b#\s*(\d{1,4})\b/i,
        /\b(\d{1,4})\s*(?:vostfr|sub|dub|dubbed|subbed)\b/i
    ];
    for (const pattern of seasonEpisodePatterns) {
        const match = text.match(pattern);
        if (match) {
            return {
                season: Number(match[1]),
                episode: Number(match[2])
            };
        }
    }
    for (const pattern of episodePatterns) {
        const match = text.match(pattern);
        if (match) {
            return {
                season: null,
                episode: Number(match[1])
            };
        }
    }
    return { season: null, episode: null };
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
function parseEpisodeHintFromUrl(urlString) {
    const parsedUrl = parseUrl(urlString);
    if (!parsedUrl) {
        return { season: null, episode: null };
    }
    const queryParts = [];
    parsedUrl.searchParams.forEach((value, key) => {
        if (!value.trim()) {
            return;
        }
        const normalizedKey = key.toLowerCase();
        if (['s', 'season', 'seasonno', 'season_num', 'seasonnumber', 'seasonid'].includes(normalizedKey)) {
            queryParts.push(`season ${value}`);
        }
        if (['e', 'ep', 'episode', 'episodeid', 'episode_num', 'episodenumber'].includes(normalizedKey)) {
            queryParts.push(`episode ${value}`);
        }
        queryParts.push(value);
    });
    const urlHint = parseEpisodeHint([
        parsedUrl.pathname,
        parsedUrl.hash,
        ...queryParts
    ].join(' '));
    return {
        season: parseSeasonHint([
            parsedUrl.pathname,
            parsedUrl.hash,
            ...queryParts
        ].join(' ')) ?? urlHint.season,
        episode: urlHint.episode
    };
}
function mergeEpisodeHints(primary, fallback) {
    return {
        season: primary.season ?? fallback.season,
        episode: primary.episode ?? fallback.episode
    };
}
function scorePatterns(value, patterns) {
    return patterns.reduce((score, [pattern, weight]) => score + (pattern.test(value) ? weight : 0), 0);
}
function inferMedia(tab) {
    const title = tab.title ?? '';
    const url = tab.url ?? '';
    if (!url || !/^https?:\/\//i.test(url)) {
        return null;
    }
    const parsedUrl = parseUrl(url);
    const hostname = parsedUrl?.hostname.replace(/^www\./i, '').toLowerCase() ?? '';
    const pathname = parsedUrl?.pathname.toLowerCase() ?? '';
    const combined = `${title} ${hostname} ${pathname}`.toLowerCase();
    const animeSiteIndicators = [
        [/(^|\.)anime(?:salt|kai|pahe|flix|dao|freak|heaven|planet|take|suge|unity|owl|fenix|gg|id|tv|to)?\./i, 4],
        [/(^|\d)9anime\./i, 4],
        [/(^|\.)ani(?:watch|wave|mixplay|me|lab|list)\./i, 4],
        [/(^|\.)(crunchyroll|funimation|hidive|vrv)\./i, 4],
        [/(^|\.)(gogoanime|hianime|zoro|kissanime|animepisode)\./i, 4]
    ];
    const animeTextIndicators = [
        [/\banime\b/i, 3],
        [/\bepisode\b|\bep\s*\d+\b/i, 2],
        [/\bsub\b|\bdub\b|dubbed|subtitled/i, 2],
        [/\bova\b|\bona\b|\bspecial\b/i, 1],
        [/season\s*\d+|s\d+e\d+/i, 1],
        [/\/anime(?:\/|-|$)/i, 3],
        [/watch\s+.+\s+online\s+in\s+hd/i, 1]
    ];
    const movieSiteIndicators = [
        [/(^|\.)(fmovies|putlocker|123movies|primewire|soap2day|flixtor)\./i, 4],
        [/(^|\.)(netflix|hulu|max|disneyplus|primevideo)\./i, 2]
    ];
    const movieTextIndicators = [
        [/\bmovie\b|\bfilm\b|\bcinema\b/i, 3],
        [/\bfull\s+movie\b|\bwatch\s+movie\b/i, 2],
        [/1080p|720p|webrip|bluray|hdtv|dvdrip/i, 1]
    ];
    const animeScore = scorePatterns(hostname, animeSiteIndicators) + scorePatterns(combined, animeTextIndicators);
    const movieScore = scorePatterns(hostname, movieSiteIndicators) + scorePatterns(combined, movieTextIndicators);
    const isYouTube = hostname === 'youtube.com' || hostname === 'm.youtube.com' || hostname === 'music.youtube.com' || hostname === 'youtu.be';
    let mediaType = 'unknown';
    if (isYouTube) {
        mediaType = 'youtube';
    }
    else if (animeScore >= movieScore && animeScore > 0) {
        mediaType = 'anime';
    }
    else if (movieScore > animeScore && movieScore > 0) {
        mediaType = 'movie';
    }
    const cleanedTitle = normalizeTitle(title) || title || url;
    const titleHint = parseEpisodeHint(title);
    const titleSeason = parseSeasonHint(title);
    const urlHint = parseEpisodeHintFromUrl(url);
    const { season, episode } = mergeEpisodeHints({
        season: titleHint.season ?? titleSeason,
        episode: titleHint.episode
    }, urlHint);
    return {
        mediaType,
        cleanedTitle,
        season,
        episode,
        confidence: (isYouTube ? 4 : 0) + animeScore + movieScore
    };
}
function buildRecord(session) {
    const endTime = session.endTime ?? Date.now();
    const durationSec = Math.max(0, Math.round((endTime - session.startTime) / 1000));
    const lastPlaybackTime = session.lastPlaybackTime ?? durationSec;
    const storedUrl = getStoredWatchUrl(session.url);
    return {
        id: `${session.tabId}-${session.startTime}`,
        tabId: session.tabId,
        url: storedUrl,
        hostname: getHostname(storedUrl),
        rawTitle: session.cleanedTitle,
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
        const injections = await chrome.scripting.executeScript({
            target: { tabId, allFrames: true },
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
        const results = injections
            .map((injection) => injection.result)
            .filter((result) => Boolean(result));
        return results
            .sort((a, b) => {
            const durationScoreA = a.durationSec ?? 0;
            const durationScoreB = b.durationSec ?? 0;
            return durationScoreB - durationScoreA;
        })[0] ?? null;
    }
    catch {
        return null;
    }
}
async function isTrackingEnabled() {
    const [enabled, consentAccepted, hostAccessGranted] = await Promise.all([
        getStorage(ENABLED_KEY, false),
        getStorage(PRIVACY_CONSENT_KEY, false),
        hasRequiredHostAccess()
    ]);
    return enabled && consentAccepted && hostAccessGranted;
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
    const baseUpdated = base.updatedAt ?? 0;
    const incomingUpdated = incoming.updatedAt ?? 0;
    if (incomingUpdated >= baseUpdated) {
        base.manualTitle = incoming.manualTitle ?? null;
        base.manualMediaType = incoming.manualMediaType ?? null;
        base.manualSeason = incoming.manualSeason ?? null;
        base.manualEpisode = incoming.manualEpisode ?? null;
        base.deletedAt = incoming.deletedAt ?? null;
    }
    base.url = incoming.url;
    base.hostname = incoming.hostname;
    base.confidence = Math.max(base.confidence, incoming.confidence);
    base.identityKey = incoming.identityKey ?? base.identityKey ?? getRecordIdentity(base);
    base.cloudId = incoming.cloudId ?? base.cloudId;
    base.updatedAt = Math.max(base.updatedAt ?? 0, incoming.updatedAt ?? 0) || Date.now();
    if (base.syncStatus !== 'pending') {
        base.syncStatus = incoming.syncStatus ?? base.syncStatus;
    }
    if (incoming.syncError) {
        base.syncError = incoming.syncError;
    }
    return base;
}
function compactHistory(history) {
    const byKey = new Map();
    const orderedKeys = [];
    const sorted = [...history].sort((a, b) => a.startedAt - b.startedAt);
    for (const record of sorted) {
        const withIdentity = ensureRecordIdentity(record);
        const key = withIdentity.identityKey;
        const existing = byKey.get(key);
        if (!existing) {
            byKey.set(key, { ...withIdentity });
            orderedKeys.push(key);
        }
        else {
            mergeIntoRecord(existing, withIdentity);
        }
    }
    return orderedKeys.map((key) => byKey.get(key));
}
function normalizeRecordPatch(patch) {
    const next = {};
    if ('manualTitle' in patch) {
        const value = typeof patch.manualTitle === 'string' ? patch.manualTitle.trim() : '';
        next.manualTitle = value || null;
    }
    if ('manualMediaType' in patch) {
        next.manualMediaType = patch.manualMediaType ?? null;
    }
    if ('manualSeason' in patch) {
        const season = patch.manualSeason;
        next.manualSeason = typeof season === 'number' && Number.isFinite(season) ? Math.max(0, season) : null;
    }
    if ('manualEpisode' in patch) {
        const episode = patch.manualEpisode;
        next.manualEpisode = typeof episode === 'number' && Number.isFinite(episode) ? Math.max(0, episode) : null;
    }
    return next;
}
async function updateLocalRecord(recordId, patch) {
    const history = compactHistory(await getStorage(HISTORY_KEY, []));
    const now = Date.now();
    const normalizedPatch = normalizeRecordPatch(patch);
    let changed = false;
    const nextHistory = history.map((record) => {
        if (record.id !== recordId) {
            return record;
        }
        changed = true;
        return ensureRecordIdentity({
            ...record,
            ...normalizedPatch,
            deletedAt: null,
            syncStatus: 'pending',
            syncError: undefined,
            updatedAt: now
        });
    });
    if (!changed) {
        throw new Error('Record not found');
    }
    await setStorage(HISTORY_KEY, nextHistory);
    void syncPendingRecords();
    return nextHistory;
}
async function deleteLocalRecord(recordId) {
    const history = compactHistory(await getStorage(HISTORY_KEY, []));
    const now = Date.now();
    let changed = false;
    const nextHistory = history.map((record) => {
        if (record.id !== recordId) {
            return record;
        }
        changed = true;
        return ensureRecordIdentity({
            ...record,
            deletedAt: now,
            syncStatus: 'pending',
            syncError: undefined,
            updatedAt: now
        });
    });
    if (!changed) {
        throw new Error('Record not found');
    }
    await setStorage(HISTORY_KEY, nextHistory);
    void syncPendingRecords();
    return nextHistory;
}
async function syncPendingRecords() {
    const session = await getValidSupabaseSession();
    if (!session?.user?.id) {
        return { ok: false, synced: 0, failed: 0, error: 'Not authenticated' };
    }
    const history = compactHistory(await getStorage(HISTORY_KEY, []));
    let synced = 0;
    let failed = 0;
    const nextHistory = [];
    for (const record of history) {
        const candidate = ensureRecordIdentity(record);
        if (candidate.syncStatus === 'synced') {
            nextHistory.push(candidate);
            continue;
        }
        try {
            const syncedRecord = await upsertCloudRecord(session, { ...candidate, syncStatus: 'syncing' });
            nextHistory.push({ ...mergeForCloud(candidate, syncedRecord), syncStatus: 'synced', syncError: undefined });
            synced += 1;
        }
        catch (error) {
            nextHistory.push({
                ...candidate,
                syncStatus: 'failed',
                syncError: error instanceof Error ? error.message : 'Cloud sync failed'
            });
            failed += 1;
        }
    }
    await setStorage(HISTORY_KEY, compactHistory(nextHistory));
    return { ok: failed === 0, synced, failed, error: failed > 0 ? 'Some records failed to sync' : undefined };
}
async function refreshHistoryFromCloud() {
    const localHistory = compactHistory(await getStorage(HISTORY_KEY, []));
    const session = await getValidSupabaseSession();
    if (!session?.user?.id) {
        await setStorage(HISTORY_KEY, localHistory);
        return localHistory;
    }
    await syncPendingRecords();
    const cloudHistory = await fetchCloudRecords(session);
    const merged = compactHistory(mergeCloudAndLocal(localHistory, cloudHistory));
    await setStorage(HISTORY_KEY, merged);
    return merged;
}
async function saveRecord(record) {
    if (record.durationSec < MIN_DURATION_SEC) {
        console.debug(`[MovieTrack] Skipped record (${record.durationSec}s < ${MIN_DURATION_SEC}s):`, record.title);
        return;
    }
    console.debug(`[MovieTrack] Saving record (${record.durationSec}s):`, record.title);
    const history = await getStorage(HISTORY_KEY, []);
    history.push({
        ...ensureRecordIdentity(record),
        syncStatus: 'pending',
        syncError: undefined,
        updatedAt: Date.now()
    });
    const compacted = compactHistory(history);
    if (compacted.length > 5000) {
        compacted.splice(0, compacted.length - 5000);
    }
    await setStorage(HISTORY_KEY, compacted);
    void syncPendingRecords();
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
async function stopTrackingSessions(now = Date.now()) {
    for (const tabId of activeSessions.keys()) {
        await finalizeSession(tabId, now);
    }
    currentActiveTabId = null;
}
async function startOrUpdateSession(tab, now = Date.now()) {
    if (typeof tab.id !== 'number') {
        return;
    }
    if (!(await isTrackingEnabled())) {
        if (activeSessions.has(tab.id)) {
            await finalizeSession(tab.id, now);
        }
        return;
    }
    // Primary detection: tab is playing audio, then confirm a real video element.
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
    const playback = await getVideoPlaybackInfo(tab.id);
    if (!playback) {
        if (existing) {
            console.debug('[MovieTrack] Video element unavailable; ending session');
            await finalizeSession(tab.id, now);
        }
        return;
    }
    // Audio is playing; classify content type for metadata
    const inferred = inferMedia(tab);
    console.debug('[MovieTrack] Inferred:', inferred);
    if (existing && existing.url === tab.url && existing.title === (tab.title ?? '')) {
        existing.lastPlaybackTime = playback.currentTimeSec;
        if (playback.durationSec && playback.durationSec > 0) {
            existing.videoDurationSec = playback.durationSec;
        }
        return;
    }
    if (existing) {
        await finalizeSession(tab.id, now);
    }
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
        await setStorage(ENABLED_KEY, false);
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
        await stopTrackingSessions(Date.now());
        return;
    }
    const activeTab = await getActiveTabInFocusedWindow();
    if (activeTab && typeof activeTab.id === 'number') {
        await onActiveTabChanged(activeTab.id);
    }
});
chrome.permissions.onRemoved.addListener(async (permissions) => {
    if (!permissions.origins?.includes(REQUIRED_HOST_PERMISSION)) {
        return;
    }
    await setStorage(ENABLED_KEY, false);
    await stopTrackingSessions(Date.now());
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    (async () => {
        const payload = message;
        if (payload?.type === 'getPrivacyStatus') {
            const [consentAccepted, enabled, hostAccessGranted] = await Promise.all([
                getStorage(PRIVACY_CONSENT_KEY, false),
                getStorage(ENABLED_KEY, false),
                hasRequiredHostAccess()
            ]);
            sendResponse({ ok: true, consentAccepted, enabled: enabled && hostAccessGranted, hostAccessGranted });
            return;
        }
        if (payload?.type === 'acceptPrivacyConsent') {
            const hostAccessGranted = await hasRequiredHostAccess();
            await Promise.all([
                setStorage(PRIVACY_CONSENT_KEY, true),
                setStorage(ENABLED_KEY, hostAccessGranted)
            ]);
            if (hostAccessGranted) {
                await heartbeat();
            }
            sendResponse({ ok: true, consentAccepted: true, enabled: hostAccessGranted, hostAccessGranted });
            return;
        }
        if (payload?.type === 'getAuthStatus') {
            const session = await getValidSupabaseSession();
            sendResponse({
                ok: true,
                configured: isSupabaseAuthConfigured(),
                signedIn: Boolean(session),
                user: session?.user ?? null
            });
            return;
        }
        if (payload?.type === 'signIn') {
            try {
                const session = await signInWithGoogle();
                await syncPendingRecords();
                sendResponse({ ok: true, signedIn: true, user: session.user ?? null });
            }
            catch (error) {
                sendResponse({
                    ok: false,
                    error: error instanceof Error ? error.message : 'Authentication failed'
                });
            }
            return;
        }
        if (payload?.type === 'syncNow') {
            const result = await syncPendingRecords();
            sendResponse(result);
            return;
        }
        if (payload?.type === 'syncCloudToLocal') {
            try {
                const history = await refreshHistoryFromCloud();
                sendResponse({ ok: true, history });
            }
            catch (error) {
                sendResponse({
                    ok: false,
                    error: error instanceof Error ? error.message : 'Cloud sync failed'
                });
            }
            return;
        }
        if (payload?.type === 'signOut') {
            const result = await signOutOfSupabase();
            sendResponse({ ...result, signedIn: false });
            return;
        }
        if (payload?.type === 'getHistory') {
            const enabled = await isTrackingEnabled();
            let compacted;
            try {
                compacted = await refreshHistoryFromCloud();
            }
            catch {
                const history = await getStorage(HISTORY_KEY, []);
                compacted = compactHistory(history);
                const changed = compacted.length !== history.length;
                if (changed) {
                    await setStorage(HISTORY_KEY, compacted);
                }
            }
            sendResponse({ ok: true, history: compacted, enabled });
            return;
        }
        if (payload?.type === 'setEnabled') {
            const enabled = Boolean(payload.enabled);
            const [consentAccepted, hostAccessGranted] = await Promise.all([
                getStorage(PRIVACY_CONSENT_KEY, false),
                hasRequiredHostAccess()
            ]);
            if (enabled && !consentAccepted) {
                sendResponse({ ok: false, error: 'Privacy consent required' });
                return;
            }
            if (enabled && !hostAccessGranted) {
                sendResponse({ ok: false, error: 'Site access required' });
                return;
            }
            await setStorage(ENABLED_KEY, enabled);
            if (!enabled) {
                await stopTrackingSessions(Date.now());
            }
            else {
                await heartbeat();
            }
            sendResponse({ ok: true, enabled });
            return;
        }
        if (payload?.type === 'clearHistory') {
            try {
                if (payload.scope === 'cloudAndLocal') {
                    const session = await getValidSupabaseSession();
                    if (session) {
                        await deleteCloudRecords(session);
                    }
                }
                await setStorage(HISTORY_KEY, []);
                sendResponse({ ok: true });
            }
            catch (error) {
                sendResponse({
                    ok: false,
                    error: error instanceof Error ? error.message : 'Clear failed'
                });
            }
            return;
        }
        if (payload?.type === 'updateRecord') {
            try {
                if (!payload.id || !payload.patch) {
                    sendResponse({ ok: false, error: 'Missing record update data' });
                    return;
                }
                const history = await updateLocalRecord(payload.id, payload.patch);
                sendResponse({ ok: true, history });
            }
            catch (error) {
                sendResponse({
                    ok: false,
                    error: error instanceof Error ? error.message : 'Update failed'
                });
            }
            return;
        }
        if (payload?.type === 'deleteRecord') {
            try {
                if (!payload.id) {
                    sendResponse({ ok: false, error: 'Missing record id' });
                    return;
                }
                const history = await deleteLocalRecord(payload.id);
                sendResponse({ ok: true, history });
            }
            catch (error) {
                sendResponse({
                    ok: false,
                    error: error instanceof Error ? error.message : 'Delete failed'
                });
            }
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
//# sourceMappingURL=background.js.map