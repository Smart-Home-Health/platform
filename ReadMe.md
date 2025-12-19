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


## Prerequisites

Before you begin, ensure you have the following installed:

- **Docker** and **Docker Compose**
- **Git**

## Quick Start with Docker (Recommended)

### 1. Clone the Repository

```bash
git clone https://github.com/johnrcarty/smart-home-health-hub.git
cd smart-home-health-hub
```

### 2. Configure Environment (Optional)

```env
# Serial Device (uncomment devices in docker-compose.yml if using)
SERIAL_PORT=/dev/ttyUSB0
```

### 3. Start the Application

```bash
# Start all services (database, backend, frontend)
docker compose up -d
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

1. Set your MQTT broker address in the settings (via web UI)
2. Configure MQTT topics in the web interface under Settings → MQTT
3. Enable nutrition tracking topics for water and calorie monitoring
4. The system automatically publishes:
   - Vital signs (SpO2, heart rate, blood pressure, temperature)
   - Nutrition intake, scheduled, and target values
   - Alarm states


## License

This project is licensed under the MIT License - see the LICENSE file for details.
