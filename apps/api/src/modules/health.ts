import { Elysia } from "elysia";

// Deep checks (Postgres/Redis pings) are added in Task 2 once clients exist.
export const healthRoutes = new Elysia().get("/health", () => ({ status: "ok" }));
