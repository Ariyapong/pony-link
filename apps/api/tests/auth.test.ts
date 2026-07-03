import { beforeEach, describe, expect, it } from "bun:test";
import { app } from "../src/app";
import { createTestUser, loginAs, resetAll } from "./helpers";

const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  app.handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );

describe("auth", () => {
  beforeEach(resetAll);

  it("login sets an httpOnly lax cookie and returns the user", async () => {
    const u = await createTestUser({ email: "ton@test.local", password: "secret-pass-1" });
    const res = await post("/api/v1/auth/login", { email: u.email, password: u.password });
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("sid=");
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
    const body = await res.json();
    expect(body.user.email).toBe("ton@test.local");
    expect(body.user.passwordHash).toBeUndefined(); // never leak the hash
  });

  it("rejects wrong password and unknown email identically", async () => {
    const u = await createTestUser();
    const bad = await post("/api/v1/auth/login", { email: u.email, password: "wrong-wrong-1" });
    const ghost = await post("/api/v1/auth/login", { email: "no@one.local", password: "wrong-wrong-1" });
    expect(bad.status).toBe(401);
    expect(ghost.status).toBe(401);
    expect((await bad.json()).error.code).toBe((await ghost.json()).error.code);
  });

  it("rate limits login attempts (5/min/IP)", async () => {
    const u = await createTestUser();
    for (let i = 0; i < 5; i++) await post("/api/v1/auth/login", { email: u.email, password: "wrong-wrong-1" });
    const sixth = await post("/api/v1/auth/login", { email: u.email, password: u.password });
    expect(sixth.status).toBe(429);
  });

  it("GET /me returns the session user; 401 without a session", async () => {
    const u = await createTestUser();
    const cookie = await loginAs(u.email, u.password);
    const me = await app.handle(new Request("http://localhost/api/v1/auth/me", { headers: { cookie } }));
    expect(me.status).toBe(200);
    expect((await me.json()).user.id).toBe(u.id);

    const anon = await app.handle(new Request("http://localhost/api/v1/auth/me"));
    expect(anon.status).toBe(401);
  });

  it("logout destroys the session server-side", async () => {
    const u = await createTestUser();
    const cookie = await loginAs(u.email, u.password);
    await post("/api/v1/auth/logout", {}, { cookie });
    const me = await app.handle(new Request("http://localhost/api/v1/auth/me", { headers: { cookie } }));
    expect(me.status).toBe(401); // the old sid is dead in Redis, not just the cookie
  });
});
