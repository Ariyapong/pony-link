/** 32 random bytes as base64url — session ids and invite tokens. */
export function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

export function sha256Hex(input: string): string {
  return new Bun.CryptoHasher("sha256").update(input).digest("hex");
}

// Route params that feed a uuid-typed Drizzle column must be shape-checked
// before hitting the query: Postgres throws 22P02 (invalid_text_representation)
// on a non-UUID string, which bubbles up as a 500 with stack noise instead of
// a clean 404. Checked ahead of the query in each handler that takes an :id.
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
