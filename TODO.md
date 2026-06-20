# Backlog / Ideas

Stuff to pick up when there's time. No particular order.

---

## Live Dashboard

- **Per-modal re-auth (5 min)** — _IN TESTING_. Account password 1×/24h unchanged; opening any live-dashboard modal now requires a fresh user PIN (idle 5-min window), with the 3 large vital readings pinned visible during auth. Built via `PinChallengeContext` + `PinChallengeModal`. Spec: rolling idle, full user picker each re-auth.

---

## Frigate Integration

- **Live stream stability** — _FIX IN TESTING_. Live HLS failed most of the time while proxied MP4 clips worked. Two root causes, both now addressed:
  1. **Transport** — `live_url` pointed **directly at Frigate** (`http://<frigate>:5000/api/go2rtc/api/stream.m3u8`), so hls.js fetched it cross-origin (CORS + go2rtc cold-start → "works only when already warm"). Fix: backend **proxies + rewrites** the go2rtc HLS playlist same-site (`/live.m3u8` + `/live-seg`, SSRF-guarded + cold-start retry) in `backend/routes/frigate.py`; `CameraLiveModal.jsx` sends credentials via hls.js `xhrSetup`. _Confirmed working_ — segments now fetch/buffer.
  2. **Codec** — after the transport fix, hls.js threw `mediaError / bufferAppendError`, i.e. the source is a codec the browser's MSE can't decode (camera "Vent" is almost certainly H.265). Fix: the live upstream now requests `&video=h264&audio=aac` so go2rtc hands back H.264 (copies if already H.264; transcodes only if needed). Overridable via the `live_hls_codecs` setting.
  - **Still needs a device retest** against the real Frigate (`192.168.1.10:5000`, patient 5 / camera "Vent"). Diagnostic: `GET /api/integrations/frigate/patient/5/live-probe` reports go2rtc's detected codecs. If it still fails with H.265 reported, go2rtc likely lacks ffmpeg for transcode → enable a transcode in Frigate's `go2rtc` config. WebRTC mode still uses the direct URL.
- **VOD playback** — _RESOLVED (no action)_. Inline VOD already plays the **proxied saved MP4** (`/clips/file`, native `<video>`, same-site, range/seek), which works on Apple devices — the old direct-to-Frigate HLS-VOD path was the flaky one and has been **deleted** (`get_vod_hls_url`, `/clip`, `/clip-urls`). Known limitation left as-is per decision: H.265 MP4 won't play in non-Apple browsers (Chrome/Firefox/Android); closing that would need backend H.264 transcoding (adds ffmpeg to the image).

---

## Theming — Light / Dark Mode — ✅ DONE (2026-06-15, branch dev/haos)

Per-user **Light / Dark / System** theme shipped. The approach diverged from the original phased plan below: instead of a separate `--color-*` layer + `[data-theme]` attribute, it **reuses the shadcn semantic tokens** (`--background`, `--card`, `--foreground`, `--border`, `--ring`, `--muted-foreground`, etc.) in `frontend/src/tailwind.css`, toggled by a `light`/`dark` class on `<html>`.

What shipped:
- **Tokens:** dark default (`:root, :root.dark`) + `:root.light` override; added `--warning` / `--accent-purple`. `.force-dark` class pins a subtree to dark regardless of theme.
- **Persistence:** per-user `User.preferences` JSON (migration 028) via `/api/auth/session` + `PATCH /api/auth/preferences`; `contexts/ThemeContext.jsx` (localStorage instant-apply + backend sync + live `prefers-color-scheme` for System); no-flash boot script in `index.html`; Light/Dark/System selector in **Account Settings → Appearance**.
- **Conversion:** full `AdminV2.css` sweep (raw hex + 281 `rgba()` literals → tokens), every admin-v2 inline-style holdout, the login flow (`LoginPage.css`), and all monitoring / reports / profile / vitals components. Recharts + Chart.js charts theme live via `frontend/src/hooks/useChartColors.js`.
- **Live dashboard** (legacy `App.css`) is **intentionally pinned dark** via `.force-dark` — no light version by decision.

Still open:
- [ ] **High-contrast + broader accessibility** — moved to the **Accessibility (a11y)** section below.
- [ ] Minor cosmetic: a few Radix-portaled dropdowns opened from *inside* the force-dark live dashboard follow the user's theme (render on `<body>`, outside the wrapper).

