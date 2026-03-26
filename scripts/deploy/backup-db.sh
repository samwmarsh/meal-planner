#!/bin/bash
# Nightly database backup — add to crontab:
# 0 3 * * * /home/ec2-user/meal-planner/scripts/deploy/backup-db.sh >> /home/ec2-user/backups/cron.log 2>&1
set -e

BACKUP_DIR=/home/ec2-user/backups
COMPOSE_FILE=/home/ec2-user/meal-planner/docker-compose.yml
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

echo "[backup] Starting database backup at $(date)..."

# pg_dump from the running PostgreSQL container
docker compose -f "$COMPOSE_FILE" exec -T db \
  pg_dumpall -U mealplanner > "$BACKUP_DIR/db_$TIMESTAMP.sql"

# Compress the backup
gzip "$BACKUP_DIR/db_$TIMESTAMP.sql"

# Keep only last 7 days of backups
find "$BACKUP_DIR" -name "db_*.sql.gz" -mtime +7 -delete

echo "[backup] Completed: $BACKUP_DIR/db_${TIMESTAMP}.sql.gz ($(du -h "$BACKUP_DIR/db_${TIMESTAMP}.sql.gz" | cut -f1))"
