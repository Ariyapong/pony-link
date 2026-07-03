import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";
import { env } from "../env";
import { requestIp } from "../lib/client-ip";
import { apiError } from "../lib/errors";
import { rateLimit } from "../lib/rate-limit";
import { withSession } from "./auth-context";
import { createSession, destroySession, SESSION_TTL_SECONDS } from "./sessions";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Verifying against this dummy when the email is unknown equalizes response
// time with the wrong-password path — otherwise argon2's cost only being paid
// for real accounts is a timing oracle that leaks which emails exist.
const DUMMY_HASH = await Bun.password.hash("timing-equalizer-dummy");

type UserRow = typeof users.$inferSelect;
export function publicUser(u: UserRow) {
  return { id: u.id, email: u.email, displayName: u.displayName, role: u.role };
}

export const authRoutes = new Elysia({ prefix: "/api/v1/auth" })
  .use(withSession)
  .post(
    "/login",
    async ({ body, cookie, set, request, server }) => {
      const ip = requestIp(server, request);
      if (!(await rateLimit(`login:${ip}`, 5, 60))) {
        return apiError(set, 429, "RATE_LIMITED", "Too many attempts — try again in a minute");
      }
      if (!EMAIL_RE.test(body.email)) {
        return apiError(set, 422, "VALIDATION", "Invalid email address");
      }
      const user = await db.query.users.findFirst({
        where: eq(users.email, body.email.toLowerCase()),
      });
      // Same 401 for unknown email and wrong password — don't leak which emails exist.
      // Always run exactly one Bun.password.verify (real hash or dummy) so timing
      // doesn't reveal whether the email is registered.
      const valid = await Bun.password.verify(body.password, user?.passwordHash ?? DUMMY_HASH);
      const ok = user !== undefined && valid;
      if (!ok) return apiError(set, 401, "INVALID_CREDENTIALS", "Email or password is incorrect");
      const sid = await createSession({ userId: user.id, role: user.role });
      cookie.sid!.set({
        value: sid,
        httpOnly: true,
        secure: env.isProd, // localhost has no https in dev (design spec §12)
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_TTL_SECONDS,
      });
      return { user: publicUser(user) };
    },
    { body: t.Object({ email: t.String(), password: t.String({ minLength: 8 }) }) },
  )
  .post("/logout", async ({ cookie, sid, set }) => {
    if (sid) await destroySession(sid);
    cookie.sid?.remove();
    set.status = 200;
    return { ok: true };
  })
  .get("/me", async ({ session, set }) => {
    if (!session) return apiError(set, 401, "UNAUTHORIZED", "Not logged in");
    const user = await db.query.users.findFirst({ where: eq(users.id, session.userId) });
    if (!user) return apiError(set, 401, "UNAUTHORIZED", "Not logged in");
    return { user: publicUser(user) };
  });
