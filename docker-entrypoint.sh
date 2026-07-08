#!/bin/sh
# Smart Home Health — unified image entrypoint.
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

echo "[entrypoint] starting server (serve.py supervisor)..."
# serve.py runs HTTP :8000 plus, when a certificate is installed, HTTPS :8443
# in the same process. exec so it becomes PID 1 and receives stop signals.
exec python serve.py
