// Runs ONCE before any test file imports application code (bunfig preload).
// Points the app at the test database / test Redis db BEFORE src/env.ts is loaded.
process.env.DATABASE_URL = "postgres://shortener:shortener@localhost:5432/shortener_test";
process.env.REDIS_URL = "redis://localhost:6379/1";
process.env.NODE_ENV = "test";
process.env.BASE_URL = "http://localhost:3000";

import postgres from "postgres";
import { runMigrations } from "../src/db/migrate";

// Create the test database if missing (CREATE DATABASE has no IF NOT EXISTS).
const admin = postgres("postgres://shortener:shortener@localhost:5432/shortener", { max: 1 });
try {
  await admin.unsafe(`CREATE DATABASE shortener_test`);
} catch (e: unknown) {
  const code = (e as { code?: string }).code;
  if (code !== "42P04") throw e; // 42P04 = duplicate_database — fine
} finally {
  await admin.end();
}
await runMigrations(process.env.DATABASE_URL);
