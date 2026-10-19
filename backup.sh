#!/usr/bin/env bash
# Daily backup wrapper for cron. Works for both PM2 and Docker installs.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f docker-compose.prod.yml ] && docker compose -f docker-compose.prod.yml ps --status running --services 2>/dev/null | grep -qx emberstack; then
  docker compose -f docker-compose.prod.yml exec -T emberstack node scripts/backup.js
else
  node scripts/backup.js
fi
