-- pony-link — the queries worth keeping. Safe to run against PROD in the blue
-- read-only connection: everything above the DANGER ZONE is SELECT-only.
--
-- In DBeaver: put the cursor on a statement and hit Cmd+Enter to run just it.
-- Tables: users · invites · links · click_events   (\dt equivalent: expand the tree)

-- ── Where am I? Run this first if you are ever unsure ────────────────────────
-- Prod = ponylink_ro/ponylink_rw + your real emails. Local dev = 1 user,
-- admin@local.test. Both live at 127.0.0.1:5432 — the label in DBeaver is not
-- proof, this query is.
SELECT current_user, current_database(),
       (SELECT count(*) FROM links) AS links,
       (SELECT string_agg(email, ', ') FROM users) AS emails;

-- ── Every link, most-clicked first ───────────────────────────────────────────
SELECT l.slug,
       l.target_url,
       l.is_active,
       count(c.id)      AS clicks,
       max(c.clicked_at) AS last_click,
       l.created_at
FROM links l
LEFT JOIN click_events c ON c.link_id = l.id
GROUP BY l.id
ORDER BY clicks DESC;

-- ── One link in detail: its recent clicks ────────────────────────────────────
-- Change the slug. Bots are counted too — see the bot query below.
SELECT c.clicked_at, c.country, c.device_type, c.referrer
FROM click_events c
JOIN links l ON l.id = c.link_id
WHERE l.slug = 'my-test'
ORDER BY c.clicked_at DESC
LIMIT 50;

-- ── Traffic per day, last 14 days ────────────────────────────────────────────
SELECT date_trunc('day', clicked_at)::date AS day,
       count(*)                            AS clicks,
       count(*) FILTER (WHERE device_type = 'bot') AS bots
FROM click_events
WHERE clicked_at > now() - interval '14 days'
GROUP BY day
ORDER BY day DESC;

-- ── Who is clicking: country / device split ─────────────────────────────────
SELECT coalesce(country, '??') AS country, device_type, count(*)
FROM click_events
GROUP BY country, device_type
ORDER BY count DESC
LIMIT 20;

-- ── People: accounts and who invited whom ───────────────────────────────────
SELECT u.email, u.display_name, u.role, u.created_at,
       inviter.email AS invited_by
FROM users u
LEFT JOIN users inviter ON inviter.id = u.invited_by
ORDER BY u.created_at;

-- ── Invites still outstanding (unused and not yet expired) ──────────────────
SELECT i.email, i.expires_at, u.email AS created_by
FROM invites i
JOIN users u ON u.id = i.created_by
WHERE i.used_at IS NULL AND i.expires_at > now()
ORDER BY i.expires_at;

-- ── Dead weight: links nobody clicks ────────────────────────────────────────
SELECT l.slug, l.target_url, l.created_at
FROM links l
LEFT JOIN click_events c ON c.link_id = l.id
WHERE c.id IS NULL
ORDER BY l.created_at;


-- ════════════════════════════════════════════════════════════════════════════
--  DANGER ZONE — only in the RED connection (ponylink_rw)
-- ════════════════════════════════════════════════════════════════════════════
-- Prefer the dashboard at gopony.link/app. It validates the URL, enforces slug
-- rules, bumps updated_at, AND clears the Redis cache. Hand-SQL does none of it.
--
-- TWO RULES, both learned the hard way:
--   1. Wrap every write in BEGIN … ROLLBACK/COMMIT. The red connection has
--      auto-commit OFF, so nothing is real until you type COMMIT. Look at the
--      row count FIRST. If it says 6 and you expected 1, ROLLBACK.
--   2. A write to `links` is only HALF an edit. Redis still serves the old
--      target for up to 24h. Finish it from your Mac:
--          ./scripts/cache-bust.sh <slug>
--      Skip this and "disabling" a link does not disable it. That is the bug.

-- Example: retarget a link, safely.
BEGIN;
UPDATE links
   SET target_url = 'https://example.com/new', updated_at = now()
 WHERE slug = 'my-test';
-- ^ read the row count. 1? good. Then:
--     COMMIT;    (and immediately: ./scripts/cache-bust.sh my-test)
--   otherwise:
--     ROLLBACK;
ROLLBACK;  -- default to the safe outcome; delete this line when you mean it

-- Example: kill a link NOW (abuse). The UPDATE alone does NOT stop it.
BEGIN;
UPDATE links SET is_active = false WHERE slug = 'my-test';
-- COMMIT;  then MANDATORY: ./scripts/cache-bust.sh my-test
ROLLBACK;

-- NOT fixable by cache-bust: changing users.role. The role is baked into each
-- Redis session (sessions.ts), so it only takes effect after that user logs out
-- and back in. Proper instant revocation is the user-management spec's job.
