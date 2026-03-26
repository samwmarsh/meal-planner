#!/bin/bash
set -e

echo "[deploy] Running before-install..."

# Backup .env if it exists (CodeDeploy overwrites the entire directory)
if [ -f /home/ec2-user/meal-planner/.env ]; then
  cp /home/ec2-user/meal-planner/.env /home/ec2-user/.env.deploy-backup
  echo "[deploy] Backed up .env"
fi
