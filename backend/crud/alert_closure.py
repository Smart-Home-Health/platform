# Smart Home Health
# Copyright (C) 2026 John Carty
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.
"""Working out when a monitoring alert actually ended.

The live engine (modules/state_module.py) closes an alert by watching samples
arrive. That only works while samples keep arriving: if the reader is unplugged
or the process restarts mid-episode, the row is stranded open forever. And its
recovery timer measured plain wall-clock between two normal samples, so when a
sensor came off mid-recovery and the stream resumed hours later, the first
sample on resume satisfied "30 seconds have passed" and the alert was recorded
as having lasted those hours.

This module reconstructs the end from the stored pulse-ox stream instead, and
defines the single rule that both it and the live engine follow:

    An alert ends at the earlier of
      recovery         -- RECOVERY_SECONDS of contiguous all-normal samples
      monitoring ended -- the last valid sample before the stream goes quiet

"Valid" excludes the -1 sentinel a pulse oximeter emits when the probe is off.
That exclusion is what makes one rule cover two different-looking failures: if
the reader dies the samples stop, and if the probe comes off the samples keep
arriving but carry no reading. Measured on real data, probe-off runs reach 9.8
hours. Counting them as data would say the patient was in alarm that whole time.

A trap worth knowing before writing any query that joins alerts to their
samples: end_time is stamped from a timestamp captured before the sample row is
written, so the sample that triggered a close can land a few hundred
microseconds AFTER end_time. A plain BETWEEN start_time AND end_time drops it.
Widen the bound -- see SCAN_EPSILON_SECONDS.
"""
import logging
from datetime import timedelta
from typing import NamedTuple, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from utils.datetime_utils import make_utc, utc_now

logger = logging.getLogger("crud.alert_closure")


# --- The rule -------------------------------------------------------------

# Matches the live engine's long-standing behaviour: values must read normal
# for this long before the episode counts as over.
RECOVERY_SECONDS = 30

# Silence, measured in *valid* samples, that means monitoring stopped rather
# than that the patient stayed well. Cadence is a rock-steady 2s (p50 and p99
# alike), so this is 60 consecutive missing samples -- never mere jitter. It
# also sits above all but 3.6% of observed probe-off runs, so re-seating a
# sensor does not routinely split one episode in two. The value is not load
# bearing for reconstructing historical rows: the discontinuities in the bad
# data run to thousands of seconds, so anything from 60s to 3000s picks out the
# same rows. It tunes live fragmentation only.
GAP_SECONDS = 120

# A hole this long inside an otherwise-normal stretch means the stretch is not
# evidence of continuous normality, so the recovery countdown restarts.
CONTINUITY_SECONDS = 10

# A reading frozen at the same (spo2, bpm) for longer than this, while in
# alarm, is a stuck sensor rather than an unending desaturation.
STUCK_SENSOR_SECONDS = 60
STUCK_SENSOR_MAX_DELTA_SECONDS = 10

# How far past the start we are willing to look before giving up. A genuinely
# longer episode is left alone rather than truncated to fit.
MAX_LOOKAHEAD_MINUTES = 120
MAX_SCAN_SAMPLES = 5000

# Alert start/end timestamps and their triggering samples are written by
# different statements, so they can disagree by well under a second in either
# direction. Widen window bounds by this much to keep the boundary samples.
SCAN_EPSILON_SECONDS = 2


# --- Provenance vocabulary, stored in monitoring_alerts.end_source ---------

LIVE_RECOVERY = "live_recovery"
LIVE_GAP = "live_gap"
INFERRED_RECOVERY = "inferred_recovery"
INFERRED_MONITORING_ENDED = "inferred_monitoring_ended"
INFERRED_NO_DATA = "inferred_no_data"

# Outcomes that mean "the end was reconstructed, not observed". Reports use the
# 'inferred' prefix rather than this tuple, but keep them in step.
INFERRED_PREFIX = "inferred"

