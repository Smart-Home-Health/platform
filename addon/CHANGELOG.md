# Changelog

## 0.4.0

Appearance. The light theme is back, now in the same bedside-monitor
language as dark, and there is a separate high-contrast switch (WCAG AAA
text, solid lines, stronger state colours). The live dashboard follows your
choice too — it is no longer pinned dark. No database migrations.

**Upgrade notes**

- **Nothing changes until you pick.** With no saved choice the app stays
  dark. A theme saved before 0.3.0 (Light or System) is honoured again on
  sign-in, so those users will see the new light theme; the sidebar's
  Appearance control or Account Settings → Appearance switches back.
- Contrast is its own setting (Normal / High) and combines with either
  theme. Saved to your profile when signed in, and on the device for the
  wall unit's quick-entry board.

**Appearance**

- Four palettes — dark, light, and a high-contrast version of each — defined
  once as design tokens; every screen, chart, dropdown and sheet reads them.
- Theme: Light / Dark / System. System follows the OS setting live.
- Pickers: an Appearance button in the sidebar footer, an Appearance card in
  Account Settings, and an Appearance view in the live dashboard's Settings
  panel.
- The browser/PWA chrome colour follows the palette.

**Fixed**

- Dropdowns and sheets opened from the live dashboard no longer disagree
  with the board's colours.
- Report charts were drawing their axes and grid in off-palette fallback
  colours; they read the design tokens now.
- Small text (captions, hints, stat labels, nav group labels) sat just under
  the WCAG AA contrast floor in dark and light; the tertiary text colour is
  lifted so every palette passes an automated axe contrast pass across the
  app (AAA in the high-contrast palettes).
- Button text on accent fills used the page colour, which was nearly
  invisible in light.

## 0.3.0

The interface release. Every screen — the live dashboard, the admin, the
sign-in flow, the phone capture surface — now shares one bedside-monitor
design language, and a long list of bugs surfaced by the rebuild are fixed
underneath it. Migrations 041–053 apply automatically on first start.

**Upgrade notes**

- **The admin is dark-only now.** The Light / System appearance choice is
  gone (there is no longer a second palette for it to switch to). A stored
  theme preference is simply ignored.
- **Permissions are enforced where they were only implied.** Ten nutrition
  write endpoints, every equipment endpoint, and care-task complete/skip now
  require the permission their buttons always claimed (`nutrition.*`,
  `equipment.*`, `care_tasks.perform`). Shipments and equipment are also
  scoped to the caller's account. A role that could only *read* one of these
  areas loses buttons that never actually worked for it.
- On the wall unit, the in-app on-screen keyboard is on by default for
  `/live`; phones and tablets keep their own keyboard. `?vkb=0` turns it off
  persistently.

**Live dashboard**

- Rebuilt end to end: range tabs on the charts, stable time and value axes
  that no longer jump between samples, a docked side panel (narrow or
  expanded) for medications, care tasks, nutrition, alerts, equipment,
  settings and the camera, a navigation drawer, and phone-sized tiles.
- **Capture Vitals** from the dashboard or the phone flow at `/capture`,
  with a number pad, per-patient expected ranges and hard limits, and
  provenance recorded on every reading.
- The nutrition panel completes a feed from a side-pane form (mix
  prefilled, amounts adjustable) and runs post-feed flushes from their own
  pane. Every docked panel scrolls independently.
- The dashboard shows the selected patient's readings, never the last
  reader to report.
- Caregiver PIN challenge on the shared number pad with masked entry; a
  wrong PIN now says so instead of doing nothing.

**Nutrition**

- **Feeds are a mix of items**: an item library, multi-item feed schedules
  with a feed rate, per-item logging, and barcode lookup against
  OpenFoodFacts with the Bluetooth wedge scanner.
- **Post-feed flush follow-ups** appear on the board when the feed's run
  time ends, timed from mix volume ÷ rate.
- **Dynamic water budget**: a hydration schedule flagged *Fills remaining
  fluid need* suggests whatever is left of the day's fluid target, and
  flushes participate the same way — a juice-heavy day suggests "goal met —
  skip?" instead of over-pouring. Computed on read; undoing a feed reshapes
  the next suggestion instantly.
