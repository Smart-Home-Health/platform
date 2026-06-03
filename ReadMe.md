# Smart Home Health Hub

Smart Home Health is a home‑care monitoring system for families and caregivers who
need to track the health and daily care of a loved one. It brings medications,
vitals, equipment, nutrition, scheduling, and clinical records together in one place,
with a focus on being simple to set up and use while still able to grow into more
complex care situations (multiple patients, ventilator monitoring, EHR ingest).

Built with a modern web stack — **FastAPI + React (Vite), backed by PostgreSQL** —
and an event‑driven backend that fans real‑time updates out to the browser over
WebSockets and bridges to MQTT / home‑automation systems.

> **For contributors:** architecture details (the event bus, models‑vs‑schemas split,
> auth middleware, migrations, integration registry) live in [`CLAUDE.md`](CLAUDE.md).
> This README covers what the app does and how to run it.

## Features

**Care tracking**
- **Vitals** — blood pressure, temperature, pulse oximetry (SpO₂), heart rate, weight,
  and custom vital definitions, with real‑time monitoring and historical trends
- **Medications** — schedules, administration logging, adherence history, and overdue/
  grace‑period handling
- **Care tasks** — categorized recurring tasks with scheduling and completion logs
- **Equipment & DME** — equipment tracking with change logs, plus durable medical
  equipment (DME) shipment tracking and alerts
- **Nutrition** — intake, output, goals, and scheduled targets
- **Symptoms** — symptom logging over time

**Clinical records**
- **Diagnoses, implants, and providers** per patient
- **Lab & imaging results** ingested from EHRs (see FHIR / Epic below)

**Monitoring & alerts**
- **Real‑time alerts** when vitals fall outside configured thresholds
- **Ventilator monitoring** — device info, parameters, samples, and alert parsing from
  uploaded vent logs
- **Reports** — overnight, weekly, and day‑over‑day summaries

**Platform**
- **Multi‑patient and multi‑business** support
- **Role‑based access control** — users, roles, and fine‑grained permissions
- **Backup & restore** of application data
- **Modern responsive web UI**, accessible from a phone or other LAN device
- **Home Assistant friendly** — works embedded in an iframe and publishes state to MQTT

## Integrations

Third‑party data sources self‑register through an integration registry and are managed
under **Settings → Integrations** in the web UI:

- **Epic / FHIR R4 (EHR)** — pulls blood work (lab Observations) and imaging narratives
  via the SMART‑on‑FHIR patient‑access API. Internal vital/unit types are mapped to
  standard **LOINC** and **UCUM** codes ("FHIR at the edges, native core").
- **Withings** — vitals from Withings devices via their cloud API
- **MQTT** — generic MQTT‑enabled devices and home‑automation systems
- **Frigate** — NVR / camera event integration
- **Manual entry** — REST‑based manual vital entry

> Reader/edge devices (serial & GPIO medical devices such as pulse oximeters) are
> handled by the **separate `shh-reader` app**, which connects back over a dedicated
> authenticated WebSocket channel. Direct serial/GPIO device access has been moved
> out of this repo — the device mappings in `docker-compose.yml` are commented out
> for that reason.

## Prerequisites

- **Docker** and **Docker Compose**
- **Git**

## Quick Start with Docker (Recommended)

### 1. Clone the repository

```bash
git clone https://github.com/Smart-Home-Health/smart-home-health-hub.git
cd smart-home-health-hub
```

### 2. Configure environment

The backend reads its environment from `backend/.env` (mounted via `env_file` in
`docker-compose.yml`). At minimum the database URL is provided by Compose; add
integration credentials here as needed, for example:

```env
# Epic / FHIR app registration (https://fhir.epic.com)
EPIC_CLIENT_ID=your-client-id
EPIC_CLIENT_SECRET=your-client-secret   # only for a confidential client
```

### 3. Start the application

```bash
docker compose up -d
```

On startup the stack will:
- create the PostgreSQL database
- run Alembic migrations (`alembic upgrade head`)
- start the backend API (FastAPI / uvicorn with hot reload)
- start the frontend dev server (Vite)

**Access the application:**
- **Web interface**: http://localhost:5173
- **API**: http://localhost:8000
- **API docs (Swagger)**: http://localhost:8000/docs

Because the frontend resolves the API URL from the current hostname at runtime, the
app also works when opened from a phone or other device on your LAN
(e.g. `http://192.168.1.184:5173`).

### Useful commands

```bash
docker compose logs -f backend     # Tail backend logs
docker compose logs -f frontend    # Tail frontend logs
docker compose restart backend     # After changes that don't hot-reload (e.g. requirements.txt)

# Database migrations (run inside the backend container)
docker compose exec backend alembic revision --autogenerate -m "description"
docker compose exec backend alembic upgrade head
```

## Usage

### Initial setup

1. Open http://localhost:5173 and sign in (or create the first user).
2. Add a patient and configure alert thresholds under Settings.
3. Start recording vitals manually, or connect a device/integration.

### Recording vitals

- **Manual entry** — enter blood pressure, temperature, SpO₂, and other measurements
- **Integrations** — connect Withings, Epic/FHIR, or MQTT sources for automatic data
- **Edge devices** — the external `shh-reader` app streams readings from serial/GPIO
  devices over the readers WebSocket channel
- **Real‑time monitoring** — watch live data update on the dashboard

### Device integration via MQTT

The system integrates with **Home Assistant** and other MQTT‑enabled devices.

1. Set your MQTT broker address under **Settings → MQTT** in the web UI.
2. Configure the topics to publish/subscribe (vitals, nutrition, alarm states).
3. The system publishes vital signs, nutrition (intake/scheduled/target), and alarm
   states, and ingests incoming readings — with loop‑prevention so MQTT‑sourced
   updates are not re‑published.

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)** —
see the [`LICENSE`](LICENSE) file for the full text.

In plain terms: the software is free and always stays free. Anyone may use, run, study,
and modify it, but **every distributed or network‑hosted version must remain open under
this same license** — no one can take it, make it proprietary, and sell it as their own
product. Charging for services around it (setup, installation, support) is fine; the
software itself cannot be locked up or resold. Because AGPL covers network use, anyone
who runs a modified version as a hosted service must also offer its source to users.
