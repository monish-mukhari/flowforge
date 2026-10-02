#!/usr/bin/env bash

set -Eeuo pipefail

expected_sha="${1:-}"
public_domain="${2:-}"

if [[ ! "$expected_sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "A full 40-character deployment commit SHA is required" >&2
  exit 2
fi

if [[ ! "$public_domain" =~ ^[A-Za-z0-9.-]+$ ]]; then
  echo "A valid public domain is required" >&2
  exit 2
fi

if [[ ! -f .env ]]; then
  echo "Production .env file is missing from $(pwd)" >&2
  exit 1
fi

deployed_sha="$(git rev-parse HEAD)"
if [[ "$deployed_sha" != "$expected_sha" ]]; then
  echo "Refusing to deploy $deployed_sha; CI approved $expected_sha" >&2
  exit 1
fi

compose=(
  docker compose
  --env-file .env
  -f compose.yaml
  -f compose.production.yaml
)

"${compose[@]}" config --quiet

backup_dir="$(pwd -P)/backups"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"

postgres_container="$("${compose[@]}" ps --status running -q postgres)"
if [[ -n "$postgres_container" ]]; then
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  backup_path="$backup_dir/flowforge-$timestamp-$expected_sha.dump"
  temporary_backup="$backup_path.partial"

  cleanup_partial_backup() {
    rm -f -- "$temporary_backup"
  }
  trap cleanup_partial_backup EXIT

  echo "Creating pre-deployment database backup"
  "${compose[@]}" exec -T postgres sh -c \
    'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
    > "$temporary_backup"
  "${compose[@]}" exec -T postgres pg_restore --list \
    < "$temporary_backup" > /dev/null
  mv -- "$temporary_backup" "$backup_path"
  chmod 600 "$backup_path"
  trap - EXIT
  echo "Verified backup: $backup_path"
else
  echo "PostgreSQL is not running; skipping backup for the first deployment"
fi

echo "Deploying $expected_sha"
"${compose[@]}" up -d --build --wait --wait-timeout 240

curl \
  --fail \
  --silent \
  --show-error \
  --retry 12 \
  --retry-delay 5 \
  --retry-all-errors \
  "https://$public_domain/" \
  > /dev/null

# Backups older than 14 days are removed only from this repository's backup folder.
find "$backup_dir" \
  -maxdepth 1 \
  -type f \
  -name 'flowforge-*.dump' \
  -mtime +14 \
  -delete

echo "Deployment healthy at https://$public_domain/"
