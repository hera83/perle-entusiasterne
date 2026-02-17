#!/bin/bash
# Apply project migrations from /project-migrations/ in sorted order
# This script runs as the last init script (zzz- prefix)

set -e

MIGRATION_DIR="/project-migrations"

if [ ! -d "$MIGRATION_DIR" ] || [ -z "$(ls -A "$MIGRATION_DIR" 2>/dev/null)" ]; then
  echo "No project migrations found in $MIGRATION_DIR"
  exit 0
fi

echo "=== Applying project migrations ==="

for f in $(ls "$MIGRATION_DIR"/*.sql 2>/dev/null | sort); do
  echo "Applying migration: $(basename "$f")"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"
done

echo "=== All project migrations applied ==="
