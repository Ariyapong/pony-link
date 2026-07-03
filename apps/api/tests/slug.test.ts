import { describe, expect, it } from "bun:test";
import { RESERVED_SLUGS, SLUG_PATH_RE, generateSlug, validateCustomSlug } from "../src/lib/slug";

describe("generateSlug", () => {
  it("makes 7-char slugs from the unambiguous alphabet", () => {
    for (let i = 0; i < 200; i++) {
      const s = generateSlug();
      expect(s).toHaveLength(7);
      expect(s).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ]+$/);
    }
  });
  it("never contains ambiguous characters", () => {
    for (let i = 0; i < 200; i++) expect(generateSlug()).not.toMatch(/[0O1lI]/);
  });
});

describe("validateCustomSlug", () => {
  it("accepts 3-64 chars of letters, digits, dash, underscore", () => {
    expect(validateCustomSlug("my-talk")).toBeNull();
    expect(validateCustomSlug("My_Talk2")).toBeNull();
    expect(validateCustomSlug("abc")).toBeNull();
    expect(validateCustomSlug("a".repeat(64))).toBeNull();
  });
  it("rejects bad shapes with a reason", () => {
    expect(validateCustomSlug("ab")).toBeString();          // too short
    expect(validateCustomSlug("a".repeat(65))).toBeString(); // too long
    expect(validateCustomSlug("has space")).toBeString();
    expect(validateCustomSlug("héllo")).toBeString();
    expect(validateCustomSlug("a/b")).toBeString();
  });
  it("rejects reserved slugs case-insensitively", () => {
    expect(validateCustomSlug("app")).toBeString();
    expect(validateCustomSlug("API")).toBeString();
    expect(validateCustomSlug("Health")).toBeString();
  });
});

describe("SLUG_PATH_RE", () => {
  it("accepts plausible slugs and rejects junk", () => {
    expect(SLUG_PATH_RE.test("abc1234")).toBe(true);
    expect(SLUG_PATH_RE.test("my-talk")).toBe(true);
    expect(SLUG_PATH_RE.test("..%2f..")).toBe(false);
    expect(SLUG_PATH_RE.test("a".repeat(65))).toBe(false);
    expect(SLUG_PATH_RE.test("")).toBe(false);
  });
});

describe("RESERVED_SLUGS", () => {
  it("covers every path the app itself serves", () => {
    for (const s of ["app", "api", "health", "assets", "favicon.ico", "robots.txt"]) {
      expect(RESERVED_SLUGS.has(s)).toBe(true);
    }
  });
});
