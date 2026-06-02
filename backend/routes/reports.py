import logging
from datetime import datetime, date, time, timedelta, timezone
from typing import Optional

import pytz
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from db import get_db
from dependencies import require_read_access
from crud.scheduling import get_scheduled_medications, get_scheduled_care_tasks

logger = logging.getLogger("app")

router = APIRouter(prefix="/api/reports", tags=["reports"])

VITAL_UNITS = {
    "spo2": "%",
    "heart_rate": "bpm",
    "respiratory_rate": "/min",
    "blood_pressure": "mmHg",
    "temperature": "°F",
    "weight": "lbs",
}

ALLOWED_VITAL_TYPES = set(VITAL_UNITS.keys())
ALLOWED_AGGREGATIONS = {"hour", "15min", "5min", "none"}


def _eastern_day_bounds(d: date):
    eastern = pytz.timezone("US/Eastern")
    local_start = eastern.localize(datetime.combine(d, time.min))
    local_end = eastern.localize(datetime.combine(d + timedelta(days=1), time.min))
    return (
        local_start.astimezone(pytz.utc).replace(tzinfo=None),
        local_end.astimezone(pytz.utc).replace(tzinfo=None),
    )


def _parse_dates(dates_str: str) -> list[date]:
    parts = [p.strip() for p in dates_str.split(",") if p.strip()]
    if not parts:
        raise HTTPException(status_code=400, detail="No dates provided")
    if len(parts) > 7:
        raise HTTPException(status_code=400, detail="Maximum 7 dates allowed")
    parsed = []
    for p in parts:
        try:
            parsed.append(datetime.strptime(p, "%Y-%m-%d").date())
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid date: {p}")
    return sorted(set(parsed))


# ---------------------------------------------------------------------------
# Time-bucket SQL expressions by aggregation level
# ---------------------------------------------------------------------------

def _bucket_sql(ts_col: str, agg: str):
    """Return (select_expr, group_expr) for the given aggregation level.
    For 'none', group_expr is None (no GROUP BY)."""
    tz = f"{ts_col} AT TIME ZONE 'US/Eastern'"
    if agg == "none":
        return (
            f"EXTRACT(HOUR FROM {tz}) "
            f"+ EXTRACT(MINUTE FROM {tz}) / 60.0 "
            f"+ EXTRACT(SECOND FROM {tz}) / 3600.0",
            None,
        )
    if agg == "5min":
        bucket = f"floor((EXTRACT(HOUR FROM {tz}) * 60 + EXTRACT(MINUTE FROM {tz})) / 5)"
        return f"{bucket} * 5 / 60.0", bucket
    if agg == "15min":
        bucket = f"floor((EXTRACT(HOUR FROM {tz}) * 60 + EXTRACT(MINUTE FROM {tz})) / 15)"
        return f"{bucket} * 15 / 60.0", bucket
    # hour (default)
    return f"EXTRACT(HOUR FROM {tz})::int", f"EXTRACT(HOUR FROM {tz})"


# ---------------------------------------------------------------------------
# Pulse-ox: stuck-sensor CTE (shared), then aggregate or raw select
# ---------------------------------------------------------------------------

_PULSE_OX_CTE = """
    WITH samples AS (
        SELECT
            timestamp, spo2, bpm,
            LAG(spo2) OVER w AS prev_spo2,
            LAG(bpm)  OVER w AS prev_bpm,
            LAG(timestamp) OVER w AS prev_ts
        FROM pulse_ox_data
        WHERE patient_id = :patient_id
          AND timestamp >= :start_ts
          AND timestamp < :end_ts
          AND spo2 IS NOT NULL AND spo2 > 0
          AND bpm IS NOT NULL AND bpm > 0
        WINDOW w AS (ORDER BY timestamp)
    ),
    marked AS (
        SELECT *,
            CASE
                WHEN spo2 = prev_spo2 AND bpm = prev_bpm
                     AND timestamp - prev_ts < INTERVAL '10 seconds'
                THEN 0 ELSE 1
            END AS new_run
        FROM samples
    ),
    runs AS (
        SELECT *, SUM(new_run) OVER (ORDER BY timestamp) AS run_id FROM marked
    ),
    with_dur AS (
        SELECT *,
            MAX(timestamp) OVER (PARTITION BY run_id)
              - MIN(timestamp) OVER (PARTITION BY run_id) AS run_dur
        FROM runs
    )
"""


def _build_pulse_ox_sql(col: str, agg: str) -> str:
    sel_expr, grp_expr = _bucket_sql("timestamp", agg)
    col_safe = "spo2" if col == "spo2" else "bpm"

    if grp_expr is None:  # raw
        return _PULSE_OX_CTE + f"""
    SELECT
        date(timestamp AT TIME ZONE 'US/Eastern') AS day,
        ({sel_expr}) AS bucket,
        {col_safe}::float AS val
    FROM with_dur
    WHERE run_dur <= INTERVAL '60 seconds'
    ORDER BY day, bucket
"""
    return _PULSE_OX_CTE + f"""
    SELECT
        date(timestamp AT TIME ZONE 'US/Eastern') AS day,
        ({sel_expr}) AS bucket,
        MIN({col_safe}) AS lo,
        AVG({col_safe})::float AS mean,
        MAX({col_safe}) AS hi,
        COUNT(*) AS n
    FROM with_dur
    WHERE run_dur <= INTERVAL '60 seconds'
    GROUP BY day, {grp_expr}
    ORDER BY day, bucket
"""


# ---------------------------------------------------------------------------
# Vent samples
# ---------------------------------------------------------------------------

def _build_vent_sql(agg: str) -> str:
    sel_expr, grp_expr = _bucket_sql("recorded_at", agg)

    base_where = """
    FROM vent_samples
    WHERE patient_id = :patient_id
      AND parameter_key = '9408'
      AND parameter_suffix = '50'
      AND recorded_at >= :start_ts
      AND recorded_at < :end_ts
      AND value_numeric IS NOT NULL
      AND value_numeric > 0 AND value_numeric <= 100
"""
    if grp_expr is None:
        return f"""
    SELECT
        date(recorded_at AT TIME ZONE 'US/Eastern') AS day,
        ({sel_expr}) AS bucket,
        value_numeric::float AS val
    {base_where}
    ORDER BY day, bucket
"""
    return f"""
    SELECT
        date(recorded_at AT TIME ZONE 'US/Eastern') AS day,
        ({sel_expr}) AS bucket,
        MIN(value_numeric) AS lo,
        AVG(value_numeric)::float AS mean,
        MAX(value_numeric) AS hi,
        COUNT(*) AS n
    {base_where}
    GROUP BY day, {grp_expr}
    ORDER BY day, bucket
"""


