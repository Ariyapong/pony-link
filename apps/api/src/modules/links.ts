import { Elysia, t } from "elysia";
import { and, count, desc, eq, getTableColumns, ilike, or, gte, sql } from "drizzle-orm";
import { db } from "../db/client";
import { clickEvents, links } from "../db/schema";
import { env } from "../env";
import { apiError } from "../lib/errors";
import { rateLimit } from "../lib/rate-limit";
import { generateSlug, validateCustomSlug } from "../lib/slug";
import { validateTargetUrl } from "../lib/url-validate";
import { redis } from "../redis";
import { withSession } from "./auth-context";

const OWN_HOST = new URL(env.BASE_URL).hostname;

type LinkRow = typeof links.$inferSelect;
export function publicLink(row: LinkRow, clickCount = 0) {
  return {
    id: row.id,
    slug: row.slug,
    shortUrl: `${env.BASE_URL}/${row.slug}`,
    targetUrl: row.targetUrl,
    title: row.title,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    clickCount,
  };
}

function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err.code === "23505" || err.cause?.code === "23505";
}

export const linkRoutes = new Elysia({ prefix: "/api/v1/links" })
  .use(withSession)
  .post(
    "/",
    async ({ body, session, set }) => {
      if (!session) return apiError(set, 401, "UNAUTHORIZED", "Not logged in");
      if (!(await rateLimit(`api:${session.userId}`, 60, 60))) {
        return apiError(set, 429, "RATE_LIMITED", "Slow down");
      }
      const urlError = validateTargetUrl(body.targetUrl, OWN_HOST);
      if (urlError) return apiError(set, 422, "VALIDATION", urlError);

      if (body.slug !== undefined) {
        const slugError = validateCustomSlug(body.slug);
        if (slugError) return apiError(set, 422, "VALIDATION", slugError);
        try {
          const [row] = await db
            .insert(links)
            .values({
              slug: body.slug, targetUrl: body.targetUrl,
              title: body.title ?? null, ownerId: session.userId,
            })
            .returning();
          await redis.del(`miss:${row!.slug}`); // spec §7: create clears negative cache
          set.status = 201;
          return { link: publicLink(row!) };
        } catch (e) {
          if (isUniqueViolation(e)) return apiError(set, 409, "SLUG_TAKEN", "That slug is already in use");
          throw e;
        }
      }

      // Generated slug: the unique index is the real collision guard; retry a
      // couple of times instead of pre-checking (check-then-insert races).
      for (let attempt = 0; attempt < 3; attempt++) {
        const slug = generateSlug();
        try {
          const [row] = await db
            .insert(links)
            .values({ slug, targetUrl: body.targetUrl, title: body.title ?? null, ownerId: session.userId })
            .returning();
          await redis.del(`miss:${row!.slug}`);
          set.status = 201;
          return { link: publicLink(row!) };
        } catch (e) {
          if (!isUniqueViolation(e)) throw e; // collision → loop and regenerate
        }
      }
      return apiError(set, 500, "SLUG_GENERATION", "Could not generate a unique slug");
    },
    {
      body: t.Object({
        targetUrl: t.String({ minLength: 1 }),
        slug: t.Optional(t.String()),
        title: t.Optional(t.String({ maxLength: 200 })),
      }),
    },
  )
  .get(
    "/",
    async ({ query, session, set }) => {
      if (!session) return apiError(set, 401, "UNAUTHORIZED", "Not logged in");
      const page = Math.max(1, query.page ?? 1);
      const limit = Math.min(100, Math.max(1, query.limit ?? 20));
      const scope = session.role === "admin" ? undefined : eq(links.ownerId, session.userId);
      const search = query.query
        ? or(ilike(links.slug, `%${query.query}%`), ilike(links.title, `%${query.query}%`))
        : undefined;
      const where = and(scope, search); // and() ignores undefined members

      const rows = await db
        .select({ ...getTableColumns(links), clickCount: count(clickEvents.id) })
        .from(links)
        .leftJoin(clickEvents, eq(clickEvents.linkId, links.id))
        .where(where)
        .groupBy(links.id)
        .orderBy(desc(links.createdAt))
        .limit(limit)
        .offset((page - 1) * limit);
      const [totalRow] = await db.select({ value: count() }).from(links).where(where);

      return {
        links: rows.map((r) => publicLink(r, r.clickCount)),
        total: totalRow!.value,
        page,
        limit,
      };
    },
    {
      query: t.Object({
        query: t.Optional(t.String()),
        page: t.Optional(t.Numeric()),
        limit: t.Optional(t.Numeric()),
      }),
    },
  )
  .get("/:id", async ({ params, session, set }) => {
    if (!session) return apiError(set, 401, "UNAUTHORIZED", "Not logged in");
    const row = await db.query.links.findFirst({ where: eq(links.id, params.id) });
    // 404 for "not yours" too — don't reveal that the id exists.
    if (!row || (session.role !== "admin" && row.ownerId !== session.userId)) {
      return apiError(set, 404, "NOT_FOUND", "Link not found");
    }
    const [clicks] = await db
      .select({ value: count() })
      .from(clickEvents)
      .where(eq(clickEvents.linkId, row.id));
    return { link: publicLink(row, clicks!.value) };
  })
  .patch(
    "/:id",
    async ({ params, body, session, set }) => {
      if (!session) return apiError(set, 401, "UNAUTHORIZED", "Not logged in");
      // Mutations share the api:<user> bucket; reads are exempt (search-as-you-type).
      if (!(await rateLimit(`api:${session.userId}`, 60, 60))) {
        return apiError(set, 429, "RATE_LIMITED", "Slow down");
      }
      const row = await db.query.links.findFirst({ where: eq(links.id, params.id) });
      if (!row || (session.role !== "admin" && row.ownerId !== session.userId)) {
        return apiError(set, 404, "NOT_FOUND", "Link not found");
      }
      if (body.targetUrl !== undefined) {
        const urlError = validateTargetUrl(body.targetUrl, OWN_HOST);
        if (urlError) return apiError(set, 422, "VALIDATION", urlError);
      }
      const [updated] = await db
        .update(links)
        .set({
          ...(body.targetUrl !== undefined ? { targetUrl: body.targetUrl } : {}),
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          updatedAt: new Date(),
        })
        .where(eq(links.id, row.id))
        .returning();
      // BOTH keys: link: (stale target) and miss: (an inactive link negative-caches;
      // re-activating must clear that or the link stays 404 for up to 5 minutes).
      await redis.del(`link:${row.slug}`, `miss:${row.slug}`);
      return { link: publicLink(updated!) };
    },
    {
      body: t.Object({
        targetUrl: t.Optional(t.String()),
        title: t.Optional(t.Union([t.String({ maxLength: 200 }), t.Null()])),
        isActive: t.Optional(t.Boolean()),
      }),
    },
  )
  .delete("/:id", async ({ params, session, set }) => {
    if (!session) return apiError(set, 401, "UNAUTHORIZED", "Not logged in");
    if (!(await rateLimit(`api:${session.userId}`, 60, 60))) {
      return apiError(set, 429, "RATE_LIMITED", "Slow down");
    }
    const row = await db.query.links.findFirst({ where: eq(links.id, params.id) });
    if (!row || (session.role !== "admin" && row.ownerId !== session.userId)) {
      return apiError(set, 404, "NOT_FOUND", "Link not found");
    }
    await db.delete(links).where(eq(links.id, row.id)); // click_events cascade
    await redis.del(`link:${row.slug}`);
    return { ok: true };
  })
  .get(
    "/:id/stats",
    async ({ params, query, session, set }) => {
      if (!session) return apiError(set, 401, "UNAUTHORIZED", "Not logged in");
      const row = await db.query.links.findFirst({ where: eq(links.id, params.id) });
      if (!row || (session.role !== "admin" && row.ownerId !== session.userId)) {
        return apiError(set, 404, "NOT_FOUND", "Link not found");
      }
      const range = query.range ?? "30d";
      const since =
        range === "all" ? null : new Date(Date.now() - (range === "7d" ? 7 : 30) * 24 * 60 * 60 * 1000);
      const where = and(
        eq(clickEvents.linkId, row.id),
        since ? gte(clickEvents.clickedAt, since) : undefined,
      );

      // Plain GROUP BY aggregates — the whole stats page is four SQL queries.
      const [totalRow] = await db.select({ value: count() }).from(clickEvents).where(where);
      const byDay = await db
        .select({
          day: sql<string>`to_char(date_trunc('day', ${clickEvents.clickedAt}), 'YYYY-MM-DD')`,
          count: count(),
        })
        .from(clickEvents)
        .where(where)
        .groupBy(sql`1`)
        .orderBy(sql`1`);
      const topReferrers = await db
        .select({
          referrer: sql<string>`coalesce(${clickEvents.referrer}, '(direct)')`,
          count: count(),
        })
        .from(clickEvents)
        .where(where)
        .groupBy(sql`1`)
        .orderBy(desc(count()))
        .limit(10);
      const byCountry = await db
        .select({
          country: sql<string>`coalesce(${clickEvents.country}, '(unknown)')`,
          count: count(),
        })
        .from(clickEvents)
        .where(where)
        .groupBy(sql`1`)
        .orderBy(desc(count()));
      const byDevice = await db
        .select({ deviceType: clickEvents.deviceType, count: count() })
        .from(clickEvents)
        .where(where)
        .groupBy(clickEvents.deviceType)
        .orderBy(desc(count()));

      return { total: totalRow!.value, byDay, topReferrers, byCountry, byDevice };
    },
    { query: t.Object({ range: t.Optional(t.Union([t.Literal("7d"), t.Literal("30d"), t.Literal("all")])) }) },
  );
