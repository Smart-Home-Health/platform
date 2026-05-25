import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple

from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger("analysis")

PULSE_OX_METRICS = [
    {"column": "bpm", "display_name": "Heart Rate", "units": "bpm", "source": "pulse_ox"},
    {"column": "spo2", "display_name": "SpO2", "units": "%", "source": "pulse_ox"},
    {"column": "pa", "display_name": "Perfusion Index", "units": "%", "source": "pulse_ox"},
]

VITALS_METRICS = [
    {"vital_type": "heart_rate", "display_name": "Heart Rate (Manual)", "units": "bpm", "source": "vitals"},
    {"vital_type": "spo2", "display_name": "SpO2 (Manual)", "units": "%", "source": "vitals"},
    {"vital_type": "respiratory_rate", "display_name": "Respiratory Rate", "units": "/min", "source": "vitals"},
    {"vital_type": "temperature", "display_name": "Temperature", "units": "°F", "source": "vitals"},
]

VENT_METRICS = [
    {"key": "09408", "suffix": "_50", "display_name": "Breath Rate (Vent)", "units": "/min", "source": "vent"},
]


def _get_dose_events(db: Session, patient_id: int, medication_id: int) -> List[datetime]:
    rows = db.execute(text("""
        SELECT administered_at
        FROM medication_log
        WHERE patient_id = :pid AND medication_id = :mid AND dose_amount > 0
        ORDER BY administered_at
    """), {"pid": patient_id, "mid": medication_id}).fetchall()
    return [r[0] for r in rows]


def _run_paired_ttest(pre_means: List, post_means: List) -> Optional[Dict[str, Any]]:
    paired = [(float(p), float(q)) for p, q in zip(pre_means, post_means)
              if p is not None and q is not None]
    if len(paired) < 2:
        return None

    pre = [p for p, _ in paired]
    post = [q for _, q in paired]

    from scipy.stats import ttest_rel
    t_stat, p_value = ttest_rel(pre, post)

    pre_grand = sum(pre) / len(pre)
    post_grand = sum(post) / len(post)
    delta = post_grand - pre_grand
    pct_change = (delta / pre_grand * 100) if pre_grand != 0 else 0

    return {
        "pre_mean": round(pre_grand, 2),
        "post_mean": round(post_grand, 2),
        "delta": round(delta, 2),
        "pct_change": round(pct_change, 1),
        "t_stat": round(float(t_stat), 3),
        "p_value": round(float(p_value), 4),
        "n_events": len(paired),
        "significant": float(p_value) < 0.05,
        "direction": "increase" if delta > 0 else "decrease" if delta < 0 else "none",
    }


def _analyze_pulse_ox(
    db: Session, patient_id: int, medication_id: int,
    metric_col: str, pre_start: int, pre_end: int, post_start: int, post_end: int,
) -> Optional[Dict[str, Any]]:
    query = text(f"""
        WITH dose_events AS (
            SELECT administered_at
            FROM medication_log
            WHERE patient_id = :pid AND medication_id = :mid AND dose_amount > 0
        )
        SELECT
            d.administered_at,
            AVG(CASE WHEN p."timestamp" >= d.administered_at - make_interval(mins => :pre_start)
                      AND p."timestamp" <= d.administered_at - make_interval(mins => :pre_end)
                 THEN p.{metric_col} END) AS pre_mean,
            AVG(CASE WHEN p."timestamp" >= d.administered_at + make_interval(mins => :post_start)
                      AND p."timestamp" <= d.administered_at + make_interval(mins => :post_end)
                 THEN p.{metric_col} END) AS post_mean
        FROM dose_events d
        LEFT JOIN pulse_ox_data p ON p.patient_id = :pid
            AND p."timestamp" >= d.administered_at - make_interval(mins => :pre_start)
            AND p."timestamp" <= d.administered_at + make_interval(mins => :post_end)
            AND p.{metric_col} IS NOT NULL AND p.{metric_col} > 0
        GROUP BY d.administered_at
        ORDER BY d.administered_at
    """)

    rows = db.execute(query, {
        "pid": patient_id, "mid": medication_id,
        "pre_start": pre_start, "pre_end": pre_end,
        "post_start": post_start, "post_end": post_end,
    }).fetchall()

    pre_means = [r[1] for r in rows]
    post_means = [r[2] for r in rows]
    return _run_paired_ttest(pre_means, post_means)


def _analyze_vitals(
    db: Session, patient_id: int, medication_id: int,
    vital_type: str, pre_start: int, pre_end: int, post_start: int, post_end: int,
) -> Optional[Dict[str, Any]]:
    query = text("""
        WITH dose_events AS (
            SELECT administered_at
            FROM medication_log
            WHERE patient_id = :pid AND medication_id = :mid AND dose_amount > 0
        )
        SELECT
            d.administered_at,
            AVG(CASE WHEN v."timestamp" >= d.administered_at - make_interval(mins => :pre_start)
                      AND v."timestamp" <= d.administered_at - make_interval(mins => :pre_end)
                 THEN v.value END) AS pre_mean,
            AVG(CASE WHEN v."timestamp" >= d.administered_at + make_interval(mins => :post_start)
                      AND v."timestamp" <= d.administered_at + make_interval(mins => :post_end)
                 THEN v.value END) AS post_mean
        FROM dose_events d
        LEFT JOIN vitals v ON v.patient_id = :pid
            AND v.vital_type = :vtype
            AND v."timestamp" >= d.administered_at - make_interval(mins => :pre_start)
            AND v."timestamp" <= d.administered_at + make_interval(mins => :post_end)
            AND v.value IS NOT NULL
        GROUP BY d.administered_at
        ORDER BY d.administered_at
    """)

    rows = db.execute(query, {
        "pid": patient_id, "mid": medication_id,
        "vtype": vital_type,
        "pre_start": pre_start, "pre_end": pre_end,
        "post_start": post_start, "post_end": post_end,
    }).fetchall()

    pre_means = [r[1] for r in rows]
    post_means = [r[2] for r in rows]
    return _run_paired_ttest(pre_means, post_means)