OUTCOME_TO_SOURCE = {
    "recovery": INFERRED_RECOVERY,
    "monitoring_ended": INFERRED_MONITORING_ENDED,
    "no_data": INFERRED_NO_DATA,
}


class Thresholds(NamedTuple):
    min_spo2: int
    max_spo2: int
    min_bpm: int
    max_bpm: int


class AlertEndInference(NamedTuple):
    end_time: Optional[object]  # aware datetime, or None meaning "do not close"
    outcome: str                # recovery | monitoring_ended | no_data | indeterminate
    detail: str
    samples_scanned: int


def load_thresholds(db: Session) -> Thresholds:
    """The alarm limits the live engine uses.

    Deliberately the lowercase setting keys seeded in main.py. crud/monitoring
    reads uppercase ones that have never matched anything, so it has always
    silently used its own defaults; do not copy that.
    """
    from crud.settings import get_setting
    return Thresholds(
        int(get_setting(db, 'min_spo2', 90)),
        int(get_setting(db, 'max_spo2', 100)),
        int(get_setting(db, 'min_bpm', 55)),
        int(get_setting(db, 'max_bpm', 155)),
    )


def classify_sample(spo2, bpm, thresholds: Thresholds) -> str:
    """One sample as 'disconnected', 'alarm' or 'normal'.

    Byte-for-byte the live engine's alarm test, so the two cannot drift.
    """
    if spo2 is None or bpm is None or spo2 <= 0 or bpm <= 0:
        return "disconnected"
    if (spo2 < thresholds.min_spo2 or spo2 > thresholds.max_spo2
            or bpm < thresholds.min_bpm or bpm > thresholds.max_bpm):
        return "alarm"
    return "normal"


_SCAN_SQL = text("""
    SELECT timestamp, spo2, bpm
    FROM pulse_ox_data
    WHERE patient_id = :pid
      AND timestamp > :scan_from
      AND timestamp <= :scan_to
      AND spo2 > 0 AND bpm > 0
    ORDER BY timestamp
    LIMIT :max_samples
""")

_NEXT_VALID_SQL = text("""
    SELECT MIN(timestamp) AS ts
    FROM pulse_ox_data
    WHERE patient_id = :pid AND timestamp > :after
      AND spo2 > 0 AND bpm > 0
""")


