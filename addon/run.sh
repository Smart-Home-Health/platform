#!/usr/bin/with-contenv bashio
# Smart Home Health — Home Assistant add-on entrypoint.
# Brings up the bundled PostgreSQL/TimescaleDB cluster (persisted under /data),
# then runs migrations and serves the unified FastAPI/SPA app.
set -e

PG_VERSION=15
PGBIN="/usr/lib/postgresql/${PG_VERSION}/bin"
export PGDATA="/data/pgdata"
APPDATA="/data/appdata"

# --- Options -> environment --------------------------------------------------
# Read options straight from /data/options.json (the Supervisor writes the user's
# config there). This works both under HA and in a bare `docker run` smoke test,
# and avoids depending on the Supervisor API that bashio::config now uses.
OPTIONS=/data/options.json
opt()      { jq -r --arg k "$1" '.[$k] // empty'  "${OPTIONS}" 2>/dev/null; }
opt_true() { [ "$(jq -r --arg k "$1" '.[$k] // false' "${OPTIONS}" 2>/dev/null)" = "true" ]; }

# JWT secret: use the configured value, else generate once and persist so issued
# tokens survive add-on restarts (the app refuses to start without a strong one).
JWT_SECRET="$(opt jwt_secret)"
if [ -z "${JWT_SECRET}" ]; then
    if [ ! -s /data/jwt_secret ]; then
        python3 -c "import secrets; print(secrets.token_hex(32))" > /data/jwt_secret
    fi
    JWT_SECRET="$(cat /data/jwt_secret)"
fi
export JWT_SECRET_KEY="${JWT_SECRET}"

if opt_true skip_account_password; then
    export SHH_SKIP_ACCOUNT_PASSWORD=1
fi

export MIN_SPO2="$(opt min_spo2)"
export MAX_SPO2="$(opt max_spo2)"
export MIN_BPM="$(opt min_bpm)"
export MAX_BPM="$(opt max_bpm)"

export STATIC_DIR="/app/static"
export DATABASE_URL="postgresql://shh@127.0.0.1:5432/shh"

# Persist uploaded artifacts (vent tarballs, epic docs, clips) under /data too.
mkdir -p "${APPDATA}"
export INTEGRATIONS_DATA_DIR="${APPDATA}"
export FRIGATE_CLIPS_DIR="${APPDATA}/clips"
export EPIC_DOCS_DIR="${APPDATA}/epic_docs"

# --- First-run init of the bundled cluster -----------------------------------
if [ ! -s "${PGDATA}/PG_VERSION" ]; then
    bashio::log.info "Initializing PostgreSQL data directory at ${PGDATA}..."
    mkdir -p "${PGDATA}"
    chown -R postgres:postgres "$(dirname "${PGDATA}")" "${PGDATA}"
    su postgres -c "${PGBIN}/initdb -D ${PGDATA} --encoding=UTF8 --auth=trust"

    # Enable TimescaleDB (must be a preloaded library) and bind to loopback only.
    {
        echo "shared_preload_libraries = 'timescaledb'"
        echo "listen_addresses = '127.0.0.1'"
    } >> "${PGDATA}/postgresql.conf"
    # Loopback-only, in-container trust auth (no external exposure).
    {
        echo "local   all all          trust"
        echo "host    all all 127.0.0.1/32 trust"
        echo "host    all all ::1/128      trust"
    } > "${PGDATA}/pg_hba.conf"

    bashio::log.info "Creating role + database..."
    su postgres -c "${PGBIN}/pg_ctl -D ${PGDATA} -w start"
    su postgres -c "${PGBIN}/psql -v ON_ERROR_STOP=1 -c \"CREATE ROLE shh LOGIN SUPERUSER;\""
    su postgres -c "${PGBIN}/createdb -O shh shh"
    su postgres -c "${PGBIN}/pg_ctl -D ${PGDATA} -w stop"
fi

# Ownership can drift across add-on updates; keep it correct.
chown -R postgres:postgres "${PGDATA}"

# --- Start PostgreSQL in the background --------------------------------------
bashio::log.info "Starting PostgreSQL..."
su postgres -c "${PGBIN}/postgres -D ${PGDATA}" &
PG_PID=$!

# Stop Postgres cleanly when the add-on is stopped.
term() {
    bashio::log.info "Shutting down..."
    su postgres -c "${PGBIN}/pg_ctl -D ${PGDATA} -m fast -w stop" || true
    kill "${APP_PID}" 2>/dev/null || true
    exit 0
}
trap term SIGTERM SIGINT

# Wait for it to accept connections.
bashio::log.info "Waiting for PostgreSQL to accept connections..."
for _ in $(seq 1 60); do
    if su postgres -c "${PGBIN}/pg_isready -h 127.0.0.1 -q"; then break; fi
    sleep 1
done

# --- Migrate + serve ---------------------------------------------------------
cd /app
bashio::log.info "Running migrations (alembic upgrade head)..."
alembic upgrade head

bashio::log.info "Starting Smart Home Health on :8000 (ingress)..."
uvicorn main:app --host 0.0.0.0 --port 8000 &
APP_PID=$!

# Keep the script alive; if either process exits, stop the add-on.
wait -n "${PG_PID}" "${APP_PID}"
term
