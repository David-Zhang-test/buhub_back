#!/usr/bin/env bash
# Restore a local pg_dump (-Fc) into AWS RDS PostgreSQL.
#
# Prereqs:
#   1. RDS instance running; database (e.g. buhub) created; security group allows your IP.
#   2. Connection string uses SSL, e.g. ?sslmode=require
#   3. Target DB is empty OR you accept overwriting with --clean (see below).
#
# Usage:
#   export DATABASE_URL_AWS='postgresql://USER:PASS@xxx.region.rds.amazonaws.com:5432/buhub?sslmode=require'
#   ./scripts/db-restore-to-aws.sh [path/to/buhub_local_*.dump]
#
# Or add DATABASE_URL_AWS to buhub_back/.env (single line), then:
#   ./scripts/db-restore-to-aws.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUHUB_BACK="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$BUHUB_BACK/.." && pwd)"
BACKUPS_DIR="$REPO_ROOT/backups"

# Read only DATABASE_URL_AWS from .env (avoid sourcing full .env — passwords/special chars).
if [[ -f "$BUHUB_BACK/.env" ]]; then
  line="$(grep -E '^[[:space:]]*DATABASE_URL_AWS=' "$BUHUB_BACK/.env" | tail -1 || true)"
  if [[ -n "$line" ]]; then
    val="${line#*=}"
    val="${val%$'\r'}"
    val="${val#\"}"
    val="${val%\"}"
    val="${val#\'}"
    val="${val%\'}"
    export DATABASE_URL_AWS="$val"
  fi
fi

TARGET="${DATABASE_URL_AWS:-}"
if [[ -z "$TARGET" ]]; then
  echo "ERROR: Set DATABASE_URL_AWS to your RDS URL (with ?sslmode=require)."
  echo "Example: postgresql://buhub:SECRET@db.xxx.ap-southeast-1.rds.amazonaws.com:5432/buhub?sslmode=require"
  exit 1
fi

DUMP="${1:-}"
if [[ -z "$DUMP" ]]; then
  DUMP=$(ls -t "$BACKUPS_DIR"/buhub_local_*.dump 2>/dev/null | head -1 || true)
fi
if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "ERROR: No dump file. Run ./scripts/db-dump-local.sh first, or pass path to .dump"
  exit 1
fi

echo "Restore from: $DUMP"
echo "Target: ${TARGET%%\?*}..." # hide query params in log

# Use same major version as source (16) for pg_restore.
DUMP_BASENAME=$(basename "$DUMP")

if [[ "${PGRESTORE_CLEAN:-0}" == "1" ]]; then
  CLEAN_FLAGS=(--clean --if-exists)
  echo "Using --clean --if-exists (drops existing objects in target DB)"
else
  CLEAN_FLAGS=()
  echo "Tip: if restore fails with 'already exists', empty the RDS database or run: PGRESTORE_CLEAN=1 $0 \"$DUMP\""
fi

docker run --rm \
  -v "$BACKUPS_DIR:/backup:ro" \
  postgres:16-alpine \
  pg_restore "${CLEAN_FLAGS[@]}" --no-owner --no-acl --verbose -d "$TARGET" "/backup/$DUMP_BASENAME"

echo "Done. Point production DATABASE_URL to RDS and run: npx prisma migrate deploy (if you rely on migration history — optional after full restore)."
