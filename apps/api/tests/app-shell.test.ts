import { describe, expect, it } from "bun:test";
import { app } from "../src/app";

describe("app shell", () => {
  it("sets security headers on every response", async () => {
    const res = await app.handle(new Request("http://localhost/health"));
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });

  it("rejects cross-origin mutations (CSRF)", async () => {
    const res = await app.handle(
      new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        headers: { origin: "https://evil.example", "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("CSRF");
  });

  it("allows same-origin mutations through the CSRF check", async () => {
    const res = await app.handle(
      new Request("http://localhost:3000/api/v1/auth/login", {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(res.status).not.toBe(403); // 404 until Task 9 adds the route — that's fine
  });

  it("returns the error envelope for unknown routes", async () => {
    const res = await app.handle(new Request("http://localhost/api/v1/nope"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });
});
