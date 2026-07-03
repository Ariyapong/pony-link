import { customAlphabet } from "nanoid";

// No 0/O/1/l/I: these slugs get read aloud and retyped from slides.
// 54^7 ≈ 1.3e12 possibilities — collisions are handled by the DB unique
// index plus one retry, not by hoping (see links module).
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";

export const generateSlug: () => string = customAlphabet(ALPHABET, 7);

// Every top-level path the app serves must be unclaimable as a slug.
export const RESERVED_SLUGS: Set<string> = new Set([
  "app", "api", "health", "assets", "static", "favicon.ico", "robots.txt",
  "login", "register", "admin",
]);

const CUSTOM_SLUG_RE = /^[a-zA-Z0-9_-]{3,64}$/;

/** Returns null when valid, otherwise a human-readable reason. */
export function validateCustomSlug(slug: string): string | null {
  if (!CUSTOM_SLUG_RE.test(slug)) {
    return "Slug must be 3-64 characters using only letters, digits, - and _";
  }
  if (RESERVED_SLUGS.has(slug.toLowerCase())) return "This slug is reserved";
  return null;
}

// Redirect-path fast reject: cheaper than Redis for obvious junk.
export const SLUG_PATH_RE = /^[a-zA-Z0-9_-]{1,64}$/;
