# Smart Home Health Hub
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
"""
Reader API routes for SHH Reader device management

Handles pairing, management, and WebSocket data ingestion from reader devices.
"""

import asyncio
import json
import logging
import secrets
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from pydantic import BaseModel
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
import httpx

from db import get_db, SessionLocal
from dependencies import require_read_access
from models.readers import Reader
from bus import EventBus
from events import SensorUpdate, AlarmPanelState, EventSource
from utils.pairing_crypto import (
    PAIR_PROTOCOL_VERSION,
    derive_fernet_key,
    public_key_b64,
)

logger = logging.getLogger('app.readers')
router = APIRouter(prefix="/api/readers", tags=["readers"])


# --- Pydantic Models ---

class ReaderCreate(BaseModel):
    ip_address: str
    name: Optional[str] = None
    patient_id: Optional[int] = None


class ReaderUpdate(BaseModel):
    name: Optional[str] = None
    patient_id: Optional[int] = None
    is_active: Optional[bool] = None


class PairRequest(BaseModel):
    ip_address: str
    port: int = 8080  # Reader API port (default 8080)
    patient_id: Optional[int] = None
    host_url: Optional[str] = None  # e.g., "http://192.168.1.50:8000"


# --- Active Connections ---

class ReaderConnectionManager:
    """Manages active WebSocket connections from readers"""
    
    def __init__(self):
        self.connections: Dict[int, WebSocket] = {}  # reader_id -> websocket
        self.encryption_keys: Dict[int, Fernet] = {}  # reader_id -> fernet instance
    
    async def connect(self, reader_id: int, websocket: WebSocket, encryption_key: str):
        await websocket.accept()
        self.connections[reader_id] = websocket
        self.encryption_keys[reader_id] = Fernet(encryption_key.encode())
        logger.info(f"Reader {reader_id} connected")
    
    def disconnect(self, reader_id: int):
        self.connections.pop(reader_id, None)
        self.encryption_keys.pop(reader_id, None)
        logger.info(f"Reader {reader_id} disconnected")
    
    def decrypt(self, reader_id: int, data: bytes) -> Dict[str, Any]:
        fernet = self.encryption_keys.get(reader_id)
        if not fernet:
            raise ValueError("No encryption key for reader")
        plaintext = fernet.decrypt(data)
        return json.loads(plaintext.decode())
    
    def encrypt(self, reader_id: int, data: Dict[str, Any]) -> bytes:
        fernet = self.encryption_keys.get(reader_id)
        if not fernet:
            raise ValueError("No encryption key for reader")
        plaintext = json.dumps(data).encode()
        return fernet.encrypt(plaintext)
    
    async def send(self, reader_id: int, message: Dict[str, Any]):
        ws = self.connections.get(reader_id)
        if ws:
            encrypted = self.encrypt(reader_id, message)
            await ws.send_bytes(encrypted)
    
    def is_connected(self, reader_id: int) -> bool:
        return reader_id in self.connections


connection_manager = ReaderConnectionManager()


def _is_reader_connected(reader) -> bool:
    """Reader is connected if it has a WebSocket or has sent data recently via MQTT."""
    if connection_manager.is_connected(reader.id):
        return True
    if reader.last_data_at:
        from datetime import timezone
        now = datetime.now(timezone.utc)
        last = reader.last_data_at if reader.last_data_at.tzinfo else reader.last_data_at.replace(tzinfo=timezone.utc)
        return (now - last).total_seconds() < 60
    return False


# --- CRUD Operations ---

def get_reader(db: Session, reader_id: int) -> Optional[Reader]:
    return db.query(Reader).filter(Reader.id == reader_id).first()


def get_reader_by_ip(db: Session, ip_address: str) -> Optional[Reader]:
    return db.query(Reader).filter(Reader.ip_address == ip_address).first()


def list_readers(db: Session, active_only: bool = False) -> list:
    query = db.query(Reader)
    if active_only:
        query = query.filter(Reader.is_active == True)
    return query.order_by(Reader.name).all()


