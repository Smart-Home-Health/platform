#!/usr/bin/env bash
# Backend API test gate. Spins up an ephemeral Timescale DB, runs the pytest
# suite in a one-shot container, and exits non-zero on failure.
#
# Run this before building the new (unified) Docker image:
#   bash scripts/run_tests.sh
set -uo pipefail

cd "$(dirname "$0")/.."

# Dedicated project name so this stack is isolated from the dev stack — without
# it, `down --remove-orphans` would treat the running dev containers (same
# default project name / directory) as orphans and remove them.
COMPOSE="docker compose -p shh_test -f docker-compose.test.yml"

cleanup() { $COMPOSE down -v --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "[run_tests] Building image + running backend test suite..."
$COMPOSE up --build --abort-on-container-exit --exit-code-from tests
code=$?

if [ "$code" -eq 0 ]; then
  echo "[run_tests] ✅ tests passed"
else
  echo "[run_tests] ❌ tests failed (exit $code)"
fi
exit $code
