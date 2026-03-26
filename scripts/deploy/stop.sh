#!/bin/bash
set -e
cd /home/ec2-user/meal-planner

echo "[deploy] Stopping existing containers..."
if [ -f docker-compose.yml ]; then
  docker compose down --timeout 30 || true
fi
echo "[deploy] Containers stopped."
