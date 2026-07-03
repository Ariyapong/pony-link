import { beforeEach, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { links, users } from "../src/db/schema";
import { resetAll } from "./helpers";

describe("database", () => {
  beforeEach(resetAll);

  it("migrations created the tables and constraints work", async () => {
    const [u] = await db
      .insert(users)
      .values({ email: "a@b.c", displayName: "a", passwordHash: "x" })
      .returning();
    const [l] = await db
      .insert(links)
      .values({ slug: "abc1234", targetUrl: "https://example.com", ownerId: u!.id })
      .returning();
    expect(l!.isActive).toBe(true);

    const found = await db.query.links.findFirst({ where: eq(links.slug, "abc1234") });
    expect(found?.targetUrl).toBe("https://example.com");

    // slug uniqueness is enforced by the DATABASE, not application code
    await expect(
      db.insert(links).values({ slug: "abc1234", targetUrl: "https://x.dev", ownerId: u!.id }).execute(),
    ).rejects.toThrow();
  });
});
