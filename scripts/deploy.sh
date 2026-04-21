#!/usr/bin/env bash

# Run this on EC2 to deploy latest changes
# chmod +x scripts/deploy.sh && ./scripts/deploy.sh

set -e

PROJECT_DIR="${PROJECT_DIR:-$HOME/hospital-zero-trust}"

echo "==> Changing to project directory: ${PROJECT_DIR}"
cd "$PROJECT_DIR"

echo "==> Pulling latest code (origin main)"
git pull origin main

echo "==> Stopping existing containers"
docker compose down

echo "==> Building and starting containers"
docker compose up -d --build

echo "==> Running Prisma migrations"
docker compose exec -T backend npx prisma migrate deploy

echo "==> Container status"
docker compose ps

echo "==> Public URL"
echo "App running at http://$(curl -s ifconfig.me)"