See Claude memory `project_theme_light_dark` for the full architecture record.

---

## Accessibility (a11y)

Broader accessibility, beyond light/dark. Distinct workstreams — the theming refactor (semantic tokens everywhere) is a useful foundation for all of them.

### Safety-critical (app-specific — do first)
- [ ] **Flashing alarm / photosensitivity (WCAG 2.3.1).** The live dashboard uses `alarm-blink`/`alarm-active`. Anything flashing **>3×/sec** can trigger seizures. Verify the blink rate is under that, or offer a non-flashing alert style (steady color + icon).
- [ ] **Timeouts / idle lock (WCAG 2.2.1).** The 5-min admin idle lock + session expiry can strand a slower user or a caregiver mid-task (e.g. a half-entered vitals form). Add a **warning before lock with an "extend" option**, or make the interval configurable.
- [ ] **Alarm audio + visual parity.** If monitoring alarms play sound, ensure a visual equivalent exists (blink does this) — and critical alerts must never be audio-only. Both channels for anything safety-critical.

### High-contrast theme
Low-effort now that theming is token-based (`.light`/`.dark` class on `<html>` + per-user `ThemeContext`). It's "add a 4th palette + wire one option," not a refactor:
- [ ] `tailwind.css`: add a `:root.contrast` block — WCAG AAA (7:1 text). Pure-black bg / pure-white text, bright `--ring`/borders, saturated `--success`/`--destructive`/`--warning`.
- [ ] `contexts/ThemeContext.jsx`: add `'contrast'` to `VALID` + the class add/remove logic (explicit pick, not system-derived).
- [ ] `index.html` boot script: handle `'contrast'` for no-flash.
- [ ] Account Settings → Appearance: add a "High Contrast" option.
- [ ] AAA polish (iterative): 3px focus rings everywhere, remove translucent tints/shadows that drop below 7:1, per-page QA walk.
- Note: the live dashboard is `.force-dark`; it'd need a `.force-contrast` to participate, or stay dark-only.

### Low vision
- [ ] Verify the UI reflows and stays usable at **200% browser zoom** (WCAG 1.4.4) — audit fixed-px containers/heights.
- [ ] Optional **font-scale / "large text"** preference, stored alongside theme in `User.preferences`.
- [ ] Respect `prefers-reduced-motion` (disable chart/transition animations).
- [ ] Never convey status by **color alone** — pair color with icon/text (WCAG 1.4.1).
- [ ] **Reflow** with no horizontal scroll down to **320px** width (WCAG 1.4.10).
- [ ] Content survives user-overridden **text spacing** (line-height/letter-spacing) without clipping (WCAG 1.4.12).

### Keyboard navigation
- [ ] Audit: every interactive element reachable via Tab in logical order; convert `<div onClick>` to real `<button>`/`<a>` (e.g. the Dashboard logo and any clickable divs).
- [ ] Visible focus indicators on all interactive elements (tokens already expose `--ring`; ensure app-wide `:focus-visible` styling).
- [ ] Modals: trap focus while open, restore focus to the trigger on close, `Esc` to close, no keyboard traps (`ModalBase` + shadcn `Dialog`).
- [ ] Add a **skip-to-content** link at the top of the layout.
- [ ] Custom controls (vital toggles, theme select, chart zoom/pan) fully operable without a mouse.

### Screen reader (blind)
- [ ] Semantic landmarks (`<header>`/`<nav>`/`<main>`) + correct heading hierarchy per page.
- [ ] Accessible names for icon-only buttons (`aria-label`) and every form input (label association — shadcn `Field`/`Label` help; verify legacy forms).
- [ ] `role="dialog"` + `aria-modal` + `aria-labelledby` on modals.
- [ ] `aria-live` regions for dynamic updates (new alerts, vital changes, save confirmations, toasts).
- [ ] Text alternative / visually-hidden **data-table fallback** for charts — Chart.js canvas is opaque to screen readers; Recharts SVG needs `role`/`aria-label` or an adjacent table.
- [ ] Meaningful `alt` on images.
- [ ] **Per-page document title** — set `document.title` per route (currently one static "Smart Home Health"); SR users rely on it to know where they are.
- [ ] **Move focus on route change** — React Router nav doesn't shift focus, so SR users aren't told the page changed; focus the main heading or announce via `aria-live`.
- [ ] End-to-end test with a real screen reader (VoiceOver / NVDA) on the core flows.

