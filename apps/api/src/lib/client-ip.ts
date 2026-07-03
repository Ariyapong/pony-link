// Published Cloudflare IPv4 ranges (https://www.cloudflare.com/ips-v4).
// The ufw firewall (deployment runbook) is the real enforcement; this check is
// defense in depth so a spoofed CF-Connecting-IP from a direct connection can
// never poison rate-limit keys. Refresh this list if Cloudflare's changes.
const CF_IPV4_RANGES = [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
  "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
  "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
  "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const b = Number(p);
    if (!Number.isInteger(b) || b < 0 || b > 255 || p !== String(b)) return null;
    n = n * 256 + b;
  }
  return n >>> 0;
}

const PARSED_RANGES = CF_IPV4_RANGES.map((cidr) => {
  const [base, bitsStr] = cidr.split("/") as [string, string];
  const bits = Number(bitsStr);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return { base: (ipv4ToInt(base)! & mask) >>> 0, mask };
});

export function isCloudflareIp(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return false;
  return PARSED_RANGES.some((r) => ((n & r.mask) >>> 0) === r.base);
}

// Loopback + RFC1918 private ranges. In production the app's TCP peer is
// ALWAYS the Caddy container on the compose bridge network (a 172.16-31.x
// address) — never Cloudflare directly — so isCloudflareIp() alone would
// never trust the header and every rate-limit bucket would key on Caddy's
// single IP. These ranges cover that peer (plus loopback for local/dev).
const PRIVATE_IPV4_RANGES = ["127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"];
const PARSED_PRIVATE_RANGES = PRIVATE_IPV4_RANGES.map((cidr) => {
  const [base, bitsStr] = cidr.split("/") as [string, string];
  const bits = Number(bitsStr);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return { base: (ipv4ToInt(base)! & mask) >>> 0, mask };
});

/** True for loopback and RFC1918 private-space peers (see PRIVATE_IPV4_RANGES above). */
export function isTrustedProxyPeer(ip: string): boolean {
  if (ip === "::1") return true; // IPv6 loopback
  const n = ipv4ToInt(ip);
  if (n === null) return false;
  return PARSED_PRIVATE_RANGES.some((r) => ((n & r.mask) >>> 0) === r.base);
}

/**
 * Trust CF-Connecting-IP based on who the TCP peer is — a trust tier, not a
 * single check:
 *   - edge tier: peer is a published Cloudflare IP — the request reached us
 *     directly from Cloudflare's edge. Trusted immediately.
 *   - proxy tier: peer is a private/loopback address. Safe because the app
 *     port is never published to the internet — only the Caddy container on
 *     the compose bridge network can reach it — and ufw guarantees only
 *     Cloudflare's ranges can reach Caddy. So a private peer forwarding this
 *     header is transitively as trustworthy as Cloudflare itself.
 *     Dev bonus: the Vite proxy also connects from 127.0.0.1, so this tier
 *     makes the header work in local dev too.
 *   - direct tier: anything else (a public, non-Cloudflare peer) — the
 *     header is ignored and we fall back to the raw socket IP, since this
 *     peer could be an attacker spoofing the header directly at us.
 */
export function clientIpFrom(socketIp: string, cfHeader: string | null): string {
  if (cfHeader && (isCloudflareIp(socketIp) || isTrustedProxyPeer(socketIp))) return cfHeader;
  return socketIp;
}

type ServerLike = { requestIP(req: Request): { address: string } | null } | null;

/** Convenience for route handlers: resolve the client IP from Elysia's context. */
export function requestIp(server: ServerLike, request: Request): string {
  let socketIp = server?.requestIP(request)?.address ?? "";
  // Bun's server.requestIP() can return IPv4-mapped IPv6 addresses (e.g.
  // "::ffff:172.18.0.5") for peers on the compose bridge network — strip the
  // mapping prefix so isTrustedProxyPeer/isCloudflareIp see a plain IPv4.
  if (socketIp.startsWith("::ffff:")) socketIp = socketIp.slice("::ffff:".length);
  return clientIpFrom(socketIp, request.headers.get("cf-connecting-ip"));
}