# ---------------------------------------------------------------------------
# Manual vitals
# ---------------------------------------------------------------------------

def _build_vitals_sql(agg: str, vital_group: Optional[str] = None) -> str:
    sel_expr, grp_expr = _bucket_sql("timestamp", agg)

    group_filter = "AND vital_group = :vital_group" if vital_group else ""

    base_where = f"""
    FROM vitals
    WHERE patient_id = :patient_id
      AND vital_type = :vital_type
      AND timestamp >= :start_ts
      AND timestamp < :end_ts
      {group_filter}
      AND value IS NOT NULL
"""
    if grp_expr is None:
        return f"""
    SELECT
        date(timestamp AT TIME ZONE 'US/Eastern') AS day,
        ({sel_expr}) AS bucket,
        value::float AS val
    {base_where}
    ORDER BY day, bucket
"""
    return f"""
    SELECT
        date(timestamp AT TIME ZONE 'US/Eastern') AS day,
        ({sel_expr}) AS bucket,
        MIN(value) AS lo,
        AVG(value)::float AS mean,
        MAX(value) AS hi,
        COUNT(*) AS n
    {base_where}
    GROUP BY day, {grp_expr}
    ORDER BY day, bucket
"""


# ---------------------------------------------------------------------------
# Row converters
# ---------------------------------------------------------------------------

def _rows_to_points_agg(rows):
    """Aggregated rows (day, t, lo, mean, hi, n) → per-date point lists."""
    by_date: dict[str, list] = {}
    for r in rows:
        day_str = str(r.day)
        by_date.setdefault(day_str, []).append({
            "hour": round(float(r.bucket), 4),
            "min": float(r.lo) if r.lo is not None else None,
            "avg": round(float(r.mean), 1) if r.mean is not None else None,
            "max": float(r.hi) if r.hi is not None else None,
            "count": int(r.n),
        })
    return by_date


def _rows_to_points_raw(rows):
    """Raw rows (day, t, val) → per-date point lists."""
    by_date: dict[str, list] = {}
    for r in rows:
        day_str = str(r.day)
        by_date.setdefault(day_str, []).append({
            "hour": round(float(r.bucket), 4),
            "avg": round(float(r.val), 1) if r.val is not None else None,
        })
    return by_date


def _rows_to_points(rows, agg: str):
    if agg == "none":
        return _rows_to_points_raw(rows)
    return _rows_to_points_agg(rows)


# ---------------------------------------------------------------------------
# Query helpers
# ---------------------------------------------------------------------------

def _query_pulse_ox(db: Session, patient_id: int, dates: list[date], col: str, agg: str):
    if not dates:
        return {}
    earliest_start, _ = _eastern_day_bounds(dates[0])
    _, latest_end = _eastern_day_bounds(dates[-1])

    sql_str = _build_pulse_ox_sql(col, agg)
    rows = db.execute(
        text(sql_str),
        {"patient_id": patient_id, "start_ts": earliest_start, "end_ts": latest_end},
    ).all()
    return _rows_to_points(rows, agg)


def _query_vent(db: Session, patient_id: int, dates: list[date], agg: str):
    if not dates:
        return {}
    earliest_start, _ = _eastern_day_bounds(dates[0])
    _, latest_end = _eastern_day_bounds(dates[-1])

    sql_str = _build_vent_sql(agg)
    rows = db.execute(
        text(sql_str),
        {"patient_id": patient_id, "start_ts": earliest_start, "end_ts": latest_end},
    ).all()
    return _rows_to_points(rows, agg)


def _query_vitals(db: Session, patient_id: int, dates: list[date], vital_type: str,
                  agg: str, vital_group: Optional[str] = None):
    if not dates:
        return {}
    earliest_start, _ = _eastern_day_bounds(dates[0])
    _, latest_end = _eastern_day_bounds(dates[-1])

    params: dict = {
        "patient_id": patient_id,
        "vital_type": vital_type,
        "start_ts": earliest_start,
        "end_ts": latest_end,
    }
    if vital_group:
        params["vital_group"] = vital_group

    sql_str = _build_vitals_sql(agg, vital_group)
    rows = db.execute(text(sql_str), params).all()
    return _rows_to_points(rows, agg)


def _dates_with_pulse_ox(db: Session, patient_id: int, dates: list[date]) -> set[str]:
    if not dates:
        return set()
    earliest_start, _ = _eastern_day_bounds(dates[0])
    _, latest_end = _eastern_day_bounds(dates[-1])
    rows = db.execute(text("""
        SELECT DISTINCT date(timestamp AT TIME ZONE 'US/Eastern')::text AS d
        FROM pulse_ox_data
        WHERE patient_id = :pid
          AND timestamp >= :start_ts AND timestamp < :end_ts
          AND spo2 IS NOT NULL AND spo2 > 0
    """), {"pid": patient_id, "start_ts": earliest_start, "end_ts": latest_end}).all()
    return {r.d for r in rows}


def _dates_with_vent(db: Session, patient_id: int, dates: list[date]) -> set[str]:
    if not dates:
        return set()
    earliest_start, _ = _eastern_day_bounds(dates[0])
    _, latest_end = _eastern_day_bounds(dates[-1])
    rows = db.execute(text("""
        SELECT DISTINCT date(recorded_at AT TIME ZONE 'US/Eastern')::text AS d
        FROM vent_samples
        WHERE patient_id = :pid
          AND parameter_key = '9408' AND parameter_suffix = '50'
          AND recorded_at >= :start_ts AND recorded_at < :end_ts
          AND value_numeric IS NOT NULL AND value_numeric > 0
    """), {"pid": patient_id, "start_ts": earliest_start, "end_ts": latest_end}).all()
    return {r.d for r in rows}


