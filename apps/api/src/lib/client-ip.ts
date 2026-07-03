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

/** Trust CF-Connecting-IP only when the TCP peer actually is Cloudflare. */
export function clientIpFrom(socketIp: string, cfHeader: string | null): string {
  if (cfHeader && isCloudflareIp(socketIp)) return cfHeader;
  return socketIp;
}

type ServerLike = { requestIP(req: Request): { address: string } | null } | null;

/** Convenience for route handlers: resolve the client IP from Elysia's context. */
export function requestIp(server: ServerLike, request: Request): string {
  const socketIp = server?.requestIP(request)?.address ?? "";
  return clientIpFrom(socketIp, request.headers.get("cf-connecting-ip"));
}
