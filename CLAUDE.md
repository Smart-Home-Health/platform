# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the stack

The canonical dev environment is Docker Compose. The compose file mounts `./backend` and `./frontend` into the containers and runs both with hot-reload.

```bash
docker compose up -d              # Start db + backend + frontend
docker compose logs -f backend    # Tail backend logs (FastAPI/uvicorn --reload)
docker compose logs -f frontend   # Tail Vite dev server
docker compose restart backend    # After changes that don't hot-reload (e.g. requirements.txt)
```

Services and ports:
- Frontend (Vite): http://localhost:5173
- Backend (FastAPI): http://localhost:8000 — Swagger at `/docs`
- Postgres: localhost:5432, db `shh`, user `shh_user`, pass `shh_dev_pass`

The backend container's startup command is `alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port 8000 --reload`, so migrations always run before the API starts.

### Database migrations

Alembic lives in `backend/alembic/`. Generate and apply migrations from inside the backend container (or with the same env):

```bash
docker compose exec backend alembic revision --autogenerate -m "description"
docker compose exec backend alembic upgrade head
docker compose exec backend alembic downgrade -1
```

Note that some ORM models live in `backend/models/` and others in `backend/schemas/` (see "Models vs schemas" below). Both packages are imported by `models/__init__.py`, which is what Alembic's metadata sees. **A new model must be re-exported from `models/__init__.py` or autogenerate will not see it.**

### Frontend

```bash
cd frontend
npm run dev      # Vite dev server (also runs in container)
npm run build    # Production build
npm run lint     # ESLint
```

There is no test runner configured in either `backend/` or `frontend/` — do not invent test commands.

## Architecture

### Event-driven backend

The backend is built around a central in-process `EventBus` (`backend/bus.py`) with three modules subscribing to it (`backend/modules/`):

- **StateModule** — owns the in-memory `sensor_state` snapshot
- **WebSocketModule** — fans state changes out to browser clients on `/ws/sensors`
- **MQTTModule** — bridges to the MQTT broker

Three input paths converge on the bus, all producing `SensorUpdate` events (`backend/events.py`):

1. **External readers** publish via MQTT → `MQTTModule` → bus (with `source=EventSource.MQTT`)
2. **Manual entry** via REST → DB write → `publish_specific_vital_to_mqtt()` → MQTT broker
3. **Legacy serial input** is bridged into the bus via `mqtt_update_bridge` in `main.py`

**MQTT loop prevention:** when an update originated from MQTT, do not re-publish it. The legacy `update_sensor()` API takes a `from_mqtt=True` flag; the new `MQTTModule` checks `event.source` before publishing. Breaking this invariant creates infinite republish loops.

Note: serial/GPIO device access has been moved out of this repo to the external `shh-reader` app — the device mappings in `docker-compose.yml` are commented out for that reason.

### REST routes

Routes live in `backend/routes/<feature>.py` and are registered in `backend/main.py`. Each module exposes a `router = APIRouter(prefix="/api/<feature>", tags=[...])` and is included via `app.include_router(...)`.

**Trailing-slash pitfall (real bug we hit):** if a route is declared `@router.post("")` (the common pattern for collection endpoints), the path is `/api/foo` with no trailing slash. The frontend MUST POST to `/api/foo`, not `/api/foo/`. FastAPI returns `307 Temporary Redirect` on the slash mismatch, and Chrome will not follow a 307 for a CORS POST with `credentials: 'include'` — the request silently dies with no console error and no backend log beyond the 307. When debugging "save just sits there" symptoms, check `docker compose logs backend` for `307 Temporary Redirect`.

### Authentication

`backend/middleware.py` (`AuthenticationMiddleware`) is registered as the *innermost* middleware (CORS wraps it so 401s still get CORS headers). It validates a JWT in the `session_token` cookie or `Authorization: Bearer` header. There is also a longer-lived `account_token` cookie that keeps the user at the user-select stage instead of bouncing back to password login when the session expires.

Public routes are an allowlist in `middleware.py`. WebSocket paths under `/ws/` and `/api/readers/ws/` are public — reader devices authenticate via a per-device encryption key after the WS connect.

Permission-gated endpoints use `Depends(require_permission("namespace.action"))`. Default roles and permissions are seeded on startup by `seed_auth.seed_default_data()`.

### Models vs schemas (historical split)

ORM classes are split across two packages for historical reasons:

- `backend/models/` — newer modules (users, readers, schedule, etc.)
- `backend/schemas/` — older modules (patients, vitals, medications, equipment, symptoms, etc.) — despite the name, these are SQLAlchemy ORM classes, NOT Pydantic schemas

When adding a new model, prefer `backend/models/` and remember to import it from `models/__init__.py` so Alembic autogenerate picks it up.

Pydantic request/response models are typically defined inline at the top of each `routes/<feature>.py` file.

### Integrations

Third-party data sources (Withings, manual entry, generic MQTT) implement `BaseIntegration` in `backend/integrations/` and self-register via `IntegrationRegistry` in `integrations/registry.py`. Routes are exposed under `/api/integrations`.

### Frontend structure

- `src/App.jsx` — routing and providers
- `src/contexts/` — `AuthContext`, `PatientContext` (end-user patient selection), `AdminPatientContext` (admin's selected patient, separate from user-facing one)
- `src/pages/admin/` — **legacy** admin UI, still routed but being replaced
- `src/pages/admin-v2/` — **current** admin UI; this is where new admin work goes
- `src/services/` — small REST wrappers (patients, settings, users)
- `src/config.js` — exports `apiUrl`, `wsUrl`, and `apiFetch()`

`config.js` resolves the API URL at runtime from `window.location.hostname` so the app works when accessed from a phone or other LAN device (e.g. `http://192.168.1.184:5173`). The CORS regex in `main.py` matches `localhost`, `127.0.0.1`, and RFC1918 ranges accordingly — keep that in sync if you change network assumptions.

`apiFetch()` is a `fetch` wrapper that auto-attaches an `Authorization: Bearer` header from `sessionStorage` when running inside a cross-origin iframe (Home Assistant embedding), where SameSite cookies are blocked. Prefer it over raw `fetch` for authenticated calls.

### Real-time updates

Frontend opens a WebSocket to `${wsUrl}` (derived from API URL → `/ws/sensors`) and listens for `sensor_update` messages broadcast by `WebSocketModule`. Reader devices use a separate `/api/readers/ws/...` channel.
