import { Elysia } from "elysia";
import { getSession } from "./sessions";

// Named plugin + global derive: any module that .use()s this gets
// { session, sid } in its handler context. Elysia dedupes by name.
export const withSession = new Elysia({ name: "with-session" }).derive(
  { as: "global" },
  async ({ cookie }) => {
    const sid = cookie.sid?.value as string | undefined;
    const session = sid ? await getSession(sid) : null;
    return { session, sid: sid ?? null };
  },
);
