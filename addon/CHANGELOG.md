# Changelog

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
