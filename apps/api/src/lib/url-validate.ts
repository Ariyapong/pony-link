// Literal private/local hosts only. We never fetch targets server-side (no SSRF
// surface in v1) — this is hygiene so the shortener can't hand out links into
// someone's internal network.
const PRIVATE_HOST_RE =
  /^(localhost$|127\.|10\.|0\.0\.0\.0$|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\]$)/i;

/** Returns null when valid, otherwise a human-readable reason. */
export function validateTargetUrl(raw: string, ownHost: string): string | null {
  if (raw.length > 2048) return "URL is too long (max 2048 characters)";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "Must be a valid absolute URL";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "Only http(s) URLs are allowed";
  }
  if (url.hostname.toLowerCase() === ownHost.toLowerCase()) {
    return "Cannot shorten links pointing at the shortener itself";
  }
  if (PRIVATE_HOST_RE.test(url.hostname)) {
    return "Private or local addresses are not allowed";
  }
  return null;
}
