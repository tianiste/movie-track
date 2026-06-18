export function normalizeAllowlistHost(value = '') {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) {
        return '';
    }
    try {
        const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
        return url.hostname.replace(/^www\./i, '');
    }
    catch {
        return trimmed
            .replace(/^https?:\/\//i, '')
            .replace(/^www\./i, '')
            .split('/')[0]
            .split(':')[0]
            .trim();
    }
}
export function getUrlAllowlistHost(urlString = '') {
    try {
        const url = new URL(urlString);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            return '';
        }
        return normalizeAllowlistHost(url.hostname);
    }
    catch {
        return '';
    }
}
export function normalizeAllowlist(values) {
    return [...new Set(values.map(normalizeAllowlistHost).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
export function isUrlAllowedByAllowlist(urlString, allowlistEnabled, sites) {
    if (!allowlistEnabled) {
        return true;
    }
    const host = getUrlAllowlistHost(urlString);
    if (!host) {
        return false;
    }
    const allowedHosts = normalizeAllowlist(sites);
    return allowedHosts.some((allowedHost) => host === allowedHost || host.endsWith(`.${allowedHost}`));
}
//# sourceMappingURL=siteAllowlist.js.map