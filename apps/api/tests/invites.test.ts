import { beforeEach, describe, expect, it } from "bun:test";
import { app } from "../src/app";
import { createTestUser, loginAs, resetAll } from "./helpers";

const req = (path: string, init: RequestInit & { cookie?: string } = {}) => {
  const { cookie, ...rest } = init;
  return app.handle(
    new Request(`http://localhost${path}`, {
      ...rest,
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
        ...(rest.headers ?? {}),
      },
    }),
  );
};

describe("invites", () => {
  beforeEach(resetAll);

  async function adminCookie() {
    const a = await createTestUser({ role: "admin" });
    return loginAs(a.email, a.password);
  }

  it("admin can create an invite and gets a fragment URL", async () => {
    const cookie = await adminCookie();
    const res = await req("/api/v1/invites", {
      method: "POST",
      cookie,
      body: JSON.stringify({ expiresInDays: 7 }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.inviteUrl).toMatch(/\/app\/register#token=[A-Za-z0-9_-]+$/);
    expect(body.invite.status).toBe("pending");
    // Raw token must NOT be stored or echoed anywhere else
    expect(JSON.stringify(body.invite)).not.toContain(body.inviteUrl.split("#token=")[1]);
  });

  it("members cannot create invites", async () => {
    const m = await createTestUser({ role: "member" });
    const cookie = await loginAs(m.email, m.password);
    const res = await req("/api/v1/invites", {
      method: "POST",
      cookie,
      body: JSON.stringify({ expiresInDays: 7 }),
    });
    expect(res.status).toBe(403);
  });

  it("anonymous gets 401", async () => {
    const res = await req("/api/v1/invites", { method: "POST", body: JSON.stringify({}) });
    expect(res.status).toBe(401);
  });

  it("lists invites with computed status", async () => {
    const cookie = await adminCookie();
    await req("/api/v1/invites", { method: "POST", cookie, body: JSON.stringify({ expiresInDays: 7 }) });
    const res = await req("/api/v1/invites", { cookie });
    expect(res.status).toBe(200);
    const { invites } = await res.json();
    expect(invites).toHaveLength(1);
    expect(invites[0].status).toBe("pending");
  });

  it("lists who used an invite and when", async () => {
    const cookie = await adminCookie();
    const created = await (
      await req("/api/v1/invites", { method: "POST", cookie, body: JSON.stringify({ expiresInDays: 7 }) })
    ).json();
    const token = created.inviteUrl.split("#token=")[1];
    const reg = await req("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({
        token,
        email: "friend@test.local",
        password: "friend-pass-123",
        displayName: "Friend",
      }),
    });
    expect(reg.status).toBe(201);
    const { invites } = await (await req("/api/v1/invites", { cookie })).json();
    expect(invites[0].status).toBe("used");
    expect(invites[0].usedAt).toBeTruthy();
    expect(invites[0].usedBy).toMatchObject({ email: "friend@test.local", displayName: "Friend" });
  });

  it("revokes an unused invite", async () => {
    const cookie = await adminCookie();
    const created = await (
      await req("/api/v1/invites", { method: "POST", cookie, body: JSON.stringify({ expiresInDays: 7 }) })
    ).json();
    const res = await req(`/api/v1/invites/${created.invite.id}`, { method: "DELETE", cookie });
    expect(res.status).toBe(200);
    const { invites } = await (await req("/api/v1/invites", { cookie })).json();
    expect(invites).toHaveLength(0);
  });

  it("404 (not 500) for a malformed invite id", async () => {
    const cookie = await adminCookie();
    const res = await req("/api/v1/invites/not-a-uuid", { method: "DELETE", cookie });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });
});
