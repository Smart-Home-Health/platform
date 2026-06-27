# Unified production image: builds the SPA, then serves it + the API from one
# FastAPI/uvicorn process. The database stays a separate container.
#
# Multi-arch build + publish (amd64 + arm64):  scripts/build-and-push.sh
# Single local build:                          docker build -t shh-app .
# (Local dev still uses the split, hot-reload docker-compose.yml.)

# --- Stage 1: build the frontend -------------------------------------------
FROM node:20-alpine AS frontend
WORKDIR /fe
# Install deps against the lockfile first for layer caching.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Produces /fe/dist (index.html, assets/, SciChart *.wasm).
RUN npm run build

# --- Stage 2: python runtime that serves API + built SPA --------------------
FROM python:3.11-slim
# OCI provenance. The source label matters for AGPL-3.0: network users are
# entitled to the corresponding source, so it must be discoverable from the image.
LABEL org.opencontainers.image.title="Smart Home Health Hub" \
      org.opencontainers.image.description="Unified image: FastAPI backend + built SPA frontend (DB runs separately)." \
      org.opencontainers.image.source="https://github.com/Smart-Home-Health/platform" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later"
ENV TZ=UTC \
    PYTHONUNBUFFERED=1 \
    STATIC_DIR=/app/static
WORKDIR /app

# Only curl is needed at runtime (healthcheck). All Python deps install from
# prebuilt wheels (psycopg2-binary, bcrypt, cryptography) on amd64 AND arm64,
# so no gcc/toolchain is required; backup/restore is pure-Python (no pg_dump).
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Python deps first for caching.
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Backend application code + the startup entrypoint.
COPY backend/ ./
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Built frontend from stage 1 -> served by FastAPI when STATIC_DIR is set.
COPY --from=frontend /fe/dist ./static

# Run as an unprivileged user. /app/data holds uploaded artifacts + integration
# data (vent tarballs, epic_docs, clips) so it must be writable by that user.
RUN useradd --uid 10001 --create-home --home-dir /home/app --shell /usr/sbin/nologin app \
    && mkdir -p /app/data \
    && chown -R app:app /app/data
USER app

EXPOSE 8000

# Public liveness endpoint; start-period covers DB wait + `alembic upgrade head`.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fsS http://localhost:8000/api/status/health || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
