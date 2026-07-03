import {
  bigserial, boolean, char, index, pgTable, text, timestamp, uuid,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ["admin", "member"] }).notNull().default("member"),
  // Self-reference needs the AnyPgColumn callback to avoid a circular type.
  invitedBy: uuid("invited_by").references((): AnyPgColumn => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  // sha-256 of the raw token. Raw token exists only in the one-time invite URL,
  // so a DB leak does not leak usable invites (design spec §4).
  tokenHash: text("token_hash").notNull().unique(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  email: text("email"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  usedBy: uuid("used_by").references(() => users.id),
});

export const links = pgTable("links", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(), // THE core lookup; immutable after creation
  targetUrl: text("target_url").notNull(),
  title: text("title"),
  ownerId: uuid("owner_id").notNull().references(() => users.id),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clickEvents = pgTable(
  "click_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    linkId: uuid("link_id").notNull().references(() => links.id, { onDelete: "cascade" }),
    clickedAt: timestamp("clicked_at", { withTimezone: true }).notNull().defaultNow(),
    referrer: text("referrer"),
    country: char("country", { length: 2 }), // from Cloudflare's CF-IPCountry header
    deviceType: text("device_type", { enum: ["desktop", "mobile", "bot", "other"] }).notNull(),
  },
  (t) => [
    // Composite index: stats queries filter by link AND time range.
    index("click_events_link_id_clicked_at_idx").on(t.linkId, t.clickedAt),
  ],
);
