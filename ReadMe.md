# Smart Home Health Hub

Smart Home Health is a home care monitoring system designed for families who need to track the health and daily care of a loved one. It provides an easy way to record medications, vitals, equipment, and nutrition in one place, with a focus on being simple to set up and use. Built with a modern web stack (FastAPI + React, backed by PostgreSQL), it's designed to grow with your needs while staying accessible to non-technical users.

## Features

- **Real-time Vital Monitoring**: Track blood pressure, temperature, pulse oximetry (SpO2), and heart rate
- **Medication Management**: Schedule and log medication administration
- **Care Task Tracking**: Manage daily care tasks and equipment usage
- **Nutrition Logging**: Record nutritional intake and dietary information
- **Real-time Alerts**: Get notified when vitals fall outside normal ranges
- **Historical Data**: View trends and history of all health metrics
- **MQTT Integration**: Connect to external devices and home automation systems
- **Serial Device Support**: Interface with medical devices via serial connection
- **Modern Web Interface**: Responsive dashboard accessible from any device

## Technology Stack

### Backend
- **FastAPI**: Modern Python web framework for APIs
- **PostgreSQL**: Reliable database for health data storage
- **Alembic**: Database migrations
- **MQTT**: Device communication protocol
- **WebSockets**: Real-time data streaming

### Frontend
- **React**: Modern user interface framework
- **Vite**: Fast development and build tool
- **Chart.js**: Additional charting capabilities

## Prerequisites

Before you begin, ensure you have the following installed:

- **Docker** and **Docker Compose**
- **Git**

For development without Docker, you'll need:
- **Python 3.11+**
- **Node.js 20+** and npm
- **PostgreSQL 15+**

## Quick Start with Docker (Recommended)

### 1. Clone the Repository

```bash
git clone https://github.com/johnrcarty/smart-home-health-hub.git
cd smart-home-health-hub
```

### 2. Configure Environment (Optional)

Create a `.env.docker` file to customize settings (optional - has sensible defaults):

```env
# MQTT Configuration (point to your Home Assistant or external broker)
MQTT_BROKER=192.168.1.12
MQTT_PORT=1883
MQTT_USERNAME=your_username
MQTT_PASSWORD=your_password

# Serial Device (uncomment devices in docker-compose.yml if using)
SERIAL_PORT=/dev/ttyUSB0
SERIAL_BAUD_RATE=9600
```

### 3. Start the Application

```bash
# Start all services (database, backend, frontend)
docker compose up -d

# View logs
docker compose logs -f backend
```

That's it! The application will:
- Automatically create the database
- Run database migrations
- Start the backend API server
- Start the frontend development server

**Access the application:**
- **Web Interface**: http://localhost:5173
- **API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs

### Docker Management Commands

```bash
# Stop all services
docker compose down

# Restart a specific service
docker compose restart backend

# View logs
docker compose logs backend --tail 50
docker compose logs frontend --tail 50

# Rebuild after code changes
docker compose up -d --build backend

# Access database
docker compose exec db psql -U shh_user -d shh

# Access backend shell
docker compose exec backend /bin/sh
```

## Serial Device Setup (Raspberry Pi)

If you're using serial medical devices (pulse oximeter, etc.) on a Raspberry Pi:

1. Uncomment the device mappings in `docker-compose.yml`:

```yaml
devices:
  - /dev/ttyUSB0:/dev/ttyUSB0
  - /dev/ttyACM0:/dev/ttyACM0
```

2. Ensure the user has permission to access serial devices:

```bash
sudo usermod -a -G dialout $USER
```

3. Restart Docker containers:

```bash
docker compose restart backend
```

## Production Deployment

For production deployment, use the production compose file:

```bash
# Build and start in production mode
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# The frontend will be served via nginx on port 80
# The backend runs with multiple workers for better performance
```

## Manual Setup (Development without Docker)

<details>
<summary>Click to expand manual setup instructions</summary>

### Backend Setup

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Create `.env` file:
```env
DATABASE_URL=postgresql://shh_user:shh_dev_pass@localhost:5432/shh
```

