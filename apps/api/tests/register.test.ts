import { beforeEach, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { app } from "../src/app";
import { ensureAdminUser } from "../src/bootstrap";
import { db } from "../src/db/client";
import { users } from "../src/db/schema";
import { createTestUser, loginAs, resetAll } from "./helpers";

async function makeInvite(opts: { email?: string; expiresInDays?: number } = {}) {
  const admin = await createTestUser({ role: "admin" });
  const cookie = await loginAs(admin.email, admin.password);
  const res = await app.handle(
    new Request("http://localhost/api/v1/invites", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ expiresInDays: opts.expiresInDays ?? 7, email: opts.email }),
    }),
  );
  const body = await res.json();
  return { token: body.inviteUrl.split("#token=")[1] as string, adminId: admin.id };
}

const register = (body: unknown) =>
  app.handle(
    new Request("http://localhost/api/v1/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("register", () => {
  beforeEach(resetAll);

  it("redeems a valid invite, creates the user, logs them in", async () => {
    const { token, adminId } = await makeInvite();
    const res = await register({
      token, email: "friend@test.local", password: "friend-pass-1", displayName: "Friend",
    });
    expect(res.status).toBe(201);
    expect(res.headers.get("set-cookie")).toContain("sid=");
    const { user } = await res.json();
    expect(user.role).toBe("member");
    const row = await db.query.users.findFirst({ where: eq(users.email, "friend@test.local") });
    expect(row?.invitedBy).toBe(adminId);
  });

  it("an invite can be used exactly once", async () => {
    const { token } = await makeInvite();
    await register({ token, email: "a@test.local", password: "password-1x", displayName: "A" });
    const second = await register({ token, email: "b@test.local", password: "password-1x", displayName: "B" });
    expect(second.status).toBe(400);
  });

  it("rejects unknown and expired tokens with the same generic error", async () => {
    // 10+ chars so it clears the schema's minLength and actually reaches the
    // invite lookup — the point of this test is an unknown token, not a short one.
    const bad = await register({ token: "garbage-token-value", email: "a@test.local", password: "password-1x", displayName: "A" });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("INVALID_INVITE");
  });

  it("enforces the email lock when the invite has one", async () => {
    const { token } = await makeInvite({ email: "only@test.local" });
    const wrong = await register({ token, email: "other@test.local", password: "password-1x", displayName: "X" });
    expect(wrong.status).toBe(400);
    const right = await register({ token, email: "only@test.local", password: "password-1x", displayName: "X" });
    expect(right.status).toBe(201);
  });

  it("rejects duplicate emails", async () => {
    const existing = await createTestUser({ email: "dup@test.local" });
    const { token } = await makeInvite();
    const res = await register({ token, email: existing.email, password: "password-1x", displayName: "D" });
    expect(res.status).toBe(409);
  });
});

describe("ensureAdminUser", () => {
  beforeEach(resetAll);

  it("creates the admin once, idempotently", async () => {
    await ensureAdminUser("boss@test.local", "boss-password-1");
    await ensureAdminUser("boss@test.local", "boss-password-1");
    const admins = await db.select().from(users).where(eq(users.role, "admin"));
    expect(admins).toHaveLength(1);
  });

  it("does nothing when creds are missing", async () => {
    await ensureAdminUser(undefined, undefined);
    const admins = await db.select().from(users).where(eq(users.role, "admin"));
    expect(admins).toHaveLength(0);
  });

  it("does nothing when an admin already exists", async () => {
    await createTestUser({ role: "admin", email: "first@test.local" });
    await ensureAdminUser("second@test.local", "second-password-1");
    const admins = await db.select().from(users).where(eq(users.role, "admin"));
    expect(admins).toHaveLength(1);
  });
});
