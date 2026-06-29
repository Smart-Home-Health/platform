# Smart Home Health
# Copyright (C) 2026 John Carty
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.
import threading
import asyncio
import json  # Add this import
import logging
import os
from typing import Optional
import mimetypes
import re
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse
from dotenv import load_dotenv
from datetime import datetime

# Load .env BEFORE importing modules that capture secrets at import time
# (middleware.py / routes/auth.py read JWT_SECRET_KEY when imported).
load_dotenv()

# Fail fast on a missing/insecure JWT secret. The fallback default in
# middleware.py / routes/auth.py is a value baked into (AGPL, public) source, so
# running with it would let anyone forge auth tokens for any user. Require a real
# secret in the environment (backend/.env). Generate one with:
#   python -c "import secrets; print(secrets.token_urlsafe(64))"
_INSECURE_JWT_DEFAULT = "change-this-secret-key-in-production"
_jwt_secret = os.getenv("JWT_SECRET_KEY")
if not _jwt_secret or _jwt_secret == _INSECURE_JWT_DEFAULT:
    raise RuntimeError(
        "JWT_SECRET_KEY is unset or set to the insecure default. Set a strong "
        "value in the environment (e.g. backend/.env). Generate one with: "
        "python -c \"import secrets; print(secrets.token_urlsafe(64))\""
    )

# Import event bus and events
from bus import EventBus
from events import SensorUpdate, EventSource

# Import modules
from modules.websocket_module import WebSocketModule
from modules.mqtt_module import MQTTModule
from modules.state_module import StateModule

# Import route modules
from routes import core, settings, vitals, medications, care_tasks, equipment, monitoring, mqtt, status, patients, nutrition, businesses, providers, auth, users, schedule, dashboard, symptoms, diagnoses, implants, dme_shipments, account, integrations, integration_imports, frigate as frigate_routes, readers, backup, analysis, reports, messages, system

# Import legacy components
from mqtt import initialize_mqtt_service, shutdown_mqtt_service
from db import get_db
from crud.settings import get_setting, save_setting

# Import auth components
from middleware import AuthenticationMiddleware
from rate_limit import RateLimitMiddleware
from seed_auth import seed_default_data

# Install the global soft-delete filter so undone (voided) completion logs are
# excluded from every read path. Imported after the route modules above so all
# ORM models are registered first.
from soft_delete import register_soft_delete_filter
register_soft_delete_filter()

# Initialize a logger for your application
logger = logging.getLogger("app")

# Configure logging
logging.basicConfig(level=logging.INFO)

# FastAPI app setup
app = FastAPI()

