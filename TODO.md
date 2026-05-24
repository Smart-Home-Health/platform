# Backlog / Ideas

Stuff to pick up when there's time. No particular order.

---

## Live Dashboard

- **Small chart scaling** — y-axis scaling is poor, hard to tell what each value means. Needs better axis labels / range handling so charts are actually readable at a glance.
- **Nutrition on the live board** — surface nutrition data somewhere on the live dashboard. Possibly alongside or within the care tasks panel (TBD on placement).

---

## AI / Analysis — Medication-Vital Correlations

Goal: detect patterns like "med X causes BPM +15 for ~1 hour" using local stats, no cloud LLM.

**Approach agreed on:**
- Use `statsmodels` (event study / windowed t-test) as the detection layer — not an LLM
- For each dose event in `medication_log`, grab BPM readings from `pulse_ox_data` in a pre/post window and run `ttest_ind` to check significance
- Eventually layer a small local LLM (Phi-3 Mini or Qwen2.5-1.5B via Ollama) on top for plain-English summaries, but raw stats come first

**Where to build it:**
- New package: `backend/analysis/` (alongside `crud/`)
- Core function: `analyze_med_effect(db, patient_id, medication_id, ...)` — returns pre/post means, delta, p-value, significance flag
- Route: `/api/analysis/patients/{patient_id}/med-effects` (stub when ready)

**Data sources already in place:**
- Events: `medication_log.administered_at` + `medication_id`
- Time series: `pulse_ox_data.bpm` (high-freq device) or `vitals` where `vital_type='heart_rate'`
- Both use `TIMESTAMP(timezone=True)` — verify tz consistency before relying on delta math

**Starter code** already drafted in conversation — paste into `backend/analysis/med_vital_correlation.py`.

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

- **Undo med on admin-v2 schedule** — fix undo medication action on the admin-v2 schedule page
- **Grace-period doses** — missed doses should persist on the schedule view until administered or grace expires, so they don't get silently skipped. Full spec saved in Claude memory (`project-grace-period-doses`). Start point: Alembic migration + `grace_period_hours` field on `MedicationSchedule`.
