#!/usr/bin/env bash
# Allow 443 ONLY from Cloudflare's published ranges (spec §8). Idempotent:
# ufw ignores duplicate rules. Run monthly via cron; ranges change rarely.
# Cron (runbook): 0 4 1 * * /opt/shortener/scripts/cloudflare-ufw.sh
set -euo pipefail

for ip in $(curl -fsS https://www.cloudflare.com/ips-v4) $(curl -fsS https://www.cloudflare.com/ips-v6); do
  ufw allow proto tcp from "$ip" to any port 443 comment cloudflare
done
ufw status | grep -c cloudflare
