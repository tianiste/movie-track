/**
 * Normalizes a hostname or URL string for allowlist comparison.
 *
 * Returns the canonical hostname in lowercase with no `www.` prefix, protocol, path,
 * or port. Returns an empty string if the input is empty.
 *
 * @returns The normalized hostname, or an empty string if the input is empty
 */
export function normalizeAllowlistHost(value = ''): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return '';
  }

  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    return url.hostname.replace(/^www\./i, '');
  } catch {
    return trimmed
      .replace(/^https?:\/\//i, '')
      .replace(/^www\./i, '')
      .split('/')[0]
      .split(':')[0]
      .trim();
  }
}

/**
 * Extracts and normalizes the hostname from an HTTP(S) URL string.
 *
 * @returns The normalized hostname if the URL is valid and uses http: or https: protocol, empty string otherwise
 */
export function getUrlAllowlistHost(urlString = ''): string {
  try {
    const url = new URL(urlString);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return '';
    }
    return normalizeAllowlistHost(url.hostname);
  } catch {
    return '';
  }
}

/**
 * Normalizes and deduplicates a list of allowlist hosts.
 *
 * @param values - Host entries to normalize and deduplicate
 * @returns A sorted array of unique normalized hosts
 */
export function normalizeAllowlist(values: string[]): string[] {
  return [...new Set(values.map(normalizeAllowlistHost).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/**
 * Determines whether a URL is allowed by the configured allowlist.
 *
 * @returns `true` if the allowlist is disabled or the URL's host matches an allowed host (exactly or as a subdomain), `false` otherwise.
 */
export function isUrlAllowedByAllowlist(urlString: string, allowlistEnabled: boolean, sites: string[]): boolean {
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
