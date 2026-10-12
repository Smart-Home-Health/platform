#!/usr/bin/env bash
# Boot a prebuilt add-on against a new disposable volume, with no host mounts,
# published ports, Supervisor token, or outbound network. Never pass live data.
# Usage: bash scripts/smoke-addon.sh shh-addon-rehearsal:<commit>
set -euo pipefail

image="${1:?Pass the prebuilt add-on image to smoke test}"
container="shh-addon-smoke-${GITHUB_RUN_ID:-local}-$$"
volume="${container}-data"

cleanup() {
  local result=$?
  if [ "$result" -ne 0 ]; then
    docker logs "$container" >&2 || true
  fi
  docker rm --force "$container" >/dev/null 2>&1 || true
  docker volume rm "$volume" >/dev/null 2>&1 || true
  return "$result"
}
trap cleanup EXIT

docker volume create "$volume" >/dev/null
# The Supervisor normally creates this file. Include numeric options because
# run.sh exports missing values as empty strings rather than applying defaults.
docker run --rm --network none --entrypoint /bin/sh \
  --mount "type=volume,source=${volume},target=/data" -i "$image" \
  -c 'cat > /data/options.json' <<'JSON'
{"jwt_secret":"","skip_account_password":false,"ha_identity_login":true,"min_spo2":90,"max_spo2":100,"min_bpm":55,"max_bpm":155,"log_level":"info"}
JSON

docker run --detach --name "$container" --network none \
  --mount "type=volume,source=${volume},target=/data" "$image" >/dev/null
wait_until_ready() {
  test "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$container")" = none
  for _ in $(seq 1 90); do
    if docker exec "$container" python3 -c \
      'import json, urllib.request; assert json.load(urllib.request.urlopen("http://127.0.0.1:8000/api/status/health", timeout=2))["status"] == "healthy"' \
      >/dev/null 2>&1; then
      return 0
    fi
    if [ "$(docker inspect --format '{{.State.Running}}' "$container")" != true ]; then
      echo 'The add-on exited before becoming healthy.' >&2
      return 1
    fi
    sleep 2
  done
  echo 'The add-on did not become healthy within the smoke-test deadline.' >&2
  return 1
}

verify_state() {
  docker exec -i -e "SMOKE_PHASE=$1" "$container" python3 - <<'PY'
import hashlib
import json
import os
from pathlib import Path
import re
from urllib.parse import urljoin
from urllib.request import Request, urlopen

from alembic.config import Config
from alembic.script import ScriptDirectory
import psycopg2

base = "http://127.0.0.1:8000"
with urlopen(base + "/api/auth/first-run", timeout=5) as response:
    first_run = json.load(response)
assert first_run["is_first_run"] is True and first_run["has_admin"] is False
with urlopen(base + "/", timeout=5) as response:
    html = response.read().decode()
assert '<div id="root">' in html
asset = re.search(r'<script\b[^>]*\bsrc="([^"]+)"', html)
assert asset, "Built SPA has no script asset"
with urlopen(urljoin(base + "/", asset.group(1)), timeout=5) as response:
    assert response.status == 200 and response.read(1)
request = Request(base + "/", headers={"X-Ingress-Path": "/api/hassio_ingress/smoke"})
with urlopen(request, timeout=5) as response:
    ingress_html = response.read().decode()
assert '<base href="/api/hassio_ingress/smoke/">' in ingress_html
assert 'window.__BASE_PATH__ = "/api/hassio_ingress/smoke"' in ingress_html

# docker exec does not inherit the environment run.sh sets for uvicorn.
# Connect explicitly; inspect bundled migration scripts without running them.
heads = set(ScriptDirectory.from_config(Config("/app/alembic.ini")).get_heads())
with psycopg2.connect("postgresql://shh@127.0.0.1:5432/shh") as connection:
    with connection.cursor() as cursor:
        cursor.execute("SELECT version_num FROM alembic_version")
        assert {row[0] for row in cursor.fetchall()} == heads
        cursor.execute("SELECT count(*) FROM patients")
        assert cursor.fetchone()[0] == 0
        cursor.execute("SELECT count(*) FROM pg_extension WHERE extname = 'timescaledb'")
        assert cursor.fetchone()[0] == 1
secret = Path("/data/jwt_secret").read_bytes().strip()
assert len(secret) >= 32
digest = hashlib.sha256(secret).digest()
digest_file = Path("/data/.smoke-signing-secret-digest")
phase = os.environ["SMOKE_PHASE"]
if phase == "initial":
    digest_file.write_bytes(digest)
else:
    assert digest_file.read_bytes() == digest, "Signing secret changed across restart"
print(phase + " add-on smoke passed; database heads: " + ", ".join(sorted(heads)))
PY
}

wait_until_ready
verify_state initial
docker restart --time 30 "$container" >/dev/null
wait_until_ready
verify_state restarted
