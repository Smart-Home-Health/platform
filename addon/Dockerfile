# Home Assistant add-on image: bundles PostgreSQL + TimescaleDB and the unified
# FastAPI/SPA app in one container.
#
# IMPORTANT: build with the REPO ROOT as context (not addon/), so the COPY lines
# below can reach backend/ and frontend/:
#   docker build -f addon/Dockerfile --build-arg BUILD_FROM=<ha-base> -t shh-addon .
# Multi-arch convenience wrapper: scripts/build-addon.sh

# Global build arg (must be declared before the first FROM so the stage-2 FROM
# below can reference it). Overridden per-arch by scripts/build-addon.sh / CI.
ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base-debian:bookworm

# --- Stage 1: build the SPA (same as the root Dockerfile) -------------------
FROM node:20-alpine AS frontend
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Produces /fe/dist with relative asset URLs (vite base './') so the injected
# <base href> (HA ingress prefix) governs where they load from.
RUN npm run build

# --- Stage 2: HA base + Postgres/TimescaleDB + Python runtime ----------------
FROM ${BUILD_FROM}

LABEL org.opencontainers.image.licenses="AGPL-3.0-or-later" \
      org.opencontainers.image.source="https://github.com/Smart-Home-Health/platform"

ENV TZ=UTC \
    PYTHONUNBUFFERED=1 \
    STATIC_DIR=/app/static \
    PIP_BREAK_SYSTEM_PACKAGES=1

# PostgreSQL 15 + TimescaleDB from the PGDG + Timescale apt repos, plus Python.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl gnupg \
    && install -d /usr/share/keyrings \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
        | gpg --dearmor -o /usr/share/keyrings/pgdg.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list \
    && curl -fsSL https://packagecloud.io/timescale/timescaledb/gpgkey \
        | gpg --dearmor -o /usr/share/keyrings/timescaledb.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/timescaledb.gpg] https://packagecloud.io/timescale/timescaledb/debian/ bookworm main" \
        > /etc/apt/sources.list.d/timescaledb.list \
    && apt-get update && apt-get install -y --no-install-recommends \
        postgresql-15 postgresql-client-15 timescaledb-2-postgresql-15 \
        python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps first for layer caching (psycopg2-binary/bcrypt/cryptography ship
# wheels for amd64 + arm64, so no toolchain needed).
COPY backend/requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Backend code + built SPA.
COPY backend/ ./
COPY --from=frontend /fe/dist ./static

# Add-on startup (brings up bundled Postgres, then the app).
COPY addon/run.sh /run.sh
RUN chmod a+x /run.sh

# s6-overlay (from the HA base image) runs this CMD as the main service.
CMD [ "/run.sh" ]
