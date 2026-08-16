#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${STL_BASE_URL:-http://localhost:5678}"

post() {
  local path="$1"
  local file="$2"
  echo
  echo "=== POST $path ($file) ==="
  curl -sS -X POST "$BASE/webhook/$path" \
    -H 'content-type: application/json' \
    --data-binary @"$ROOT/fixtures/$file"
  echo
}

echo "=== health ==="
curl -sS "$BASE/healthz"
echo

echo "=== reset ledger ==="
curl -sS -X POST "$BASE/webhook/stl/admin" \
  -H 'content-type: application/json' \
  --data '{"action":"reset","token":"stl-dev"}'
echo

post stl/meta meta-lead.json
post stl/google google-lead.json
post stl/google google-lead.json
post stl/website website-lead.json
post stl/website quarantine-invalid.json

echo
echo "=== ledger peek ==="
curl -sS -X POST "$BASE/webhook/stl/admin" \
  -H 'content-type: application/json' \
  --data '{"action":"peek","token":"stl-dev"}'
echo