def create_reader(db: Session, ip_address: str, port: int = 8080, name: str = None, patient_id: int = None) -> Reader:
    # The Fernet key is derived during pairing (ECDH with the reader),
    # not generated upfront.
    reader = Reader(
        name=name or f"Reader-{ip_address}",
        ip_address=ip_address,
        port=port,
        patient_id=patient_id,
        encryption_key=None,
        is_active=True,
        is_paired=False
    )
    db.add(reader)
    db.commit()
    db.refresh(reader)
    return reader


def update_reader(db: Session, reader: Reader, **kwargs) -> Reader:
    for key, value in kwargs.items():
        if hasattr(reader, key) and value is not None:
            setattr(reader, key, value)
    reader.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(reader)
    return reader


def delete_reader(db: Session, reader_id: int) -> bool:
    reader = get_reader(db, reader_id)
    if reader:
        db.delete(reader)
        db.commit()
        return True
    return False


# --- REST Endpoints ---

@router.get("")
async def list_readers_endpoint(
    active_only: bool = False,
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access)
):
    """List all registered readers"""
    readers = list_readers(db, active_only)
    return {
        "readers": [
            {**r.to_dict(), "connected": _is_reader_connected(r)}
            for r in readers
        ]
    }


@router.get("/{reader_id}")
async def get_reader_endpoint(
    reader_id: int,
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access)
):
    """Get a specific reader"""
    reader = get_reader(db, reader_id)
    if not reader:
        raise HTTPException(status_code=404, detail="Reader not found")
    return {
        **reader.to_dict(),
        "connected": _is_reader_connected(reader)
    }


@router.post("")
async def create_reader_endpoint(
    data: ReaderCreate,
    db: Session = Depends(get_db)
):
    """Create a new reader (without pairing)"""
    existing = get_reader_by_ip(db, data.ip_address)
    if existing:
        raise HTTPException(status_code=400, detail="Reader with this IP already exists")
    
    reader = create_reader(db, data.ip_address, name=data.name, patient_id=data.patient_id)
    return {"success": True, "reader": reader.to_dict()}


@router.put("/{reader_id}")
async def update_reader_endpoint(
    reader_id: int,
    data: ReaderUpdate,
    db: Session = Depends(get_db)
):
    """Update reader settings"""
    reader = get_reader(db, reader_id)
    if not reader:
        raise HTTPException(status_code=404, detail="Reader not found")
    
    update_data = data.model_dump(exclude_unset=True)
    reader = update_reader(db, reader, **update_data)
    return {"success": True, "reader": reader.to_dict()}


@router.delete("/{reader_id}")
async def delete_reader_endpoint(
    reader_id: int,
    db: Session = Depends(get_db)
):
    """Delete a reader"""
    success = delete_reader(db, reader_id)
    if not success:
        raise HTTPException(status_code=404, detail="Reader not found")
    return {"success": True}


# --- Pairing Flow ---

# Pending pairing requests awaiting user approval on the reader.
# Memory-only: a hub restart cancels in-flight pairings (they take seconds).
PENDING_PAIR_TTL = 180  # seconds


@dataclass
class PendingPairing:
    private_key: X25519PrivateKey  # ephemeral, discarded once the key is derived
    host_ws_url: str
    created_at: float  # time.monotonic()

    def expired(self) -> bool:
        return time.monotonic() - self.created_at > PENDING_PAIR_TTL


pending_pairings: Dict[int, PendingPairing] = {}


def _reader_facing_ws_url(reader_id: int, request_host_url: Optional[str]) -> str:
    """
    URL the host gives to the reader during pairing, derived from the host_url the
    frontend reports (its own origin). Path must match the WebSocket route
    /api/readers/ws/{reader_id}.

    This works in both deploy modes because the reader connects to the same origin
    the browser used: in the unified image that origin IS the backend; in split dev
    the Vite proxy forwards /api/readers/ws (ws) to the backend. (The old
    READER_FACING_BASE_URL override is no longer needed and has been removed.)
    """
    base = (request_host_url or "").strip()
    if base:
        ws = base.replace("http://", "ws://").replace("https://", "wss://").rstrip("/")
        return f"{ws}/api/readers/ws/{reader_id}"
    return f"ws://HOST_IP:8000/api/readers/ws/{reader_id}"