def infer_alert_end(
    db: Session,
    *,
    patient_id: int,
    start_time,
    thresholds: Optional[Thresholds] = None,
    max_lookahead_minutes: int = MAX_LOOKAHEAD_MINUTES,
    gap_seconds: int = GAP_SECONDS,
    recovery_seconds: int = RECOVERY_SECONDS,
    continuity_seconds: int = CONTINUITY_SECONDS,
) -> AlertEndInference:
    """Reconstruct when an episode that started at start_time actually ended."""
    if thresholds is None:
        thresholds = load_thresholds(db)

    start = make_utc(start_time)
    epsilon = timedelta(seconds=SCAN_EPSILON_SECONDS)

    def result(end, outcome, detail, scanned):
        # The scan deliberately reaches back before start_time to catch the
        # sample that opened the alert, so an end drawn from "the last sample
        # we saw" can land a hair earlier than the start. An episode cannot end
        # before it began; the shortest honest answer is zero.
        if end is not None and end < start:
            end = start
        return AlertEndInference(end, outcome, detail, scanned)

    rows = db.execute(_SCAN_SQL, {
        "pid": patient_id,
        # The sample that opened the alert is written just before the alert
        # itself, so it sits fractionally earlier than start_time.
        "scan_from": start - epsilon,
        "scan_to": start + timedelta(minutes=max_lookahead_minutes),
        "max_samples": MAX_SCAN_SAMPLES,
    }).all()

    if not rows:
        return result(start, "no_data", "no samples after the start", 0)

    prev_valid = start
    recovery_start = None
    frozen_since = None
    frozen_key = None

    for row in rows:
        ts = make_utc(row.timestamp)
        # Boundary samples can predate start_time by a hair; never let that
        # read as a negative gap.
        since_prev = max((ts - prev_valid).total_seconds(), 0.0)

        # 1. The stream went quiet. Everything after the silence describes a
        #    later state of the world, not this episode, so stop at the last
        #    thing we actually saw.
        if since_prev > gap_seconds:
            return result(
                prev_valid, "monitoring_ended",
                f"no valid samples for {since_prev:.0f}s", len(rows),
            )

        kind = classify_sample(row.spo2, row.bpm, thresholds)

        if kind == "alarm":
            recovery_start = None
            # 2. A reading that has not moved at all is the sensor stuck, not a
            #    desaturation that never lifts.
            key = (row.spo2, row.bpm)
            if frozen_key == key and since_prev < STUCK_SENSOR_MAX_DELTA_SECONDS:
                if (ts - frozen_since).total_seconds() > STUCK_SENSOR_SECONDS:
                    return result(
                        frozen_since, "monitoring_ended", "stuck_sensor", len(rows),
                    )
            else:
                frozen_key, frozen_since = key, ts
        else:
            frozen_key, frozen_since = None, None
            # 3. Normal. A hole inside the stretch means it is not continuous
            #    evidence, so start counting again from here.
            if recovery_start is None or since_prev > continuity_seconds:
                recovery_start = ts
            elif (ts - recovery_start).total_seconds() >= recovery_seconds:
                return result(ts, "recovery", "sustained recovery", len(rows))

        prev_valid = ts

    # Ran out of samples without concluding anything. If the scan was truncated
    # we simply did not look far enough to say.
    if len(rows) >= MAX_SCAN_SAMPLES:
        return result(None, "indeterminate", "scan truncated", len(rows))

    # Is there anything at all beyond where we stopped? This is what keeps the
    # lookahead bound from turning "the sensor came off for a fortnight" into
    # "we cannot tell" -- a gap is a gap however far away the next sample is.
    nxt = db.execute(_NEXT_VALID_SQL, {"pid": patient_id, "after": prev_valid}).scalar()
    if nxt is None:
        return result(
            prev_valid, "monitoring_ended", "stream ends here", len(rows),
        )
    silence = (make_utc(nxt) - prev_valid).total_seconds()
    if silence > gap_seconds:
        return result(
            prev_valid, "monitoring_ended",
            f"no valid samples for {silence:.0f}s", len(rows),
        )

    # Continuous data for the whole lookahead without ever recovering. That is
    # a real, long episode (or a fault this rule does not model); either way,
    # truncating it to the bound would be inventing an answer.
    return result(
        None, "indeterminate", "no recovery within the lookahead", len(rows),
    )


def close_alert_with_inference(db: Session, alert, *, thresholds=None) -> dict:
    """Reconstruct and write one alert's end. Returns what happened."""
    from crud.monitoring import update_monitoring_alert

    inference = infer_alert_end(
        db, patient_id=alert.patient_id, start_time=alert.start_time,
        thresholds=thresholds,
    )
    result = {
        "id": alert.id,
        "patient_id": alert.patient_id,
        "start_time": make_utc(alert.start_time).isoformat(),
        "old_end_time": make_utc(alert.end_time).isoformat() if alert.end_time else None,
        "new_end_time": inference.end_time.isoformat() if inference.end_time else None,
        "outcome": inference.outcome,
        "detail": inference.detail,
        "samples_scanned": inference.samples_scanned,
        "closed": False,
    }
    if inference.end_time is None:
        return result

    minutes = (inference.end_time - make_utc(alert.start_time)).total_seconds() / 60
    result["new_minutes"] = round(minutes, 2)
    update_monitoring_alert(
        db, alert.id,
        end_time=inference.end_time,
        end_source=OUTCOME_TO_SOURCE[inference.outcome],
    )
    result["closed"] = True
    result["end_source"] = OUTCOME_TO_SOURCE[inference.outcome]
    return result


