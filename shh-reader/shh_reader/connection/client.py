"""
WebSocket Client for SHH Reader

Handles encrypted WebSocket connection to the SHH host platform.
Supports automatic reconnection and cached data replay.
"""

import asyncio
import json
import logging
import socket
from datetime import datetime
from typing import Optional, Callable, Dict, Any, List
from dataclasses import dataclass

import websockets
from websockets.client import WebSocketClientProtocol
from cryptography.fernet import Fernet

from ..cache.sqlite import cache_manager, CachedEvent

logger = logging.getLogger('shh_reader.connection')


@dataclass
class ConnectionStatus:
    """Current connection status"""
    connected: bool
    host_url: Optional[str]
    last_connected: Optional[datetime]
    last_error: Optional[str]
    reconnect_attempts: int


class HostConnection:
    """
    WebSocket client for connecting to SHH host platform.
    
    Features:
    - Fernet symmetric encryption for all messages
    - Automatic reconnection with exponential backoff
    - Cached data replay on reconnection
    - Heartbeat/ping-pong for connection health
    """
    
    def __init__(
        self,
        on_status_change: Optional[Callable[[ConnectionStatus], None]] = None,
        on_config_update: Optional[Callable[[Dict[str, Any]], None]] = None
    ):
        self.on_status_change = on_status_change
        self.on_config_update = on_config_update
        
        self._host_url: Optional[str] = None
        self._encryption_key: Optional[bytes] = None
        self._fernet: Optional[Fernet] = None
        self._device_name: str = socket.gethostname()
        
        self._ws: Optional[WebSocketClientProtocol] = None
        self._running = False
        self._connected = False
        self._task: Optional[asyncio.Task] = None
        self._sync_task: Optional[asyncio.Task] = None
        
        self._reconnect_attempts = 0
        self._max_backoff = 60  # Max seconds between reconnect attempts
        self._last_connected: Optional[datetime] = None
        self._last_error: Optional[str] = None
    
    @property
    def connected(self) -> bool:
        return self._connected
    
    @property
    def status(self) -> ConnectionStatus:
        return ConnectionStatus(
            connected=self._connected,
            host_url=self._host_url,
            last_connected=self._last_connected,
            last_error=self._last_error,
            reconnect_attempts=self._reconnect_attempts
        )
    
    def configure(self, host_url: str, encryption_key: str, device_name: str = None):
        """
        Configure connection settings.
        
        Args:
            host_url: WebSocket URL (e.g., ws://192.168.1.100:8000/ws/reader)
            encryption_key: Base64-encoded Fernet key
            device_name: Optional device identifier (defaults to hostname)
        """
        self._host_url = host_url
        self._encryption_key = encryption_key.encode() if isinstance(encryption_key, str) else encryption_key
        self._fernet = Fernet(self._encryption_key)
        if device_name:
            self._device_name = device_name
        logger.info(f"Connection configured: {host_url}")
    
    def _encrypt(self, data: Dict[str, Any]) -> bytes:
        """Encrypt a message payload"""
        if not self._fernet:
            raise RuntimeError("Encryption not configured")
        plaintext = json.dumps(data).encode()
        return self._fernet.encrypt(plaintext)
    
    def _decrypt(self, data: bytes) -> Dict[str, Any]:
        """Decrypt a message payload"""
        if not self._fernet:
            raise RuntimeError("Encryption not configured")
        plaintext = self._fernet.decrypt(data)
        return json.loads(plaintext.decode())
    
    def _emit_status(self):
        """Emit current status"""
        if self.on_status_change:
            self.on_status_change(self.status)
    
    async def start(self):
        """Start the connection manager"""
        if self._running:
            return
        
        if not self._host_url or not self._fernet:
            logger.warning("Cannot start: connection not configured")
            return
        
        self._running = True
        self._task = asyncio.create_task(self._connection_loop())
        logger.info("Connection manager started")
    
    async def stop(self):
        """Stop the connection manager"""
        self._running = False
        
        if self._sync_task:
            self._sync_task.cancel()
            try:
                await self._sync_task
            except asyncio.CancelledError:
                pass
        
        if self._ws:
            await self._ws.close()
        
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        
        self._connected = False
        self._emit_status()
        logger.info("Connection manager stopped")
    
    async def send(self, message: Dict[str, Any]) -> bool:
        """
        Send a message to the host.
        
        Returns True if sent successfully, False if queued for later.
        """
        if self._connected and self._ws:
            try:
                encrypted = self._encrypt(message)
                await self._ws.send(encrypted)
                return True
            except Exception as e:
                logger.debug(f"Send failed, will cache: {e}")
        
        # Cache for later if not connected or send failed
        event_type = message.get('type', 'unknown')
        timestamp = datetime.fromisoformat(message.get('ts', datetime.utcnow().isoformat()))
        payload = {k: v for k, v in message.items() if k not in ('type', 'ts')}
        await cache_manager.cache_event(event_type, timestamp, payload)
        return False
    
    async def send_sensor_data(self, spo2: int, bpm: int, perfusion: float, timestamp: datetime = None):
        """Send sensor data to host"""
        message = {
            "type": "sensor",
            "ts": (timestamp or datetime.utcnow()).isoformat(),
            "values": {
                "spo2": spo2,
                "bpm": bpm,
                "perfusion": perfusion
            }
        }
        return await self.send(message)
    
    async def send_alarm_state(self, alarm1: bool, alarm2: bool, timestamp: datetime = None):
        """Send alarm state to host"""
        message = {
            "type": "alarm",
            "ts": (timestamp or datetime.utcnow()).isoformat(),
            "alarm1": alarm1,
            "alarm2": alarm2
        }
        return await self.send(message)
    
    async def _connection_loop(self):
        """Main connection loop with reconnection logic"""
        while self._running:
            try:
                logger.info(f"Connecting to {self._host_url}")
                
                async with websockets.connect(
                    self._host_url,
                    additional_headers={"X-Reader-Name": self._device_name}
                ) as ws:
                    self._ws = ws
                    self._connected = True
                    self._last_connected = datetime.utcnow()
                    self._reconnect_attempts = 0
                    self._last_error = None
                    self._emit_status()
                    logger.info("Connected to host")
                    
                    # Send handshake
                    handshake = self._encrypt({
                        "type": "handshake",
                        "device_name": self._device_name,
                        "ts": datetime.utcnow().isoformat()
                    })
                    await ws.send(handshake)
                    
                    # Start sync task for cached data
                    self._sync_task = asyncio.create_task(self._sync_cached_data())
                    
                    # Message receive loop
                    async for message in ws:
                        try:
                            if isinstance(message, bytes):
                                data = self._decrypt(message)
                            else:
                                data = self._decrypt(message.encode())
                            
                            await self._handle_message(data)
                        except Exception as e:
                            logger.error(f"Error handling message: {e}")
                    
            except websockets.ConnectionClosed as e:
                self._last_error = f"Connection closed: {e}"
                logger.warning(self._last_error)
            except Exception as e:
                self._last_error = f"Connection error: {e}"
                logger.error(self._last_error)
            
            finally:
                self._ws = None
                self._connected = False
                if self._sync_task:
                    self._sync_task.cancel()
                self._emit_status()
            
            # Reconnect with backoff
            if self._running:
                self._reconnect_attempts += 1
                backoff = min(2 ** self._reconnect_attempts, self._max_backoff)
                logger.info(f"Reconnecting in {backoff}s (attempt {self._reconnect_attempts})")
                await asyncio.sleep(backoff)
    
    async def _handle_message(self, data: Dict[str, Any]):
        """Handle incoming message from host"""
        msg_type = data.get('type')
        
        if msg_type == 'pong':
            logger.debug("Received pong")
        elif msg_type == 'config':
            logger.info("Received config update")
            if self.on_config_update:
                self.on_config_update(data.get('settings', {}))
        elif msg_type == 'ack':
            # Acknowledgment of received data
            event_ids = data.get('event_ids', [])
            if event_ids:
                await cache_manager.mark_synced(event_ids)
        else:
            logger.debug(f"Unknown message type: {msg_type}")
    
    async def _sync_cached_data(self):
        """Background task to sync cached data"""
        await asyncio.sleep(2)  # Wait a bit after connection
        
        while self._connected and self._running:
            try:
                # Get unsynced events
                events = await cache_manager.get_unsynced(limit=50)
                
                if events:
                    logger.info(f"Syncing {len(events)} cached events")
                    
                    # Send as batch
                    batch = {
                        "type": "cache_sync",
                        "ts": datetime.utcnow().isoformat(),
                        "records": [e.to_message() for e in events],
                        "event_ids": [e.id for e in events]
                    }
                    
                    if self._ws:
                        encrypted = self._encrypt(batch)
                        await self._ws.send(encrypted)
                        # Mark as synced (host will ack)
                        await cache_manager.mark_synced([e.id for e in events])
                
                # Check again in a bit
                await asyncio.sleep(5)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Sync error: {e}")
                await asyncio.sleep(10)