@router.post("/pair")
async def initiate_pairing(
    data: PairRequest,
    db: Session = Depends(get_db)
):
    """
    Initiate pairing with a reader device.

    1. Creates reader record if needed
    2. Sends our ephemeral X25519 public key to the reader; the Fernet key
       is derived on both sides once the user approves on the reader, so no
       key material ever crosses the wire
    3. Returns pending status — the frontend polls /pair/status while the
       user clicks Allow on the reader's screen
    """
    # Check if reader exists or create new
    reader = get_reader_by_ip(db, data.ip_address)
    if not reader:
        reader = create_reader(db, data.ip_address, port=data.port, patient_id=data.patient_id)
    elif reader.is_paired:
        raise HTTPException(status_code=400, detail="Reader is already paired")
    else:
        # Update port if it changed
        if reader.port != data.port:
            update_reader(db, reader, port=data.port)

    # URL the host gives to the reader (reader will connect to this)
    host_ws_url = _reader_facing_ws_url(reader.id, data.host_url)

    private_key = X25519PrivateKey.generate()

    try:
        # Send pairing request to reader
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"http://{data.ip_address}:{data.port}/api/pair",
                json={
                    "host_url": host_ws_url,
                    "hub_public_key": public_key_b64(private_key),
                    "protocol_version": PAIR_PROTOCOL_VERSION
                }
            )

            if response.status_code != 200:
                raise HTTPException(status_code=502, detail="Reader rejected pairing request")

            result = response.json()
            device_name = result.get('device_name')

            if result.get('status') != 'pending':
                raise HTTPException(status_code=502, detail="Reader did not accept the pairing request")

            # Store pending pairing until the user approves on the reader
            pending_pairings[reader.id] = PendingPairing(
                private_key=private_key,
                host_ws_url=host_ws_url,
                created_at=time.monotonic()
            )

            # Update reader name if provided
            if device_name and reader.name.startswith("Reader-"):
                update_reader(db, reader, name=device_name)

            return {
                "success": True,
                "reader_id": reader.id,
                "reader_name": device_name or reader.name,
                "status": "pending_approval",
                "message": "Approve the pairing request on the reader"
            }

    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Cannot reach reader at {data.ip_address}: {e}")


@router.get("/{reader_id}/pair/status")
async def pairing_status(
    reader_id: int,
    db: Session = Depends(get_db)
):
    """
    Poll the reader for the outcome of a pending pairing request.

    Once the user clicks Allow on the reader, the reader returns its public
    key and both sides derive the same Fernet key.
    """
    reader = get_reader(db, reader_id)
    if not reader:
        raise HTTPException(status_code=404, detail="Reader not found")

    pending = pending_pairings.get(reader_id)
    if not pending or pending.expired():
        pending_pairings.pop(reader_id, None)
        return {"status": "expired"}

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(
                f"http://{reader.ip_address}:{reader.port}/api/pair/status"
            )
            if response.status_code != 200:
                return {"status": "pending", "reachable": False}
            result = response.json()
    except httpx.RequestError:
        # Transient network hiccup — keep waiting rather than failing the poll
        return {"status": "pending", "reachable": False}

    reader_status = result.get('status')

    if reader_status == 'pending':
        return {"status": "pending"}

    if reader_status == 'denied':
        pending_pairings.pop(reader_id, None)
        return {"status": "denied"}

    if reader_status == 'approved':
        reader_public_key = result.get('reader_public_key')
        if not reader_public_key:
            raise HTTPException(status_code=502, detail="Reader approved but returned no public key")
        derived = derive_fernet_key(pending.private_key, reader_public_key)
        update_reader(
            db, reader,
            is_paired=True,
            paired_at=datetime.utcnow(),
            encryption_key=derived
        )
        pending_pairings.pop(reader_id, None)
        return {"status": "paired", "reader": reader.to_dict()}

    # Reader reports no pending request while we still have one — it
    # restarted (its pending state is memory-only) or timed out.
    pending_pairings.pop(reader_id, None)
    return {"status": "expired"}