# --- The sweep: alerts the live engine can no longer reach -----------------

GRACE_MINUTES = 20
SWEEP_BATCH_LIMIT = 50


_OPEN_ALERTS_SQL = text("""
    SELECT id, patient_id, start_time, end_time
    FROM monitoring_alerts
    WHERE end_time IS NULL AND end_source IS NULL AND start_time < :older_than
    ORDER BY start_time
    LIMIT :limit
""")


def find_open_alerts(db: Session, *, older_than, limit: int):
    """Alerts still open past the grace period and not yet given up on.

    Raw SQL rather than the ORM: we need four columns, and going through the
    mapper would drag in the whole Patient relationship graph for nothing.
    """
    return db.execute(_OPEN_ALERTS_SQL, {"older_than": older_than, "limit": limit}).all()


def sweep_open_alerts(
    db: Session, *, now=None, grace_minutes: int = GRACE_MINUTES,
    limit: int = SWEEP_BATCH_LIMIT, dry_run: bool = False,
) -> dict:
    """Close alerts nothing else can close.

    The grace period keeps us off episodes the live engine still owns. It is
    not what makes this safe, though: an alert that is genuinely still running
    has neither recovered nor gone quiet, so the reconstruction returns
    'indeterminate' and the row is left exactly as it was.
    """
    now = make_utc(now) if now else utc_now()
    cutoff = now - timedelta(minutes=grace_minutes)
    thresholds = load_thresholds(db)

    summary = {
        "examined": 0, "closed": 0, "indeterminate": 0,
        "by_outcome": {}, "items": [],
    }
    for alert in find_open_alerts(db, older_than=cutoff, limit=limit):
        summary["examined"] += 1
        try:
            if dry_run:
                inference = infer_alert_end(
                    db, patient_id=alert.patient_id, start_time=alert.start_time,
                    thresholds=thresholds,
                )
                item = {
                    "id": alert.id,
                    "start_time": make_utc(alert.start_time).isoformat(),
                    "new_end_time": (inference.end_time.isoformat()
                                     if inference.end_time else None),
                    "outcome": inference.outcome,
                    "detail": inference.detail,
                    "closed": False,
                }
            else:
                item = close_alert_with_inference(db, alert, thresholds=thresholds)
        except Exception as e:  # one bad row must not starve the rest
            logger.exception("[alert_closure] alert %s failed to sweep", alert.id)
            db.rollback()
            summary["items"].append({"id": alert.id, "error": str(e)})
            continue

        summary["items"].append(item)
        outcome = item["outcome"]
        summary["by_outcome"][outcome] = summary["by_outcome"].get(outcome, 0) + 1
        if outcome == "indeterminate":
            summary["indeterminate"] += 1
            if not dry_run:
                # Record that we looked and could not tell, so the next tick
                # does not rescan it forever. The row stays open and still
                # reports as unclosed; the maintenance endpoint can retry it.
                _mark_indeterminate(db, alert.id)
        elif item.get("closed"):
            summary["closed"] += 1

    return summary


def _mark_indeterminate(db: Session, alert_id: int) -> None:
    from crud.monitoring import update_monitoring_alert
    update_monitoring_alert(db, alert_id, end_source="indeterminate")


# --- The resweep: ends that were written across a silence ------------------

