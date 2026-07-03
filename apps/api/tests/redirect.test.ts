import { beforeEach, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { app } from "../src/app";
import { db } from "../src/db/client";
import { clickEvents, links } from "../src/db/schema";
import { redis } from "../src/redis";
import { createTestUser, resetAll } from "./helpers";

const hit = (path: string, headers: Record<string, string> = {}) =>
  app.handle(new Request(`http://localhost${path}`, { headers }));

async function seedLink(slug: string, targetUrl = "https://example.com/target") {
  const u = await createTestUser();
  const [row] = await db.insert(links).values({ slug, targetUrl, ownerId: u.id }).returning();
  return row!;
}

const settle = () => new Promise((r) => setTimeout(r, 100)); // let fire-and-forget insert land

describe("redirect hot path", () => {
  beforeEach(resetAll);

  it("302s with no-store and records the click after the response", async () => {
    await seedLink("go-here");
    const res = await hit("/go-here", {
      referer: "https://twitter.com/x",
      "cf-ipcountry": "TH",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://example.com/target");
    expect(res.headers.get("cache-control")).toBe("no-store");
    await settle();
    const events = await db.select().from(clickEvents);
    expect(events).toHaveLength(1);
    expect(events[0]!.country).toBe("TH");
    expect(events[0]!.referrer).toBe("https://twitter.com/x");
    expect(events[0]!.deviceType).toBe("desktop");
  });

  it("serves from cache on the second hit (DB row can vanish, redirect survives)", async () => {
    const row = await seedLink("cached-one");
    await hit("/cached-one");
    await db.delete(links).where(eq(links.id, row.id)); // bypasses API cache invalidation
    const res = await hit("/cached-one");
    expect(res.status).toBe(302); // proof it came from Redis, not Postgres
  });

  it("negative-caches missing slugs (a later direct-DB insert stays 404 until TTL)", async () => {
    expect((await hit("/not-yet")).status).toBe(404);
    expect(await redis.get("miss:not-yet")).not.toBeNull();
    const u = await createTestUser();
    await db.insert(links).values({ slug: "not-yet", targetUrl: "https://example.com", ownerId: u.id });
    expect((await hit("/not-yet")).status).toBe(404); // API create clears this; raw insert doesn't
  });

  it("inactive links 404 and get negative-cached", async () => {
    const row = await seedLink("switched-off");
    await db.update(links).set({ isActive: false }).where(eq(links.id, row.id));
    expect((await hit("/switched-off")).status).toBe(404);
    expect(await redis.get("miss:switched-off")).not.toBeNull();
  });

  it("bot clicks are recorded as bots (unfurls must not be blocked)", async () => {
    await seedLink("bot-target");
    const res = await hit("/bot-target", { "user-agent": "Slackbot-LinkExpanding 1.0" });
    expect(res.status).toBe(302);
    await settle();
    const events = await db.select().from(clickEvents);
    expect(events[0]!.deviceType).toBe("bot");
  });

  it("junk paths 404 without touching anything", async () => {
    expect((await hit("/" + "x".repeat(100))).status).toBe(404);
  });

  it("bare domain redirects to the dashboard", async () => {
    const res = await hit("/");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/app");
  });
});
