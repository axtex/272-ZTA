#!/usr/bin/env bash

# Run this once on a fresh EC2 Ubuntu 24.04 instance
# chmod +x scripts/ec2-setup.sh && ./scripts/ec2-setup.sh

set -e

echo "==> Updating apt packages"
sudo apt update -y
sudo apt upgrade -y

echo "==> Installing Docker (official convenience script)"
curl -fsSL https://get.docker.com | sudo sh

echo "==> Adding ubuntu user to docker group"
sudo usermod -aG docker ubuntu

echo "==> Installing Docker Compose plugin"
sudo apt install -y docker-compose-plugin

echo "==> Installing nginx"
sudo apt install -y nginx

echo "==> Enabling and starting docker + nginx services"
sudo systemctl enable --now docker
sudo systemctl enable --now nginx

echo ""
echo "✅ EC2 setup complete."
echo ""
echo "Next steps:"
echo "1) Log out and back in (or reconnect SSH) so docker group changes apply."
echo "2) Upload/clone your repo onto the instance."
echo "3) Create ./backend/.env and ./frontend/.env on the instance."
echo "4) Run: docker compose up -d --build"
