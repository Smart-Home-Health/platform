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

## Theming — Light / Dark / High-Contrast Mode

The entire UI uses hardcoded hex colors with no CSS custom properties. Adding theme support requires a prerequisite refactor before any theme can be switched at runtime.

### Phase 1 — Extract CSS variables (prerequisite for everything else)

**`AdminV2.css`** (~9,600 lines, GitHub dark palette — do this first, it's the active UI)

Identify and replace every raw hex with a variable. The palette is consistent so ~35–40 variables cover it all:

| Variable name | Current value | Role |
|---|---|---|
| `--color-bg-base` | `#0d1117` | Page background |
| `--color-bg-surface` | `#161b22` | Cards, sidebar, modal |
| `--color-bg-raised` | `#21262d` | Buttons, inputs, hover bg |
| `--color-bg-subtle` | `#30363d` | Borders, dividers, badge bg |
| `--color-border` | `#30363d` | All borders |
| `--color-border-muted` | `#21262d` | Subtle inner borders |
| `--color-border-emphasis` | `#484f58` | Hover border states |
| `--color-text-primary` | `#e6edf3` | Body text, headings |
| `--color-text-secondary` | `#c9d1d9` | Secondary text |
| `--color-text-muted` | `#8b949e` | Labels, placeholders |
| `--color-text-subtle` | `#6e7681` | Very muted text |
| `--color-accent-primary` | `#58a6ff` | Links, active nav, focus |
| `--color-accent-primary-dim` | `rgba(88,166,255,0.1–0.2)` | Tinted backgrounds |
| `--color-accent-purple` | `#a371f7` | Task/therapy badges |
| `--color-accent-purple-dim` | `rgba(163,113,247,0.2)` | |
| `--color-accent-orange` | `#f78166` | Medication icon |
| `--color-accent-orange-dim` | `rgba(247,129,102,0.2)` | |
| `--color-accent-yellow` | `#d29922` | Warning/equipment |
| `--color-accent-yellow-dim` | `rgba(210,153,34,0.1–0.2)` | |
| `--color-success` | `#3fb950` / `#238636` | Success states |
| `--color-success-dim` | `rgba(46,160,67,0.2)` | |
| `--color-success-emphasis` | `#2ea043` | Success hover |
| `--color-danger` | `#f85149` | Errors, delete |
| `--color-danger-dim` | `rgba(248,81,73,0.1–0.2)` | |
| `--color-danger-emphasis` | `#da3633` | Danger button bg |
| `--color-warning` | `#d29922` | Overdue/due |
| `--color-warning-dim` | `rgba(210,153,34,0.1)` | |
| `--color-info` | `#58a6ff` | Info notices |
| `--color-info-dim` | `rgba(56,139,253,0.1)` | |
| `--color-avatar-gradient` | `135deg, #58a6ff, #a371f7` | User/patient avatars |
| `--color-schedule-day-btn` | `#1f6feb` | Day selector active |
| `--color-overlay` | `rgba(0,0,0,0.7)` | Modal backdrop |
| `--color-shadow-card` | `rgba(0,0,0,0.3–0.4)` | Card/dropdown shadows |

Steps for AdminV2.css:
- [ ] Add a `:root` block at the top of AdminV2.css with all variables above
- [ ] Global find-and-replace each hex with its variable (use `replace_all` for each)
- [ ] Verify `rgba()` values that embed a hex — convert to `rgba(var(--color-*-rgb), 0.x)` or use a separate dim variable

**`App.css`** (~2,800 lines, legacy dashboard — second priority)

This uses a different palette (`#161e2e`, `#1a202c`, `#2d3748`, etc.) and is only used by the non-admin live dashboard. Extract separately:

- [ ] `--dash-bg` = `#161e2e`
- [ ] `--dash-surface` = `#1a202c`
- [ ] `--dash-raised` = `#2d3748`
- [ ] `--dash-border` = `#30363d`
- [ ] `--dash-text` = `#e2e8f0`
- [ ] `--dash-text-muted` = `#a0aec0`
- [ ] All the vital-specific colors (spo2 blue, bpm green, perfusion orange, bp red, temp yellow)

**Other CSS files** (smaller, lower priority):
- [ ] `LoginPage.css`, `LandingPage.css`, `LoginModal.css`, `FirstRunSetup.css`, `Layout.css` — scan for hardcoded colors and add to whichever `:root` block applies

---

### Phase 2 — Define light theme tokens

Add a `[data-theme="light"]` override block in `index.css` (applies globally). Map each variable to appropriate light values:

- Backgrounds invert: `--color-bg-base` → `#ffffff`, `--color-bg-surface` → `#f6f8fa`, `--color-bg-raised` → `#eaeef2`
- Text inverts: `--color-text-primary` → `#1f2328`, `--color-text-muted` → `#636c76`
- Borders lighten: `--color-border` → `#d0d7de`
- Accent/semantic colors stay close but may need lightness adjustment for contrast (test each)
- Status colors (danger, warning, success) likely need darker variants for light bg — check 4.5:1 WCAG AA

Key things to verify manually after:
- [ ] Nav active state is readable (blue on white)
- [ ] Badge/pill text has enough contrast
- [ ] Form inputs look intentional, not broken

---

### Phase 3 — Define high-contrast theme tokens

Add a `[data-theme="high-contrast"]` block. Requirements: WCAG AAA (7:1 ratio for text).

- Base: pure black `#000000` bg, pure white `#ffffff` text
- All borders become white or bright yellow (`#ffff00`)
- Accent/status colors become pure saturated: `#4dbbff` (info), `#ff6b6b` (danger), `#7ee787` (success), `#f9c846` (warning)
- Muted text eliminated — everything is either full white or a bright semantic color
- Shadows and translucent overlays removed (use solid borders instead)
- Focus rings: thick `3px` bright yellow outline on all interactive elements

---

### Phase 4 — Theme toggle in React

- [ ] Add theme state to a context or `localStorage` (key: `theme`, values: `dark` | `light` | `high-contrast`)
- [ ] On mount: read from `localStorage`, fall back to `prefers-color-scheme` media query (dark → `dark`, light → `light`)
- [ ] Apply `document.documentElement.setAttribute('data-theme', theme)` — this is what the CSS `[data-theme]` selectors key off
- [ ] Add a 3-way toggle button to the AdminV2 sidebar footer (sun / moon / contrast icons)
- [ ] Persist selection to `localStorage` on change

---

### Phase 5 — QA pass

- [ ] Walk every page of admin-v2 in all three themes: dashboard, patients, medications, schedule, care tasks, history, users, roles, settings
- [ ] Check all modal/overlay states
- [ ] Check all badge/status colors
- [ ] Check focus rings are visible in all themes (keyboard nav)
- [ ] Test on mobile viewport
- [ ] Verify legacy dashboard still looks correct in dark mode (it doesn't have a light variant — acceptable, or add a note in the toggle that it's dark-only)

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

## Security — Pre-Release Hardening

From a pre-first-release security pass (2026-06-02). Ordered by severity.

### 🔴 Critical — must fix before any release
- [ ] **JWT secret is the public hardcoded default.** `JWT_SECRET_KEY` is **not set in `backend/.env`**, so `middleware.py:30` and `routes/auth.py:59` fall back to `"change-this-secret-key-in-production"` — a value present in the (AGPL, soon-public) source. Anyone can forge a `session_token` for any user incl. system admin → **full auth bypass.** Fix: generate a strong secret (`python -c "import secrets; print(secrets.token_urlsafe(64))"`), set `JWT_SECRET_KEY` in `.env`, and make the app **fail to start** if it's unset (no silent insecure default).

### 🟠 High — before internet-facing / production
- [ ] **Cookies hardcoded `secure=False`** (5× in `routes/auth.py`: ~111, 273, 350, 426, 524). Over HTTPS the session cookie can leak over plain HTTP. Make `secure` env-driven (True in prod).
- [ ] **Postgres published on host `:5432` with weak hardcoded creds** (`shh_user`/`shh_dev_pass` in `docker-compose.yml`, also `DATABASE_URL` inline). Fine for local dev; a direct DB door if the host is reachable. Prod: don't publish 5432, pull password from env.
- [ ] **No login throttling / account lockout** found, and a low-entropy **PIN** is an accepted credential. bcrypt won't stop online brute force of a 4–6 digit PIN. Add rate-limiting/lockout on the login + PIN endpoints before exposing the app.

### 🟡 Medium — hardening
- [ ] **CORS** (`main.py:71`) allows all `localhost` + entire RFC1918 with `allow_credentials=True`. Intentional for LAN, but any page on the network can make credentialed requests (`samesite=lax` only partly mitigates), and it won't match a real domain if you go internet-facing. Make allowed origins configurable.
- [ ] **Tar extraction** in `routes/integration_imports.py:127` has a `..`/absolute-path guard but doesn't handle **symlink/hardlink members**. On Py 3.12+ add `filter="data"` to `extractall()`. (`crud/backup.py` restore is safe — reads `.json` into memory only.)
- [ ] **Reader Fernet keys stored plaintext** in DB (`readers.encryption_key`). DB compromise leaks them. Encrypt at rest or document the risk. _(The wire leak is fixed as of 2026-06-12: pairing now does an X25519/HKDF exchange — `utils/pairing_crypto.py` + reader `pairing.py` — so the Fernet key is derived on both ends and never sent over HTTP. At-rest encryption remains open.)_
- [ ] **`metric_col` f-string SQL** (`analysis/med_vital_correlation.py:87`) is safe today (whitelisted from `PULSE_OX_METRICS`) but fragile. Add an assert against the whitelist so a future edit can't turn it into injection.

### ✅ Verified OK (no action)
bcrypt + per-password salts · no `eval`/`exec`/`pickle`/`shell=True` · `.env` never committed (checked history) · deps pinned · authz enforced (`backup` system-admin gated, `analysis` full-auth + read-access, `require_permission` throughout) · no default/backdoor admin · reader WS channel encrypted (Fernet) · no debug exception leakage.
