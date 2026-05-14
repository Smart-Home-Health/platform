import threading
import asyncio
import json  # Add this import
import logging
import os
from typing import Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from datetime import datetime

# Import event bus and events
from bus import EventBus
from events import SensorUpdate, EventSource

# Import modules
from modules.websocket_module import WebSocketModule
from modules.mqtt_module import MQTTModule
from modules.state_module import StateModule

# Import route modules
from routes import core, settings, vitals, medications, care_tasks, equipment, monitoring, mqtt, status, patients, nutrition, businesses, providers, auth, users, schedule, dashboard, symptoms, diagnoses, implants, dme_shipments, account, integrations, readers, backup

# Import legacy components
from mqtt import initialize_mqtt_service, shutdown_mqtt_service
from db import get_db
from crud.settings import get_setting, save_setting

# Import auth components
from middleware import AuthenticationMiddleware
from seed_auth import seed_default_data

load_dotenv()

# Initialize a logger for your application
logger = logging.getLogger("app")

# Configure logging
logging.basicConfig(level=logging.INFO)

# FastAPI app setup
app = FastAPI()

# Middleware is a stack: last-added = outermost (runs first).
# CORS must be outermost so ALL responses (including auth 401s) get CORS headers.
app.add_middleware(AuthenticationMiddleware)
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
app.include_router(readers.router)
app.include_router(backup.router)

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
    """Background task to publish nutrition scheduled values every hour"""
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
