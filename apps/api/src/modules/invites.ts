import { Elysia, t } from "elysia";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { invites, users } from "../db/schema";
import { env } from "../env";
import { randomToken, sha256Hex, UUID_RE } from "../lib/crypto";
import { apiError } from "../lib/errors";
import { withSession } from "./auth-context";

type InviteRow = typeof invites.$inferSelect;

function inviteStatus(i: InviteRow): "pending" | "used" | "expired" {
  if (i.usedAt) return "used";
  if (i.expiresAt.getTime() < Date.now()) return "expired";
  return "pending";
}

function publicInvite(i: InviteRow) {
  // token_hash never leaves the server
  return {
    id: i.id,
    email: i.email,
    expiresAt: i.expiresAt,
    usedAt: i.usedAt,
    status: inviteStatus(i),
  };
}

export const inviteRoutes = new Elysia({ prefix: "/api/v1/invites" })
  .use(withSession)
  .post(
    "/",
    async ({ body, session, set }) => {
      if (!session) return apiError(set, 401, "UNAUTHORIZED", "Not logged in");
      if (session.role !== "admin") return apiError(set, 403, "FORBIDDEN", "Admins only");
      const raw = randomToken();
      const [row] = await db
        .insert(invites)
        .values({
          tokenHash: sha256Hex(raw),
          createdBy: session.userId,
          email: body.email?.toLowerCase() ?? null,
          expiresAt: new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000),
        })
        .returning();
      set.status = 201;
      return {
        invite: publicInvite(row!),
        // Fragment (#) — never sent to the server, never in access logs (spec §5).
        inviteUrl: `${env.BASE_URL}/app/register#token=${raw}`,
      };
    },
    {
      body: t.Object({
        email: t.Optional(t.String()),
        expiresInDays: t.Number({ minimum: 1, maximum: 90, default: 7 }),
      }),
    },
  )
  .get("/", async ({ session, set }) => {
    if (!session) return apiError(set, 401, "UNAUTHORIZED", "Not logged in");
    if (session.role !== "admin") return apiError(set, 403, "FORBIDDEN", "Admins only");
    const rows = await db
      .select({ invite: invites, usedByUser: users })
      .from(invites)
      .leftJoin(users, eq(invites.usedBy, users.id))
      .orderBy(desc(invites.expiresAt));
    return {
      invites: rows.map(({ invite, usedByUser }) => ({
        ...publicInvite(invite),
        usedBy: usedByUser
          ? { id: usedByUser.id, displayName: usedByUser.displayName, email: usedByUser.email }
          : null,
      })),
    };
  })
  .delete("/:id", async ({ params, session, set }) => {
    if (!session) return apiError(set, 401, "UNAUTHORIZED", "Not logged in");
    if (session.role !== "admin") return apiError(set, 403, "FORBIDDEN", "Admins only");
    // 404 (not 422) deliberately: a malformed id gets the same response as an
    // id that exists but isn't yours, so id shape is never confirmed to probers.
    if (!UUID_RE.test(params.id)) return apiError(set, 404, "NOT_FOUND", "Invite not found");
    const row = await db.query.invites.findFirst({ where: eq(invites.id, params.id) });
    if (!row) return apiError(set, 404, "NOT_FOUND", "Invite not found");
    if (row.usedAt) return apiError(set, 409, "ALREADY_USED", "Invite was already used");
    await db.delete(invites).where(eq(invites.id, params.id));
    return { ok: true };
  });