@router.get("/day-over-day")
async def day_over_day(
    patient_id: int,
    vital_type: str,
    dates: str = Query(..., description="Comma-separated YYYY-MM-DD (max 7)"),
    aggregation: str = Query("hour", description="Aggregation: hour, 15min, 5min, none"),
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access),
):
    if vital_type not in ALLOWED_VITAL_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid vital_type: {vital_type}")
    if aggregation not in ALLOWED_AGGREGATIONS:
        raise HTTPException(status_code=400, detail=f"Invalid aggregation: {aggregation}")

    parsed_dates = _parse_dates(dates)
    empty_points: list = []

    days_result = []

    if vital_type in ("spo2", "heart_rate"):
        col = "spo2" if vital_type == "spo2" else "bpm"
        device_dates = _dates_with_pulse_ox(db, patient_id, parsed_dates)
        device_date_objs = [d for d in parsed_dates if d.isoformat() in device_dates]
        manual_date_objs = [d for d in parsed_dates if d.isoformat() not in device_dates]

        device_data = _query_pulse_ox(db, patient_id, device_date_objs, col, aggregation)
        manual_data = _query_vitals(db, patient_id, manual_date_objs, vital_type, aggregation)

        for d in parsed_dates:
            ds = d.isoformat()
            if ds in device_data:
                days_result.append({"date": ds, "source": "pulse_ox", "hourly": device_data[ds]})
            elif ds in manual_data:
                days_result.append({"date": ds, "source": "manual", "hourly": manual_data[ds]})
            else:
                days_result.append({"date": ds, "source": "none", "hourly": list(empty_points)})

    elif vital_type == "respiratory_rate":
        vent_dates = _dates_with_vent(db, patient_id, parsed_dates)
        vent_date_objs = [d for d in parsed_dates if d.isoformat() in vent_dates]
        manual_date_objs = [d for d in parsed_dates if d.isoformat() not in vent_dates]

        vent_data = _query_vent(db, patient_id, vent_date_objs, aggregation)
        manual_data = _query_vitals(db, patient_id, manual_date_objs, "respiratory_rate", aggregation)

        for d in parsed_dates:
            ds = d.isoformat()
            if ds in vent_data:
                days_result.append({"date": ds, "source": "vent", "hourly": vent_data[ds]})
            elif ds in manual_data:
                days_result.append({"date": ds, "source": "manual", "hourly": manual_data[ds]})
            else:
                days_result.append({"date": ds, "source": "none", "hourly": list(empty_points)})

    elif vital_type == "blood_pressure":
        data = _query_vitals(db, patient_id, parsed_dates, "blood_pressure", aggregation, vital_group="map")
        for d in parsed_dates:
            ds = d.isoformat()
            days_result.append({"date": ds, "source": "manual", "hourly": data.get(ds, list(empty_points))})

    elif vital_type == "temperature":
        data = _query_vitals(db, patient_id, parsed_dates, "temperature", aggregation, vital_group="body")
        for d in parsed_dates:
            ds = d.isoformat()
            days_result.append({"date": ds, "source": "manual", "hourly": data.get(ds, list(empty_points))})

    else:
        data = _query_vitals(db, patient_id, parsed_dates, vital_type, aggregation)
        for d in parsed_dates:
            ds = d.isoformat()
            days_result.append({"date": ds, "source": "manual", "hourly": data.get(ds, list(empty_points))})

    return {
        "vital_type": vital_type,
        "unit": VITAL_UNITS.get(vital_type, ""),
        "aggregation": aggregation,
        "days": days_result,
    }


# ---------------------------------------------------------------------------
# Overnight monitoring summary
# ---------------------------------------------------------------------------

def _overnight_bounds(d: date, start_hour: int, end_hour: int):
    eastern = pytz.timezone("US/Eastern")
    local_start = eastern.localize(datetime.combine(d, time(start_hour)))
    local_end = eastern.localize(datetime.combine(d + timedelta(days=1), time(end_hour)))
    return (
        local_start.astimezone(pytz.utc).replace(tzinfo=None),
        local_end.astimezone(pytz.utc).replace(tzinfo=None),
        local_start,
        local_end,
    )


