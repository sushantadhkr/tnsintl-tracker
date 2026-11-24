/*
 * Browsing policy matcher — shared by the desk browser request filter and the
 * agent UI. Pure functions, no Electron imports, so they can be unit tested.
 */

function normalizeDomain(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    .split('?')[0]
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
}

/** A host matches a domain when it is the domain itself or a subdomain of it. */
function matchesDomain(host, domain) {
  const d = normalizeDomain(domain);
  if (!d) return false;
  const h = String(host || '').toLowerCase();
  return h === d || h.endsWith('.' + d);
}

function urlParts(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return { host: url.hostname.toLowerCase(), url };
  } catch {
    return null;
  }
}

/**
 * Returns null when the request is allowed, otherwise the reason it is blocked.
 * Non-http(s) schemes (about:, data:, blob:, devtools:) are left alone.
 */
function blockReason(rawUrl, policy) {
  const parts = urlParts(rawUrl);
  if (!parts) return null;
  const mode = policy?.mode === 'blocklist' ? 'blocklist' : 'allowlist';
  const block = Array.isArray(policy?.block) ? policy.block : [];
  const allow = Array.isArray(policy?.allow) ? policy.allow : [];

  if (block.some((d) => matchesDomain(parts.host, d))) return 'blocked-domain';
  if (mode === 'allowlist' && !allow.some((d) => matchesDomain(parts.host, d))) return 'not-allowlisted';
  return null;
}

function isUrlAllowed(rawUrl, policy) {
  return blockReason(rawUrl, policy) === null;
}

module.exports = { normalizeDomain, matchesDomain, blockReason, isUrlAllowed };
