"""
Reader API routes for SHH Reader device management

Handles pairing, management, and WebSocket data ingestion from reader devices.
"""

import asyncio
import json
import logging
import os
import secrets
from datetime import datetime
from typing import Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from pydantic import BaseModel
from cryptography.fernet import Fernet
import httpx

from db import get_db, SessionLocal
from dependencies import require_read_access
from models.readers import Reader
from bus import EventBus
from events import SensorUpdate, AlarmPanelState, EventSource

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


class PairConfirm(BaseModel):
    reader_id: int
    code: str
    host_url: Optional[str] = None


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
    encryption_key = Fernet.generate_key().decode()
    reader = Reader(
        name=name or f"Reader-{ip_address}",
        ip_address=ip_address,
        port=port,
        patient_id=patient_id,
        encryption_key=encryption_key,
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
    
    reader = create_reader(db, data.ip_address, data.name, data.patient_id)
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

# Store pending pairing codes: reader_id -> code
pending_pairings: Dict[int, str] = {}


def _reader_facing_ws_url(reader_id: int, request_host_url: Optional[str]) -> str:
    """
    URL the host gives to the reader during pairing. Uses READER_FACING_BASE_URL
    when set (e.g. http://host.docker.internal:8000 so readers in Docker can reach host);
    otherwise uses the URL provided by the client (e.g. from frontend API_BASE_URL).
    Path must match the WebSocket route: /api/readers/ws/{reader_id}.
    """
    base = os.environ.get("READER_FACING_BASE_URL", "").strip() or request_host_url
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
    2. Sends pairing request to reader (host gives reader the URL to connect back to)
    3. Returns pairing code from reader for user to confirm
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
    
    try:
        # Send pairing request to reader
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"http://{data.ip_address}:{data.port}/api/pair",
                json={
                    "host_url": host_ws_url,
                    "encryption_key": reader.encryption_key
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=502, detail="Reader rejected pairing request")
            
            result = response.json()
            code = result.get('code')
            device_name = result.get('device_name')
            
            if not code:
                raise HTTPException(status_code=502, detail="Reader did not return pairing code")
            
            # Store pending pairing
            pending_pairings[reader.id] = code
            
            # Update reader name if provided
            if device_name and reader.name.startswith("Reader-"):
                update_reader(db, reader, name=device_name)
            
            return {
                "success": True,
                "reader_id": reader.id,
                "reader_name": device_name or reader.name,
                "code": code,
                "message": "Confirm the code shown on the reader device"
            }
            
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Cannot reach reader at {data.ip_address}: {e}")


@router.post("/pair/confirm")
async def confirm_pairing(
    data: PairConfirm,
    db: Session = Depends(get_db)
):
    """
    Confirm pairing with the code shown on reader.
    
    Completes the pairing process and instructs reader to start connection.
    """
    reader = get_reader(db, data.reader_id)
    if not reader:
        raise HTTPException(status_code=404, detail="Reader not found")
    
    expected_code = pending_pairings.get(data.reader_id)
    if not expected_code:
        raise HTTPException(status_code=400, detail="No pending pairing for this reader")
    
    if data.code != expected_code:
        raise HTTPException(status_code=400, detail="Invalid pairing code")
    
    # Same URL the host gives to the reader (must match initiate_pairing)
    host_ws_url = _reader_facing_ws_url(reader.id, data.host_url)
    
    try:
        # Confirm pairing with reader
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"http://{reader.ip_address}:{reader.port}/api/pair/confirm",
                json={
                    "code": data.code,
                    "host_url": host_ws_url,
                    "encryption_key": reader.encryption_key
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=502, detail="Reader rejected confirmation")
            
            result = response.json()
            if not result.get('success'):
                raise HTTPException(status_code=502, detail=result.get('error', 'Unknown error'))
        
        # Update reader as paired
        update_reader(db, reader, is_paired=True, paired_at=datetime.utcnow())
        
        # Clear pending pairing
        pending_pairings.pop(data.reader_id, None)
        
        return {
            "success": True,
            "reader": reader.to_dict(),
            "message": "Reader paired successfully"
        }
        
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Cannot reach reader: {e}")


@router.post("/{reader_id}/unpair")
async def unpair_reader(
    reader_id: int,
    db: Session = Depends(get_db)
):
    """Unpair a reader"""
    reader = get_reader(db, reader_id)
    if not reader:
        raise HTTPException(status_code=404, detail="Reader not found")
    
    # Generate new encryption key (invalidates old one)
    new_key = Fernet.generate_key().decode()
    update_reader(
        db, reader,
        is_paired=False,
        paired_at=None,
        encryption_key=new_key
    )
    
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