@router.get("/overnight")
async def overnight_summary(
    patient_id: int,
    report_date: str = Query(..., description="Night-of date YYYY-MM-DD"),
    start_hour: int = Query(20, description="Start hour (local, 0-23)"),
    end_hour: int = Query(8, description="End hour next day (local, 0-23)"),
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access),
):
    try:
        d = datetime.strptime(report_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")

    if start_hour < 0 or start_hour > 23 or end_hour < 0 or end_hour > 23:
        raise HTTPException(status_code=400, detail="Hours must be 0-23")

    utc_start, utc_end, local_start, local_end = _overnight_bounds(d, start_hour, end_hour)

    # --- Vitals summary (pulse ox) ---
    vitals_rows = db.execute(text("""
        WITH filtered AS (
            SELECT spo2, bpm, timestamp
            FROM pulse_ox_data
            WHERE patient_id = :pid
              AND timestamp >= :start AND timestamp < :end
              AND spo2 IS NOT NULL AND spo2 > 0
              AND bpm IS NOT NULL AND bpm > 0
        )
        SELECT
            MIN(spo2) AS spo2_min, AVG(spo2)::float AS spo2_avg, MAX(spo2) AS spo2_max,
            MIN(bpm)  AS hr_min,   AVG(bpm)::float  AS hr_avg,   MAX(bpm)  AS hr_max,
            COUNT(*)  AS sample_count
        FROM filtered
    """), {"pid": patient_id, "start": utc_start, "end": utc_end}).first()

    vitals_summary = {}
    if vitals_rows and vitals_rows.sample_count and vitals_rows.sample_count > 0:
        # Time below SpO2 90
        below_90 = db.execute(text("""
            SELECT COUNT(*) AS cnt
            FROM pulse_ox_data
            WHERE patient_id = :pid
              AND timestamp >= :start AND timestamp < :end
              AND spo2 IS NOT NULL AND spo2 > 0 AND spo2 < 90
              AND bpm IS NOT NULL AND bpm > 0
        """), {"pid": patient_id, "start": utc_start, "end": utc_end}).scalar() or 0

        # Estimate minutes below 90 — each sample is roughly 4 seconds apart
        time_below_90_min = round(below_90 * 4 / 60, 1)

        vitals_summary = {
            "spo2": {
                "min": int(vitals_rows.spo2_min),
                "avg": round(vitals_rows.spo2_avg, 1),
                "max": int(vitals_rows.spo2_max),
                "time_below_90_minutes": time_below_90_min,
            },
            "heart_rate": {
                "min": int(vitals_rows.hr_min),
                "avg": round(vitals_rows.hr_avg, 1),
                "max": int(vitals_rows.hr_max),
            },
        }

    # --- Vitals time series for chart ---
    chart_rows = db.execute(text("""
        SELECT
            EXTRACT(EPOCH FROM timestamp)::bigint AS ts,
            spo2, bpm
        FROM pulse_ox_data
        WHERE patient_id = :pid
          AND timestamp >= :start AND timestamp < :end
          AND spo2 IS NOT NULL AND spo2 > 0
          AND bpm IS NOT NULL AND bpm > 0
        ORDER BY timestamp
    """), {"pid": patient_id, "start": utc_start, "end": utc_end}).all()

    # Downsample to ~1 point per 5 minutes for chart performance
    vitals_chart = []
    last_ts = 0
    for r in chart_rows:
        if r.ts - last_ts >= 300:
            vitals_chart.append({"ts": r.ts, "spo2": int(r.spo2), "hr": int(r.bpm)})
            last_ts = r.ts

    # --- Monitoring alerts ---
    alert_rows = db.execute(text("""
        SELECT id, start_time, end_time,
               spo2_min, spo2_max, bpm_min, bpm_max,
               spo2_alarm_triggered, hr_alarm_triggered,
               oxygen_used, oxygen_highest, acknowledged
        FROM monitoring_alerts
        WHERE patient_id = :pid
          AND start_time >= :start AND start_time < :end
        ORDER BY start_time
    """), {"pid": patient_id, "start": utc_start, "end": utc_end}).all()

    alert_items = []
    total_alert_minutes = 0
    longest_alert_minutes = 0
    oxygen_episodes = 0
    oxygen_total_minutes = 0
    oxygen_highest_flow = 0

    for a in alert_rows:
        end_t = a.end_time or utc_end
        duration = (end_t - a.start_time).total_seconds() / 60
        duration = round(duration, 1)
        total_alert_minutes += duration
        if duration > longest_alert_minutes:
            longest_alert_minutes = duration

        if a.oxygen_used:
            oxygen_episodes += 1
            oxygen_total_minutes += duration
            if a.oxygen_highest and a.oxygen_highest > oxygen_highest_flow:
                oxygen_highest_flow = a.oxygen_highest

        alert_items.append({
            "start_time": a.start_time.isoformat(),
            "end_time": a.end_time.isoformat() if a.end_time else None,
            "duration_minutes": duration,
            "spo2_min": a.spo2_min,
            "spo2_max": a.spo2_max,
            "bpm_min": a.bpm_min,
            "bpm_max": a.bpm_max,
            "spo2_alarm": bool(a.spo2_alarm_triggered),
            "hr_alarm": bool(a.hr_alarm_triggered),
            "oxygen_used": bool(a.oxygen_used),
            "oxygen_highest": float(a.oxygen_highest) if a.oxygen_highest else None,
            "acknowledged": bool(a.acknowledged),
        })

    # --- Care checklist (meds + tasks in overnight window) ---
    # Use Eastern timezone offset for schedule helpers
    eastern = pytz.timezone("US/Eastern")
    tz_offset = int(eastern.localize(datetime.combine(d, time(12))).utcoffset().total_seconds() / 60)

    # Get schedules for both days that the overnight window spans
    meds_day1 = get_scheduled_medications(db, d, patient_id, tz_offset_minutes=tz_offset)
    meds_day2 = get_scheduled_medications(db, d + timedelta(days=1), patient_id, tz_offset_minutes=tz_offset)
    all_meds = meds_day1 + meds_day2

    tasks_day1 = get_scheduled_care_tasks(db, d, patient_id, tz_offset_minutes=tz_offset)
    tasks_day2 = get_scheduled_care_tasks(db, d + timedelta(days=1), patient_id, tz_offset_minutes=tz_offset)
    all_tasks = tasks_day1 + tasks_day2

    local_start_aware = local_start.astimezone(pytz.utc)
    local_end_aware = local_end.astimezone(pytz.utc)

    # Look up skipped med logs (dose_amount = 0) in the window so we can
    # distinguish "skipped" from "given on time". get_scheduled_medications
    # only flags `completed` from log presence, not from log dose.
    skipped_med_rows = db.execute(text("""
        SELECT schedule_id, scheduled_time
        FROM medication_log
        WHERE patient_id = :pid
          AND dose_amount = 0
          AND scheduled_time IS NOT NULL
          AND scheduled_time >= :start AND scheduled_time < :end
    """), {"pid": patient_id, "start": utc_start, "end": utc_end}).all()
    skipped_meds_keys = {
        (r.schedule_id, r.scheduled_time.strftime('%H:%M'))
        for r in skipped_med_rows if r.scheduled_time
    }

    # Look up skipped care task logs (status='skipped') the same way.
    skipped_task_rows = db.execute(text("""
        SELECT schedule_id, scheduled_time
        FROM care_task_log
        WHERE patient_id = :pid
          AND status = 'skipped'
          AND scheduled_time IS NOT NULL
          AND scheduled_time >= :start AND scheduled_time < :end
    """), {"pid": patient_id, "start": utc_start, "end": utc_end}).all()
    skipped_tasks_keys = {
        (r.schedule_id, r.scheduled_time.strftime('%H:%M'))
        for r in skipped_task_rows if r.scheduled_time
    }

    # ALL scheduled med/task logs in the window — including from meds/tasks
    # that have since been deactivated. The active-schedule expansion above
    # only knows about currently-active records, so without these rows a
    # historical "given" or "skipped" event would be invisible the moment
    # the underlying medication is marked inactive.
    all_med_log_rows = db.execute(text("""
        SELECT ml.schedule_id, ml.scheduled_time, ml.administered_at,
               ml.dose_amount, m.name AS med_name
        FROM medication_log ml
        JOIN medication m ON m.id = ml.medication_id
        WHERE ml.patient_id = :pid
          AND ml.scheduled_time IS NOT NULL
          AND ml.scheduled_time >= :start AND ml.scheduled_time < :end
    """), {"pid": patient_id, "start": utc_start, "end": utc_end}).all()

    all_task_log_rows = db.execute(text("""
        SELECT ctl.schedule_id, ctl.scheduled_time, ctl.completed_at,
               ctl.status, ct.name AS task_name
        FROM care_task_log ctl
        JOIN care_task ct ON ct.id = ctl.care_task_id
        WHERE ctl.patient_id = :pid
          AND ctl.scheduled_time IS NOT NULL
          AND ctl.scheduled_time >= :start AND ctl.scheduled_time < :end
    """), {"pid": patient_id, "start": utc_start, "end": utc_end}).all()

    def _in_window(item):
        st = item.get("scheduled_time")
        if st is None:
            return False
        if isinstance(st, str):
            st = datetime.fromisoformat(st)
        if st.tzinfo is None:
            st = st.replace(tzinfo=timezone.utc)
        return local_start_aware <= st < local_end_aware

    def _skip_key(item):
        st = item.get("scheduled_time")
        if st is None:
            return None
        if isinstance(st, str):
            st = datetime.fromisoformat(st)
        if st.tzinfo is None:
            st = st.replace(tzinfo=timezone.utc)
        return (item.get("schedule_id"), st.astimezone(timezone.utc).strftime('%H:%M'))

    def _med_status(item):
        if _skip_key(item) in skipped_meds_keys:
            return "skipped"
        if item.get("completed"):
            st = item["scheduled_time"]
            ca = item.get("completed_at")
            if st and ca:
                if isinstance(st, str):
                    st = datetime.fromisoformat(st)
                if isinstance(ca, str):
                    ca = datetime.fromisoformat(ca)
                if st.tzinfo is None:
                    st = st.replace(tzinfo=timezone.utc)
                if ca.tzinfo is None:
                    ca = ca.replace(tzinfo=timezone.utc)
                diff = (ca - st).total_seconds() / 60
                if abs(diff) <= 15:
                    return "on_time"
                return "late"
            return "on_time"
        return "missed"

    def _fmt_time(dt):
        if dt is None:
            return None
        if isinstance(dt, str):
            dt = datetime.fromisoformat(dt)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        local = dt.astimezone(eastern)
        return local.strftime("%-I:%M %p")

    def _to_utc_aware(dt):
        if dt is None:
            return None
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)

    def _log_med_status(scheduled_dt, administered_dt, dose_amount):
        if dose_amount == 0:
            return "skipped"
        if scheduled_dt and administered_dt:
            diff = (administered_dt - scheduled_dt).total_seconds() / 60
            return "on_time" if abs(diff) <= 15 else "late"
        return "on_time"

    # First pass: items from currently-active schedules (gives us missed entries).
    # Track UTC HH:MM-keyed coverage so the second pass can append inactive-med
    # logs without double-counting.
    seen_meds_utc = set()
    internal_meds = []
    for m in all_meds:
        if not _in_window(m) or m.get("is_prn"):
            continue
        sk = _skip_key(m)
        if sk in seen_meds_utc:
            continue
        seen_meds_utc.add(sk)
        st = _to_utc_aware(m.get("scheduled_time")
            if not isinstance(m.get("scheduled_time"), str)
            else datetime.fromisoformat(m["scheduled_time"]))
        internal_meds.append((st, {
            "name": m.get("medication_name", ""),
            "scheduled_time": _fmt_time(m.get("scheduled_time")),
            "status": _med_status(m),
            "administered_at": _fmt_time(m.get("completed_at")),
        }))

    # Second pass: append logs whose schedule isn't covered above — these are
    # administrations of meds that are now inactive (or whose schedule has
    # since been deleted). We can show "given" or "skipped" reliably from the
    # log, but not "missed" because we don't track which days an inactive med
    # was previously scheduled.
    for r in all_med_log_rows:
        if r.scheduled_time is None:
            continue
        key = (r.schedule_id, r.scheduled_time.strftime('%H:%M'))
        if key in seen_meds_utc:
            continue
        seen_meds_utc.add(key)
        sched_aware = _to_utc_aware(r.scheduled_time)
        admin_aware = _to_utc_aware(r.administered_at)
        status = _log_med_status(sched_aware, admin_aware, r.dose_amount)
        internal_meds.append((sched_aware, {
            "name": r.med_name,
            "scheduled_time": _fmt_time(sched_aware),
            "status": status,
            "administered_at": _fmt_time(admin_aware),
        }))

    internal_meds.sort(key=lambda x: (x[0] or datetime.max.replace(tzinfo=timezone.utc)))
    med_checklist = [item for (_, item) in internal_meds]

    # Same pattern for care tasks.
    seen_tasks_utc = set()
    internal_tasks = []
    for t in all_tasks:
        if not _in_window(t):
            continue
        sk = _skip_key(t)
        if sk in seen_tasks_utc:
            continue
        seen_tasks_utc.add(sk)
        if sk in skipped_tasks_keys:
            status = "skipped"
        elif t.get("completed"):
            status = "completed"
        else:
            status = "missed"
        st_raw = t.get("scheduled_time")
        st = _to_utc_aware(datetime.fromisoformat(st_raw) if isinstance(st_raw, str) else st_raw)
        internal_tasks.append((st, {
            "name": t.get("care_task_name", ""),
            "scheduled_time": _fmt_time(t.get("scheduled_time")),
            "status": status,
            "completed_at": _fmt_time(t.get("completed_at")),
        }))

    for r in all_task_log_rows:
        if r.scheduled_time is None:
            continue
        key = (r.schedule_id, r.scheduled_time.strftime('%H:%M'))
        if key in seen_tasks_utc:
            continue
        seen_tasks_utc.add(key)
        sched_aware = _to_utc_aware(r.scheduled_time)
        completed_aware = _to_utc_aware(r.completed_at)
        if r.status == "skipped":
            status = "skipped"
        elif r.status in ("completed", "partial"):
            status = "completed"
        else:
            status = "completed"
        internal_tasks.append((sched_aware, {
            "name": r.task_name,
            "scheduled_time": _fmt_time(sched_aware),
            "status": status,
            "completed_at": _fmt_time(completed_aware),
        }))

    internal_tasks.sort(key=lambda x: (x[0] or datetime.max.replace(tzinfo=timezone.utc)))
    task_checklist = [item for (_, item) in internal_tasks]

    # --- Symptoms ---
    symptom_rows = db.execute(text("""
        SELECT symptom_type, severity, timestamp, description
        FROM symptoms
        WHERE patient_id = :pid
          AND timestamp >= :start AND timestamp < :end
        ORDER BY timestamp
    """), {"pid": patient_id, "start": utc_start, "end": utc_end}).all()

    symptoms = [
        {
            "symptom_type": s.symptom_type,
            "severity": s.severity,
            "timestamp": s.timestamp.isoformat() if s.timestamp else None,
            "description": s.description,
        }
        for s in symptom_rows
    ]

    # --- Compliance calc ---
    # Skipped items aren't a compliance failure (intentional) but also aren't
    # a compliance success. Drop them from the denominator entirely so a
    # legitimately-skipped dose doesn't drag the percentage down.
    def _counts_against_compliance(status):
        return status != "skipped"

    def _counts_as_done(status):
        return status not in ("missed", "skipped")

    total_items = sum(1 for m in med_checklist if _counts_against_compliance(m["status"])) + \
                  sum(1 for t in task_checklist if _counts_against_compliance(t["status"]))
    completed_items = sum(1 for m in med_checklist if _counts_as_done(m["status"])) + \
                      sum(1 for t in task_checklist if _counts_as_done(t["status"]))
    compliance_pct = round(completed_items / total_items * 100, 1) if total_items > 0 else None

    return {
        "date": report_date,
        "window": {
            "start": local_start.strftime("%Y-%m-%dT%H:%M"),
            "end": local_end.strftime("%Y-%m-%dT%H:%M"),
            "start_hour": start_hour,
            "end_hour": end_hour,
        },
        "vitals_summary": vitals_summary,
        "vitals_chart": vitals_chart,
        "alerts": {
            "total": len(alert_items),
            "total_duration_minutes": round(total_alert_minutes, 1),
            "longest_duration_minutes": round(longest_alert_minutes, 1),
            "items": alert_items,
        },
        "oxygen": {
            "episodes": oxygen_episodes,
            "total_minutes": round(oxygen_total_minutes, 1),
            "highest_flow": oxygen_highest_flow,
        },
        "care_checklist": {
            "medications": med_checklist,
            "care_tasks": task_checklist,
        },
        "symptoms": symptoms,
        "compliance_pct": compliance_pct,
    }


