#!/bin/sh
# Smart Home Health Hub — unified image entrypoint.
# Waits for the database to accept connections (so a `docker run` against a cold
# or still-initializing DB doesn't crash-loop), runs migrations, then serves.
set -e

echo "[entrypoint] waiting for database..."
python - <<'PY'
import os, sys, time
import psycopg2

url = os.environ.get("DATABASE_URL")
if not url:
    sys.exit("[entrypoint] DATABASE_URL is not set")

deadline = time.time() + int(os.environ.get("DB_WAIT_SECONDS", "60"))
while True:
    try:
        psycopg2.connect(url).close()
        print("[entrypoint] database is ready")
        break
    except Exception as e:  # noqa: BLE001 - any connect failure means "not ready yet"
        if time.time() > deadline:
            sys.exit(f"[entrypoint] database not ready in time: {e}")
        time.sleep(1)
PY

echo "[entrypoint] running migrations (alembic upgrade head)..."
alembic upgrade head

echo "[entrypoint] starting uvicorn..."
# exec so uvicorn becomes PID 1 and receives stop signals directly.
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