# Middleware is a stack: last-added = outermost (runs first).
# CORS must be outermost so ALL responses (including auth 401s/429s) get CORS headers.
# Order: CORS (outer) -> RateLimit -> Auth (inner). RateLimit runs before auth so
# public login routes are throttled, but inside CORS so 429s carry CORS headers.
app.add_middleware(AuthenticationMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[],  # No wildcard when credentials=True
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Register route modules
app.include_router(auth.router)  # Auth routes first (public)
app.include_router(account.router)  # Account management
app.include_router(core.router)
app.include_router(settings.router)
app.include_router(vitals.router)
app.include_router(medications.router)
app.include_router(care_tasks.router)
app.include_router(equipment.router)
app.include_router(monitoring.router)
app.include_router(mqtt.router)
app.include_router(status.router)
app.include_router(patients.router)
app.include_router(nutrition.router)
app.include_router(businesses.router)
app.include_router(providers.router)
app.include_router(users.router)
app.include_router(schedule.router)
app.include_router(dashboard.router)
app.include_router(symptoms.router)
app.include_router(diagnoses.router)
app.include_router(implants.router)
app.include_router(dme_shipments.router)
app.include_router(integrations.router)
app.include_router(integration_imports.router)
app.include_router(frigate_routes.router)
app.include_router(readers.router)
app.include_router(backup.router)
app.include_router(analysis.router)
app.include_router(reports.router)
app.include_router(messages.router)
app.include_router(system.router)

# --- Static frontend (unified single-image deploy) --------------------------
# In the unified production image the built SPA is copied in and STATIC_DIR
# points at it; this app then serves the frontend on the same origin as the API
# (no separate Vite/nginx container). In split dev STATIC_DIR is unset, so none
# of this registers and the backend behaves exactly as before — Vite serves the
# frontend on :5173 and proxies /api + /ws here.
#
# This MUST come after every include_router() so the SPA catch-all is the
# lowest-priority route and never shadows an API endpoint.
mimetypes.add_type("application/wasm", ".wasm")
mimetypes.add_type("application/javascript", ".js")


# A real HA ingress path looks like "/api/hassio_ingress/<token>" — only slashes
# and URL-safe token chars. Anything else (quotes, <, >, backslashes, ...) is
# rejected so a directly-reachable backend can't be tricked into reflecting a
# crafted X-Ingress-Path header into the SPA shell (HTML/JS injection).
_INGRESS_PATH_RE = re.compile(r"\A/[A-Za-z0-9_./-]*\Z")


def inject_ingress_base(html: str, ingress_path: str) -> str:
    """Rewrite the SPA shell's <base> tag and window.__BASE_PATH__ to the Home
    Assistant ingress prefix so relative assets, the router, and API/WS URLs all
    resolve under HA's proxy path. `ingress_path` is the X-Ingress-Path header
    value (e.g. "/api/hassio_ingress/<token>"); "" (or anything that doesn't
    match the strict ingress-path shape) leaves the app at root."""
    base = (ingress_path or "").rstrip("/")
    if base and not _INGRESS_PATH_RE.match(base):
        base = ""
    # Use function replacements so `base` is treated as a literal, not an re.sub
    # template (no backslash/backreference interpretation).
    html = re.sub(r'<base\s+href="[^"]*"\s*/?>', lambda _m: f'<base href="{base}/">', html, count=1)
    html = re.sub(
        r'window\.__BASE_PATH__\s*=\s*"[^"]*"',
        lambda _m: f'window.__BASE_PATH__ = "{base}"',
        html,
        count=1,
    )
    return html


STATIC_DIR = os.getenv("STATIC_DIR")
if STATIC_DIR:
    STATIC_DIR = os.path.realpath(STATIC_DIR)
if STATIC_DIR and os.path.isdir(STATIC_DIR):
    _assets_dir = os.path.join(STATIC_DIR, "assets")
    if os.path.isdir(_assets_dir):
        # Hashed, immutable build assets get the efficient StaticFiles handler.
        app.mount("/assets", StaticFiles(directory=_assets_dir), name="assets")

    _index_file = os.path.join(STATIC_DIR, "index.html")
    # Read the shell once; the base path is injected per-request (it varies with
    # the HA ingress token).
    with open(_index_file, encoding="utf-8") as _f:
        _index_template = _f.read()

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str, request: Request):
        """Serve a real static file if one exists (favicon, *.wasm, ...),
        otherwise return the SPA shell (with the ingress base path injected) so
        client-side routing handles the path."""
        # Unknown /api or /ws paths are genuine 404s, not the SPA shell.
        if full_path.startswith(("api", "ws")):
            raise HTTPException(status_code=404)
        candidate = os.path.join(STATIC_DIR, full_path)
        # Guard against path traversal escaping STATIC_DIR.
        if full_path and os.path.isfile(candidate) and \
                os.path.commonpath([os.path.realpath(candidate), STATIC_DIR]) == STATIC_DIR:
            return FileResponse(candidate)
        html = inject_ingress_base(_index_template, request.headers.get("X-Ingress-Path", ""))
        return HTMLResponse(html)

    logger.info(f"[main] Serving static frontend from {STATIC_DIR}")

# Global event bus and modules
event_bus = EventBus(maxsize=1000)
websocket_module: Optional[WebSocketModule] = None
mqtt_module: Optional[MQTTModule] = None
state_module: Optional[StateModule] = None

# Legacy MQTT bridge for backward compatibility
def mqtt_update_bridge(*args, **kwargs):
    """
    Bridge legacy MQTT handler calls to the new event bus system.
    """
    # Pull out 'from_mqtt' if provided
    kwargs.pop("from_mqtt", None)

    values = {}
    raw = None

    if len(args) == 1 and isinstance(args[0], (list, tuple)) and all(isinstance(x, tuple) for x in args[0]):
        # List of pairs
        for k, v in args[0]:
            if k == "raw_data":
                raw = v
            else:
                values[k] = v
    else:
        # name, value, name, value ...
        it = iter(args)
        for k in it:
            try:
                v = next(it)
            except StopIteration:
                break
            if k == "raw_data":
                raw = v
            else:
                values[k] = v

    # Publish to the event bus thread-safely from MQTT thread/callbacks
    loop = asyncio.get_event_loop()
    fut = asyncio.run_coroutine_threadsafe(
        event_bus.publish(SensorUpdate(ts=datetime.now(), values=values, raw=raw, source=EventSource.MQTT)),
        loop
    )
    try:
        fut.result(timeout=1.0)
    except Exception as e:
        logger.exception("Failed to enqueue MQTT update on bus: %s", e)


