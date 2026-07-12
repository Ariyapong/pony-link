-- Human DB access roles for DBeaver (over the SSH tunnel — never exposed publicly).
-- The app and Drizzle migrations keep using `shortener`, the owner; neither role
-- below owns anything, so Postgres itself denies ALTER / DROP / TRUNCATE on the
-- app's tables. Full control over DATA, zero ability to desync the migration
-- history — the one mistake that is genuinely hard to undo.
--
-- NO PASSWORDS IN THIS FILE, deliberately. The roles are created LOGIN-but-
-- passwordless (which cannot authenticate under scram — safe), then you set the
-- passwords interactively with \password, which hashes them client-side: the
-- plaintext never lands in this file, in shell history, or in the Postgres log.
--
-- Step 1 — create roles + grants (idempotent, safe to re-run):
--   cd /opt/pony-link
--   docker compose -f compose.prod.yml exec -T postgres \
--     psql -v ON_ERROR_STOP=1 -U shortener -d shortener < scripts/db-roles.sql
--
-- Step 2 — set the two passwords (prompts twice each, echoes nothing):
--   docker compose -f compose.prod.yml exec -it postgres \
--     psql -U shortener -d shortener
--   \password ponylink_ro
--   \password ponylink_rw
--   \q

-- Roles: CREATE ROLE has no IF NOT EXISTS, so guard it to stay re-runnable ----
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ponylink_ro') THEN
    CREATE ROLE ponylink_ro LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ponylink_rw') THEN
    CREATE ROLE ponylink_rw LOGIN;
  END IF;
END
$$;

-- 1) read-only — your default, everyday connection -------------------------
GRANT CONNECT ON DATABASE shortener TO ponylink_ro;
GRANT USAGE ON SCHEMA public TO ponylink_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ponylink_ro;

-- 2) read-write DATA — deliberate, colour-coded red in DBeaver -------------
GRANT CONNECT ON DATABASE shortener TO ponylink_rw;
GRANT USAGE ON SCHEMA public TO ponylink_rw;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ponylink_rw;
-- click_events.id is a bigserial: INSERT needs the sequence too.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ponylink_rw;

-- Future tables (every `drizzle-kit` migration creates them AS shortener) must
-- be granted automatically, or both roles go blind after the next migration.
ALTER DEFAULT PRIVILEGES FOR ROLE shortener IN SCHEMA public
  GRANT SELECT ON TABLES TO ponylink_ro;
ALTER DEFAULT PRIVILEGES FOR ROLE shortener IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ponylink_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE shortener IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO ponylink_rw;

-- Guardrails against the classic human-with-a-GUI outage --------------------
-- auto-commit is OFF in DBeaver's write connection, so an UPDATE you forget to
-- COMMIT keeps its ROW LOCKS — and the API's own writes to those rows then
-- block, waiting on a human who went to lunch. Postgres ends the standoff by
-- itself: an idle transaction is rolled back after 5 min. statement_timeout
-- likewise stops a careless full scan from pinning the box. Neither applies to
-- `shortener` (the app), only to these human roles.
ALTER ROLE ponylink_ro SET idle_in_transaction_session_timeout = '5min';
ALTER ROLE ponylink_rw SET idle_in_transaction_session_timeout = '5min';
ALTER ROLE ponylink_ro SET statement_timeout = '60s';
ALTER ROLE ponylink_rw SET statement_timeout = '60s';

-- Sanity check. Expect:
--   ponylink_ro  t f f f   has_password=f  (until step 2)
--   ponylink_rw  t t t t   has_password=f  (until step 2)
-- Re-run this after step 2 and both has_password must be t, or the role cannot
-- log in and DBeaver will just say "password authentication failed".
SELECT r.rolname,
       has_table_privilege(r.rolname, 'links', 'SELECT') AS can_select,
       has_table_privilege(r.rolname, 'links', 'INSERT') AS can_insert,
       has_table_privilege(r.rolname, 'links', 'UPDATE') AS can_update,
       has_table_privilege(r.rolname, 'links', 'DELETE') AS can_delete,
       a.rolpassword IS NOT NULL AS has_password
FROM pg_roles r
JOIN pg_authid a ON a.oid = r.oid
WHERE r.rolname IN ('ponylink_ro', 'ponylink_rw')
ORDER BY r.rolname;
