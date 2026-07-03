import { Elysia } from "elysia";
import { env } from "./env";
import { apiError } from "./lib/errors";
import { authRoutes } from "./modules/auth";
import { healthRoutes } from "./modules/health";
import { inviteRoutes } from "./modules/invites";
import { linkRoutes } from "./modules/links";
import { redirectRoutes } from "./modules/redirect";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Hosts allowed to send mutating requests. SameSite=Lax cookies are the first
// CSRF wall; this Origin check is the second. Non-browser clients (curl, tests)
// send no Origin header and pass — CSRF is strictly a browser attack.
const allowedOriginHosts = new Set([new URL(env.BASE_URL).host]);
if (!env.isProd) allowedOriginHosts.add("localhost:5173"); // Vite dev server

export const app = new Elysia()
  .derive({ as: "global" }, () => ({ startedAt: performance.now() }))
  .onRequest(({ request, set }) => {
    set.headers["x-content-type-options"] = "nosniff";
    set.headers["referrer-policy"] = "strict-origin-when-cross-origin";

    // onRequest runs for every request BEFORE routing, so this is the only
    // hook that can enforce CSRF on paths that don't match any route (Elysia
    // sends unmatched paths straight to onError, skipping onBeforeHandle).
    if (!MUTATING.has(request.method)) return;
    const origin = request.headers.get("origin");
    if (!origin) return;
    try {
      if (!allowedOriginHosts.has(new URL(origin).host)) {
        return apiError(set, 403, "CSRF", "Cross-origin request rejected");
      }
    } catch {
      return apiError(set, 403, "CSRF", "Cross-origin request rejected");
    }
  })
  .onAfterResponse({ as: "global" }, ({ request, set, path, startedAt }) => {
    // One structured JSON line per request — greppable, parseable, no log library.
    console.log(
      JSON.stringify({
        t: new Date().toISOString(),
        method: request.method,
        path,
        status: set.status ?? 200,
        // startedAt comes from derive(), which only runs for matched routes —
        // unmatched paths reach here with startedAt undefined, so guard it.
        ms: typeof startedAt === "number" ? Math.round(performance.now() - startedAt) : undefined,
      }),
    );
  })
  .onError({ as: "global" }, ({ code, error, set }) => {
    if (code === "VALIDATION") return apiError(set, 422, "VALIDATION", error.message);
    if (code === "NOT_FOUND") return apiError(set, 404, "NOT_FOUND", "Not found");
    console.error(error);
    return apiError(set, 500, "INTERNAL", "Internal server error");
  })
  .use(healthRoutes)
  .use(authRoutes)
  .use(inviteRoutes)
  .use(linkRoutes)
  .use(redirectRoutes);

export type App = typeof app;
