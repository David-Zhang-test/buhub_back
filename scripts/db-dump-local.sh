#!/usr/bin/env bash
# Dump local Docker Postgres (buhub_postgres / compose service postgres) to ../backups/
# Requires: docker compose postgres running (container name buhub-postgres by default).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUHUB_BACK="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$BUHUB_BACK/.." && pwd)"
BACKUPS_DIR="${BACKUPS_DIR:-$REPO_ROOT/backups}"
mkdir -p "$BACKUPS_DIR"

CONTAINER="${POSTGRES_CONTAINER:-buhub-postgres}"
USER="${POSTGRES_USER:-buhub}"
DB="${POSTGRES_DB:-buhub}"

OUT="${BACKUPS_DIR}/buhub_local_$(date +%Y%m%d_%H%M%S).dump"

docker exec "$CONTAINER" pg_dump -U "$USER" -d "$DB" -Fc >"$OUT"
ls -lh "$OUT"
echo "Wrote: $OUT"
