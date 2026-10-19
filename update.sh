#!/usr/bin/env bash
# One-command update.
#   ./scripts/update.sh            PM2 install (default)
#   ./scripts/update.sh docker     Docker Compose install
set -euo pipefail
cd "$(dirname "$0")/.."
MODE="${1:-pm2}"

echo "==> Backing up the database first"
./scripts/backup.sh || echo "    (backup skipped - continuing)"

echo "==> Getting the latest code"
git pull --ff-only

if [ "$MODE" = "docker" ]; then
  echo "==> Rebuilding and restarting the containers"
  docker compose -f docker-compose.prod.yml up -d --build
  docker image prune -f >/dev/null
  sleep 8
  docker compose -f docker-compose.prod.yml ps
else
  echo "==> Installing dependencies"
  npm ci --omit=dev
  echo "==> Restarting the bot"
  if pm2 describe emberstack >/dev/null 2>&1; then pm2 restart emberstack --update-env; else pm2 start ecosystem.config.js; fi
  pm2 save >/dev/null

  PORT_VALUE="$(grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d '[:space:]' || true)"
  echo "==> Waiting for the dashboard to answer"
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS "http://127.0.0.1:${PORT_VALUE:-3000}/healthz" >/dev/null 2>&1; then echo "    Healthy."; break; fi
    sleep 2
    if [ "$i" = "10" ]; then echo "    Not answering yet. Check:  pm2 logs emberstack"; fi
  done
fi
echo "==> Update finished"
