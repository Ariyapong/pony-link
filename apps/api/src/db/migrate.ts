import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Path is anchored to this file so it works from any cwd (tests, Docker).
const MIGRATIONS_FOLDER = new URL("../../drizzle", import.meta.url).pathname;

export async function runMigrations(databaseUrl: string): Promise<void> {
  const client = postgres(databaseUrl, { max: 1 });
  await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
  await client.end();
}
