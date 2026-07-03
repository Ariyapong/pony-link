import { describe, expect, it } from "bun:test";
import { deviceTypeFrom } from "../src/lib/device";

describe("deviceTypeFrom", () => {
  it("classifies bots (unfurl previews count as bots, not humans)", () => {
    expect(deviceTypeFrom("WhatsApp/2.23.20 A")).toBe("bot");
    expect(deviceTypeFrom("Slackbot-LinkExpanding 1.0")).toBe("bot");
    expect(deviceTypeFrom("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe("bot");
  });
  it("classifies mobile", () => {
    expect(
      deviceTypeFrom("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"),
    ).toBe("mobile");
    expect(deviceTypeFrom("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe("mobile");
  });
  it("classifies desktop", () => {
    expect(
      deviceTypeFrom("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0"),
    ).toBe("desktop");
  });
  it("handles missing UA", () => {
    expect(deviceTypeFrom(null)).toBe("other");
    expect(deviceTypeFrom("")).toBe("other");
  });
});
