import { beforeEach, describe, expect, it } from "bun:test";
import { app } from "../src/app";
import { redis } from "../src/redis";
import { createTestUser, loginAs, resetAll } from "./helpers";

const create = (cookie: string, body: unknown) =>
  app.handle(
    new Request("http://localhost/api/v1/links", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    }),
  );

describe("POST /api/v1/links", () => {
  beforeEach(resetAll);

  async function memberCookie() {
    const u = await createTestUser();
    return loginAs(u.email, u.password);
  }

  it("creates a link with a generated 7-char slug", async () => {
    const cookie = await memberCookie();
    const res = await create(cookie, { targetUrl: "https://example.com" });
    expect(res.status).toBe(201);
    const { link } = await res.json();
    expect(link.slug).toMatch(/^[23456789a-zA-Z]{7}$/);
    expect(link.shortUrl).toBe(`http://localhost:3000/${link.slug}`);
    expect(link.isActive).toBe(true);
  });

  it("creates a link with a custom slug", async () => {
    const cookie = await memberCookie();
    const res = await create(cookie, { targetUrl: "https://example.com", slug: "my-talk", title: "Talk" });
    expect(res.status).toBe(201);
    expect((await res.json()).link.slug).toBe("my-talk");
  });

  it("409 when the custom slug is taken", async () => {
    const cookie = await memberCookie();
    await create(cookie, { targetUrl: "https://example.com", slug: "dupe" });
    const res = await create(cookie, { targetUrl: "https://other.dev", slug: "dupe" });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("SLUG_TAKEN");
  });

  it("422 for reserved slugs, bad slugs, and bad URLs", async () => {
    const cookie = await memberCookie();
    expect((await create(cookie, { targetUrl: "https://example.com", slug: "app" })).status).toBe(422);
    expect((await create(cookie, { targetUrl: "https://example.com", slug: "a" })).status).toBe(422);
    expect((await create(cookie, { targetUrl: "javascript:alert(1)" })).status).toBe(422);
    expect((await create(cookie, { targetUrl: "http://localhost/x" })).status).toBe(422);
  });

  it("clears the negative cache so a fresh link resolves immediately (spec §7)", async () => {
    const cookie = await memberCookie();
    await redis.set("miss:fresh-one", "1", "EX", 300); // slug was probed before creation
    const res = await create(cookie, { targetUrl: "https://example.com", slug: "fresh-one" });
    expect(res.status).toBe(201);
    expect(await redis.get("miss:fresh-one")).toBeNull();
  });

  it("401 without a session", async () => {
    const res = await create("", { targetUrl: "https://example.com" });
    expect(res.status).toBe(401);
  });
});