- Fluid targets are combined on both sides: a water-only goal is lifted by
  the fluid the food schedules deliver, and every readout shows the parts.
- One adaptive bathroom sheet (Bristol scale, wetness for diapers, measured
  volume when weighed); one intake sheet with a full-screen item picker,
  Recent and All items tabs, and Save + Another.
- Plan tab = targets, coverage, then schedules behind an Active / Inactive
  sheet. Complete Now on the Schedule tab opens the pre-linked intake form.
- Fixed: tube feeds returned 422 and counted toward nothing; urine totals
  ignored anything not literally in `ml`; multi-time cron schedules counted
  as one event a day; a mixed diaper counted as two changes.

**Medications, care tasks, schedule**

- Medications: three-step add / grouped edit sheet, a days-of-supply stock
  bar that shares one low-stock definition with the alerts, per-medication
  history, and `end_date` finally reachable. Optional fields can now be
  cleared (prescriber, pharmacy, low-stock alert).
- Care tasks: one canonical day shape across all three views, schedules
  editable again (add / edit / pause / delete), adherence overview by task
  and by person, and completions credited to the signed-in user.
- Shared schedule board with a status pill instead of a colour stripe.

**Monitoring and alerts**

- **Alerts end when the readings say so.** The recovery countdown required
  no samples in between, so a probe that came off mid-recovery closed the
  alert hours later when the stream resumed (one 2-second desaturation was
  recorded as 381 minutes). Alerts now need continuous valid samples to
  close, a stream going quiet ends the alert at the last real reading, a
  5-minute sweep closes what the live path cannot, and each end records its
  provenance. 36 stranded and 29 mis-closed rows were corrected in place.
- Alert state is tracked **per patient** and rehydrated across restarts, so
  two patients streaming through one hub no longer share one alarm.
- Reports stop fabricating durations for unclosed alerts.
- Timeline rebuilt as two aligned charts with event lanes underneath; **room
  condition bounds** per patient (temperature, humidity, CO2, PM2.5) with
  caution and critical bands; ventilator day led by pinned parameters;
  environment view on the same chart stack with a trigger × outcome
  correlation grid.
- Alerts further back than the 200 most recent no longer vanish from the
  day view.

**Reports**

- Day over day, overnight and weekly summary rebuilt on one shared surface.
  The alarm line is the account's configured threshold; red is reserved for
  a reading that breached it.
- Overnight sensor coverage is **counted** (minutes with a reading) rather
  than assumed from sample count. Weekly charts draw each day's low–high
  band behind the average.
- Share handoff / summary as plain text; CSV export of what is on screen.

**Equipment and shipments**

- Equipment overview as a dashboard (attention list, readiness per
  category, incoming delivery, timeline), history as one timeline of
  changes, counts and deliveries, and Supplies as the list *and* the
  management surface — one stock rule instead of four.
- Shipments rebuilt as cards and a three-step detail page. Fixed: receiving
  outside the reconcile path never worked (every receipt 422'd yet the
  shipment was marked complete); follow-up orders landed on
  `/shipments/undefined`.
- Tracking level now offers the values the backend understands
  (`item` / `box` / `none`).

**Configuration**

- Care profile hub with sub-pages (edit, features, measurements, room
  conditions, Home Assistant sharing, context); user hub with access,
  security and a real activity log (`/api/users/{id}/activity`).
- Care profiles, users and roles in one Directory.
- **Person avatars**: identicons for everyone, photos attachable with
  client-side cropping.
- Fixed: dates of birth rendered a day early anywhere west of UTC.

**Everywhere**

- Messages board shared by admin and dashboard; Messages always in the nav.
- Symptoms rebuilt; sign-in, first-run and password reset on one auth shell.
- Modals carry dialog roles, focus trapping and restore, and Escape handling.
- CSS bundle down ~16%; the shadcn/Tailwind component layer and well over
  15,000 lines of unreachable code and dead styles removed.

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
