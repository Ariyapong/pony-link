import { app } from "../src/app";
import { db, sql } from "../src/db/client";
import { users } from "../src/db/schema";
import { redis } from "../src/redis";

export async function resetAll(): Promise<void> {
  await sql`TRUNCATE users, invites, links, click_events RESTART IDENTITY CASCADE`;
  await redis.flushdb();
}

let counter = 0;

export async function createTestUser(opts?: {
  role?: "admin" | "member";
  email?: string;
  password?: string;
}): Promise<{ id: string; email: string; password: string; role: "admin" | "member" }> {
  counter += 1;
  const email = opts?.email ?? `user${counter}@test.local`;
  const password = opts?.password ?? "password-123";
  const role = opts?.role ?? "member";
  const [row] = await db
    .insert(users)
    .values({ email, displayName: email.split("@")[0]!, passwordHash: await Bun.password.hash(password), role })
    .returning();
  return { id: row!.id, email, password, role };
}

/** Logs in via the real endpoint; returns a Cookie header value ("sid=..."). */
export async function loginAs(email: string, password: string): Promise<string> {
  const res = await app.handle(
    new Request("http://localhost/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
  if (res.status !== 200) throw new Error(`loginAs failed: ${res.status} ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/sid=([^;]+)/);
  if (!match) throw new Error("no sid cookie in login response");
  return `sid=${match[1]}`;
}