@router.post("/{reader_id}/unpair")
async def unpair_reader(
    reader_id: int,
    db: Session = Depends(get_db)
):
    """Unpair a reader"""
    reader = get_reader(db, reader_id)
    if not reader:
        raise HTTPException(status_code=404, detail="Reader not found")

    # Keys are derived per-pairing, so just drop this one.
    # (update_reader skips None values, so set these directly.)
    reader.is_paired = False
    reader.paired_at = None
    reader.encryption_key = None
    reader.updated_at = datetime.utcnow()
    db.commit()
    pending_pairings.pop(reader_id, None)

    # Best-effort: tell the reader so it stops reconnecting with a stale key
    # and its unpaired data gating re-engages.
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(f"http://{reader.ip_address}:{reader.port}/api/unpair")
    except httpx.RequestError:
        logger.warning(f"Could not notify reader {reader_id} of unpair (unreachable)")

    # Disconnect if connected
    if connection_manager.is_connected(reader_id):
        connection_manager.disconnect(reader_id)

    return {"success": True}


# --- WebSocket Endpoint ---

# Keys to exclude when treating a message as flat sensor payload
_SENSOR_MSG_KEYS = frozenset(('type', 'ts', 'event_ids', 'records'))


def _sensor_values_from_message(msg: dict) -> dict:
    """Extract sensor values from message; accept nested 'values' or top-level keys."""
    values = msg.get('values') if isinstance(msg.get('values'), dict) else None
    if values:
        return values
    return {k: v for k, v in msg.items() if k not in _SENSOR_MSG_KEYS and v is not None}


_reader_activity_cache: Dict[int, float] = {}  # reader_id -> last update timestamp
_READER_ACTIVITY_INTERVAL = 5  # seconds between DB writes

def _update_reader_activity(
    reader_id: int,
    *,
    device_name: Optional[str] = None,
    last_data: bool = False,
) -> None:
    """Update reader last_seen (and optionally name, last_data_at). Throttled to avoid DB churn."""
    import time
    now = time.monotonic()
    # Always write for device_name updates; throttle routine last_seen/last_data
    if device_name is None:
        last_write = _reader_activity_cache.get(reader_id, 0)
        if now - last_write < _READER_ACTIVITY_INTERVAL:
            return
    _reader_activity_cache[reader_id] = now

    db = SessionLocal()
    try:
        reader = db.query(Reader).filter(Reader.id == reader_id).first()
        if not reader:
            return
        reader.last_seen = datetime.utcnow()
        if device_name is not None:
            reader.name = device_name
        if last_data:
            reader.last_data_at = datetime.utcnow()
        db.commit()
    finally:
        db.close()


def _update_reader_activity_by_patient(patient_id: int) -> None:
    """Update last_data_at for all paired readers assigned to this patient."""
    db = SessionLocal()
    try:
        readers = db.query(Reader).filter(
            Reader.patient_id == patient_id,
            Reader.is_paired == True,
        ).all()
        now = datetime.utcnow()
        for reader in readers:
            reader.last_seen = now
            reader.last_data_at = now
        if readers:
            db.commit()
    finally:
        db.close()


async def start_reader_activity_subscriber(event_bus) -> None:
    """Subscribe to MQTT SensorUpdate events and update reader activity."""
    from events import SensorUpdate, EventSource
    async for event in event_bus.subscribe_to_type(SensorUpdate):
        try:
            if event.source == EventSource.MQTT and event.patient_id is not None:
                _update_reader_activity_by_patient(event.patient_id)
        except Exception as e:
            logger.error(f"Error updating reader activity from MQTT: {e}")


