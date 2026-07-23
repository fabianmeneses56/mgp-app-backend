#!/usr/bin/env bash
# Deploys the current main branch. Used by the GitHub Actions workflow and for manual deploys.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env.production ]; then
  echo ".env.production not found — copy .env.production.example and fill it in first." >&2
  exit 1
fi

git fetch origin main
git checkout main
git pull --ff-only origin main

# --env-file makes ${DB_USERNAME}/${DB_PASSWORD}/${DB_NAME} available for
# interpolation inside docker-compose.prod.yml (env_file alone does not).
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker image prune -f

echo "Deploy done: $(git rev-parse --short HEAD)"
