#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
node "$ROOT/scripts/build-workflow.js"

docker cp "$ROOT/workflows/stl-speed-to-lead.json" n8n:/tmp/stl-speed-to-lead.json
docker exec -u root n8n sh -c 'mkdir -p /home/node/stl-data && chown -R node:node /home/node/stl-data'
docker exec -u node n8n sh -c 'test -f /home/node/stl-data/stl-ledger.json || printf "%s" "{\"leads\":{},\"phones\":{}}" > /home/node/stl-data/stl-ledger.json'

docker exec -u node n8n n8n import:workflow --input=/tmp/stl-speed-to-lead.json
docker exec -u node n8n n8n publish:workflow --id=7c2e1d0a-4f3b-4a91-9c6e-00a51eaa0001
docker exec -u node n8n n8n unpublish:workflow --id=7c2e1d0a-4f3b-4a91-9c6e-00a51eaa0002 >/dev/null 2>&1 || true
docker restart n8n >/dev/null

echo "Waiting for production webhooks..."
for i in $(seq 1 40); do
  if curl -sf http://localhost:5678/healthz >/dev/null 2>&1 && curl -sf -o /dev/null -w '%{http_code}' -X POST http://localhost:5678/webhook/stl/admin -H 'content-type: application/json' --data '{"action":"peek","token":"stl-dev"}' | grep -q 200; then
    echo "Speed-to-lead is live. One published workflow, one lead at a time."
    exit 0
  fi
  sleep 1
done
echo "Imported. If webhooks 404, wait a few seconds for n8n to finish starting."
