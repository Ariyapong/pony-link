import { describe, expect, it } from "bun:test";
import { clientIpFrom, isCloudflareIp, isTrustedProxyPeer, requestIp } from "../src/lib/client-ip";

describe("isCloudflareIp", () => {
  it("recognizes addresses inside published CF ranges", () => {
    expect(isCloudflareIp("173.245.48.10")).toBe(true);   // 173.245.48.0/20
    expect(isCloudflareIp("104.16.0.1")).toBe(true);      // 104.16.0.0/13
  });
  it("rejects everything else", () => {
    expect(isCloudflareIp("8.8.8.8")).toBe(false);
    expect(isCloudflareIp("192.168.1.1")).toBe(false);
    expect(isCloudflareIp("not-an-ip")).toBe(false);
    expect(isCloudflareIp("")).toBe(false);
  });
  it("104.16.0.0/13 boundary", () => {
    expect(isCloudflareIp("104.15.255.255")).toBe(false); // just below the range
    expect(isCloudflareIp("104.16.0.0")).toBe(true);      // range start
  });
});

describe("isTrustedProxyPeer", () => {
  it("trusts loopback", () => {
    expect(isTrustedProxyPeer("127.0.0.1")).toBe(true);
    expect(isTrustedProxyPeer("::1")).toBe(true);
  });
  it("trusts private IPv4 ranges", () => {
    expect(isTrustedProxyPeer("10.0.0.5")).toBe(true);
    expect(isTrustedProxyPeer("172.18.0.5")).toBe(true);
    expect(isTrustedProxyPeer("192.168.1.1")).toBe(true);
  });
  it("172.16.0.0/12 boundary — 172.15.x and 172.32.x are NOT trusted", () => {
    expect(isTrustedProxyPeer("172.15.0.1")).toBe(false);
    expect(isTrustedProxyPeer("172.32.0.1")).toBe(false);
  });
  it("172.16.0.0/12 boundary — 172.16.x and 172.31.255.255 ARE trusted", () => {
    expect(isTrustedProxyPeer("172.16.0.1")).toBe(true);
    expect(isTrustedProxyPeer("172.31.255.255")).toBe(true);
  });
  it("rejects public IPs", () => {
    expect(isTrustedProxyPeer("8.8.8.8")).toBe(false);
    expect(isTrustedProxyPeer("203.0.113.7")).toBe(false);
  });
});

describe("clientIpFrom", () => {
  it("honors CF-Connecting-IP when the socket peer is Cloudflare (edge tier)", () => {
    expect(clientIpFrom("173.245.48.10", "203.0.113.7")).toBe("203.0.113.7");
  });
  it("honors CF-Connecting-IP from a private proxy peer (proxy tier — Caddy on the compose network)", () => {
    expect(clientIpFrom("172.18.0.5", "203.0.113.7")).toBe("203.0.113.7");
  });
  it("ignores the header from a public non-Cloudflare peer (spoofing attempt)", () => {
    expect(clientIpFrom("8.8.8.8", "203.0.113.7")).toBe("8.8.8.8");
  });
  it("falls back to socket IP when no header", () => {
    expect(clientIpFrom("8.8.8.8", null)).toBe("8.8.8.8");
  });
});

describe("requestIp", () => {
  it("strips an IPv4-mapped IPv6 prefix before evaluating trust (Bun's requestIP() shape for compose peers)", () => {
    const request = new Request("http://localhost/x", { headers: { "cf-connecting-ip": "203.0.113.7" } });
    const server = { requestIP: () => ({ address: "::ffff:172.18.0.5" }) };
    expect(requestIp(server, request)).toBe("203.0.113.7");
  });
  it("returns \"\" when server is null (fail closed, not throw)", () => {
    const request = new Request("http://localhost/x");
    expect(requestIp(null, request)).toBe("");
  });
});
