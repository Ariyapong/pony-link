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
  // Sessions fail CLOSED, the opposite of the redirect cache's fail-open: a
  // corrupt session payload is a security-relevant anomaly (not a Redis
  // outage — Redis just answered with garbage), so the safe move is to
  // treat the caller as logged out and scrub the bad key, not to guess at
  // partial trust. Contrast with redirect.ts, where a dead/corrupt cache
  // degrades to a slower Postgres read because staying up matters more than
  // staying fast.
  let data: SessionData;
  try {
    data = JSON.parse(raw) as SessionData;
  } catch (err) {
    console.error(JSON.stringify({ msg: "corrupt session payload", sid, err: String(err) }));
    await redis.del(`sess:${sid}`);
    return null;
  }
  await redis.expire(`sess:${sid}`, SESSION_TTL_SECONDS); // sliding refresh
  return data;
}

export async function destroySession(sid: string): Promise<void> {
  await redis.del(`sess:${sid}`);
}
