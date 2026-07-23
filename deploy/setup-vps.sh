#!/usr/bin/env bash
# One-time VPS bootstrap. Run as root: sudo bash deploy/setup-vps.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "This script must run as root: sudo bash deploy/setup-vps.sh" >&2
  exit 1
fi

APP_USER="${APP_USER:-claude}"

echo "==> Installing Docker CE from the official repository..."
if ! command -v docker >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
    $(. /etc/os-release && echo "$VERSION_CODENAME") stable" >/etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
  echo "    Docker already installed, skipping."
fi

systemctl enable --now docker

echo "==> Adding $APP_USER to the docker group..."
usermod -aG docker "$APP_USER"

echo "==> Creating 2G swap (build safety on 1 vCPU / 4GB)..."
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
else
  echo "    Swap already active, skipping."
fi

echo "==> Configuring firewall (SSH stays open)..."
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo
echo "Bootstrap complete."
echo "NOTE: $APP_USER must start a new session (re-login) for the docker group to apply."
