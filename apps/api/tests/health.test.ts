import { describe, expect, it } from "bun:test";
import { app } from "../src/app";

// app.handle() runs a real Request through the full Elysia pipeline
// without opening a network port — this is how all API tests work here.
describe("GET /health", () => {
  it("returns ok", async () => {
    const res = await app.handle(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});
