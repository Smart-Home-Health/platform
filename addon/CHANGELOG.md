# Changelog

## 0.2.2

- **Home Assistant sensors as data sources.** Map any HA entity to a patient
  vital (SpO2, blood pressure, temperature, …) or an environmental metric
  under **Configuration → Home Assistant**. Zero-config when running as the
  add-on (Supervisor connection); standalone installs use a long-lived access
  token. Units are converted automatically (°F, inHg, mg/m³, …), and the
  app's own MQTT-published entities are excluded so nothing loops back.
- **Room sensors on the monitoring timeline.** Room-scoped series
  (temperature, humidity, CO2, PM2.5) with a room picker; location
  suggestions come straight from your Home Assistant areas, so rooms stay
  consistent between the two platforms.
- **Patient care area.** Set the room a patient occupies; MQTT discovery now
  publishes it as the suggested area, so the patient's entities land in the
  right HA area automatically.
- **MQTT discovery polish.** Alarm-panel states are included in the combined
  state; disabling MQTT for a patient (or single sections) now deletes the
  retained discovery entities instead of leaving orphans; temperature,
  weight, and pressure entities carry proper device classes; each paired
  reader gets a connectivity sensor in HA.
- **Better on phones.** Dialogs fit small screens, the Home Assistant mapping
  list becomes cards, and section navigation is a scrollable strip with
  scroll hints.
- Smaller image: removed 9 MB of dead vendored chart bundles.

## 0.2.1

- **Reader devices work correctly under ingress.** Pairing a pulse-ox reader
  while browsing from the HA sidebar now hands the device the hub's LAN
  address (`http://<host>:8000`) instead of an unreachable ingress URL; the
  backend also rejects ingress URLs outright as a backstop.
- **Reader connection protection.** A live reader's connection slot can no
  longer be taken over by an unauthenticated LAN peer — a reconnecting device
  must prove it holds the pairing key with its first encrypted message before
  the existing connection is replaced (replay-protected). Normal reconnects
  are unaffected.
- The reader data channel itself was audited and is untouched by the ingress
  work — already-paired readers keep streaming as before.

## 0.2.0

- **Home Assistant user directory.** Configuration → Users now lists *every*
  HA user (via the Supervisor API), not just those who have opened the app.
  Link them to existing profiles, **create a profile for them in one step**
  (no password — their HA login signs them in), or add them as a patient.
- **Sign in with Home Assistant.** When the app is opened through ingress (the
  sidebar panel), it now knows which HA user is at the keyboard. Link an HA user
  to an app profile under **Configuration → Users → Home Assistant users** and
  they are signed in automatically — no password, no user picker. Unlinked HA
  users skip the account password and land on the user picker.
- **Direct LAN port (8000) for shared devices.** Wall tablets and shared
  stations can embed the app via a dashboard iframe card using the LAN address.
  That path always shows the user picker — identity auto-login works only
  through ingress, and the app verifies requests really came from the ingress
  proxy before trusting identity headers.
- **Sidebar entry for every HA user** (`panel_admin: false`) — the app enforces
  its own roles and permissions.
- New option `ha_identity_login` (default `true`) to turn identity login off.
- Add-on icon and logo.

> **⚠️ Upgrade note:** the new LAN port and Supervisor API permissions require
> a full **uninstall + reinstall** of the add-on to take effect (Home Assistant
> only applies port/permission changes on install). **Uninstalling deletes the
> add-on's `/data` — take a Home Assistant backup of the add-on first and
> restore it after reinstalling.** A plain update gets you identity login
> through ingress; the LAN port and the user directory stay off until you
> reinstall.

## 0.1.0

- Initial release: bundled PostgreSQL/TimescaleDB + unified app, ingress panel,
  MQTT auto-discovery, monitoring-mode option.
