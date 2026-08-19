# Monitoring-alert subsystem: what is known

Written 2026-08-19, after PR #141. Intended as the starting point for someone
investigating the rest of the alert subsystem, so it separates what has been
checked against the running system from what has only been read in the source.

Every claim is tagged:

- **[VERIFIED]** — checked against the live dev database or a running container,
  with the command shown or reproducible from [Queries](#reusable-queries).
- **[READ]** — read directly in the source at the cited `file:line`, not executed.
- **[INFERRED]** — a conclusion drawn from the above; the reasoning is given so
  it can be attacked.
- **[UNVERIFIED]** — believed, but not established. Treat as a question.

## Contents

1. [What PR #141 changed](#1-what-pr-141-changed)
2. [Beliefs that turned out to be false](#2-beliefs-that-turned-out-to-be-false)
3. [Open issues](#3-open-issues)
4. [The dataset, and what it cannot prove](#4-the-dataset-and-what-it-cannot-prove)
5. [Reusable queries](#reusable-queries)
6. [Running things](#running-things)

---

## 1. What PR #141 changed

### The defect it fixed

`modules/state_module.py` closes an alert by watching samples arrive. Its
recovery countdown compared plain wall-clock between the first normal reading
and *any* later one, with nothing requiring samples in between. **[READ]**

So when a probe came off mid-recovery and the stream resumed hours later, the
first sample back satisfied "thirty seconds have passed" and `end_time` was
stamped at the moment monitoring *resumed*. **[VERIFIED]** on alert 2220 — its
complete sample set between recorded start and end was:

```
17:13:40  spo2=89   <- alert opens (min_spo2 = 90)
17:13:42  spo2=90   <- normal, countdown starts
17:13:44 .. 17:14:04  all normal   <- 22s, short of the 30s rule
   *** stream stops for 6h 21m ***
23:35:20  spo2=95   <- elapsed = 6h21m >= 30  ->  end_time = 23:35:20
```

Real episode: one sample, ~2 seconds. Recorded: 381.7 minutes.

The rows that were never closed at all are the same mechanism plus a process
restart before the stream resumed: `current_alert_id` lives only in memory
(`state_module.py:50`), so after a restart nothing knew the alert existed.

### The rule now in force

Defined once in `crud/alert_closure.py` and imported by both the live engine and
the offline reconstruction, so the two cannot drift.

> An alert ends at the **earlier** of:
> - **recovery** — `RECOVERY_SECONDS` (30) of *contiguous* all-normal samples
> - **monitoring ended** — the last valid sample before the stream goes quiet
>
> A sample is `disconnected` if `spo2 <= 0 or bpm <= 0`; else `alarm` if outside
> the thresholds; else `normal`. A disconnected sample **breaks a recovery run**
> (it is not evidence the patient stayed well) and **does not count as data**
> (so time spent in it accrues toward the gap).

Both halves of that last sentence are load-bearing and independent:

- Without "breaks the run": probe off, `-1` every 2s for 10 min, then one normal
  sample → `elapsed >= 30` closes 10 minutes late.
- Without "not data": a 9.8-hour `-1` run never registers as silence, so the
  alert is recorded as lasting the whole probe-off.

`GAP_SECONDS = 120`. **[VERIFIED]** cadence is 2.0s at both p50 and p99, so this
is 60 consecutive missing samples. 10.4% of observed probe-off runs exceed 60s
but only 3.6% exceed 120s, so 120 fragments fewer real episodes. The value is
**not** load-bearing for historical reconstruction: the discontinuities in the
bad data run to thousands of seconds, so anything in [60s, 3000s] selects an
identical set.

### The sweep, and why it is not redundant

`modules/alert_sweeper.py`, every 300s. The live engine only executes when a
sample arrives, so it can never close an alert once samples stop entirely
(reader unplugged, process restarted). The two cover disjoint failures:

| failure | closed by |
|---|---|
| stream resumes with a discontinuity | live gap rule |
| stream never resumes, or process lost `current_alert_id` | sweep |

**[VERIFIED]** the loop starts cleanly: `[alert_sweeper] Sweep loop started` in
`docker compose logs backend` after a restart.

### Provenance

Migration `047` adds `end_source` and `end_time_superseded` to
`monitoring_alerts`. Values: `live_recovery`, `live_gap`, `inferred_recovery`,
`inferred_monitoring_ended`, `inferred_no_data`, `indeterminate`, or NULL
meaning "closed before provenance was tracked".

`indeterminate` is written with `end_time` still NULL — it marks "we looked and
could not tell", which keeps the row visibly open while dropping it out of the
sweep's candidate set so it is not rescanned forever.

### Effect on the dev database **[VERIFIED]**

36 stranded rows closed, 29 corrected. Longest alert on record went from 789.5
min to 10.1 min. Zero stranded, zero negative durations. Every replaced value is
preserved in `end_time_superseded`.

```
 end_source                | count | min_min | max_min
 (null - pre-existing)     |  2741 |    0.51 |   10.07
 inferred_monitoring_ended |    34 |    0.00 |    5.20
 inferred_recovery         |    31 |    0.57 |    4.70
```

---

## 2. Beliefs that turned out to be false

Recorded so they are not chased again. Each was believed by someone (including
a prior memory note and an exploring subagent) before being checked.

**"The reader restarts mid-episode and the closing write never lands."**
FALSE. **[VERIFIED]** — for every one of the 36 stranded alerts, pulse-ox data
continues seamlessly, with the next sample ~2s after `start_time` and no gap.
The data was always there; the state machine lost track of it.

**"`end_time` is written from a naive local clock, which explains the absurd
durations."** FALSE as an explanation. The naive-clock issue was real
(`datetime.now()` vs `utc_now()`) and is fixed, but it corrupted nothing:
**[VERIFIED]** `TZ=UTC` in the container, Postgres session TimeZone UTC,
`datetime.now() == datetime.utcnow()`, and `SELECT count(*) FROM
monitoring_alerts WHERE end_time < start_time` returns **0**. A local-time write
would produce end *before* start — the wrong sign for what was observed.

**"`/api/monitoring/alerts-list` and the dashboard silently use the wrong
thresholds (95/100/60/100)."** FALSE as stated — see [3.4](#34-a-dead-cluster-in-crudmonitoringpy).
The uppercase-key bug is real but sits in code no route reaches.

**"Patients 2 and 4 streaming concurrently is evidence the single-scalar
`current_alert_id` bug fires in practice."** FALSE — see
[section 4](#4-the-dataset-and-what-it-cannot-prove). It was a bulk copy, not
concurrent streams.

---

## 3. Open issues

Ranked by what seems most worth resolving first.

### 3.1 Alert state is per-process, not per-patient

`self.current_alert_id`, `self.alert_recovery_start_time` and the new
`self.alert_last_valid_sample_time` are single scalars on the `StateModule`
instance (`state_module.py:50-57`). **[READ]**

**[INFERRED]** consequences with two patients streaming through one process:

- While patient A has an open alert, `current_alert_id is not None`, so patient
  B's out-of-range samples take the ALARM branch and **never open a row**.
- Patient B's normal samples run the recovery countdown for patient A's alert
  and can close it.
- `alert_last_valid_sample_time` is shared, so patient B's samples mask a gap in
  patient A's stream — the gap rule simply fails to fire.

**Direction of the failure matters:** a masked gap means the live rule does not
fire, and the sweep (which *is* per-alert and per-patient) picks the row up
later. So this degrades the fix rather than corrupting data. The missing-row
case is the more serious half.

**[UNVERIFIED]** — this has never been observed. This install has only ever had
one real stream (section 4), so there is no evidence either way in the data.

Suggested: rehydrate state from `WHERE end_time IS NULL` on startup and key it by
`patient_id`. Note that rehydration also fixes the restart case at its source.

### 3.2 Nothing closes an alert on disconnect or shutdown

- Reader WebSocket teardown (`routes/readers.py:723-733`) calls
  `connection_manager.disconnect` and `_publish_reader_availability(online=False)`
  and nothing else. It does not notify `StateModule`. **[READ]**
- `shutdown_event` (`main.py:400-411`) shuts down MQTT and the event bus only.
  **[READ]**
- **[VERIFIED]** nothing consumes reader availability for this purpose — the only
  references are in `mqtt/service.py` and a test.

The sweep now covers the consequences within ~5 minutes. Closing at the source
would make the recorded end more accurate (it would be the last real sample
rather than requiring reconstruction), so this is a quality improvement rather
than a correctness hole.

### 3.3 `start_data_id` / `end_data_id` are NULL on every row ever written

**[VERIFIED]** — `SELECT count(*) FROM monitoring_alerts WHERE start_data_id IS
NOT NULL` returns 0 across all 2,806 rows.

Cause, **[READ]**: `_save_pulse_ox_data` (`state_module.py:197-214`) discards the
value returned by `crud/vitals.save_pulse_ox_data`, and `data_point`
(`state_module.py:174-180`) is built with keys `timestamp/spo2/bpm/perfusion/raw`
only. So `data_point.get("id")` at the `start_monitoring_alert` call site is
always `None`. `end_data_id` is never passed by any code path at all.

**[INFERRED]** knock-on: `get_monitoring_alerts(detailed=True)` guards its data
lookup with `if detailed and row.start_data_id:` (`crud/monitoring.py:81`), which
is therefore never true — the `data_points` key is never populated. That block
also contains a genuine expression bug, `(row.end_data_id is None) | (...)`,
which evaluates the Python `is None` to a bool before the bitwise `|`. It is
unreachable today, so fixing the id plumbing would expose it.

### 3.4 A dead cluster in `crud/monitoring.py`

**[VERIFIED]** `routes/monitoring.py:38-40` imports exactly seven names from
`crud.monitoring`. These functions are imported by no route and call only each
other:

`get_alerts_list`, `get_alert_summary`, `get_active_alerts_count`,
`get_monitoring_dashboard_data`, `check_system_health`,
`get_vital_history_for_monitoring`

They matter for two reasons:

1. They read **uppercase** setting keys — `get_setting_value(db, 'MIN_SPO2', 95)`
   at `crud/monitoring.py:637-640` and `:993-996`. **[VERIFIED]** only lowercase
   keys exist in `settings`, and `get_setting_value` does an exact match, so
   these always fall back to 95/100/60/100 rather than the configured
   90/100/55/155. Harmless while dead; a trap if anything is ever wired to them.
2. They implement a **second, parallel notion of an alert** — synthesising
   ephemeral alert dicts by re-scanning `pulse_ox_data` against thresholds,
   rather than reading `monitoring_alerts`. Two different answers to "what were
   the alerts?" exist in the codebase.

Suggested: delete, or wire up and fix the keys. Deciding which is the real
question.

Also dead: `save_pulse_ox_data` in `crud/monitoring.py:573` is a duplicate of the
live one in `crud/vitals.py:362` and takes no `patient_id`. **[VERIFIED]** no
callers.

### 3.5 Ventilator and external alarms are never recorded

**[VERIFIED]** `record_ventilator_alarm`, `record_external_pulse_ox_alarm` and
`clear_external_alarm` (`crud/monitoring.py:146-178`) are placeholders that log
and return `True`; they have zero callers.

**[INFERRED]** so `ExternalAlarm` and `VentilatorAlert` rows are never created,
despite `schemas/external_alarm.py` carrying an FK to `monitoring_alerts.id`.
`external_alarm_triggered` on an alert row is set only by the
`alert_type="disconnected"` branch of `_start_pulse_ox_alert`, which **[READ]**
is itself never reached — nothing passes that argument.

### 3.6 A third divergent threshold source

**[VERIFIED]** `routes/core.py:31-34` reads `MIN_SPO2`/`MAX_SPO2`/`MIN_BPM`/
`MAX_BPM` straight from the environment — not the settings table — and serves
them from `GET /api/limits` (`routes/core.py:76-81`). Those env vars are **not
set** in this deployment, so the endpoint returns nulls.

So there are three answers to "what are the alarm thresholds?": the settings
table (authoritative, used by the engine and by `crud/alert_closure`), the
uppercase keys in the dead cluster, and this endpoint's env vars.

### 3.7 Sweeper concurrency assumption

**[READ]** `sweep_open_alerts` takes no lock — no `SELECT ... FOR UPDATE SKIP
LOCKED`. Two instances would both scan. Writes are idempotent so the cost is
wasted work rather than wrong data, and `serve.py:92` runs the HTTPS listener
with `lifespan="off"` specifically so `startup_event` fires once. Worth
revisiting if uvicorn ever runs `--workers > 1`.

---

## 4. The dataset, and what it cannot prove

Understanding this prevents a specific wrong conclusion.

**[VERIFIED]** row counts:

```
patients:  1 John Carty | 2 Elijah Carty (active) | 4 Elijah Carty (INACTIVE)
           5 Test Testerson | 9 Jane Doe (no account)

monitoring_alerts:  p2 = 2400 (2026-04-01 .. 2026-08-19)
                    p4 =  405 (2026-04-01 .. 2026-05-05)
                    p5 =    1

pulse_ox_data:      p2 = 3,681,172    p4 = 477,396    p9 = 120
```

Patients 2 and 4 are **the same person**, patient 4 being an inactive duplicate.
**[VERIFIED]** all 405 of patient 4's alerts share an exact microsecond
`start_time` with a patient-2 alert, and on a sampled day both carry exactly
15,163 pulse-ox rows with identical timestamps.

**[INFERRED] it was a bulk copy, not a live dual-write.** Patient 2's alerts
occupy ids 1–398 and patient 4's occupy 406–810 — contiguous blocks, not
interleaved. Live concurrent writes would interleave. `created_at` equals
`start_time` on both copies, consistent with a field-preserving restore
(`crud/backup.py` re-inserts archived rows verbatim).

There is a second, independent argument for the same conclusion: if the two
streams *had* been live and concurrent, the single-scalar `current_alert_id`
(issue 3.1) would have suppressed the second patient's alerts entirely. Both
sets exist, so they were not written concurrently.

**Consequence for issue 3.1:** this install has never run two concurrent
patient streams, so **this dataset cannot demonstrate or refute the per-patient
bug**. Investigating it needs a synthetic two-patient test, not a query.

**Also note:** the PR #141 backfill corrected patient 4's duplicate rows too
(ids 409, 486–489, 573, 632, 791, 798 appear in the corrected set). That is
correct — they are copies of the same episodes — but it means the 65 corrected
rows are not 65 distinct clinical events.

Whether the 810 duplicated rows and the inactive patient 4 should be cleaned up
is an open question, out of scope for #141.

---

## Reusable queries

Watch out for one trap when writing new ones. **[VERIFIED]**: `end_time` is
stamped from a timestamp captured *before* the triggering sample row is written,
so that sample lands a few hundred microseconds **after** `end_time` (alert 2220:
`23:35:20.701843` vs `23:35:20.701577`). `start_time` has the mirror problem. A
plain `BETWEEN start_time AND end_time` silently drops both boundary samples —
this hid 5 of the 29 mis-closed rows on the first pass. Widen both bounds by ~2s.

**Health check — should be all zeros:**

```sql
SELECT count(*) FILTER (WHERE end_time IS NULL AND end_source IS NULL) AS stranded,
       count(*) FILTER (WHERE end_time < start_time)                   AS negative,
       count(*) FILTER (WHERE end_source = 'indeterminate')            AS gave_up,
       round(max(EXTRACT(EPOCH FROM (end_time-start_time))/60)::numeric,1) AS longest_min
FROM monitoring_alerts;
```

**Find an end written across a silence** (the selection predicate the resweep
uses; both terms are required):

```sql
WITH windowed AS (
    SELECT a.id, a.end_time, p.timestamp,
           LAG(p.timestamp) OVER (PARTITION BY a.id ORDER BY p.timestamp) AS prev_ts
    FROM monitoring_alerts a
    JOIN pulse_ox_data p
      ON p.patient_id = a.patient_id
     AND p.timestamp >  a.start_time - interval '2 seconds'
     AND p.timestamp <= a.end_time   + interval '2 seconds'
     AND p.spo2 > 0 AND p.bpm > 0
    WHERE a.end_time IS NOT NULL
)
SELECT id,
       MAX(EXTRACT(EPOCH FROM (timestamp - prev_ts)))        AS max_gap,
       EXTRACT(EPOCH FROM (end_time - MAX(timestamp)))       AS silence_before_close
FROM windowed GROUP BY id, end_time
HAVING GREATEST(COALESCE(MAX(EXTRACT(EPOCH FROM (timestamp - prev_ts))), 0),
                COALESCE(EXTRACT(EPOCH FROM (end_time - MAX(timestamp))), 0)) > 120;
```

**Probe-off runs** (the `-1` sentinel, which is why silence is measured in valid
samples):

```sql
WITH d AS (
  SELECT timestamp, spo2,
         row_number() OVER (ORDER BY timestamp)
       - row_number() OVER (PARTITION BY (spo2 <= 0) ORDER BY timestamp) AS grp
  FROM pulse_ox_data WHERE patient_id = 2)
SELECT count(*) AS runs,
       round(max(EXTRACT(EPOCH FROM (mx-mn)))::numeric,0) AS longest_s
FROM (SELECT grp, min(timestamp) mn, max(timestamp) mx
      FROM d WHERE spo2 <= 0 GROUP BY grp) r;
```

**Sample cadence** (establishes what counts as a gap):

```sql
WITH d AS (SELECT timestamp, lag(timestamp) OVER (ORDER BY timestamp) AS prev
           FROM pulse_ox_data WHERE patient_id = 2 AND timestamp > now() - interval '7 days')
SELECT percentile_disc(0.5)  WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (timestamp-prev))) AS p50,
       percentile_disc(0.99) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (timestamp-prev))) AS p99
FROM d WHERE prev IS NOT NULL;
```

---

## Running things

```bash
bash scripts/run_tests.sh          # backend gate, ephemeral Timescale. 710 tests.
npm test && npm run lint           # from frontend/. 1005 tests; lint is --max-warnings 0
docker compose exec backend alembic upgrade head
```

Reconstruction is exposed as a superuser endpoint, dry-run by default:

```bash
POST /api/system/maintenance/alert-closures
     {"dry_run": true, "include_open": true, "include_closed": true}
```

It returns per-alert old/new times and the thresholds used. **Run it dry and
read the output before applying** — applying rewrites clinical records.

Two gotchas when poking at this from a shell:

- A bare `python -c` script that touches the ORM fails with
  `expression 'VentilatorAlert' failed to locate a name` — the mappers are only
  fully registered once `main` is imported. Start such scripts with
  `import main`. Raw-SQL paths are unaffected, which is why
  `crud/alert_closure.py` uses `text()` throughout.
- `crud/settings.get_setting` swallows exceptions and returns the default, so a
  mapper failure shows up as thresholds silently reverting to 90/100/55/155
  rather than as an error.

The relevant code:

| file | role |
|---|---|
| `crud/alert_closure.py` | the rule, the reconstruction, the sweep and resweep passes |
| `modules/state_module.py` | the live engine; `_check_pulse_ox_thresholds` is the state machine |
| `modules/alert_sweeper.py` | the 300s background loop |
| `crud/monitoring.py` | alert CRUD, plus the dead cluster in 3.4 |
| `routes/reports.py` | overnight (~line 600) and weekly (~line 1290) alert sections |
| `tests/test_alert_closure.py` | 30 tests, each named for the real row whose shape it reproduces |
