#!/usr/bin/env bash
# Build (and optionally push) the Home Assistant add-on image.
#
# The add-on bundles Postgres/TimescaleDB + the unified app, so the build context
# is the REPO ROOT (the Dockerfile needs backend/ and frontend/). Per HA add-on
# convention we publish arch-prefixed images that addon/config.yaml references.
#
#   scripts/build-addon.sh                 # build + push amd64 & aarch64
#   PUSH=false scripts/build-addon.sh      # build locally (loads amd64 only)
#   REGISTRY=ghcr.io/me VERSION=0.2.0 scripts/build-addon.sh
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root = build context

REGISTRY="${REGISTRY:-ghcr.io/smart-home-health}"
VERSION="${VERSION:-$(grep -m1 '^version:' addon/config.yaml | sed -E 's/.*"(.*)".*/\1/')}"
PUSH="${PUSH:-true}"

# arch -> "HA base image|buildx platform"
ARCHES=(
  "amd64|ghcr.io/home-assistant/amd64-base-debian:bookworm|linux/amd64"
  "aarch64|ghcr.io/home-assistant/aarch64-base-debian:bookworm|linux/arm64"
)

for entry in "${ARCHES[@]}"; do
  IFS='|' read -r arch base platform <<<"${entry}"
  img="${REGISTRY}/${arch}-addon"
  echo "==> ${img}:${VERSION}  (${platform})"
  out_flag="--load"
  [ "${PUSH}" = "true" ] && out_flag="--push"
  docker buildx build \
    --platform "${platform}" \
    --build-arg "BUILD_FROM=${base}" \
    -f addon/Dockerfile \
    -t "${img}:${VERSION}" -t "${img}:latest" \
    "${out_flag}" \
    .
done

echo "Done. Images tagged ${VERSION} + latest under ${REGISTRY}."