### Motor / dexterity
- [ ] **Touch target size** (WCAG 2.5.5/2.5.8, ~44px min) — audit icon buttons, vital toggles, modal close buttons; a dense admin UI tends to undersize them. Matters most on tablet/kiosk for elderly/tremor users.
- [ ] No **drag-only or precise-timing-only** actions — chart pan/zoom needs a button/keyboard alternative (see Keyboard navigation).
- [ ] Adequate spacing between adjacent targets.

### Cognitive
- [ ] Consistent layout/nav and plain language; avoid jargon in user-facing copy.
- [ ] **Confirmation for destructive/medical actions** — already strong (med-quantity guards, undo-with-audit); preserve as the app grows.
- [ ] Clear error messages that say **how to fix**, not just "invalid."

### Forms
- [ ] Don't use placeholder text as the only label.
- [ ] Explicit error identification + correction suggestions (WCAG 3.3.1 / 3.3.3); clear required-field indication and expected input formats.
- [ ] `autocomplete` attributes on personal fields (name, email, etc. — WCAG 1.3.5).

### Tooling & testing (so a11y doesn't regress)
- [ ] Run **axe-core / Lighthouse / Pa11y** (in CI if possible) for automated catches.
- [ ] **Contrast audit** of the actual light/dark token pairs — verify text (incl. `--muted-foreground`) and the `color-mix` tints hit 4.5:1 (AA).
- [ ] Manual **keyboard-only** and **screen-reader** passes — automated tools catch only ~30–40%.

---

## Medications

- **Zero-quantity administration guard** — _DONE_. Administering a dose larger than the on-hand `Medication.quantity` is now **hard-blocked** (no "administer anyway"). Backend returns `409 {error:"insufficient_quantity", ...}` from all paths (`/api/schedule/complete/medication`, `/complete/bulk`, and `administer_medication` → `/medications/{id}/administer`) via `backend/utils/medication_quantity.py`. Frontend `UpdateQuantityModal` (admin-v2 schedule) forces the caregiver to enter a new on-hand quantity (`PUT /api/medications/{id}`) and then retries the dose; bulk loops through multiple out-of-stock meds. The legacy **live dashboard** `MedicationModal` has the same gate on its Mark-Taken, PRN, and Mark-All paths (Mark-All stops at the out-of-stock med and is re-run after updating; completed doses are skipped to avoid duplicates).
- **Low-stock medication alert** — _DONE_ (2026-06-11). Built on the new **user messages** system (`backend/models/user_messages.py`, `crud/user_messages.py`, `routes/messages.py`, migrations 024–026): a generator run by `GET /api/messages/active` upserts one message per low med and auto-resolves on restock (or when the med/patient is deactivated). "Low" is per-med via `Medication.low_stock_threshold` + `low_stock_threshold_type` — either a raw **quantity** on hand or **days of supply left** projected from active schedules (croniter over the next 7 days). Surfaced as an "obnoxious" blocking modal (`MessagesModal`) that auto-pops on login/user-switch (hourly re-pop on unlock, `MessagesAutoPop` in `Layout`) plus the Dashboard Messages icon. Out-of-stock = critical/snooze-only; low = warning, dismissible. Messages support `ack_scope` 'anyone' (one user clears for all — used for low-med) vs 'per_user' (everyone must acknowledge; per-user snooze too), with an admin broadcast page at `/care/messages`. Threshold editable per med in the manage form; **Bulk Low-Stock Alert** button applies a days-of-supply threshold to every scheduled med (`POST /api/medications/low-stock-threshold/apply-days`).
- **Grace-period doses** — missed doses should persist on the schedule view until administered or grace expires, so they don't get silently skipped. Full spec saved in Claude memory (`project-grace-period-doses`). Start point: Alembic migration + `grace_period_hours` field on `MedicationSchedule`.
- **Undo completed items** — _DONE (with audit trail)_. A completed dose/feed/care-task marked by mistake (e.g. on the wrong day) can be reversed, and every undo is auditable. Backend: `DELETE /api/schedule/log/{item_type}/{log_id}` (`item_type` ∈ `medication`, `nutrition_intake`, `nutrition_output`, `care_task`) **soft-deletes** the log row — sets `voided_at`/`voided_by` instead of hard-deleting (migration `020_soft_delete_completion_logs` added these to all four log tables). For medications it adds the deducted dose back to `Medication.quantity`. Handles the merged-diaper composite `mixed-<id>-<id>` output key. A global SQLAlchemy `do_orm_execute` filter (`backend/soft_delete.py`, registered in `main.py`) appends `voided_at IS NULL` to every ORM SELECT on those models, so schedule/history/adherence/monitoring/reports all ignore undone rows automatically (opt out with `.execution_options(include_voided=True)`). Each undo writes an `audit_logs` row (`action='schedule.undo'`). The `get_scheduled_*` builders (`crud/scheduling.py`) and `get_daily_medication_schedule` (`crud/medications.py`) surface `log_id` for completed scheduled items. Frontend: **Undo button** on the admin-v2 medications schedule (`AdminV2MedicationsSchedule.jsx`) and an **UndoIcon** on completed rows in the unified schedule (`AdminV2Schedule.jsx`, all three columns), both with confirm + refetch. Dedicated **Undo Log** audit view at `/care/schedule/undo-log` (`AdminV2ScheduleUndoLog.jsx`, gated by `audit.read`, surfaced as a sub-nav tab under Schedule) reads `GET /api/schedule/undo-log`.

