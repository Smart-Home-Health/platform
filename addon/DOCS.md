# Smart Home Health — Home Assistant add-on

A self-contained appliance: this add-on bundles **PostgreSQL + TimescaleDB** and
the unified FastAPI/SPA app in one container, and is reached through the Home
Assistant sidebar via **ingress** (no exposed port required).

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
| `min_spo2` / `max_spo2` | `90` / `100` | SpO₂ alarm thresholds. |
| `min_bpm` / `max_bpm` | `55` / `155` | Heart-rate alarm thresholds. |
| `log_level` | `info` | Add-on log verbosity. |

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
REGISTRY=ghcr.io/smart-home-health VERSION=0.1.0 bash scripts/build-addon.sh
```

This publishes per-arch images (`amd64-addon`, `aarch64-addon`) that
`config.yaml` references.
