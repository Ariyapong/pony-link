import { Elysia } from "elysia";
import { sql } from "../db/client";
import { redis } from "../redis";

export const healthRoutes = new Elysia().get("/health", async ({ set }) => {
  try {
    await sql`SELECT 1`;
    await redis.ping();
    return { status: "ok" };
  } catch {
    set.status = 503;
    return { status: "degraded" }; // deliberately no detail — this endpoint is public
  }
});