---

## Integrations — Epic / FHIR

- **Multi-org endpoint directory via fasten-sources** — _IDEA, not started_. The Epic FHIR connector (`backend/integrations/epic.py`) currently ships a tiny hardcoded `EPIC_ENDPOINTS` list (sandbox + manual URL entry). To support real hospitals without paying for Fasten Connect (their managed SaaS aggregator, which would also route PHI through Fasten), consume the **open-source [fasten-sources](https://github.com/fastenhealth/fasten-sources)** provider definitions — a library of ~70k provider endpoint metadata + SMART-on-FHIR/OpenID config docs. It's **Go** (can't import from Python), but the **endpoint definitions are language-agnostic data** (JSON/OpenID metadata) we can vendor or fetch to populate our own org picker. Keeps connections **direct** (Epic→our server, PHI never leaves the network) and **free**. Figure out: format/licensing of the definitions, how to keep them fresh, and how to feed them into `EpicIntegration._resolve_endpoint` + a frontend search/typeahead in place of the static enum. Decision context: chose to stay on the direct/free path over Fasten Connect because the current pipeline is fairly portable (pure FHIR parsers in `epic.py` + `persist_sync_extras` are aggregator-agnostic). See Claude memory `project-fhir-standards`.

---

## Backend / Data — TimescaleDB for sensor tables — ✅ CORE DONE (2026-06-15, branch dev/haos)

**Core conversion shipped** (migrations 030–032). `pulse_ox_data`, `vitals`, and `vent_samples` are now hypertables (composite PKs `(id, <time col>)`; existing data migrated into chunks; `timescale/timescaledb:latest-pg15` image with `shared_preload_libraries=timescaledb`). Full record + the reused-volume gotcha in **`docs/migrate-timescaledb.md`** and Claude memory `project_timescaledb_migration`.

**Still open (deferred, optional):** compression policies, continuous aggregates for the pulse-ox/vent rollups, and retention/downsampling — see the "Why it fits" / "Plan" notes retained below.

_Original IDEA / SPEC (2026-06-15)._ Two append-only sensor tables dominate the DB and grow unbounded: **`vent_samples`** (~10M rows, 2.5 GB) and **`pulse_ox_data`** (~2.2M rows, 548 MB, ~2s sampling). Everything else is small relational data. TimescaleDB is a **Postgres extension** (not a DB switch — same SQL/SQLAlchemy/psycopg), so scope it to **just these two tables**; the rest stays plain Postgres.

Why it fits (ranked):
- **Compression** — columnar compression on this regular numeric time-series typically hits ~90–95%: `vent_samples` 2.5 GB → ~150–300 MB, and compressed chunks scan *faster* for range queries. Win today, not "at scale."
- **Continuous aggregates** — incrementally-refreshed hourly/daily rollups map directly to existing code that full-scans + aggregates in Python: `crud/vitals.analyze_pulse_ox_day`, the vent percentile bands (`stats_by_suffix`), and the timeline / day-over-day / weekly / overnight reports. Turns scans into indexed lookups.
- **Retention / downsampling** — auto-drop or downsample raw chunks (keep the aggregates) so growth is bounded.

Plan:
- [ ] Swap dev image to `timescale/timescaledb:latest-pg15` in `docker-compose.yml`; `CREATE EXTENSION timescaledb`.
- [ ] Convert `vent_samples` + `pulse_ox_data` to hypertables on `timestamp` (maintenance window or create-new-and-copy — `migrate_data` on 10M rows locks).
- [ ] Add compression policy (compress chunks older than e.g. 7d) + a retention/downsample policy.
- [ ] Add continuous aggregates for the pulse-ox daily distribution + vent parameter rollups; point the analysis/report endpoints at them.

Gotchas (specific to current schema):
- PK must include the partition column: `PRIMARY KEY (id)` → `(id, timestamp)` (keep `id` as identity). FKs are only outward (→ `patients`, `vent_imports`) and **nothing references these tables by FK**, so conversion won't ripple.
- Alembic won't autogenerate `create_hypertable` / policies / continuous-aggregate views — hand-written migration SQL.
- Backups: JSON export (`crud/backup.py`) unaffected; `pg_dump`/restore needs the extension on the target.
- **Portability:** AWS RDS doesn't support the Timescale extension (only Timescale Cloud / self-hosted). Non-issue while self-hosted in Docker; lock-in if a managed-PG move is ever planned.

Defer option: just ensure a composite index on `(patient_id, timestamp)` on both tables keeps range queries fast at current size — but app-maintained rollups would reinvent continuous aggregates, so prefer Timescale if investing. Cheaper to convert now than when tables are 10× bigger.

---

## Packaging — Unified backend + frontend Docker image

_SCOPED, not started (2026-06-15)._ Ship **one** image containing the FastAPI backend + the built frontend so a deployer pulls a single image; **DB stays a separate** Timescale container. Approach: multi-stage Dockerfile (node build → python runtime), FastAPI serves the SPA **same-origin** (kills CORS for the bundled case), with the existing two-container hot-reload dev flow kept **additive/untouched**. The one nuanced code change is a same-origin signal in `frontend/src/config.js` (today hardcodes `:8000`).

Full scope, required changes, and open decisions in **`docs/unified-image.md`**. Note: the implementation edits `config.js`/`main.py`/`middleware.py`, which are **bind-mounted into the running dev containers** — do it in a git worktree (or when the live instance is idle) to avoid reload blips.

---

## System Health page — maintenance endpoints UNTESTED on live data

_2026-06-15, branch dev/haos._ The System Health page + `/api/system/*` API are built and the read path (`GET /api/system/health`) is verified live. The three maintenance endpoints are implemented but **deliberately never executed against real data** (they're destructive / state-changing):

- [ ] **Test `POST /api/system/maintenance/prune`** — `drop_chunks()`. Safe first run: cutoff older than all data → 0 chunks dropped, confirms the path without data loss. Then a real prune.
- [ ] **Test `POST /api/system/maintenance/compress`** — enables compression on the hypertable + `compress_chunk()`. Reversible via `decompress_chunk`, but changes table state. Try on `vitals` (smallest) first.
- [ ] **Test `POST /api/system/maintenance/vacuum`** — `VACUUM ANALYZE` (non-destructive but heavy).

See Claude memory `project_system_health_page`.

---

## Backup / Restore — coverage gaps after recent DB changes

_Reviewed 2026-06-15 against `crud/backup.py` (per-patient JSON-in-tar.gz export/import)._

**Good news — TimescaleDB did NOT break it.** Restore's `_insert` pops `id` and re-inserts, so new ids come from the sequence and the row's own timestamp routes the INSERT to the right chunk — composite PKs `(id, timestamp)` on the hypertables (`vitals`, `pulse_ox_data`) are satisfied transparently. Export reads via ORM from chunks fine. No mechanical breakage from the migration.

**✅ FIXED (2026-06-15, format v2)** — added to export + restore and verified with a rolled-back round-trip (data + FK remap intact):
- [x] `allergies`
- [x] `custom_vital_definitions` (migr 017)
- [x] `diagnostic_reports` + `lab_results` + `imaging_studies` (migr 022 — FHIR clinical results)
- [x] Restore now accepts format versions 1–2 (old backups still restore; older files just absent).

**Decisions locked:**
- `integrations` / `patient_integrations` — **excluded** (hold OAuth tokens / API keys; don't put secrets in a portable archive). ✅ decided.
- Restored device imports get a synthetic **"Imported Data" integration** to satisfy the NOT-NULL `integration_id` FK — `get_or_create_imported_integration()` in `crud/backup.py` (mirrors the hidden import user). DB-only catalog row (slug `imported`, not in the code registry), so it's **hidden from the "add integration" picker but shows on a patient that has it**. ✅ built + verified.

**✅ Streaming infra + pulse_ox done (2026-06-15, format v3):**
- [x] **Streaming helpers** in `crud/backup.py` — `_stream_table_to_tar()` (Core `select(table)` + `stream_results`/`yield_per` → NDJSON to a temp file → `tar.add`) and `_restore_stream_ndjson()` (line-by-line read → `bulk_insert_mappings` in `STREAM_BATCH`=5000 chunks, drops `id`, remaps via a `transform` callback). `_read_archive` skips `.ndjson` members; restore lists all members via `archive_members` and streams them separately.
- [x] **`pulse_ox_data` converted** to `pulse_ox_data.ndjson`. Restore reads `.ndjson` if present, else falls back to legacy `.json` array (old v1/v2 backups still restore). `vitals` (small) stays inline JSON.
- [x] **Verified:** Jane Doe round-trip (120 rows, counts + ISO timestamps intact, rolled back) **and** export-only scale test on patient id=2 (**1,785,655 rows in 28.4s, 47.7 MB gz, peak RSS 147 MB** — confirms memory-bounded streaming).

**✅ Vent tables done (2026-06-15, format v3):**
- [x] **`vent_imports`** — minted a new UUID per import (str→str id-map for samples), `integration_id` → synthetic imported integration, `uploaded_by` via `resolve_user`; **`vent_device_info`** remapped by `import_id`. Skipped `vent_ingested_files` (regenerable dedup).
- [x] **`vent_samples`** → `vent_samples.ndjson`, streamed via the shared helpers; restore `transform` remaps `patient_id` + `import_id` and drops orphan samples (`transform` returning `False`).
- [x] **Verified:** synthesized round-trip (new UUID ≠ source, samples remapped to new import, points at `imported` integration, device_info remapped, values intact, rolled back) **and** export-only scale on the real owner (patient 2: **9,975,136 vent_samples in 172s, 120 MB gz, peak RSS 214 MB**).
- **Raw files:** `vent_imports.storage_path` still points at the original upload on `./data` (not captured) — `storage_path` dangles on restore; parsed samples are preserved, only re-parse capability is lost. Capturing the raw files into the tar is the only remaining vent gap (low priority).

**Note (perf, not a blocker):** the export endpoint runs synchronously — a ~10M-row patient takes ~3 min and returns a ~120 MB archive held in memory. Fine for now; if patients get much bigger, consider a streaming HTTP response / async job.

**Still deferred — other:**
- [ ] `clinical_documents` (migr 022) — binary attachments (`LargeBinary data`) + on-disk files. Report *narrative* (`conclusion`) + lab values already captured; only attached PDFs/images missing.
- [ ] `user_messages` (migr 024) — transient alerts; likely intentionally excluded.
- [ ] `readers` (has patient_id) — device-specific + Fernet keys; likely intentional. Document either way.

---

## MQTT → Home Assistant — known gaps

_Reviewed 2026-06-15._ Per-patient combined-state publishing to HA is working
(vitals, nutrition calories+water, bathroom). Deferred loose ends are tracked in
**`docs/mqtt-known-gaps.md`**:
- [ ] **GPIO alarms** (`alarm1`/`alarm2`) discovered but never published → always Unknown; plus alarm thresholds are global, not per-patient.
- [ ] **Legacy/dead code** — _done: removed `_send_legacy_mqtt_discovery` (+helpers), fixed `_get_nutrition_dashboard_data` water bug._ Remaining: simplify/remove `_get_nutrition_dashboard_data` + the legacy global-topic publish path, retire legacy `MqttSettings.jsx`.
- [ ] **Un-discovery** — no way to remove stale HA entities when a section/patient is disabled (need empty-retained-config publish).

Done this session: removed the `test_mode` footgun; seed temp/BP/weight on restart.

---

## Security — Pre-Release Hardening

From a pre-first-release security pass (2026-06-02). Ordered by severity.

### 🔴 Critical — must fix before any release
- [x] **JWT secret is the public hardcoded default.** — _DONE (2026-06-15)_. Generated a strong `JWT_SECRET_KEY` into `backend/.env`; `main.py` now **fails to start** if it's unset or equals the default (`change-this-secret-key-in-production`). Also moved `load_dotenv()` above the local imports so `middleware.py`/`routes/auth.py` capture the real secret at import time (they read it at module load, which previously ran before `load_dotenv()`). Effect: existing tokens signed with the old default are invalidated → one-time re-login. **Remember to set a distinct `JWT_SECRET_KEY` on the deployed box** (don't reuse the dev value).

### 🟠 High — before internet-facing / production
- [ ] **Cookies hardcoded `secure=False`** (5× in `routes/auth.py`: ~111, 273, 350, 426, 524). Over HTTPS the session cookie can leak over plain HTTP. Make `secure` env-driven (True in prod).
- [ ] **Postgres published on host `:5432` with weak hardcoded creds** (`shh_user`/`shh_dev_pass` in `docker-compose.yml`, also `DATABASE_URL` inline). Fine for local dev; a direct DB door if the host is reachable. Prod: don't publish 5432, pull password from env.
- [x] **No login throttling / account lockout** — _DONE (2026-06-15)_. Added in-process per-IP **rate limiting** on all sensitive auth endpoints (`rate_limit.py` middleware, 429 + `Retry-After`, audited as `auth.rate_limited`) and **account-level lockout** (migration `029`, `accounts.failed_login_attempts`/`locked_until`, wired into `account_login`/`account_access`/`account_unlock`) mirroring the pre-existing per-user lockout. Thresholds env-configurable via `security_config.py` (`LOGIN_LOCKOUT_THRESHOLD`/`MINUTES`, `RATE_LIMIT_ENABLED`, `RL_*_PER_MIN`). The low-entropy PIN is now defended by rate limit + per-user lockout. (A dedicated WAF/edge throttle is still advisable if internet-facing.)

### 🟡 Medium — hardening
- [ ] **CORS** (`main.py:71`) allows all `localhost` + entire RFC1918 with `allow_credentials=True`. Intentional for LAN, but any page on the network can make credentialed requests (`samesite=lax` only partly mitigates), and it won't match a real domain if you go internet-facing. Make allowed origins configurable.
- [ ] **Tar extraction** in `routes/integration_imports.py:127` has a `..`/absolute-path guard but doesn't handle **symlink/hardlink members**. On Py 3.12+ add `filter="data"` to `extractall()`. (`crud/backup.py` restore is safe — reads `.json` into memory only.)
- [ ] **Reader Fernet keys stored plaintext** in DB (`readers.encryption_key`). DB compromise leaks them. Encrypt at rest or document the risk. _(The wire leak is fixed as of 2026-06-12: pairing now does an X25519/HKDF exchange — `utils/pairing_crypto.py` + reader `pairing.py` — so the Fernet key is derived on both ends and never sent over HTTP. At-rest encryption remains open.)_
- [ ] **`metric_col` f-string SQL** (`analysis/med_vital_correlation.py:87`) is safe today (whitelisted from `PULSE_OX_METRICS`) but fragile. Add an assert against the whitelist so a future edit can't turn it into injection.

### ✅ Verified OK (no action)
bcrypt + per-password salts · no `eval`/`exec`/`pickle`/`shell=True` · `.env` never committed (checked history) · deps pinned · authz enforced (`backup` system-admin gated, `analysis` full-auth + read-access, `require_permission` throughout) · no default/backdoor admin · reader WS channel encrypted (Fernet) · no debug exception leakage.
