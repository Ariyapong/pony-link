import { redis } from "../redis";

/**
 * Fixed-window counter: INCR + EXPIRE on first hit.
 * Trade-off (documented on purpose): a burst straddling a window boundary can
 * see up to 2x the limit briefly. That's acceptable here; a sliding-window
 * (sorted-set) limiter is the v2 exercise if it ever matters.
 * Fails OPEN: if Redis is down, requests pass — availability of redirects
 * beats perfect limiting for this app.
 */
export async function rateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const key = `rl:${bucket}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSeconds);
    return count <= limit;
  } catch (err) {
    console.error("rate limiter unavailable, failing open", err);
    return true;
  }
}
