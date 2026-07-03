import { describe, expect, it } from "bun:test";
import { validateTargetUrl } from "../src/lib/url-validate";

const OWN = "s.aritoton.com";

describe("validateTargetUrl", () => {
  it("accepts normal http(s) URLs", () => {
    expect(validateTargetUrl("https://example.com/a?b=c#d", OWN)).toBeNull();
    expect(validateTargetUrl("http://example.com", OWN)).toBeNull();
  });
  it("rejects non-http(s) schemes (XSS via redirect)", () => {
    expect(validateTargetUrl("javascript:alert(1)", OWN)).toBeString();
    expect(validateTargetUrl("data:text/html,hi", OWN)).toBeString();
    expect(validateTargetUrl("ftp://example.com", OWN)).toBeString();
  });
  it("rejects garbage and over-long URLs", () => {
    expect(validateTargetUrl("not a url", OWN)).toBeString();
    expect(validateTargetUrl("https://example.com/" + "a".repeat(2048), OWN)).toBeString();
  });
  it("rejects redirect loops to itself", () => {
    expect(validateTargetUrl("https://s.aritoton.com/other", OWN)).toBeString();
  });
  it("rejects localhost and private-range literals", () => {
    for (const u of [
      "http://localhost:3000/x", "http://127.0.0.1/x", "http://10.0.0.5/x",
      "http://192.168.1.1/x", "http://172.16.0.1/x", "http://169.254.1.1/x", "http://[::1]/x",
    ]) {
      expect(validateTargetUrl(u, OWN)).toBeString();
    }
  });
});
