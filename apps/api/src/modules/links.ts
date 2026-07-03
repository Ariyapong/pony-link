import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { links } from "../db/schema";
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
  );
