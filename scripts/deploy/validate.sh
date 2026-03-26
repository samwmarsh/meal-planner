#!/bin/bash
set -e

echo "[deploy] Validating deployment..."

RESPONSE=$(curl -sf http://localhost/api/health 2>&1)
if echo "$RESPONSE" | grep -q '"status":"ok"'; then
  echo "[deploy] Deployment validated successfully."
  echo "[deploy] Health response: $RESPONSE"
  exit 0
else
  echo "[deploy] Validation FAILED."
  echo "[deploy] Response: $RESPONSE"
  echo "[deploy] Container status:"
  docker compose -f /home/ec2-user/meal-planner/docker-compose.yml ps
  exit 1
fi
