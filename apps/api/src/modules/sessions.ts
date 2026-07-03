import { randomToken } from "../lib/crypto";
import { redis } from "../redis";

// Sessions over JWT — deliberate (design spec §6): Redis sessions are instantly
// revocable and auto-expire. JWTs solve a multi-service distribution problem
// this single-server app does not have.
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days, sliding

export type SessionData = { userId: string; role: "admin" | "member" };

export async function createSession(data: SessionData): Promise<string> {
  const sid = randomToken();
  await redis.set(`sess:${sid}`, JSON.stringify(data), "EX", SESSION_TTL_SECONDS);
  return sid;
}

export async function getSession(sid: string): Promise<SessionData | null> {
  const raw = await redis.get(`sess:${sid}`);
  if (!raw) return null;
  await redis.expire(`sess:${sid}`, SESSION_TTL_SECONDS); // sliding refresh
  return JSON.parse(raw) as SessionData;
}

export async function destroySession(sid: string): Promise<void> {
  await redis.del(`sess:${sid}`);
}
