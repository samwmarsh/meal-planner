#!/bin/bash
set -e
cd /home/ec2-user/meal-planner

echo "[deploy] Running after-install checks..."

# Make all deploy scripts executable (git doesn't always preserve +x via CodeDeploy)
chmod +x /home/ec2-user/meal-planner/scripts/deploy/*.sh

# Restore .env from backup (CodeDeploy overwrites the directory)
if [ ! -f .env ] && [ -f /home/ec2-user/.env.deploy-backup ]; then
  cp /home/ec2-user/.env.deploy-backup .env
  echo "[deploy] Restored .env from backup"
fi

# Ensure .env exists
if [ ! -f .env ]; then
  echo "ERROR: .env file not found at /home/ec2-user/meal-planner/.env"
  echo "Create it from .env.example before deploying."
  exit 1
fi

# Prune old Docker images to free disk space (older than 7 days)
echo "[deploy] Pruning old Docker images..."
docker system prune -f --filter "until=168h" || true

# Pre-pull base images to speed up builds
echo "[deploy] Pre-pulling base images..."
docker pull node:20-alpine || true
docker pull postgres:16-alpine || true
docker pull nginx:alpine || true

echo "[deploy] After-install complete."
