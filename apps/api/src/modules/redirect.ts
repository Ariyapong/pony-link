import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { clickEvents, links } from "../db/schema";
import { requestIp } from "../lib/client-ip";
import { deviceTypeFrom } from "../lib/device";
import { rateLimit } from "../lib/rate-limit";
import { SLUG_PATH_RE } from "../lib/slug";
import { redis } from "../redis";

const LINK_TTL = 60 * 60 * 24; // 24h — invalidated explicitly on every write
const MISS_TTL = 60 * 5; //  5m — blunts slug scanning; cleared on create/patch

type CachedLink = { id: string; url: string };

function notFoundPage(): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Not found</title>
<body style="font-family:system-ui;display:grid;place-items:center;min-height:100vh;margin:0">
<div style="text-align:center"><h1>404</h1><p>This short link doesn't exist or was disabled.</p>
<p><a href="https://www.aritoton.com">aritoton.com</a></p></div></body>`,
    { status: 404, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}

/** Exported for tests. In the route it runs fire-and-forget AFTER the 302 —
 *  analytics must never delay or break a redirect (fails open). */
export async function recordClick(linkId: string, request: Request): Promise<void> {
  try {
    await db.insert(clickEvents).values({
      linkId,
      referrer: request.headers.get("referer")?.slice(0, 512) ?? null,
      country: request.headers.get("cf-ipcountry")?.slice(0, 2).toUpperCase() ?? null,
      deviceType: deviceTypeFrom(request.headers.get("user-agent")),
    });
  } catch (err) {
    console.error(JSON.stringify({ msg: "click recording failed", err: String(err) }));
  }
}

function redirectTo(url: string): Response {
  // 302 + no-store, never 301: a 301 is cached by browsers forever, which kills
  // both analytics and the ability to edit/disable a link (design spec §7).
  return new Response(null, { status: 302, headers: { location: url, "cache-control": "no-store" } });
}

// NOTE on `set.status`: Elysia honors a returned raw Response's own .status for
// the actual client-facing reply regardless of `set.status` — so these writes
// are not needed for correctness of what the browser receives. But app.ts's
// onAfterResponse access-log logs `set.status ?? 200` (it can't inspect a
// returned Response object), so without this every redirect/404/429 here would
// be misreported as 200 in the access log. Every other route module in this
// codebase sets `set.status` for the same reason; redirect.ts must match.
export const redirectRoutes = new Elysia()
  .get("/", ({ set }) => {
    set.status = 302;
    return redirectTo("/app");
  })
  .get("/:slug", async ({ params, request, server, set }) => {
    const { slug } = params;
    if (!SLUG_PATH_RE.test(slug)) {
      set.status = 404;
      return notFoundPage();
    }

    if (!(await rateLimit(`redirect:${requestIp(server, request)}`, 300, 60))) {
      set.status = 429;
      return new Response("Too many requests", { status: 429, headers: { "cache-control": "no-store" } });
    }

    // 1) positive cache
    const cached = await redis.get(`link:${slug}`);
    if (cached) {
      let link: CachedLink | null = null;
      try {
        link = JSON.parse(cached) as CachedLink;
      } catch {
        // corrupt cache entry — fail open to the DB (falls through below)
        await redis.del(`link:${slug}`);
      }
      if (link) {
        void recordClick(link.id, request);
        set.status = 302;
        return redirectTo(link.url);
      }
    }
    // 2) negative cache — scanners hammer Redis, not Postgres (spec §7)
    if (await redis.get(`miss:${slug}`)) {
      set.status = 404;
      return notFoundPage();
    }
    // 3) source of truth
    const row = await db.query.links.findFirst({ where: eq(links.slug, slug) });
    if (!row || !row.isActive) {
      await redis.set(`miss:${slug}`, "1", "EX", MISS_TTL);
      set.status = 404;
      return notFoundPage();
    }
    const entry: CachedLink = { id: row.id, url: row.targetUrl };
    await redis.set(`link:${slug}`, JSON.stringify(entry), "EX", LINK_TTL);
    void recordClick(row.id, request);
    set.status = 302;
    return redirectTo(row.targetUrl);
  });
