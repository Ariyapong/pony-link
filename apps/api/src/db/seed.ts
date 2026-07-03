// Dev-only seed: `bun run seed`. Idempotent-ish (skips if the admin exists).
import { eq } from "drizzle-orm";
import { db, sql } from "./client";
import { clickEvents, links, users } from "./schema";
import { runMigrations } from "./migrate";
import { env } from "../env";

await runMigrations(env.DATABASE_URL);

const existing = await db.query.users.findFirst({ where: eq(users.email, "admin@local.test") });
if (existing) {
  console.log("seed: already seeded, nothing to do");
} else {
  const [admin] = await db
    .insert(users)
    .values({
      email: "admin@local.test",
      displayName: "Ton (dev)",
      passwordHash: await Bun.password.hash("admin-password-123"),
      role: "admin",
    })
    .returning();
  const [l1] = await db
    .insert(links)
    .values([
      { slug: "blog", targetUrl: "https://www.aritoton.com", title: "My site", ownerId: admin!.id },
      { slug: "gh", targetUrl: "https://github.com", title: "GitHub", ownerId: admin!.id },
    ])
    .returning();
  const devices = ["desktop", "mobile", "bot", "other"] as const;
  const countries = ["TH", "US", "JP", "DE", null];
  await db.insert(clickEvents).values(
    Array.from({ length: 40 }, (_, i) => ({
      linkId: l1!.id,
      clickedAt: new Date(Date.now() - i * 6 * 60 * 60 * 1000), // spread over ~10 days
      referrer: i % 3 === 0 ? "https://google.com" : null,
      country: countries[i % countries.length]!,
      deviceType: devices[i % devices.length]!,
    })),
  );
  console.log("seed: admin@local.test / admin-password-123, links: /blog /gh");
}
await sql.end();
process.exit(0);
