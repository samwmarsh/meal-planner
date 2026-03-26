#!/bin/bash
set -e
cd /home/ec2-user/meal-planner

echo "[deploy] Building and starting services..."
docker compose up --build -d

# Wait for backend to become healthy (up to 60 seconds)
echo "[deploy] Waiting for backend health check..."
for i in $(seq 1 30); do
  if curl -sf http://localhost/api/health > /dev/null 2>&1; then
    echo "[deploy] Backend is healthy after $((i * 2)) seconds."
    exit 0
  fi
  sleep 2
done

echo "[deploy] WARNING: Backend did not become healthy within 60 seconds."
echo "[deploy] Container logs:"
docker compose logs --tail=30 backend
exit 1
