#!/usr/bin/env bash
# Nightly Postgres backup: local 7-day retention + mandatory offsite copy to R2.
# Cron (runbook): 30 3 * * * /opt/pony-link/scripts/backup.sh >> /var/log/pony-link-backup.log 2>&1
set -euo pipefail

DIR=/opt/pony-link
BACKUP_DIR=$DIR/backups
STAMP=$(date +%F)
FILE="$BACKUP_DIR/shortener-$STAMP.sql.gz"

mkdir -p "$BACKUP_DIR"
docker compose -f "$DIR/compose.prod.yml" exec -T postgres \
  pg_dump -U shortener shortener | gzip > "$FILE"

# offsite: rclone remote "r2" configured in the runbook
rclone copy "$FILE" r2:pony-link-backups/

# local retention: 7 days
find "$BACKUP_DIR" -name 'shortener-*.sql.gz' -mtime +7 -delete
echo "backup ok: $FILE ($(du -h "$FILE" | cut -f1))"
