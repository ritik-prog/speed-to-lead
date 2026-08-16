#!/usr/bin/env bash
# Local n8n used by this project. Port 5678. Does not use 5000.
set -euo pipefail
if lsof -nP -iTCP:5678 -sTCP:LISTEN >/dev/null 2>&1; then
  docker stop n8n >/dev/null 2>&1 || true
  sleep 1
fi
docker rm n8n >/dev/null 2>&1 || true
docker volume create n8n_data >/dev/null
docker volume create n8n_stl >/dev/null
docker run -d --name n8n --restart unless-stopped \
  -p 5678:5678 \
  -e GENERIC_TIMEZONE=Asia/Kolkata \
  -e TZ=Asia/Kolkata \
  -e N8N_SECURE_COOKIE=false \
  -e N8N_RESTRICT_FILE_ACCESS_TO=/home/node/stl-data \
  -e N8N_CONCURRENCY_PRODUCTION_LIMIT=1 \
  -v n8n_data:/home/node/.n8n \
  -v n8n_stl:/home/node/stl-data \
  docker.n8n.io/n8nio/n8n:latest
for i in $(seq 1 40); do
  if curl -sf -o /dev/null http://localhost:5678/healthz; then break; fi
  sleep 1
done
docker exec -u root n8n sh -c 'mkdir -p /home/node/stl-data && chown -R node:node /home/node/stl-data'
echo "n8n is at http://localhost:5678"
