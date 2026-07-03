import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { users } from "./db/schema";
import { env } from "./env";

/**
 * First-boot admin (design spec §6): if no admin exists and creds are provided,
 * create one. Idempotent — safe to run on every boot; env vars can be removed
 * after the first successful start.
 */
export async function ensureAdminUser(
  email: string | undefined = env.ADMIN_EMAIL,
  password: string | undefined = env.ADMIN_PASSWORD,
): Promise<void> {
  if (!email || !password) return;
  const existing = await db.query.users.findFirst({ where: eq(users.role, "admin") });
  if (existing) return;
  await db.insert(users).values({
    email: email.toLowerCase(),
    displayName: "Admin",
    passwordHash: await Bun.password.hash(password),
    role: "admin",
  });
  console.log(JSON.stringify({ msg: "bootstrap admin created", email }));
}