# Selects rows whose recorded end was stamped after the stream had already gone
# quiet -- proof the value was written across a stretch where nothing was being
# measured. Both terms are needed: depending on how the sub-second ordering
# fell, the silence shows up either as a hole inside the window or as a stretch
# between the last sample and end_time. Checking only the first misses a fifth
# of them.
_IMPLAUSIBLE_SQL = text("""
    WITH windowed AS (
        SELECT a.id, a.patient_id, a.start_time, a.end_time,
               p.timestamp,
               LAG(p.timestamp) OVER (PARTITION BY a.id ORDER BY p.timestamp) AS prev_ts
        FROM monitoring_alerts a
        JOIN pulse_ox_data p
          ON p.patient_id = a.patient_id
         AND p.timestamp >  a.start_time - make_interval(secs => :epsilon)
         AND p.timestamp <= a.end_time   + make_interval(secs => :epsilon)
         AND p.spo2 > 0 AND p.bpm > 0
        WHERE a.end_time IS NOT NULL AND a.end_source IS NULL
    ),
    agg AS (
        SELECT id, patient_id, start_time, end_time,
               COUNT(*) AS valid_samples,
               MAX(EXTRACT(EPOCH FROM (timestamp - prev_ts))) AS max_gap,
               EXTRACT(EPOCH FROM (end_time - MAX(timestamp))) AS silence_before_close
        FROM windowed
        GROUP BY id, patient_id, start_time, end_time
    )
    SELECT id, patient_id, start_time, end_time, valid_samples,
           COALESCE(max_gap, 0) AS max_gap,
           COALESCE(silence_before_close, 0) AS silence_before_close
    FROM agg
    WHERE GREATEST(COALESCE(max_gap, 0), COALESCE(silence_before_close, 0)) > :gap_seconds
    ORDER BY start_time
""")


def resweep_implausible_closures(
    db: Session, *, thresholds=None, gap_seconds: int = GAP_SECONDS,
    dry_run: bool = True, limit: Optional[int] = None,
) -> dict:
    """Correct ends that were stamped after the stream had already gone quiet.

    Selection is by evidence of a silence, never by duration: a long alert is
    not by itself wrong, but an end written across a stretch with no data is.
    Corrections may only ever shorten -- the failure being undone always
    overstates, so a rule that cannot lengthen cannot invent alert time.
    """
    from crud.monitoring import update_monitoring_alert

    if thresholds is None:
        thresholds = load_thresholds(db)

    rows = db.execute(_IMPLAUSIBLE_SQL, {
        "epsilon": SCAN_EPSILON_SECONDS, "gap_seconds": gap_seconds,
    }).all()
    if limit:
        rows = rows[:limit]

    summary = {"selected": len(rows), "rewritten": 0, "skipped": 0, "items": []}
    for row in rows:
        start = make_utc(row.start_time)
        old_end = make_utc(row.end_time)
        inference = infer_alert_end(
            db, patient_id=row.patient_id, start_time=row.start_time,
            thresholds=thresholds,
        )
        item = {
            "id": row.id,
            "start_time": start.isoformat(),
            "old_end_time": old_end.isoformat(),
            "old_minutes": round((old_end - start).total_seconds() / 60, 2),
            "outcome": inference.outcome,
            "detail": inference.detail,
            "rewritten": False,
        }

        # Never blank an end we already have, and never push one later.
        if inference.end_time is None:
            item["skipped_reason"] = "indeterminate"
        elif inference.end_time >= old_end:
            item["skipped_reason"] = "would not shorten"
        else:
            item["new_end_time"] = inference.end_time.isoformat()
            item["new_minutes"] = round(
                (inference.end_time - start).total_seconds() / 60, 2)
            if not dry_run:
                update_monitoring_alert(
                    db, row.id,
                    end_time=inference.end_time,
                    end_source=OUTCOME_TO_SOURCE[inference.outcome],
                    end_time_superseded=old_end,
                )
                logger.warning(
                    "[alert_closure] alert %s end %s -> %s (%.1f min -> %.1f min, %s)",
                    row.id, old_end.isoformat(), inference.end_time.isoformat(),
                    item["old_minutes"], item["new_minutes"], inference.detail,
                )
            item["rewritten"] = True

        if item["rewritten"]:
            summary["rewritten"] += 1
        else:
            summary["skipped"] += 1
        summary["items"].append(item)

    return summary
