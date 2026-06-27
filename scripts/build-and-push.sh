#!/usr/bin/env bash
# Build and push the unified Smart Home Health image to a registry as a
# multi-arch (amd64 + arm64) manifest.
#
# Usage:
#   VERSION=0.1.0 scripts/build-and-push.sh
#   (override the default repo with IMAGE=othernamespace/repo)
#
# Env:
#   IMAGE      registry/repo (default: smarthomehealth/platform)
#   VERSION    image tag (default: `git describe` or `latest`)
#   PLATFORMS  default linux/amd64,linux/arm64
#   PUSH       set to 0 to build without pushing (loads amd64 locally instead)
set -euo pipefail
cd "$(dirname "$0")/.."

IMAGE="${IMAGE:-smarthomehealth/platform}"
VERSION="${VERSION:-$(git describe --tags --always --dirty 2>/dev/null || echo latest)}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
PUSH="${PUSH:-1}"

# Ensure a buildx builder capable of multi-arch exists.
if ! docker buildx inspect shh-builder >/dev/null 2>&1; then
  docker buildx create --name shh-builder --driver docker-container --use >/dev/null
else
  docker buildx use shh-builder
fi
# QEMU for cross-arch emulation (no-op if already registered).
docker run --privileged --rm tonistiigi/binfmt --install all >/dev/null 2>&1 || true

echo "[build] $IMAGE:$VERSION  ($PLATFORMS)"

if [ "$PUSH" = "1" ]; then
  docker buildx build --platform "$PLATFORMS" \
    -t "$IMAGE:$VERSION" -t "$IMAGE:latest" \
    --push .
  echo "[build] pushed $IMAGE:$VERSION and $IMAGE:latest"
else
  # Can't --load a multi-arch manifest; build the host arch only for local test.
  docker buildx build --load -t "$IMAGE:$VERSION" .
  echo "[build] loaded $IMAGE:$VERSION locally (single-arch, not pushed)"
fi
