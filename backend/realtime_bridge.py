"""
Realtime WebSocket bridge: connect to an external ws://host:8080/api/realtime (or similar)
and publish incoming JSON as SensorUpdate so the dashboard /ws/sensors feed receives it.

Expected message shapes:
  - { "spo2": 95, "bpm": 101, "perf": 53, "alarm_spo2": false, "alarm_bpm": false }
  - { "status": "running" } | { "status": "stopped" }

Set REALTIME_WS_URL (e.g. ws://192.168.1.184:8080/api/realtime) to enable.
"""
import asyncio
import json
import logging
from datetime import datetime

from bus import EventBus
from events import SensorUpdate, EventSource

logger = logging.getLogger("app.realtime_bridge")

# Use optional dependency; if not installed, bridge no-ops
try:
    import websockets
except ImportError:
    websockets = None


def _payload_to_values(data: dict) -> dict:
    """Map external API keys to internal (perf→perfusion, alarm_*→*_alarm)."""
    values = {}
    if "spo2" in data and data["spo2"] is not None:
        values["spo2"] = data["spo2"]
    if "bpm" in data and data["bpm"] is not None:
        values["bpm"] = data["bpm"]
    if "perf" in data and data["perf"] is not None:
        values["perfusion"] = data["perf"]
    if "perfusion" in data and data["perfusion"] is not None:
        values["perfusion"] = data["perfusion"]
    if "alarm_spo2" in data:
        values["spo2_alarm"] = bool(data["alarm_spo2"])
    if "alarm_bpm" in data:
        values["bpm_alarm"] = bool(data["alarm_bpm"])
    if "status" in data:
        values["status"] = data["status"]
    return values


async def run_realtime_bridge(event_bus: EventBus, url: str) -> None:
    """Connect to url, read JSON messages, publish SensorUpdate; reconnect on disconnect."""
    if not websockets:
        logger.warning("[realtime_bridge] websockets package not installed; bridge disabled")
        return
    while True:
        try:
            async with websockets.connect(
                url,
                ping_interval=20,
                ping_timeout=10,
                close_timeout=5,
            ) as ws:
                logger.info("[realtime_bridge] Connected to %s", url)
                async for raw in ws:
                    try:
                        data = json.loads(raw) if isinstance(raw, str) else raw
                        if not isinstance(data, dict):
                            continue
                        values = _payload_to_values(data)
                        if not values:
                            continue
                        event = SensorUpdate(
                            ts=datetime.utcnow(),
                            values=values,
                            raw=raw if isinstance(raw, str) else json.dumps(data),
                            source=EventSource.API,
                            patient_id=None,
                        )
                        await event_bus.publish(event)
                    except json.JSONDecodeError as e:
                        logger.debug("[realtime_bridge] Invalid JSON: %s", e)
                    except Exception as e:
                        logger.warning("[realtime_bridge] Error handling message: %s", e)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning("[realtime_bridge] Disconnected from %s: %s; reconnecting in 5s", url, e)
        await asyncio.sleep(5)
