import { beforeEach, describe, expect, it } from "bun:test";
import { app } from "../src/app";
import { redis } from "../src/redis";
import { createTestUser, loginAs, resetAll } from "./helpers";

const api = (path: string, cookie: string, init: RequestInit = {}) =>
  app.handle(
    new Request(`http://localhost${path}`, {
      ...init,
      headers: { "content-type": "application/json", cookie, ...(init.headers ?? {}) },
    }),
  );

async function makeLink(cookie: string, body: Record<string, unknown>) {
  const res = await api("/api/v1/links", cookie, { method: "POST", body: JSON.stringify(body) });
  return (await res.json()).link;
}

describe("link management", () => {
  beforeEach(resetAll);

  it("lists own links with pagination and search", async () => {
    const u = await createTestUser();
    const cookie = await loginAs(u.email, u.password);
    await makeLink(cookie, { targetUrl: "https://example.com/1", slug: "alpha-one", title: "First" });
    await makeLink(cookie, { targetUrl: "https://example.com/2", slug: "beta-two" });
    const all = await (await api("/api/v1/links?page=1&limit=10", cookie)).json();
    expect(all.total).toBe(2);
    expect(all.links).toHaveLength(2);
    expect(all.links[0].clickCount).toBe(0);
    const filtered = await (await api("/api/v1/links?query=alpha", cookie)).json();
    expect(filtered.total).toBe(1);
    expect(filtered.links[0].slug).toBe("alpha-one");
  });

  it("members cannot see each other's links; admin sees all", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const admin = await createTestUser({ role: "admin" });
    const ca = await loginAs(a.email, a.password);
    const cb = await loginAs(b.email, b.password);
    const cAdmin = await loginAs(admin.email, admin.password);
    const linkA = await makeLink(ca, { targetUrl: "https://example.com/a" });
    expect((await (await api("/api/v1/links", cb)).json()).total).toBe(0);
    expect((await api(`/api/v1/links/${linkA.id}`, cb)).status).toBe(404); // not 403
    expect((await (await api("/api/v1/links", cAdmin)).json()).total).toBe(1);
  });

  it("PATCH updates fields and clears BOTH cache keys (reactivation bug guard)", async () => {
    const u = await createTestUser();
    const cookie = await loginAs(u.email, u.password);
    const link = await makeLink(cookie, { targetUrl: "https://example.com", slug: "patch-me" });
    await redis.set("link:patch-me", "cached", "EX", 3600);
    await redis.set("miss:patch-me", "1", "EX", 300);
    const res = await api(`/api/v1/links/${link.id}`, cookie, {
      method: "PATCH",
      body: JSON.stringify({ targetUrl: "https://changed.dev", isActive: false }),
    });
    expect(res.status).toBe(200);
    const updated = (await res.json()).link;
    expect(updated.targetUrl).toBe("https://changed.dev");
    expect(updated.isActive).toBe(false);
    expect(await redis.get("link:patch-me")).toBeNull();
    expect(await redis.get("miss:patch-me")).toBeNull();
  });

  it("PATCH validates the new target URL", async () => {
    const u = await createTestUser();
    const cookie = await loginAs(u.email, u.password);
    const link = await makeLink(cookie, { targetUrl: "https://example.com" });
    const res = await api(`/api/v1/links/${link.id}`, cookie, {
      method: "PATCH",
      body: JSON.stringify({ targetUrl: "javascript:alert(1)" }),
    });
    expect(res.status).toBe(422);
  });

  it("DELETE removes the link and its cache entry", async () => {
    const u = await createTestUser();
    const cookie = await loginAs(u.email, u.password);
    const link = await makeLink(cookie, { targetUrl: "https://example.com", slug: "del-me" });
    await redis.set("link:del-me", "cached", "EX", 3600);
    const res = await api(`/api/v1/links/${link.id}`, cookie, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(await redis.get("link:del-me")).toBeNull();
    expect((await api(`/api/v1/links/${link.id}`, cookie)).status).toBe(404);
  });

  it("GET/PATCH/DELETE with a malformed id return 404, not a 500 from Postgres 22P02", async () => {
    const u = await createTestUser();
    const cookie = await loginAs(u.email, u.password);
    const get = await api("/api/v1/links/not-a-uuid", cookie);
    expect(get.status).toBe(404);
    expect((await get.json()).error.code).toBe("NOT_FOUND");
    const patch = await api("/api/v1/links/not-a-uuid", cookie, {
      method: "PATCH",
      body: JSON.stringify({ title: "x" }),
    });
    expect(patch.status).toBe(404);
    expect((await patch.json()).error.code).toBe("NOT_FOUND");
    const del = await api("/api/v1/links/not-a-uuid", cookie, { method: "DELETE" });
    expect(del.status).toBe(404);
    expect((await del.json()).error.code).toBe("NOT_FOUND");
  });
});
