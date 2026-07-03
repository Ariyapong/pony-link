import { beforeAll, describe, expect, it, spyOn } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { app } from "../src/app";

const SPA_DIR = new URL("../public/app", import.meta.url).pathname;

describe("SPA serving", () => {
  beforeAll(() => {
    // Fixture standing in for a real Vite build.
    mkdirSync(`${SPA_DIR}/assets`, { recursive: true });
    writeFileSync(`${SPA_DIR}/index.html`, "<!doctype html><div id=root>spa</div>");
    writeFileSync(`${SPA_DIR}/assets/x.js`, "console.log(1)");
  });

  const hit = (path: string) => app.handle(new Request(`http://localhost${path}`));

  it("serves index.html at /app with a CSP header", async () => {
    const res = await hit("/app");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("spa");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
  });

  it("serves real asset files", async () => {
    const res = await hit("/app/assets/x.js");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("console.log(1)");
  });

  it("falls back to index.html for client-side routes", async () => {
    const res = await hit("/app/links/123-abc");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("spa");
  });

  it("blocks path traversal", async () => {
    const res = await hit("/app/..%2f..%2fpackage.json");
    const text = await res.text();
    expect(text).not.toContain('"name"');
  });

  it("returns 404, not 500, for malformed percent-encoding", async () => {
    const res = await hit("/app/%");
    expect(res.status).toBe(404);
  });

  it("SPA 404 (malformed percent-encoding) sets set.status so the access log records 404, not the implicit 200", async () => {
    const spy = spyOn(console, "log").mockImplementation(() => {});
    await hit("/app/%");
    await new Promise((r) => setTimeout(r, 50)); // onAfterResponse (access-log hook) runs after handle() resolves
    const logged = spy.mock.calls.map((c) => JSON.parse(c[0] as string));
    spy.mockRestore();
    const line = logged.find((l) => l.path === "/app/%");
    expect(line?.status).toBe(404);
  });
});
