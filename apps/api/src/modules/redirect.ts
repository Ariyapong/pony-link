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
      country: request.headers.get("cf-ipcountry")?.slice(0, 2)?.toUpperCase() ?? null,
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

export const redirectRoutes = new Elysia()
  .get("/", ({ set }) => {
    const res = redirectTo("/app");
    set.status = res.status as any;
    return res;
  })
  .get("/:slug", async ({ params, request, server, set }) => {
    const { slug } = params;
    if (!SLUG_PATH_RE.test(slug)) {
      const res = notFoundPage();
      set.status = res.status as any;
      return res;
    }

    if (!(await rateLimit(`redirect:${requestIp(server, request)}`, 300, 60))) {
      const res = new Response("Too many requests", { status: 429, headers: { "cache-control": "no-store" } });
      set.status = res.status as any;
      return res;
    }

    // 1) positive cache
    const cached = await redis.get(`link:${slug}`);
    if (cached) {
      const link = JSON.parse(cached) as CachedLink;
      void recordClick(link.id, request);
      const res = redirectTo(link.url);
      set.status = res.status as any;
      return res;
    }
    // 2) negative cache — scanners hammer Redis, not Postgres (spec §7)
    if (await redis.get(`miss:${slug}`)) {
      const res = notFoundPage();
      set.status = res.status as any;
      return res;
    }
    // 3) source of truth
    const row = await db.query.links.findFirst({ where: eq(links.slug, slug) });
    if (!row || !row.isActive) {
      await redis.set(`miss:${slug}`, "1", "EX", MISS_TTL);
      const res = notFoundPage();
      set.status = res.status as any;
      return res;
    }
    const entry: CachedLink = { id: row.id, url: row.targetUrl };
    await redis.set(`link:${slug}`, JSON.stringify(entry), "EX", LINK_TTL);
    void recordClick(row.id, request);
    const res = redirectTo(row.targetUrl);
    set.status = res.status as any;
    return res;
  });