Setup database:
```bash
createdb shh
alembic upgrade head
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

</details>

## Usage

### Initial Setup

1. Open your web browser and navigate to http://localhost:5173
2. The system will initialize with default settings
3. Configure your alert thresholds in the Settings panel
4. Begin recording vitals manually or connect supported devices

### Recording Vitals

- **Manual Entry**: Use the vitals form to manually input blood pressure, temperature, and other measurements
- **Device Integration**: Connect compatible MQTT or serial devices for automatic data collection
- **Real-time Monitoring**: View live data streams on the dashboard

### Medication Management

- Add medications with dosing schedules
- Log when medications are administered
- View medication history and adherence

### Care Tasks

- Create custom care task categories
- Schedule recurring tasks
- Track completion status

## Device Integration

### MQTT Devices

The system supports MQTT-enabled medical devices and integrates with **Home Assistant** for home automation.

**Configuration:**

1. Set your MQTT broker address in the settings (via web UI or environment variables)
2. Configure MQTT topics in the web interface under Settings → MQTT
3. Enable nutrition tracking topics for water and calorie monitoring
4. The system automatically publishes:
   - Vital signs (SpO2, heart rate, blood pressure, temperature)
   - Nutrition intake, scheduled, and target values
   - Alarm states

**Home Assistant Integration:**

The system uses MQTT Discovery to automatically create sensors in Home Assistant:
- Real-time vital sign sensors
- Nutrition tracking (intake, scheduled progress, daily targets)
- Binary sensors for alarms
- Availability monitoring

### Serial Devices

For devices that communicate via serial port (pulse oximeters, etc.), configure in Docker:

```yaml
# In docker-compose.yml, uncomment:
devices:
  - /dev/ttyUSB0:/dev/ttyUSB0
  - /dev/ttyACM0:/dev/ttyACM0
```

Set the serial port in environment variables or settings panel.

## Development

### Backend Development

The backend uses FastAPI with a modular architecture:

- `main.py`: Main application, API routes, and module initialization
- `models.py`: Database models (SQLAlchemy)
- `crud/`: Database operations organized by domain
- `routes/`: API endpoints for each feature area
- `modules/`: Core system modules (MQTT, Serial, WebSocket, GPIO, State)
- `mqtt/`: MQTT client, discovery, and publishing
- `events.py`: Event system for inter-module communication
- `bus.py`: Event bus for pub/sub messaging

**Hot Reload:** The Docker development setup automatically reloads on code changes.

### Frontend Development

The React frontend is organized as:

- `src/components/`: Reusable UI components
- `src/pages/`: Page-level components
- `src/services/`: API communication
- `src/contexts/`: React context providers
- `src/config.js`: Configuration management

**Hot Reload:** Vite provides instant HMR (Hot Module Replacement).

### Database Migrations

Create a new migration after changing models:

```bash
# Using Docker
docker compose exec backend alembic revision --autogenerate -m "Description"
docker compose exec backend alembic upgrade head

# Or manually
cd backend
alembic revision --autogenerate -m "Description of changes"
alembic upgrade head
```

### Architecture

The system uses an event-driven architecture:

1. **Event Bus**: Central pub/sub system for inter-module communication
2. **Modules**: Independent modules (MQTT, Serial, GPIO, WebSocket, State) subscribe to events
3. **State Manager**: Maintains global state and broadcasts updates via WebSocket
4. **MQTT Integration**: Bidirectional communication with Home Assistant
5. **Real-time Updates**: WebSocket pushes live data to frontend clients

## Troubleshooting

### Common Issues

1. **Port Already in Use**
   - Stop conflicting services: `sudo lsof -i :8000` or `:5173`
   - Change ports in docker-compose.yml if needed

2. **Database Connection Issues**
   - Check if database container is healthy: `docker compose ps`
   - View database logs: `docker compose logs db`
   - Restart database: `docker compose restart db`

3. **MQTT Connection Issues**
   - Verify MQTT broker is accessible from Docker network
   - Use the broker's IP address, not `localhost`
   - Check credentials in Settings panel or environment variables
   - View MQTT logs: `docker compose logs backend | grep -i mqtt`

4. **Serial Device Not Found**
   - Uncomment device mappings in docker-compose.yml
   - Check device exists: `ls -l /dev/ttyUSB*`
   - Add user to dialout group: `sudo usermod -a -G dialout $USER`
   - Restart Docker after group changes

5. **Container Won't Start**
   - View logs: `docker compose logs backend --tail 100`
   - Check for syntax errors in code
   - Rebuild: `docker compose up -d --build`

6. **Frontend Not Loading**
   - Check frontend logs: `docker compose logs frontend`
   - Verify backend is running: `curl http://localhost:8000/api/status`
   - Clear browser cache

### Viewing Logs

```bash
# All services
docker compose logs -f

# Specific service with filter
docker compose logs backend --tail 100 | grep -i "error\|warning"
docker compose logs backend --tail 50 | grep -i "mqtt\|nutrition"

# Follow logs in real-time
docker compose logs -f backend
```

### Accessing Containers

```bash
# Backend shell
docker compose exec backend /bin/sh

# Database shell
docker compose exec db psql -U shh_user -d shh

# Check Python environment
docker compose exec backend python --version
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes and test thoroughly
4. Commit your changes: `git commit -am 'Add some feature'`
5. Push to the branch: `git push origin feature-name`
6. Submit a pull request

## Support

For support, please:

1. Check the troubleshooting section above
2. Review the API documentation at http://localhost:8000/docs
3. Open an issue on the GitHub repository

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Built with FastAPI and React
- Charts powered by SciChart and Chart.js
- Database management with PostgreSQL and Alembic
- Real-time communication via WebSockets and MQTT