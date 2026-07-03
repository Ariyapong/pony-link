import { Elysia } from "elysia";
import { resolve } from "node:path";

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

function notFoundResponse(): Response {
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

async function serveSpa(relPath: string): Promise<Response> {
  const exact = await serve(relPath);
  if (exact) return exact;
  const index = await serve("index.html"); // client-side route fallback
  if (index) return index;
  return notFoundResponse();
}

export const spaRoutes = new Elysia()
  .get("/app", () => serveSpa("index.html"))
  .get("/app/*", ({ params }) => {
    const decoded = safeDecode(params["*"]);
    if (decoded === null) return notFoundResponse();
    return serveSpa(decoded);
  });