def _analyze_vent(
    db: Session, patient_id: int, medication_id: int,
    param_key: str, param_suffix: str,
    pre_start: int, pre_end: int, post_start: int, post_end: int,
) -> Optional[Dict[str, Any]]:
    query = text("""
        WITH dose_events AS (
            SELECT administered_at
            FROM medication_log
            WHERE patient_id = :pid AND medication_id = :mid AND dose_amount > 0
        )
        SELECT
            d.administered_at,
            AVG(CASE WHEN vs.recorded_at >= d.administered_at - make_interval(mins => :pre_start)
                      AND vs.recorded_at <= d.administered_at - make_interval(mins => :pre_end)
                 THEN vs.value_numeric END) AS pre_mean,
            AVG(CASE WHEN vs.recorded_at >= d.administered_at + make_interval(mins => :post_start)
                      AND vs.recorded_at <= d.administered_at + make_interval(mins => :post_end)
                 THEN vs.value_numeric END) AS post_mean
        FROM dose_events d
        LEFT JOIN vent_samples vs ON vs.patient_id = :pid
            AND vs.parameter_key = :pkey
            AND vs.parameter_suffix = :psuffix
            AND vs.recorded_at >= d.administered_at - make_interval(mins => :pre_start)
            AND vs.recorded_at <= d.administered_at + make_interval(mins => :post_end)
            AND vs.value_numeric IS NOT NULL
            AND vs.value_numeric BETWEEN -5000 AND 5000
        GROUP BY d.administered_at
        ORDER BY d.administered_at
    """)

    rows = db.execute(query, {
        "pid": patient_id, "mid": medication_id,
        "pkey": param_key, "psuffix": param_suffix,
        "pre_start": pre_start, "pre_end": pre_end,
        "post_start": post_start, "post_end": post_end,
    }).fetchall()

    pre_means = [r[1] for r in rows]
    post_means = [r[2] for r in rows]
    return _run_paired_ttest(pre_means, post_means)


def analyze_med_effects(
    db: Session,
    patient_id: int,
    medication_id: int,
    pre_start: int = 60,
    pre_end: int = 5,
    post_start: int = 15,
    post_end: int = 120,
) -> Dict[str, Any]:
    med_row = db.execute(text(
        "SELECT id, name, concentration FROM medication WHERE id = :mid"
    ), {"mid": medication_id}).first()

    if not med_row:
        return {"error": "Medication not found"}

    dose_times = _get_dose_events(db, patient_id, medication_id)
    if len(dose_times) < 2:
        return {
            "medication": {"id": med_row[0], "name": med_row[1], "concentration": med_row[2]},
            "metrics": [],
            "windows": {
                "pre": {"start_min": pre_start, "end_min": pre_end},
                "post": {"start_min": post_start, "end_min": post_end},
            },
            "warnings": [f"Only {len(dose_times)} dose event — need at least 2 for analysis."],
        }

    metrics = []
    warnings = []

    for m in PULSE_OX_METRICS:
        try:
            result = _analyze_pulse_ox(db, patient_id, medication_id, m["column"],
                                       pre_start, pre_end, post_start, post_end)
            if result:
                metrics.append({**m, **result})
            else:
                warnings.append(f"{m['display_name']}: insufficient paired data")
        except Exception as e:
            logger.warning(f"Pulse ox analysis failed for {m['column']}: {e}")

    for m in VITALS_METRICS:
        try:
            result = _analyze_vitals(db, patient_id, medication_id, m["vital_type"],
                                     pre_start, pre_end, post_start, post_end)
            if result:
                metrics.append({**m, **result})
        except Exception as e:
            logger.warning(f"Vitals analysis failed for {m['vital_type']}: {e}")

    for m in VENT_METRICS:
        try:
            result = _analyze_vent(db, patient_id, medication_id, m["key"], m["suffix"],
                                   pre_start, pre_end, post_start, post_end)
            if result:
                metrics.append({**m, **result})
        except Exception as e:
            logger.warning(f"Vent analysis failed for {m['key']}: {e}")

    return {
        "medication": {"id": med_row[0], "name": med_row[1], "concentration": med_row[2]},
        "metrics": metrics,
        "windows": {
            "pre": {"start_min": pre_start, "end_min": pre_end},
            "post": {"start_min": post_start, "end_min": post_end},
        },
        "warnings": warnings,
        "total_dose_events": len(dose_times),
    }


def get_patient_medications_for_analysis(db: Session, patient_id: int) -> List[Dict[str, Any]]:
    rows = db.execute(text("""
        SELECT m.id, m.name, m.concentration, COUNT(ml.id) AS dose_count
        FROM medication m
        JOIN medication_log ml ON ml.medication_id = m.id
            AND ml.patient_id = :pid AND ml.dose_amount > 0
        WHERE m.patient_id = :pid AND m.active = true
        GROUP BY m.id, m.name, m.concentration
        HAVING COUNT(ml.id) >= 2
        ORDER BY m.name
    """), {"pid": patient_id}).fetchall()

    return [{"id": r[0], "name": r[1], "concentration": r[2], "dose_count": r[3]} for r in rows]
