#!/usr/bin/env bash
# Invalidate the redirect cache for one or more slugs, from your Mac.
#
# WHY THIS EXISTS: the API deletes `link:<slug>` / `miss:<slug>` on every write
# (links.ts:179,203). A hand-written UPDATE in DBeaver does not — so Redis keeps
# serving the OLD target for up to 24h (LINK_TTL, redirect.ts:11), and flipping
# is_active=false by hand does NOT stop a link redirecting. Run this immediately
# after any manual edit of `links` in prod. It is the second half of that edit.
#
#   scripts/cache-bust.sh blog gh          # prod (default)
#   TARGET=local scripts/cache-bust.sh blog
#
# NOTE: user/role edits are NOT fixable here — the role is baked into each Redis
# session (sessions.ts:9) and there is no user->session index yet (that is the
# `user-sess:<userId>` item in the user-management spec). Until then, a role
# change only takes effect when that user logs out and back in.
set -euo pipefail

VPS=deploy@167.172.86.165
TARGET=${TARGET:-prod}

[ $# -ge 1 ] || { echo "usage: [TARGET=local] $0 <slug> [slug...]" >&2; exit 1; }

# Slugs go into a remote shell command, so allowlist them rather than trying to
# quote defensively. Matches the app's own slug charset (lib/slug.ts). Bash 3.2
# is what macOS ships — no ${x@Q}, no associative arrays.
keys=""
for slug in "$@"; do
  case "$slug" in
    *[!A-Za-z0-9_-]* | "") echo "refusing suspicious slug: '$slug'" >&2; exit 1 ;;
  esac
  keys="$keys link:$slug miss:$slug"
done

if [ "$TARGET" = local ]; then
  # shellcheck disable=SC2086 # word-splitting is intended; slugs are allowlisted
  docker compose exec -T redis redis-cli DEL $keys
else
  ssh "$VPS" "cd /opt/pony-link && docker compose -f compose.prod.yml exec -T redis \
    redis-cli DEL$keys"
fi
echo "cache-bust ($TARGET): $*"
