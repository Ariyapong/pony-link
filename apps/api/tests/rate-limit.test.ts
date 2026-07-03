import { beforeEach, describe, expect, it } from "bun:test";
import { rateLimit } from "../src/lib/rate-limit";
import { redis } from "../src/redis";

describe("rateLimit", () => {
  beforeEach(async () => {
    await redis.flushdb();
  });

  it("allows up to the limit, then blocks", async () => {
    for (let i = 0; i < 5; i++) expect(await rateLimit("t:1.2.3.4", 5, 60)).toBe(true);
    expect(await rateLimit("t:1.2.3.4", 5, 60)).toBe(false);
  });

  it("tracks buckets independently", async () => {
    for (let i = 0; i < 5; i++) await rateLimit("t:1.1.1.1", 5, 60);
    expect(await rateLimit("t:1.1.1.1", 5, 60)).toBe(false);
    expect(await rateLimit("t:2.2.2.2", 5, 60)).toBe(true);
  });

  it("resets after the window expires", async () => {
    expect(await rateLimit("t:3.3.3.3", 1, 1)).toBe(true);
    expect(await rateLimit("t:3.3.3.3", 1, 1)).toBe(false);
    await new Promise((r) => setTimeout(r, 1100));
    expect(await rateLimit("t:3.3.3.3", 1, 1)).toBe(true);
  });
});
