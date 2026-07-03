import { beforeEach, describe, expect, it } from "bun:test";
import { app } from "../src/app";
import { db } from "../src/db/client";
import { clickEvents, links } from "../src/db/schema";
import { createTestUser, loginAs, resetAll } from "./helpers";

const DAY = 24 * 60 * 60 * 1000;

describe("GET /api/v1/links/:id/stats", () => {
  beforeEach(resetAll);

  async function seed() {
    const u = await createTestUser();
    const cookie = await loginAs(u.email, u.password);
    const [link] = await db
      .insert(links)
      .values({ slug: "stat-me", targetUrl: "https://example.com", ownerId: u.id })
      .returning();
    await db.insert(clickEvents).values([
      { linkId: link!.id, clickedAt: new Date(Date.now() - 1 * DAY), referrer: "https://google.com", country: "TH", deviceType: "desktop" },
      { linkId: link!.id, clickedAt: new Date(Date.now() - 1 * DAY), referrer: "https://google.com", country: "US", deviceType: "mobile" },
      { linkId: link!.id, clickedAt: new Date(Date.now() - 2 * DAY), referrer: null, country: "TH", deviceType: "bot" },
      { linkId: link!.id, clickedAt: new Date(Date.now() - 40 * DAY), referrer: null, country: null, deviceType: "desktop" },
    ]);
    return { link: link!, cookie };
  }

  it("aggregates within the default 30d range", async () => {
    const { link, cookie } = await seed();
    const res = await app.handle(
      new Request(`http://localhost/api/v1/links/${link.id}/stats`, { headers: { cookie } }),
    );
    expect(res.status).toBe(200);
    const s = await res.json();
    expect(s.total).toBe(3); // the 40-day-old click is outside the window
    expect(s.byDay.reduce((a: number, d: { count: number }) => a + d.count, 0)).toBe(3);
    expect(s.byDay[0]!.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(s.topReferrers.find((r: { referrer: string }) => r.referrer === "https://google.com")!.count).toBe(2);
    expect(s.topReferrers.find((r: { referrer: string }) => r.referrer === "(direct)")!.count).toBe(1);
    expect(s.byCountry.find((c: { country: string }) => c.country === "TH")!.count).toBe(2);
    expect(s.byDevice.find((d: { deviceType: string }) => d.deviceType === "bot")!.count).toBe(1);
  });

  it("range=all includes everything", async () => {
    const { link, cookie } = await seed();
    const res = await app.handle(
      new Request(`http://localhost/api/v1/links/${link.id}/stats?range=all`, { headers: { cookie } }),
    );
    expect((await res.json()).total).toBe(4);
  });

  it("404 for someone else's link", async () => {
    const { link } = await seed();
    const other = await createTestUser();
    const cookie = await loginAs(other.email, other.password);
    const res = await app.handle(
      new Request(`http://localhost/api/v1/links/${link.id}/stats`, { headers: { cookie } }),
    );
    expect(res.status).toBe(404);
  });
});
