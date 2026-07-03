import { isbot } from "isbot";

export type DeviceType = "desktop" | "mobile" | "bot" | "other";

const MOBILE_RE = /Mobile|Android|iPhone|iPad/i;

// Bot check FIRST: unfurl bots (WhatsApp/Slack/LINE) often claim mobile UAs.
export function deviceTypeFrom(ua: string | null): DeviceType {
  if (!ua) return "other";
  if (isbot(ua)) return "bot";
  if (MOBILE_RE.test(ua)) return "mobile";
  return "desktop";
}