# ---------------------------------------------------------------------------
# Weekly care summary
# ---------------------------------------------------------------------------

@router.get("/weekly-summary")
async def weekly_summary(
    patient_id: int,
    end_date: str = Query(None, description="End date YYYY-MM-DD, defaults to today"),
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access),
):
    eastern = pytz.timezone("US/Eastern")

    if end_date:
        try:
            end_d = datetime.strptime(end_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format")
    else:
        end_d = datetime.now(eastern).date()

    start_d = end_d - timedelta(days=6)
    dates_range = [start_d + timedelta(days=i) for i in range(7)]

    utc_start, _ = _eastern_day_bounds(start_d)
    _, utc_end = _eastern_day_bounds(end_d)

    # --- Vitals sparklines ---
    vitals_result = {}
    # SpO2 + HR from pulse_ox
    for col, key in [("spo2", "spo2"), ("bpm", "heart_rate")]:
        rows = db.execute(text(f"""
            SELECT
                date(timestamp AT TIME ZONE 'US/Eastern') AS day,
                MIN({col}) AS lo, AVG({col})::float AS avg, MAX({col}) AS hi
            FROM pulse_ox_data
            WHERE patient_id = :pid
              AND timestamp >= :start AND timestamp < :end
              AND {col} IS NOT NULL AND {col} > 0
            GROUP BY day ORDER BY day
        """), {"pid": patient_id, "start": utc_start, "end": utc_end}).all()

        daily = [{"date": str(r.day), "avg": round(r.avg, 1)} for r in rows]
        all_vals = [r.avg for r in rows if r.avg]
        vitals_result[key] = {
            "min": int(min(r.lo for r in rows)) if rows else None,
            "avg": round(sum(all_vals) / len(all_vals), 1) if all_vals else None,
            "max": int(max(r.hi for r in rows)) if rows else None,
            "daily": daily,
        }

    # Respiratory rate from vent_samples
    rr_rows = db.execute(text("""
        SELECT
            date(recorded_at AT TIME ZONE 'US/Eastern') AS day,
            MIN(value_numeric) AS lo, AVG(value_numeric)::float AS avg, MAX(value_numeric) AS hi
        FROM vent_samples
        WHERE patient_id = :pid
          AND parameter_key = '9408' AND parameter_suffix = '50'
          AND recorded_at >= :start AND recorded_at < :end
          AND value_numeric IS NOT NULL AND value_numeric > 0 AND value_numeric <= 100
        GROUP BY day ORDER BY day
    """), {"pid": patient_id, "start": utc_start, "end": utc_end}).all()

    rr_daily = [{"date": str(r.day), "avg": round(r.avg, 1)} for r in rr_rows]
    rr_vals = [r.avg for r in rr_rows if r.avg]
    vitals_result["respiratory_rate"] = {
        "min": round(min(r.lo for r in rr_rows), 1) if rr_rows else None,
        "avg": round(sum(rr_vals) / len(rr_vals), 1) if rr_vals else None,
        "max": round(max(r.hi for r in rr_rows), 1) if rr_rows else None,
        "daily": rr_daily,
    }

    # Temperature + weight from vitals table
    for vtype, vgroup in [("temperature", "body"), ("weight", None)]:
        group_filter = "AND vital_group = :vgroup" if vgroup else ""
        params = {"pid": patient_id, "start": utc_start, "end": utc_end, "vital_type": vtype}
        if vgroup:
            params["vgroup"] = vgroup
        rows = db.execute(text(f"""
            SELECT
                date(timestamp AT TIME ZONE 'US/Eastern') AS day,
                MIN(value) AS lo, AVG(value)::float AS avg, MAX(value) AS hi
            FROM vitals
            WHERE patient_id = :pid
              AND vital_type = :vital_type
              AND timestamp >= :start AND timestamp < :end
              AND value IS NOT NULL
              {group_filter}
            GROUP BY day ORDER BY day
        """), params).all()

        daily = [{"date": str(r.day), "avg": round(r.avg, 1)} for r in rows]
        vals = [r.avg for r in rows if r.avg]
        vitals_result[vtype] = {
            "min": round(min(r.lo for r in rows), 1) if rows else None,
            "avg": round(sum(vals) / len(vals), 1) if vals else None,
            "max": round(max(r.hi for r in rows), 1) if rows else None,
            "daily": daily,
        }

    # --- Compliance ---
    tz_offset = int(eastern.localize(datetime.combine(start_d, time(12))).utcoffset().total_seconds() / 60)

    # Pre-fetch all scheduled logs in the period so we can:
    # 1) detect skipped doses (dose_amount = 0) on active-schedule entries
    # 2) surface administrations of meds/tasks whose schedule is no longer active
    period_med_log_rows = db.execute(text("""
        SELECT schedule_id, scheduled_time, administered_at, dose_amount
        FROM medication_log
        WHERE patient_id = :pid
          AND scheduled_time IS NOT NULL
          AND scheduled_time >= :start AND scheduled_time < :end
    """), {"pid": patient_id, "start": utc_start, "end": utc_end}).all()
    period_skipped_med_keys = {
        (r.schedule_id, r.scheduled_time.strftime('%Y-%m-%d %H:%M'))
        for r in period_med_log_rows if r.scheduled_time and r.dose_amount == 0
    }

    period_task_log_rows = db.execute(text("""
        SELECT schedule_id, scheduled_time, completed_at, status
        FROM care_task_log
        WHERE patient_id = :pid
          AND scheduled_time IS NOT NULL
          AND scheduled_time >= :start AND scheduled_time < :end
    """), {"pid": patient_id, "start": utc_start, "end": utc_end}).all()
    period_skipped_task_keys = {
        (r.schedule_id, r.scheduled_time.strftime('%Y-%m-%d %H:%M'))
        for r in period_task_log_rows if r.scheduled_time and r.status == 'skipped'
    }

    med_total = 0
    med_administered = 0
    med_on_time = 0
    med_late = 0
    med_skipped = 0
    med_missed = 0
    task_total = 0
    task_completed = 0
    task_skipped = 0
    task_missed = 0

    covered_med_keys = set()
    covered_task_keys = set()

    def _utc_minute_key(sid, st):
        if st is None:
            return None
        if isinstance(st, str):
            st = datetime.fromisoformat(st)
        if st.tzinfo is None:
            st = st.replace(tzinfo=timezone.utc)
        return (sid, st.astimezone(timezone.utc).strftime('%Y-%m-%d %H:%M'))

    for day in dates_range:
        meds = get_scheduled_medications(db, day, patient_id, tz_offset_minutes=tz_offset)
        for m in meds:
            if m.get("is_prn"):
                continue
            mkey = _utc_minute_key(m.get("schedule_id"), m.get("scheduled_time"))
            if mkey in covered_med_keys:
                continue
            covered_med_keys.add(mkey)
            med_total += 1
            if mkey in period_skipped_med_keys:
                med_skipped += 1
            elif m.get("completed"):
                med_administered += 1
                st = m["scheduled_time"]
                ca = m.get("completed_at")
                if st and ca:
                    if isinstance(st, str):
                        st = datetime.fromisoformat(st)
                    if isinstance(ca, str):
                        ca = datetime.fromisoformat(ca)
                    if st.tzinfo is None:
                        st = st.replace(tzinfo=timezone.utc)
                    if ca.tzinfo is None:
                        ca = ca.replace(tzinfo=timezone.utc)
                    if abs((ca - st).total_seconds()) <= 900:
                        med_on_time += 1
                    else:
                        med_late += 1
                else:
                    med_on_time += 1
            else:
                med_missed += 1

        tasks = get_scheduled_care_tasks(db, day, patient_id, tz_offset_minutes=tz_offset)
        for t in tasks:
            tkey = _utc_minute_key(t.get("schedule_id"), t.get("scheduled_time"))
            if tkey in covered_task_keys:
                continue
            covered_task_keys.add(tkey)
            task_total += 1
            if tkey in period_skipped_task_keys:
                task_skipped += 1
            elif t.get("completed"):
                task_completed += 1
            else:
                task_missed += 1

    # Add log entries whose schedule isn't covered above (inactive meds/tasks).
    # We can't show "missed" for these — we don't know which days they were
    # scheduled — but actual administrations and skips are recorded in the log.
    for r in period_med_log_rows:
        if r.scheduled_time is None:
            continue
        key = (r.schedule_id, r.scheduled_time.strftime('%Y-%m-%d %H:%M'))
        if key in covered_med_keys:
            continue
        covered_med_keys.add(key)
        med_total += 1
        if r.dose_amount == 0:
            med_skipped += 1
        elif r.administered_at and r.scheduled_time:
            sched = r.scheduled_time.replace(tzinfo=timezone.utc) if r.scheduled_time.tzinfo is None else r.scheduled_time
            admin = r.administered_at if r.administered_at.tzinfo else r.administered_at.replace(tzinfo=timezone.utc)
            med_administered += 1
            if abs((admin - sched).total_seconds()) <= 900:
                med_on_time += 1
            else:
                med_late += 1
        else:
            med_administered += 1
            med_on_time += 1

    for r in period_task_log_rows:
        if r.scheduled_time is None:
            continue
        key = (r.schedule_id, r.scheduled_time.strftime('%Y-%m-%d %H:%M'))
        if key in covered_task_keys:
            continue
        covered_task_keys.add(key)
        task_total += 1
        if r.status == 'skipped':
            task_skipped += 1
        else:
            task_completed += 1

    # Skipped items are intentional non-doses — drop them from the denominator
    # so a legitimate skip doesn't drag the percentage down.
    compliance_denom = (med_total - med_skipped) + (task_total - task_skipped)
    total_done = med_administered + task_completed
    overall_pct = round(total_done / compliance_denom * 100, 1) if compliance_denom > 0 else None

    compliance = {
        "medications": {
            "total_scheduled": med_total,
            "administered": med_administered,
            "on_time": med_on_time,
            "late": med_late,
            "skipped": med_skipped,
            "missed": med_missed,
        },
        "care_tasks": {
            "total_scheduled": task_total,
            "completed": task_completed,
            "skipped": task_skipped,
            "missed": task_missed,
        },
        "overall_pct": overall_pct,
    }

    # --- Nutrition ---
    nutrition_rows = db.execute(text("""
        SELECT
            date(consumed_at AT TIME ZONE 'US/Eastern') AS day,
            COALESCE(SUM(calories), 0)::float AS calories,
            COALESCE(SUM(CASE WHEN item_type = 'liquid' THEN
                CASE amount_unit
                    WHEN 'ml' THEN amount
                    WHEN 'oz' THEN amount * 29.5735
                    WHEN 'cups' THEN amount * 236.588
                    ELSE 0
                END ELSE 0 END), 0)::float AS fluid_ml,
            COALESCE(SUM(protein_grams), 0)::float AS protein_g
        FROM nutrition_intake
        WHERE patient_id = :pid
          AND consumed_at >= :start AND consumed_at < :end
        GROUP BY day ORDER BY day
    """), {"pid": patient_id, "start": utc_start, "end": utc_end}).all()

    nutrition_daily = [
        {"date": str(r.day), "calories": round(r.calories, 0), "fluid_ml": round(r.fluid_ml, 0), "protein_g": round(r.protein_g, 1)}
        for r in nutrition_rows
    ]

    # Get active nutrition goals
    goal_row = db.execute(text("""
        SELECT calories_target, water_ml_target, protein_grams_target
        FROM nutrition_goals
        WHERE patient_id = :pid AND is_active = true
        ORDER BY effective_date DESC LIMIT 1
    """), {"pid": patient_id}).first()

    nutrition_goals = {}
    if goal_row:
        nutrition_goals = {
            "calories_target": goal_row.calories_target,
            "water_ml_target": goal_row.water_ml_target,
            "protein_grams_target": goal_row.protein_grams_target,
        }

    cal_vals = [r.calories for r in nutrition_rows if r.calories]
    fluid_vals = [r.fluid_ml for r in nutrition_rows if r.fluid_ml]

    # --- Alerts ---
    alert_summary_rows = db.execute(text("""
        SELECT
            date(start_time AT TIME ZONE 'US/Eastern') AS day,
            COUNT(*) AS cnt,
            SUM(EXTRACT(EPOCH FROM (COALESCE(end_time, NOW()) - start_time)) / 60)::float AS total_min,
            SUM(CASE WHEN spo2_alarm_triggered THEN 1 ELSE 0 END) AS spo2_alarms,
            SUM(CASE WHEN hr_alarm_triggered THEN 1 ELSE 0 END) AS hr_alarms,
            SUM(CASE WHEN external_alarm_triggered THEN 1 ELSE 0 END) AS ext_alarms
        FROM monitoring_alerts
        WHERE patient_id = :pid
          AND start_time >= :start AND start_time < :end
        GROUP BY day ORDER BY day
    """), {"pid": patient_id, "start": utc_start, "end": utc_end}).all()

    alert_total = sum(r.cnt for r in alert_summary_rows)
    alert_total_min = sum(r.total_min for r in alert_summary_rows if r.total_min)
    alert_by_type = {
        "spo2_alarm": sum(r.spo2_alarms for r in alert_summary_rows),
        "hr_alarm": sum(r.hr_alarms for r in alert_summary_rows),
        "external": sum(r.ext_alarms for r in alert_summary_rows),
    }
    alert_daily = [{"date": str(r.day), "count": r.cnt} for r in alert_summary_rows]

    # --- Equipment due ---
    end_check_dt = datetime.combine(end_d + timedelta(days=7), time.min)
    equip_rows = db.execute(text("""
        SELECT name, last_changed, useful_days,
               last_changed + CAST(useful_days || ' days' AS interval) AS due_date
        FROM equipment
        WHERE patient_id = :pid
          AND scheduled_replacement = true
          AND useful_days IS NOT NULL AND useful_days > 0
          AND last_changed IS NOT NULL
          AND last_changed + CAST(useful_days || ' days' AS interval) <= :end_check
        ORDER BY due_date
    """), {"pid": patient_id, "end_check": end_check_dt}).all()

    equipment_due = []
    for e in equip_rows:
        due = e.due_date.date() if e.due_date else None
        days_overdue = (end_d - due).days if due and due <= end_d else 0
        equipment_due.append({
            "name": e.name,
            "last_changed": e.last_changed.isoformat() if e.last_changed else None,
            "due_date": due.isoformat() if due else None,
            "days_overdue": max(0, days_overdue),
        })

    # --- Symptoms ---
    symptom_rows = db.execute(text("""
        SELECT symptom_type, severity, timestamp, is_resolved, description
        FROM symptoms
        WHERE patient_id = :pid
          AND (timestamp >= :start AND timestamp < :end
               OR (is_resolved = false AND timestamp < :end))
        ORDER BY timestamp DESC
    """), {"pid": patient_id, "start": utc_start, "end": utc_end}).all()

    new_symptoms = []
    unresolved_count = 0
    resolved_count = 0
    for s in symptom_rows:
        if s.timestamp and s.timestamp >= utc_start:
            new_symptoms.append({
                "symptom_type": s.symptom_type,
                "severity": s.severity,
                "timestamp": s.timestamp.isoformat(),
                "is_resolved": bool(s.is_resolved),
                "description": s.description,
            })
        if not s.is_resolved:
            unresolved_count += 1
        else:
            resolved_count += 1

    return {
        "period": {"start": start_d.isoformat(), "end": end_d.isoformat()},
        "vitals": vitals_result,
        "compliance": compliance,
        "nutrition": {
            "daily": nutrition_daily,
            "goals": nutrition_goals,
            "avg_calories": round(sum(cal_vals) / len(cal_vals), 0) if cal_vals else None,
            "avg_fluid_ml": round(sum(fluid_vals) / len(fluid_vals), 0) if fluid_vals else None,
        },
        "alerts": {
            "total": alert_total,
            "total_duration_minutes": round(alert_total_min, 1),
            "by_type": alert_by_type,
            "daily_counts": alert_daily,
        },
        "equipment_due": equipment_due,
        "symptoms": {
            "new": new_symptoms,
            "unresolved_count": unresolved_count,
            "resolved_count": resolved_count,
        },
    }
