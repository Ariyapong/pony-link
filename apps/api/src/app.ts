import { Elysia } from "elysia";
import { healthRoutes } from "./modules/health";

export const app = new Elysia().use(healthRoutes);

// Eden Treaty derives the typed client for apps/web from this export.
export type App = typeof app;
