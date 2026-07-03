import { app } from "./app";
import { ensureAdminUser } from "./bootstrap";
import { runMigrations } from "./db/migrate";
import { sql } from "./db/client";
import { env } from "./env";
import { redis } from "./redis";

// Migrations on boot: safe while there is exactly one app instance (spec §10).
await runMigrations(env.DATABASE_URL);
await ensureAdminUser();

app.listen(env.PORT);
console.log(JSON.stringify({ msg: "api listening", port: env.PORT }));

async function shutdown() {
  await app.stop();
  await sql.end();
  redis.disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
