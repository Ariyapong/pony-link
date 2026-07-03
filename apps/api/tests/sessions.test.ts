import { beforeEach, describe, expect, it } from "bun:test";
import { randomToken, sha256Hex } from "../src/lib/crypto";
import { createSession, destroySession, getSession } from "../src/modules/sessions";
import { redis } from "../src/redis";

describe("crypto helpers", () => {
  it("randomToken is url-safe and unique", () => {
    const a = randomToken();
    const b = randomToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  });
  it("sha256Hex is deterministic", () => {
    expect(sha256Hex("abc")).toBe(sha256Hex("abc"));
    expect(sha256Hex("abc")).toHaveLength(64);
  });
});

describe("sessions", () => {
  beforeEach(async () => {
    await redis.flushdb();
  });

  it("round-trips session data", async () => {
    const sid = await createSession({ userId: "u1", role: "member" });
    expect(await getSession(sid)).toEqual({ userId: "u1", role: "member" });
  });

  it("returns null for unknown sids", async () => {
    expect(await getSession("nope")).toBeNull();
  });

  it("destroy revokes immediately (why sessions beat JWTs here)", async () => {
    const sid = await createSession({ userId: "u1", role: "admin" });
    await destroySession(sid);
    expect(await getSession(sid)).toBeNull();
  });

  it("reading a session refreshes its TTL (sliding expiry)", async () => {
    const sid = await createSession({ userId: "u1", role: "member" });
    await redis.expire(`sess:${sid}`, 10); // simulate an old session
    await getSession(sid);
    const ttl = await redis.ttl(`sess:${sid}`);
    expect(ttl).toBeGreaterThan(1000); // bumped back toward 30 days
  });
});
