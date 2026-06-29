# Smart Home Health

Smart Home Health is a home‑care monitoring system for families and caregivers who
need to track the health and daily care of a loved one. It brings medications,
vitals, equipment, nutrition, scheduling, and clinical records together in one place,
with a focus on being simple to set up and use while still able to grow into more
complex care situations (multiple patients, ventilator monitoring, EHR ingest).

Built with a modern web stack — **FastAPI + React (Vite), backed by PostgreSQL /
TimescaleDB** — and an event‑driven backend that fans real‑time updates out to the
browser over WebSockets and bridges to MQTT / home‑automation systems.

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

- **Epic / FHIR R4 (EHR)** — _experimental / work in progress._ Pulls blood work
  (lab Observations) and imaging narratives via the SMART‑on‑FHIR patient‑access API.
  Internal vital/unit types are mapped to standard **LOINC** and **UCUM** codes
  ("FHIR at the edges, native core"). The connector is built but not yet validated
  against a live Epic endpoint.
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

The app requires a **TimescaleDB** database (it uses hypertables — plain PostgreSQL
will fail migrations). Both methods below provision the right database container for
you; the database always runs separately from the app.

## Run it (recommended)

Runs the published **single image** — the backend API and the built web UI served
together on one port — alongside a TimescaleDB container. It pulls
[`smarthomehealth/platform`](https://hub.docker.com/r/smarthomehealth/platform)
from Docker Hub (multi‑arch: amd64 + arm64), so there's nothing to build.

```bash
git clone https://github.com/Smart-Home-Health/platform.git
cd platform

cp .env.example .env          # then set JWT_SECRET_KEY and POSTGRES_PASSWORD
docker compose -f docker-compose.prod.yml up -d
```

`JWT_SECRET_KEY` is **required** (`openssl rand -hex 32`) — the app refuses to start
on an insecure default. Pin a version with `APP_IMAGE=smarthomehealth/platform:<tag>`.

**Access the application:**
- **Web app + API**: http://localhost:8000
- **API docs (Swagger)**: http://localhost:8000/docs

On first launch you'll be guided through admin **first‑run setup**. It also works
from a phone or other LAN device (e.g. `http://192.168.1.184:8000`). For publishing
and deployment details, see [`docs/unified-image.md`](docs/unified-image.md).

## Develop it (hot reload)

The development stack runs the frontend (Vite) and backend (uvicorn `--reload`) as
**two containers** with live reload, for working on the code.

```bash
docker compose up -d
```

On startup the stack creates the database, runs Alembic migrations
(`alembic upgrade head`), and starts both dev servers.

**Access the application:**
- **Web interface**: http://localhost:5173
- **API**: http://localhost:8000
- **API docs (Swagger)**: http://localhost:8000/docs

The web UI works from a phone or other LAN device too (e.g.
`http://192.168.1.184:5173`); it reaches the backend on the same origin via the Vite
dev proxy. Integration credentials and other optional settings go in `backend/.env`
for dev — see [`.env.example`](.env.example) for the recognized variables.

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

1. Open the web app (http://localhost:8000 for the single‑image run, or
   http://localhost:5173 in dev) and sign in (or create the first user).
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