@router.websocket("/ws/{reader_id}")
async def reader_websocket(websocket: WebSocket, reader_id: int):
    """
    WebSocket endpoint for reader data ingestion.
    Uses short-lived DB sessions per operation so the connection pool is not held for the socket lifetime.
    Messages are encrypted with the reader's Fernet key.
    """
    from main import event_bus  # Import here to avoid circular import

    db = SessionLocal()
    try:
        reader = get_reader(db, reader_id)
        if not reader:
            await websocket.close(code=4004, reason="Reader not found")
            return
        if not reader.is_paired:
            await websocket.close(code=4003, reason="Reader not paired")
            return
        if not reader.encryption_key:
            await websocket.close(code=4003, reason="No encryption key")
            return
        patient_id = reader.patient_id
        encryption_key = reader.encryption_key
    finally:
        db.close()

    await connection_manager.connect(reader_id, websocket, encryption_key)
    _update_reader_activity(reader_id)

    try:
        while True:
            data = await websocket.receive_bytes()
            try:
                message = connection_manager.decrypt(reader_id, data)
            except Exception as e:
                logger.error(f"Decryption failed for reader {reader_id}: {e}")
                continue

            msg_type = message.get('type')

            if msg_type == 'handshake':
                device_name = message.get('device_name')
                _update_reader_activity(reader_id, device_name=device_name)
                await connection_manager.send(reader_id, {"type": "pong"})

            elif msg_type == 'ping':
                await connection_manager.send(reader_id, {"type": "pong"})

            elif msg_type == 'sensor':
                values = _sensor_values_from_message(message)
                ts_str = message.get('ts')
                if event_bus and values:
                    event = SensorUpdate(
                        ts=datetime.fromisoformat(ts_str) if ts_str else datetime.utcnow(),
                        values=values,
                        raw=json.dumps(message),
                        source=EventSource.READER,
                        patient_id=patient_id
                    )
                    await event_bus.publish(event)
                    logger.debug("Reader %s: published sensor %s", reader_id, {k: values.get(k) for k in ('spo2', 'bpm', 'perfusion') if k in values})
                _update_reader_activity(reader_id, last_data=True)

            elif msg_type == 'alarm':
                if event_bus:
                    event = AlarmPanelState(
                        ts=datetime.fromisoformat(message.get('ts')) if message.get('ts') else datetime.utcnow(),
                        alarm1=message.get('alarm1', False),
                        alarm2=message.get('alarm2', False),
                        source=EventSource.READER,
                        patient_id=patient_id
                    )
                    await event_bus.publish(event)
                _update_reader_activity(reader_id)

            elif msg_type == 'cache_sync':
                records = message.get('records', [])
                event_ids = message.get('event_ids', [])
                for record in records:
                    record_type = record.get('type')
                    if record_type == 'sensor' and event_bus:
                        values = _sensor_values_from_message(record)
                        if values:
                            event = SensorUpdate(
                                ts=datetime.fromisoformat(record.get('ts')) if record.get('ts') else datetime.utcnow(),
                                values=values,
                                raw=json.dumps(record),
                                source=EventSource.READER,
                                patient_id=patient_id
                            )
                            await event_bus.publish(event)
                    elif record_type == 'alarm' and event_bus:
                        event = AlarmPanelState(
                            ts=datetime.fromisoformat(record.get('ts')) if record.get('ts') else datetime.utcnow(),
                            alarm1=record.get('alarm1', False),
                            alarm2=record.get('alarm2', False),
                            source=EventSource.READER,
                            patient_id=patient_id
                        )
                        await event_bus.publish(event)
                await connection_manager.send(reader_id, {"type": "ack", "event_ids": event_ids})
                _update_reader_activity(reader_id, last_data=True)
                logger.info(f"Reader {reader_id} synced {len(records)} cached records")

    except WebSocketDisconnect:
        logger.info(f"Reader {reader_id} disconnected")
    except Exception as e:
        logger.error(f"Reader {reader_id} error: {e}")
    finally:
        connection_manager.disconnect(reader_id)
