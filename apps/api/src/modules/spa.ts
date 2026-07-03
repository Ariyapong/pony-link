import { Elysia } from "elysia";
import { resolve } from "node:path";
import type { SetLike } from "../lib/errors";

// Resolve the URL relative to this file, then make it absolute
const SPA_DIR = resolve(new URL("../../public/app", import.meta.url).pathname);

// Static SPA → strict CSP is cheap. 'unsafe-inline' styles: React inline style
// attributes (the stats bars) need it; scripts stay locked down.
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'";

async function serve(relPath: string): Promise<Response | null> {
  const fullPath = resolve(SPA_DIR, relPath);
  // Verify path doesn't escape SPA_DIR
  if (!fullPath.startsWith(SPA_DIR + "/") && fullPath !== SPA_DIR) {
    return null;
  }
  const file = Bun.file(fullPath);
  if (await file.exists()) {
    const headers: Record<string, string> = {};
    if (fullPath.endsWith(".html")) headers["content-security-policy"] = CSP;
    return new Response(file, { headers });
  }
  return null;
}

// set.status defaults to Elysia's implicit 200 for a returned raw Response,
// which is what app.ts's onAfterResponse access-log reads (it can't inspect
// a returned Response object's own .status) — so every 404 path here must
// set it explicitly, same convention redirect.ts documents. The 200 paths
// (serve() found a real file) are fine implicitly and don't need to set it.
function notFoundResponse(set: SetLike): Response {
  set.status = 404;
  return new Response("Dashboard build not found (dev mode: use the Vite server on :5173)", {
    status: 404, headers: { "cache-control": "no-store" },
  });
}

function safeDecode(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null; // malformed percent-encoding — treat as not-found, not a 500
  }
}

async function serveSpa(relPath: string, set: SetLike): Promise<Response> {
  const exact = await serve(relPath);
  if (exact) return exact;
  const index = await serve("index.html"); // client-side route fallback
  if (index) return index;
  return notFoundResponse(set);
}

export const spaRoutes = new Elysia()
  .get("/app", ({ set }) => serveSpa("index.html", set))
  .get("/app/*", ({ params, set }) => {
    const decoded = safeDecode(params["*"]);
    if (decoded === null) return notFoundResponse(set);
    return serveSpa(decoded, set);
  });
