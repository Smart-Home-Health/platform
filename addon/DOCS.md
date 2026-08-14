# Smart Home Health — Home Assistant add-on

A self-contained appliance: this add-on bundles **PostgreSQL + TimescaleDB** and
the unified FastAPI/SPA app in one container, and is reached through the Home
Assistant sidebar via **ingress**. A direct LAN port (8000) is also published
for shared-device iframes — see "Sign in with Home Assistant" below.

## What's inside / how data is stored

- PostgreSQL (with the TimescaleDB extension) runs **inside the add-on**. Its data
  directory lives at `/data/pgdata`, and uploaded artifacts at `/data/appdata` —
  both on the add-on's auto-persistent `/data`, so they survive restarts and
  updates.
- The app serves itself on internal port `8000`; HA's ingress proxies to it
  same-origin under a per-token path prefix. The app is base-path aware (the
  backend injects HA's `X-Ingress-Path` into the SPA shell), so assets, the
  client-side router, and the live-data WebSocket all resolve under the prefix.

## Installation

**Option A — local add-on (quickest for testing).** Copy this `addon/` folder to
`/addons/smart_home_health/` on the HA host (Samba/SSH add-on), then
**Settings → Add-ons → Add-on Store → ⋮ → Check for updates**. The store will pull
the prebuilt image referenced in `config.yaml`.

**Option B — add-on repository.** Add this repo's URL under **Add-on Store → ⋮ →
Repositories**, then install "Smart Home Health".

Open it from the sidebar once started (the "Health Hub" panel).

## Configuration options

| Option | Default | Notes |
| --- | --- | --- |
| `jwt_secret` | _(blank)_ | Token signing secret. Leave blank to auto-generate one (persisted to `/data/jwt_secret`). |
| `skip_account_password` | `false` | Skip the account-password login and drop straight into user selection (monitoring mode). See below. |
| `ha_identity_login` | `true` | Sign users in from their Home Assistant login when the app is opened through ingress. See below. |
| `min_spo2` / `max_spo2` | `90` / `100` | SpO₂ alarm thresholds. |
| `min_bpm` / `max_bpm` | `55` / `155` | Heart-rate alarm thresholds. |
| `log_level` | `info` | Add-on log verbosity. |

### Sign in with Home Assistant (`ha_identity_login`)

When the app is opened from the HA sidebar (ingress), Home Assistant forwards
who is logged in. The app uses that two ways:

- **Linked HA user** → signed in as their app profile immediately: no account
  password, no user picker, and no daily password re-prompt (the HA login
  counts as a full login). Link users under **Configuration → Users → Home
  Assistant users** — anyone who has opened the panel once appears there.
- **Unlinked HA user** → the account password is skipped (HA already
  authenticated them) and the normal user picker is shown.

Locking the app or choosing **Switch user** brings the picker back and it stays
until a profile is chosen — reopening from the sidebar in a *new* tab signs the
linked user in again.

**Shared devices (wall tablet, med-station Pi):** use the direct LAN address
(port `8000`, e.g. `http://<ha-host>:8000`) in a dashboard iframe card instead
of ingress. That path always shows the user picker, so a shared screen never
inherits anyone's identity. Ingress URLs also rotate on reinstall — never
hardcode an ingress URL in an iframe card.

**Security:** identity headers are only trusted when the request's TCP peer is
the Supervisor's ingress proxy (`172.30.32.2`). Requests on the LAN port that
carry forged identity headers are rejected. Requires Home Assistant Core
≥ 2023.9 (older versions simply fall back to the picker flow).

### Home Assistant user directory

**Configuration → Users → Home Assistant users** lists everyone with an HA
login (fetched through the Supervisor API), each marked *Linked*, *Opened the
app*, or *Never opened the app*. For anyone not yet linked you can:

- **Link** them to an existing app profile,
- **Create profile** — a one-step import: pick roles (and patients); no
  password is set because their HA login signs them in. A password or PIN can
  be added later for shared devices.
- **Add as patient** — creates a patient record with the name prefilled.

Running outside Home Assistant (Docker Compose), the Supervisor API isn't
available; the list falls back to HA users who have opened the app at least
once. The directory needs the `hassio_api`/`homeassistant_api` permissions in
this add-on's manifest — on upgrades from 0.1.0 they only take effect after a
full uninstall + reinstall (back up `/data` first).

### `skip_account_password`

When enabled, the app skips the account-password screen and goes straight to user
selection in **monitoring mode** (the live dashboard is glanceable without a login;
authenticating as a user unlocks full read access). Leave it off to require the
account password as usual.

### MQTT

If you run the Mosquitto add-on, this add-on requests its connection info
(`services: mqtt:want`) so the broker host can be seeded automatically. MQTT
topics are still managed in the app's own settings.

## Building the image

The image is **not** built by the add-on folder alone — it needs both `backend/`
and `frontend/`, so it's built from the repo root with buildx:

```bash
REGISTRY=ghcr.io/smart-home-health VERSION=0.2.0 bash scripts/build-addon.sh
```

This publishes per-arch images (`amd64-addon`, `aarch64-addon`) that
`config.yaml` references.
