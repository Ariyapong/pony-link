import { treaty } from "@elysiajs/eden";
import type { App } from "../../api/src/app";

// Same-origin in prod; in dev Vite proxies /api to the local API.
export const api = treaty<App>(window.location.origin);
