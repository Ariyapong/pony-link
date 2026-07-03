export type SetLike = { status?: number | string };

/** Uniform error envelope: { error: { code, message } } with the given HTTP status. */
export function apiError(set: SetLike, status: number, code: string, message: string) {
  set.status = status;
  return { error: { code, message } };
}