@app.on_event("startup")
async def startup_event():
    global websocket_module, mqtt_module, state_module
    
    logger.info("[main] Starting event-driven backend system")
    
    # Get current event loop
    loop = asyncio.get_event_loop()
    
    # Initialize default settings if they don't exist
    db = next(get_db())

    # Device settings
    if get_setting(db, "device_name") is None:
        save_setting(db, "device_name", "Smart Home Health Monitor", "string", "Device name")

    if get_setting(db, "device_location") is None:
        save_setting(db, "device_location", "Bedroom", "string", "Device location")

    # Alert thresholds - use environment variables as defaults if available
    if get_setting(db, "min_spo2") is None:
        save_setting(db, "min_spo2", os.getenv("MIN_SPO2", 90), "int", "Minimum SpO2 threshold")

    if get_setting(db, "max_spo2") is None:
        save_setting(db, "max_spo2", os.getenv("MAX_SPO2", 100), "int", "Maximum SpO2 threshold")

    if get_setting(db, "min_bpm") is None:
        save_setting(db, "min_bpm", os.getenv("MIN_BPM", 55), "int", "Minimum heart rate threshold")

    if get_setting(db, "max_bpm") is None:
        save_setting(db, "max_bpm", os.getenv("MAX_BPM", 155), "int", "Maximum heart rate threshold")

    # Display settings
    if get_setting(db, "temp_unit") is None:
        save_setting(db, "temp_unit", "F", "string", "Temperature unit (F or C)")

    if get_setting(db, "weight_unit") is None:
        save_setting(db, "weight_unit", "lbs", "string", "Weight unit (lbs or kg)")

    if get_setting(db, "dark_mode") is None:
        save_setting(db, "dark_mode", True, "bool", "Dark mode enabled")

    # Seed default roles and permissions for authentication system
    try:
        seed_default_data(db)
        logger.info("[main] Default roles and permissions seeded")
    except Exception as e:
        logger.error(f"[main] Error seeding auth data: {e}")

    # Initialize modules
    
    # 1. State module (manages centralized state)
    state_module = StateModule(event_bus)
    await state_module.start_event_subscribers()
    logger.info("[main] State module initialized")
    
    # 2. WebSocket module (manages client connections)
    websocket_module = WebSocketModule(event_bus)
    await websocket_module.start_event_subscribers()
    logger.info("[main] WebSocket module initialized")
    
    # 3. MQTT module (handles MQTT integration)
    mqtt_module = MQTTModule(event_bus)
    
    # Initialize MQTT system with legacy bridge
    mqtt_manager, mqtt_publisher = initialize_mqtt_service(loop, mqtt_update_bridge)
    if mqtt_manager and mqtt_publisher:
        mqtt_module.set_mqtt_components(mqtt_manager, mqtt_publisher)
        await mqtt_module.start_event_subscribers()
        logger.info("[main] MQTT system initialized successfully")
    else:
        logger.info("[main] MQTT system not initialized (disabled or failed)")
    
    # 4. Start nutrition scheduled update task (hourly)
    asyncio.create_task(nutrition_scheduled_updater())
    logger.info("[main] Nutrition scheduled updater started")

    # 5. Track reader activity from MQTT sensor data
    from routes.readers import start_reader_activity_subscriber
    asyncio.create_task(start_reader_activity_subscriber(event_bus))
    logger.info("[main] Reader activity subscriber started")

    logger.info("[main] Event-driven system startup complete")


async def nutrition_scheduled_updater():
    """Background task to publish nutrition scheduled values over MQTT every hour.

    This drives the nutrition "scheduled/expected" sensor value on the live
    dashboard; it is unrelated to the due-count badges, which the dashboard now
    keeps current with a client-side 60s poll (see Dashboard.jsx)."""
    logger.info("[nutrition_updater] Started hourly nutrition scheduled updater")
    while True:
        try:
            await asyncio.sleep(3600)  # Wait 1 hour

            # Publish scheduled nutrition values
            db = next(get_db())
            try:
                from crud.patients import get_background_patient_id
                from crud.nutrition import _publish_nutrition_scheduled_mqtt

                background_pid = get_background_patient_id(db)
                if background_pid is not None:
                    _publish_nutrition_scheduled_mqtt(db, background_pid)
                    logger.info("[nutrition_updater] Published hourly nutrition scheduled update")
            finally:
                db.close()
        except Exception as e:
            logger.error(f"[nutrition_updater] Error in scheduled updater: {e}")
            await asyncio.sleep(60)  # Wait 1 minute before retry


@app.on_event("shutdown")
async def shutdown_event():
    logger.info("[main] Shutting down event-driven system")
    
    # Shutdown MQTT service
    shutdown_mqtt_service()
    
    # Shutdown event bus
    event_bus.shutdown()
    
    logger.info("[main] Shutdown complete")


# Expose modules for other parts of the application
def get_modules():
    """Get references to all initialized modules."""
    return {
        "event_bus": event_bus,
        "websocket": websocket_module,
        "mqtt": mqtt_module,
        "state": state_module
    }
