import { describe, expect, it } from "bun:test";
import { clientIpFrom, isCloudflareIp } from "../src/lib/client-ip";

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
});

describe("clientIpFrom", () => {
  it("honors CF-Connecting-IP only when the socket peer is Cloudflare", () => {
    expect(clientIpFrom("173.245.48.10", "203.0.113.7")).toBe("203.0.113.7");
  });
  it("ignores the header from a non-Cloudflare peer (spoofing attempt)", () => {
    expect(clientIpFrom("8.8.8.8", "203.0.113.7")).toBe("8.8.8.8");
  });
  it("falls back to socket IP when no header", () => {
    expect(clientIpFrom("8.8.8.8", null)).toBe("8.8.8.8");
  });
});
