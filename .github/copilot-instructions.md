# GitHub Copilot Instructions for Smart Home Health

## Project Overview

This is a real-time health monitoring system with Python FastAPI backend and React frontend, designed for continuous patient monitoring via serial sensors and MQTT integration.

## Core Architecture

### Data Flow Pattern
- **Serial Input**: `serial_reader.py` → `update_sensor()` → WebSocket broadcast + MQTT publish
- **MQTT Input**: MQTT `/set` topics → `mqtt_handler.py` → `update_sensor(from_mqtt=True)` → WebSocket broadcast (no republish)
- **Manual Input**: REST API → database → `publish_specific_vital_to_mqtt()` → MQTT publish

Critical: Use `from_mqtt=True` in `update_sensor()` calls from MQTT handlers to prevent republishing loops.

### State Management
- **Global State**: `state_manager.py` maintains `sensor_state` dict with latest values
- **Broadcasting**: `broadcast_state()` sends full state snapshot via WebSocket to React frontend
- **Database**: SQLAlchemy models in `models.py`, session management via `get_db()` dependency injection
- **MQTT**: Dual-topic pattern (listen on `/set`, broadcast to `/state`) with origin tracking for loop prevention

### Database Patterns
```python
# Standard database session pattern
def some_function(db: Session = Depends(get_db)):
    try:
        # Database operations
        result = db.query(Model).filter(...)
        db.commit()
        return result
    finally:
        # Session cleanup handled by dependency
        pass

# State manager context manager
from state_manager import get_db_session
with get_db_session() as db:
    # Operations here
```

## Key Components

### Backend Core Files
- `main.py`: FastAPI app with WebSocket endpoint `/ws/sensors`, REST API routes
- `state_manager.py`: Central state management, WebSocket broadcasting, MQTT publishing
- `mqtt_handler.py`: MQTT client with topic subscription and message processing
- `serial_reader.py`: Continuous serial data collection from medical devices
- `models.py`: SQLAlchemy ORM models for all data entities
- `crud.py`: Database operations layer

### Frontend Core Files
- `src/App.jsx`: Main WebSocket connection, real-time chart updates, modal management
- `src/components/ChartBlock.jsx`: Recharts-based real-time sensor visualization
- `src/components/SettingsForm.jsx`: MQTT configuration, system settings
- `src/config.js`: Environment-based API and WebSocket URL configuration

## Development Workflows

### Running the System
```bash
# Backend
cd backend
python main.py

# Frontend  
cd frontend
npm run dev
```

### Database Migrations
```bash
cd backend
alembic upgrade head              # Apply migrations
alembic revision --autogenerate -m "description"  # Create migration
```

### MQTT Testing
Use `/api/mqtt/test-connection` endpoint for connection validation. MQTT topics follow pattern:
- Listen: `shh/{vital}/set` 
- Broadcast: `shh/{vital}/state`

## Critical Patterns

### MQTT Loop Prevention
Always use `from_mqtt=True` when calling `update_sensor()` from MQTT message handlers:
```python
# In mqtt_handler.py
update_sensor(("vital_name", value), from_mqtt=True)
```

### WebSocket Real-time Updates
State changes automatically broadcast via WebSocket. Frontend subscribes to `/ws/sensors`:
```javascript
// Frontend pattern
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === "sensor_update") {
    // Update React state
  }
};
```

### Chart Data Management
Charts use time-based datasets with Unix timestamps:
```javascript
// Chart data format
{x: timestamp, y: value}
```

## Common Issues

- **Double MQTT publishing**: Ensure `from_mqtt=True` usage in handlers
- **Database session leaks**: Use dependency injection or context managers
- **WebSocket disconnections**: Frontend auto-reconnects, backend handles cleanup
- **Chart performance**: Use filtered datasets (last 5 minutes) for real-time charts

## Environment Configuration

Required `.env` variables:
- `DATABASE_URL`: PostgreSQL connection string
- `MIN_SPO2`, `MAX_SPO2`, `MIN_BPM`, `MAX_BPM`: Alarm thresholds
- Frontend uses `VITE_API_URL` for backend connection

## Integration Points

- **Home Assistant**: MQTT discovery messages via `/api/mqtt/send-discovery`
- **Serial Devices**: Pulse oximeter, temperature sensors via configurable serial ports
- **External Alarms**: GPIO-based alarm integration (Raspberry Pi specific)
- **Medication Management**: Scheduling system with care task integration
