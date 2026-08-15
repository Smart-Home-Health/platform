#!/usr/bin/env bash
# Deploy a DEV build of the HA add-on to a development Home Assistant box.
#
#   bash scripts/addon-dev-deploy.sh [ssh-host]     # default: wakey-dev
#
# The add-on image must be built from the REPO ROOT (it needs backend/ and
# frontend/), so Supervisor can't build it as a local add-on. Instead we:
#   1. buildx an amd64 image tagged :dev and push it to GHCR (public package,
#      Supervisor pulls anonymously; `docker login ghcr.io` first if needed),
#   2. copy addon/ to /addons/smart_home_health/ on the HA host with the
#      version rewritten to "dev" so Supervisor resolves ...-addon:dev,
#   3. reload the store; install or update the local add-on.
#
# Never point this at production HA. The default host is the wakey-dev VM.
set -euo pipefail

cd "$(dirname "$0")/.."

HOST="${1:-wakey-dev}"
REGISTRY="${REGISTRY:-ghcr.io/smart-home-health}"
IMAGE="${REGISTRY}/amd64-addon:dev"
SLUG_DIR="/addons/smart_home_health"

if [ "${HOST}" = "hcc-ha" ]; then
  echo "Refusing to deploy a dev build to hcc-ha (production)." >&2
  exit 1
fi

echo "[dev-deploy] Building ${IMAGE} (repo-root context)..."
docker buildx build \
  --platform linux/amd64 \
  --build-arg BUILD_FROM=ghcr.io/home-assistant/amd64-base-debian:bookworm \
  -f addon/Dockerfile \
  -t "${IMAGE}" \
  --push \
  .

echo "[dev-deploy] Staging addon/ to ${HOST}:${SLUG_DIR} (version -> dev)..."
STAGE="$(mktemp -d)"
trap 'rm -rf "${STAGE}"' EXIT
cp -r addon/. "${STAGE}/"
# Local add-on identity: version "dev" makes Supervisor use the :dev image tag.
sed -i 's/^version: .*/version: "dev"/' "${STAGE}/config.yaml"
# tar over ssh — rsync isn't guaranteed on the HA SSH add-on.
ssh "${HOST}" "mkdir -p ${SLUG_DIR}"
tar -C "${STAGE}" -cf - . | ssh "${HOST}" "tar -C ${SLUG_DIR} -xf -"

echo "[dev-deploy] Reloading store + installing/updating..."
# `ha` needs the login-shell env for its API token on the SSH add-on.
ssh "${HOST}" 'bash -lc "ha store reload"'
sleep 3
if ssh "${HOST}" 'bash -lc "ha addons info local_smart_home_health"' >/dev/null 2>&1; then
  ssh "${HOST}" 'bash -lc "ha addons update local_smart_home_health || true; ha addons rebuild local_smart_home_health || true; ha addons restart local_smart_home_health"'
else
  ssh "${HOST}" 'bash -lc "ha addons install local_smart_home_health && ha addons start local_smart_home_health"'
fi

echo "[dev-deploy] Done. Logs: ssh ${HOST} 'bash -lc \"ha addons logs local_smart_home_health\"'"
