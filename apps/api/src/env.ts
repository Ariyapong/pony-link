// Bun auto-loads .env from the package directory — no dotenv needed.
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const nodeEnv = process.env.NODE_ENV ?? "development";

export const env = {
  DATABASE_URL: required("DATABASE_URL"),
  REDIS_URL: required("REDIS_URL"),
  PORT: Number(process.env.PORT ?? 3000),
  NODE_ENV: nodeEnv,
  isProd: nodeEnv === "production",
  BASE_URL: process.env.BASE_URL ?? "http://localhost:3000",
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || undefined,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || undefined,
};
