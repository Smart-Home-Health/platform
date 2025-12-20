import threading
import asyncio
import json  # Add this import
import platform
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
from modules.serial_module import SerialModule
from modules.gpio_module import GPIOModule
from modules.websocket_module import WebSocketModule
from modules.mqtt_module import MQTTModule
from modules.state_module import StateModule

# Import route modules
from routes import core, settings, vitals, medications, care_tasks, equipment, monitoring, mqtt, serial, status, patients, nutrition, businesses, providers, auth, admin

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

# Platform detection for GPIO functionality
def is_raspberry_pi():
    """Check if running on Raspberry Pi"""
    try:
        with open('/proc/cpuinfo', 'r') as f:
            return any('BCM' in line for line in f)
    except (FileNotFoundError, PermissionError):
        return False

def is_gpio_available():
    """Check if GPIO functionality is available"""
    if not is_raspberry_pi():
        return False
    try:
        import lgpio
        return True
    except ImportError:
        return False

# Determine GPIO availability
GPIO_AVAILABLE = is_gpio_available()
if GPIO_AVAILABLE:
    print("[main] GPIO functionality available - running on Raspberry Pi")
else:
    print("[main] GPIO functionality not available - running on non-Raspberry Pi system")

# FastAPI app setup
app = FastAPI()

# Add CORS middleware (must be first)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://localhost:3000",  # Alternative dev port
        "http://localhost",       # Docker frontend
        "*"  # Allow all for now - restrict in production
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Add authentication middleware
app.add_middleware(AuthenticationMiddleware)

# Register route modules
app.include_router(auth.router)  # Auth routes first (public)
app.include_router(core.router)
app.include_router(settings.router)
app.include_router(vitals.router)
app.include_router(medications.router)
app.include_router(care_tasks.router)
app.include_router(equipment.router)
app.include_router(monitoring.router)
app.include_router(mqtt.router)
app.include_router(serial.router)
app.include_router(status.router)
app.include_router(patients.router)
app.include_router(nutrition.router)
app.include_router(businesses.router)
app.include_router(providers.router)
app.include_router(admin.router)

# Global event bus and modules
event_bus = EventBus(maxsize=1000)
serial_module: Optional[SerialModule] = None
gpio_module: Optional[GPIOModule] = None
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
    global serial_module, gpio_module, websocket_module, mqtt_module, state_module
    
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

    # Initialize default GPIO alarm settings if they don't exist
    if get_setting(db, "alarm1_device") is None:
        save_setting(db, "alarm1_device", "vent", "string", "Device type for Alarm 1 RJ9 port")

    if get_setting(db, "alarm2_device") is None:
        save_setting(db, "alarm2_device", "pulseox", "string", "Device type for Alarm 2 RJ9 port")

    if get_setting(db, "alarm1_recovery_time") is None:
        save_setting(db, "alarm1_recovery_time", 30, "int", "Recovery time in seconds for Alarm 1")

    if get_setting(db, "alarm2_recovery_time") is None:
        save_setting(db, "alarm2_recovery_time", 30, "int", "Recovery time in seconds for Alarm 2")
    
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
    
    # 4. Serial module (handles serial port communication)
    serial_module = SerialModule(event_bus, loop)
    serial_module.start()
    logger.info("[main] Serial module initialized")
    
    # 5. GPIO module (handles GPIO monitoring)
    gpio_module = GPIOModule(event_bus, loop)
    gpio_enabled = get_setting(db, "gpio_enabled", default=False)
    
    if gpio_enabled in [True, "true", "True", 1, "1"]:
        if gpio_module.start():
            logger.info("[main] GPIO module initialized and started")
        else:
            logger.warning("[main] GPIO module initialization failed")
    else:
        logger.info("[main] GPIO module disabled in settings")
    
    # 6. Start nutrition scheduled update task (hourly)
    asyncio.create_task(nutrition_scheduled_updater())
    logger.info("[main] Nutrition scheduled updater started")
    
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
                from crud.patients import get_active_patient
                from crud.nutrition import _publish_nutrition_scheduled_mqtt
                
                active_patient = get_active_patient(db)
                if active_patient:
                    _publish_nutrition_scheduled_mqtt(db, active_patient.id)
                    logger.info("[nutrition_updater] Published hourly nutrition scheduled update")
            finally:
                db.close()
        except Exception as e:
            logger.error(f"[nutrition_updater] Error in scheduled updater: {e}")
            await asyncio.sleep(60)  # Wait 1 minute before retry


@app.on_event("shutdown")
async def shutdown_event():
    logger.info("[main] Shutting down event-driven system")
    
    # Shutdown modules
    if serial_module:
        serial_module.stop()
        
    if gpio_module:
        gpio_module.stop()
    
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
        "serial": serial_module,
        "gpio": gpio_module,
        "websocket": websocket_module,
        "mqtt": mqtt_module,
        "state": state_module
    }
