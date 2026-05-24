# modules/websocket_module.py
"""
WebSocket module - manages WebSocket connections and publishes state updates to clients.
"""
import asyncio
import json
import uuid
import traceback
from datetime import datetime
from typing import Set, Dict, Any
import logging

from fastapi import WebSocket, WebSocketDisconnect

from bus import EventBus
from events import WebSocketEvent, StateSync, EventSource, SensorUpdate, AlarmPanelState

logger = logging.getLogger("websocket_module")

class WebSocketModule:
    """Manages WebSocket connections and broadcasts state updates."""
    
    def __init__(self, event_bus: EventBus):
        self.event_bus = event_bus
        self.active_connections: Dict[str, WebSocket] = {}
        self.subscription_tasks: Dict[str, asyncio.Task] = {}
        
        # Current state cache for new client synchronization
        self.current_state = {}
        # Per-patient latest readings (patient_id -> { spo2, bpm, ts, ... }) for care dashboard
        self.patient_readings: Dict[int, Dict[str, Any]] = {}
        
    async def start_event_subscribers(self):
        """Start subscribing to relevant events."""
        # Subscribe to sensor updates
        asyncio.create_task(self._subscribe_to_sensor_updates())
        
        # Subscribe to alarm panel updates
        asyncio.create_task(self._subscribe_to_alarm_updates())
        
        # Subscribe to state sync requests
        asyncio.create_task(self._subscribe_to_state_sync())
        
        logger.info("WebSocket module event subscribers started")

    def _normalize_sensor_values(self, values: dict) -> dict:
        """Normalize alternate key names (e.g. perf→perfusion, alarm_spo2→spo2_alarm)."""
        out = dict(values)
        if 'perf' in out and 'perfusion' not in out:
            out['perfusion'] = out['perf']
        if 'alarm_spo2' in out:
            out['spo2_alarm'] = out['alarm_spo2']
        if 'alarm_bpm' in out:
            out['bpm_alarm'] = out['alarm_bpm']
        return out

    async def _subscribe_to_sensor_updates(self):
        """Subscribe to sensor update events and broadcast to clients."""
        async for event in self.event_bus.subscribe_to_type(SensorUpdate):
            try:
                # Normalize keys (perf→perfusion, alarm_spo2/alarm_bpm) then update cache
                normalized = self._normalize_sensor_values(event.values)
                self.current_state.update(normalized)
                # Per-patient readings for care dashboard
                pid = getattr(event, 'patient_id', None)
                if pid is not None:
                    self.patient_readings[pid] = {
                        **normalized,
                        'ts': event.ts.isoformat(),
                    }
                # Broadcast to all connected clients
                await self._broadcast_sensor_update(event)
                
            except Exception as e:
                logger.error(f"Error handling sensor update: {e}")

    async def _subscribe_to_alarm_updates(self):
        """Subscribe to alarm panel events and broadcast to clients."""
        async for event in self.event_bus.subscribe_to_type(AlarmPanelState):
            try:
                # Update current state cache
                self.current_state['alarm1'] = event.alarm1
                self.current_state['alarm2'] = event.alarm2
                # Per-patient alarm state for care dashboard
                pid = getattr(event, 'patient_id', None)
                if pid is not None and pid in self.patient_readings:
                    self.patient_readings[pid]['alarm1'] = event.alarm1
                    self.patient_readings[pid]['alarm2'] = event.alarm2
                
                # Broadcast to all connected clients
                await self._broadcast_alarm_update(event)
                
            except Exception as e:
                logger.error(f"Error handling alarm update: {e}")

    async def _subscribe_to_state_sync(self):
        """Subscribe to state sync requests."""
        async for event in self.event_bus.subscribe_to_type(StateSync):
            try:
                if event.client_id and event.client_id in self.active_connections:
                    await self._send_full_state(event.client_id)
                else:
                    # Broadcast full state to all clients
                    await self._broadcast_full_state()
                    
            except Exception as e:
                logger.error(f"Error handling state sync: {e}")

    async def connect_client(self, websocket: WebSocket) -> str:
        """Accept a new WebSocket connection."""
        await websocket.accept()
        
        # Generate unique client ID
        client_id = str(uuid.uuid4())
        self.active_connections[client_id] = websocket
        
        # Publish connection event
        event = WebSocketEvent(
            ts=datetime.now(),
            client_id=client_id,
            event_type="connected",
            source=EventSource.SYSTEM
        )
        await self.event_bus.publish(event, topic="websocket.connection")
        
        # Give the connection a moment to stabilize
        await asyncio.sleep(0.1)
        
        # Send current state to new client
        await self._send_full_state(client_id)
        
        logger.info(f"WebSocket client {client_id} connected. Total clients: {len(self.active_connections)}")
        return client_id

    async def disconnect_client(self, client_id: str):
        """Handle client disconnection."""
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            
            # Cancel any subscription tasks for this client
            if client_id in self.subscription_tasks:
                self.subscription_tasks[client_id].cancel()
                del self.subscription_tasks[client_id]
            
            # Publish disconnection event
            event = WebSocketEvent(
                ts=datetime.now(),
                client_id=client_id,
                event_type="disconnected",
                source=EventSource.SYSTEM
            )
            await self.event_bus.publish(event, topic="websocket.connection")
            
            logger.info(f"WebSocket client {client_id} disconnected. Total clients: {len(self.active_connections)}")

    async def _send_full_state(self, client_id: str):
        """Send full current state to a specific client."""
        if client_id not in self.active_connections:
            logger.warning(f"Attempted to send state to non-existent client {client_id}")
            return
            
        websocket = self.active_connections[client_id]
        
        # Check if WebSocket is still connected
        if websocket.client_state.value not in [1, 2]:  # CONNECTING=0, CONNECTED=1, DISCONNECTED=2
            logger.warning(f"WebSocket for client {client_id} is not in connected state: {websocket.client_state}")
            await self.disconnect_client(client_id)
            return
        
        try:
            # Get comprehensive state from database
            full_state = await self._get_full_state()
            
            message = {
                "type": "sensor_update",
                "state": full_state
            }
            
            # Test JSON serialization first
            json_message = json.dumps(message, default=str)
            logger.debug(f"Sending {len(json_message)} bytes to client {client_id}")
            
            # Send the message
            await websocket.send_text(json_message)
            logger.debug(f"Successfully sent full state to client {client_id}")
            
        except Exception as e:
            logger.error(f"Failed to send full state to client {client_id}: {e}")
            logger.error(f"Full traceback: {traceback.format_exc()}")
            await self.disconnect_client(client_id)

    async def _broadcast_full_state(self):
        """Broadcast full current state to all clients."""
        if not self.active_connections:
            return
            
        # Get comprehensive state from database
        full_state = await self._get_full_state()
        
        message = {
            "type": "sensor_update",
            "state": full_state
        }
        
        await self._broadcast_message(message)

    async def _broadcast_sensor_update(self, event: SensorUpdate):
        """Broadcast sensor update to all clients."""
        if not self.active_connections:
            return
            
        # For sensor updates, we might want to send incremental updates
        # or trigger a full state refresh
        await self._broadcast_full_state()

    async def _broadcast_alarm_update(self, event: AlarmPanelState):
        """Broadcast alarm update to all clients."""
        if not self.active_connections:
            return
            
        message = {
            "type": "alarm_update", 
            "alarm1": event.alarm1,
            "alarm2": event.alarm2,
            "timestamp": event.ts.isoformat()
        }
        
        await self._broadcast_message(message)

    async def _broadcast_message(self, message: dict):
        """Broadcast a message to all connected clients."""
        if not self.active_connections:
            return
            
        disconnected_clients = []
        message_json = json.dumps(message, default=str)
        
        for client_id, websocket in list(self.active_connections.items()):
            try:
                await websocket.send_text(message_json)
            except Exception as e:
                logger.error(f"Failed to send message to client {client_id}: {e}")
                disconnected_clients.append(client_id)
        
        # Clean up disconnected clients
        for client_id in disconnected_clients:
            await self.disconnect_client(client_id)

    async def _get_full_state(self) -> dict:
        """Get comprehensive state from database and cache."""
        # This method should fetch the complete state including:
        # - Current sensor values
        # - Recent vitals history  
        # - Alert counts
        # - Settings
        # - Equipment/medication counts
        
        try:
            from state_manager import get_db_session
            from crud.equipment import get_equipment_due_count
            from crud.medications import get_due_and_upcoming_medications_count
            from crud.scheduling import get_due_and_upcoming_care_tasks_count, get_due_and_upcoming_nutrition_count
            from crud.monitoring import get_unacknowledged_alerts_count, get_active_ventilator_alerts_count
            from crud.settings import get_all_settings
            from crud.vitals import get_vitals_by_type

            state = self.current_state.copy()

            with get_db_session() as db:
                # Get alert counts (rollback on failure so later queries don't see aborted transaction)
                try:
                    pulse_ox_alerts = get_unacknowledged_alerts_count(db)
                    vent_alerts = get_active_ventilator_alerts_count(db)
                    alerts_count = pulse_ox_alerts + vent_alerts
                except Exception as e:
                    logger.warning(f"Error getting alert counts: {e}")
                    db.rollback()
                    alerts_count = 0

                try:
                    equipment_due_count = get_equipment_due_count(db)
                except Exception as e:
                    logger.warning(f"Error getting equipment due count: {e}")
                    db.rollback()
                    equipment_due_count = 0
                try:
                    medications_due_count = get_due_and_upcoming_medications_count(db)
                except Exception as e:
                    logger.warning(f"Error getting medications due count: {e}")
                    db.rollback()
                    medications_due_count = 0
                try:
                    care_tasks_due_count = get_due_and_upcoming_care_tasks_count(db)
                except Exception as e:
                    logger.warning(f"Error getting care tasks due count: {e}")
                    db.rollback()
                    care_tasks_due_count = 0
                try:
                    nutrition_due_count = get_due_and_upcoming_nutrition_count(db)
                except Exception as e:
                    logger.warning(f"Error getting nutrition due count: {e}")
                    db.rollback()
                    nutrition_due_count = 0

                try:
                    settings_result = get_all_settings(db)
                except Exception as e:
                    logger.warning(f"Error getting settings: {e}")
                    db.rollback()
                    settings_result = None
                settings_dict = {}
                if settings_result and isinstance(settings_result, dict):
                    for key, value in settings_result.items():
                        settings_dict[key] = {"value": value, "type": type(value).__name__}
                elif settings_result is not None:
                    logger.warning(f"Unexpected settings result format: {type(settings_result)}")

                # Get recent vitals from unified vitals table
                try:
                    bp_history = get_vitals_by_type(db, 'blood_pressure', limit=5)
                except Exception as e:
                    logger.warning(f"Error getting BP data: {e}")
                    db.rollback()
                    bp_history = []

                try:
                    temp_history = get_vitals_by_type(db, 'temperature', limit=10)
                except Exception as e:
                    logger.warning(f"Error getting temp data: {e}")
                    db.rollback()
                    temp_history = []
                
                # Get dashboard chart data with safe defaults
                chart_1_vital = settings_dict.get('dashboard_chart_1_vital', {}).get('value', 'blood_pressure')
                chart_2_vital = settings_dict.get('dashboard_chart_2_vital', {}).get('value', 'temperature')
                
                chart_1_data = []
                chart_2_data = []
                
                try:
                    if chart_1_vital:
                        chart_1_data = get_vitals_by_type(db, chart_1_vital, limit=20)
                except Exception as e:
                    logger.warning(f"Error getting chart 1 data for {chart_1_vital}: {e}")
                    db.rollback()
                
                try:
                    if chart_2_vital and chart_2_vital != chart_1_vital:
                        chart_2_data = get_vitals_by_type(db, chart_2_vital, limit=20)
                except Exception as e:
                    logger.warning(f"Error getting chart 2 data for {chart_2_vital}: {e}")
                    db.rollback()
            
            # Build comprehensive state
            state.update({
                'bp': bp_history if bp_history else [],
                'temp': temp_history if temp_history else [],
                'settings': settings_dict,
                'alerts_count': alerts_count,
                'equipment_due_count': equipment_due_count,
                'medications': medications_due_count,
                'nutrition': nutrition_due_count,
                'care_tasks': care_tasks_due_count,
                'dashboard_chart_1': {
                    'vital_type': chart_1_vital,
                    'data': chart_1_data
                },
                'dashboard_chart_2': {
                    'vital_type': chart_2_vital,
                    'data': chart_2_data
                }
            })
            
            # Ensure default values for required fields
            for key in ['spo2', 'bpm', 'perfusion', 'status', 'map_bp', 'alarm1', 'alarm2']:
                if key not in state:
                    state[key] = None if key not in ['alarm1', 'alarm2'] else False
            
            # Calculate alarm flags with safe defaults
            min_spo2 = int(settings_dict.get('min_spo2', {}).get('value', 90))
            max_spo2 = int(settings_dict.get('max_spo2', {}).get('value', 100))
            min_bpm = int(settings_dict.get('min_bpm', {}).get('value', 55))
            max_bpm = int(settings_dict.get('max_bpm', {}).get('value', 155))

            spo2_val = state.get('spo2')
            bpm_val = state.get('bpm')

            state['spo2_alarm'] = False
            state['bpm_alarm'] = False

            if isinstance(spo2_val, (int, float)) and spo2_val != -1 and spo2_val is not None:
                state['spo2_alarm'] = spo2_val < min_spo2 or spo2_val > max_spo2

            if isinstance(bpm_val, (int, float)) and bpm_val != -1 and bpm_val is not None:
                state['bpm_alarm'] = bpm_val < min_bpm or bpm_val > max_bpm

            # Combined alarm flag: only vitals (SpO2/BPM) so banner clears when O2 and BPM are normal
            state['alarm'] = state['spo2_alarm'] or state['bpm_alarm']
            # Per-patient readings for care dashboard (keys as strings for JSON)
            state['patient_readings'] = {
                str(pid): data for pid, data in self.patient_readings.items()
            }
            
            logger.debug(f"Built full state with {len(state)} keys")
            return state
            
        except Exception as e:
            logger.error(f"Error getting full state: {e}")
            import traceback
            logger.error(f"Full traceback: {traceback.format_exc()}")
            
            # Return minimal state on error
            minimal_state = self.current_state.copy()
            for key in ['spo2', 'bpm', 'perfusion', 'status', 'map_bp', 'alarm1', 'alarm2']:
                if key not in minimal_state:
                    minimal_state[key] = None if key not in ['alarm1', 'alarm2'] else False
            
            minimal_state.update({
                'bp': [],
                'temp': [],
                'settings': {},
                'alerts_count': 0,
                'equipment_due_count': 0,
                'medications': 0,
                'nutrition': 0,
                'care_tasks': 0,
                'spo2_alarm': False,
                'bpm_alarm': False,
                'alarm': False,
                'dashboard_chart_1': {'vital_type': 'blood_pressure', 'data': []},
                'dashboard_chart_2': {'vital_type': 'temperature', 'data': []},
                'patient_readings': {},
            })
            
            return minimal_state

    async def handle_websocket_connection(self, websocket: WebSocket):
        """Handle a WebSocket connection lifecycle."""
        client_id = await self.connect_client(websocket)
        
        try:
            while True:
                # Wait for messages from client (ping/pong, requests, etc.)
                data = await websocket.receive_text()
                
                # Handle client messages if needed
                try:
                    message = json.loads(data)
                    await self._handle_client_message(client_id, message)
                except json.JSONDecodeError:
                    logger.warning(f"Invalid JSON from client {client_id}: {data}")
                    
        except WebSocketDisconnect:
            pass
        except Exception as e:
            logger.error(f"Error in WebSocket connection {client_id}: {e}")
        finally:
            await self.disconnect_client(client_id)

    async def _handle_client_message(self, client_id: str, message: dict):
        """Handle messages from WebSocket clients."""
        message_type = message.get("type")
        
        if message_type == "ping":
            # Respond to ping
            pong_message = {"type": "pong", "timestamp": datetime.now().isoformat()}
            try:
                await self.active_connections[client_id].send_text(json.dumps(pong_message))
            except Exception as e:
                logger.error(f"Failed to send pong to client {client_id}: {e}")
                
        elif message_type == "request_state":
            # Client requesting full state refresh
            await self._send_full_state(client_id)
            
        else:
            logger.debug(f"Unknown message type from client {client_id}: {message_type}")

    def get_status(self) -> dict:
        """Get current status of the WebSocket module."""
        return {
            "active_connections": len(self.active_connections),
            "client_ids": list(self.active_connections.keys())
        }
