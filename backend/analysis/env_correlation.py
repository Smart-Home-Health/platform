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
"""
Personal environmental-correlation statistics (GH #49).

On-demand event-window analysis over a curated set of (exposure, outcome,
window) pairs: for each pair, the rate of the clinical outcome inside the
hours following an environmental exposure is compared with the patient's own
baseline rate over the same date range, reported as a rate ratio with a 95%
confidence interval and honest sample sizes. Descriptive only — the wording
never implies causation and never suggests care actions (see
``_build_message``); the nightly findings pipeline (GH #54) will later serve
persisted results through the same card shape (``source`` field).

Default exposure thresholds:
- pressure drop >= 4 hPa / 6h — a fast frontal passage (the magnitude used in
  weather-sensitivity literature and in the feature's original spec)
- pressure drop >= 6 hPa / 24h — a large synoptic-scale daily change
- pressure rise >= 4 hPa / 6h — symmetry control for the 6h drop
- relative humidity <= 30% — below the recommended 30-50% band; dry air
  thickens airway secretions
- PM2.5 >= 35 µg/m³ — the EPA 24-hour standard / AQI boundary for
  sensitive groups

The EXPOSURES/OUTCOMES dicts are whitelists in the same sense as
``med_vital_correlation``'s metric lists: only their contents ever reach SQL
identifiers, so user input cannot inject column or metric names.
"""
import logging
import math
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from schemas.environmental_observation import EnvironmentalObservation
from schemas.monitoring_alert import MonitoringAlert
from schemas.symptom import Symptom

logger = logging.getLogger("analysis")

DISCLAIMER = (
    "Informational only. These statistics describe when clinical events and "
    "environmental conditions happened near each other in time for this "
    "patient. They cannot show that one thing made another happen, and they "
    "are not a basis for care decisions — follow the care plan for any "
    "intervention."
)

EXPOSURES: Dict[str, Dict] = {
    "pressure_drop_6h": {
        "metric": "pressure_delta_6h", "comparator": "<=",
        "default_threshold": -4.0, "bounds": (-20.0, -1.0),
        "unit": "hPa", "quality": "estimated",
        "label": "a pressure drop of {abs_threshold:g} hPa or more over 6 hours",
    },
    "pressure_drop_24h": {
        "metric": "pressure_delta_24h", "comparator": "<=",
        "default_threshold": -6.0, "bounds": (-30.0, -2.0),
        "unit": "hPa", "quality": "estimated",
        "label": "a pressure drop of {abs_threshold:g} hPa or more over 24 hours",
    },
    "pressure_rise_6h": {
        "metric": "pressure_delta_6h", "comparator": ">=",
        "default_threshold": 4.0, "bounds": (1.0, 20.0),
        "unit": "hPa", "quality": "estimated",
        "label": "a pressure rise of {abs_threshold:g} hPa or more over 6 hours",
    },
    "low_humidity": {
        "metric": "relative_humidity", "comparator": "<=",
        "default_threshold": 30.0, "bounds": (10.0, 45.0),
        "unit": "%", "quality": "measured",
        "label": "outdoor humidity at or below {threshold:g}%",
    },
    "high_pm25": {
        "metric": "pm25", "comparator": ">=",
        "default_threshold": 35.0, "bounds": (10.0, 150.0),
        "unit": "µg/m³", "quality": "measured",
        "label": "PM2.5 at or above {threshold:g} µg/m³",
    },
}

OUTCOMES: Dict[str, Dict] = {
    "spo2_alarms": {"label": "SpO2 alarms"},
    "oxygen_use": {"label": "Supplemental oxygen use"},
    "respiratory_care": {"label": "Respiratory care events"},
    "symptoms": {"label": "Logged symptoms"},
}

# Care-task matching for respiratory_care: categories are user-editable free
# text (no slug exists), so match by category or task name. The distinct task
# names that matched are returned on the card (`matched_sources`) so the
# counting is transparent.
RESPIRATORY_CATEGORY_PATTERN = "respiratory"
RESPIRATORY_NAME_PATTERNS = [
    "%suction%", "%cough%", "%nebuliz%", "%chest pt%", "%cpt%", "%vest%", "%trach%",
]

# (exposure_key, outcome_key, default_window_hours)
PAIRS = [
    ("pressure_drop_6h", "spo2_alarms", 6),
    ("pressure_drop_6h", "respiratory_care", 6),
    ("pressure_drop_6h", "oxygen_use", 6),
    ("pressure_drop_6h", "symptoms", 12),
    ("pressure_drop_24h", "spo2_alarms", 24),
    ("pressure_drop_24h", "respiratory_care", 24),
    ("pressure_rise_6h", "spo2_alarms", 6),
    ("low_humidity", "respiratory_care", 6),
    ("low_humidity", "spo2_alarms", 6),
    ("high_pm25", "spo2_alarms", 6),
    ("high_pm25", "respiratory_care", 6),
]

MIN_EXPOSED_HOURS = 24
MIN_BASELINE_HOURS = 168
MIN_TOTAL_EVENTS = 5


def fetch_outcome_events(
    db: Session, patient_id: int, outcome_key: str,
    start: datetime, end: datetime,
) -> List[Dict]:
    """
    One outcome's event stream for a patient/range, as
    ``[{"ts", "end_ts" (or None), "label"}]`` ordered by time. Shared by the
    correlation math and the clinical-events overlay endpoint.
    """
    if outcome_key in ("spo2_alarms", "oxygen_use"):
        query = db.query(MonitoringAlert).filter(
            MonitoringAlert.patient_id == patient_id,
            MonitoringAlert.start_time >= start,
            MonitoringAlert.start_time < end,
        )
        if outcome_key == "spo2_alarms":
            query = query.filter(MonitoringAlert.spo2_alarm_triggered.is_(True))
        else:
            query = query.filter(MonitoringAlert.oxygen_used.is_(True))
        events = []
        for a in query.order_by(MonitoringAlert.start_time.asc()).all():
            if outcome_key == "oxygen_use" and a.oxygen_highest:
                label = f"Oxygen used ({a.oxygen_highest:g} {a.oxygen_unit or ''})".strip()
            elif outcome_key == "oxygen_use":
                label = "Oxygen used"
            else:
                label = f"SpO2 alarm (min {a.spo2_min})" if a.spo2_min else "SpO2 alarm"
            events.append({
                "ts": a.start_time.isoformat(),
                "end_ts": a.end_time.isoformat() if a.end_time else None,
                "label": label,
            })
        return events

    if outcome_key == "respiratory_care":
        # Raw SQL bypasses the global soft-delete ORM filter, so voided_at
        # must be excluded explicitly here.
        rows = db.execute(text("""
            SELECT ctl.completed_at, ct.name
            FROM care_task_log ctl
            JOIN care_task ct ON ct.id = ctl.care_task_id
            LEFT JOIN care_task_category cat ON cat.id = ct.category_id
            WHERE ctl.patient_id = :pid
              AND ctl.status = 'completed'
              AND ctl.voided_at IS NULL
              AND ctl.completed_at >= :start AND ctl.completed_at < :end
              AND (lower(cat.name) LIKE :cat_pat OR lower(ct.name) LIKE ANY(:name_pats))
            ORDER BY ctl.completed_at ASC
        """), {
            "pid": patient_id, "start": start, "end": end,
            "cat_pat": f"%{RESPIRATORY_CATEGORY_PATTERN}%",
            "name_pats": RESPIRATORY_NAME_PATTERNS,
        }).fetchall()
        return [{"ts": r.completed_at.isoformat(), "end_ts": None, "label": r.name}
                for r in rows]

    if outcome_key == "symptoms":
        rows = (db.query(Symptom)
                .filter(Symptom.patient_id == patient_id,
                        Symptom.timestamp >= start,
                        Symptom.timestamp < end)
                .order_by(Symptom.timestamp.asc()).all())
        return [{
            "ts": s.timestamp.isoformat(), "end_ts": None,
            "label": f"{s.symptom_type}" + (f" (severity {s.severity})" if s.severity else ""),
        } for s in rows]

    raise ValueError(f"Unknown outcome: {outcome_key}")


def _exposure_hour_series(db: Session, metric: str, start: datetime, end: datetime):
    """1h-bucketed avg of an exposure metric (outdoor scope) as
    ``[(bucket_dt, avg)]`` ascending. `metric` comes only from EXPOSURES."""
    rows = db.execute(text("""
        SELECT time_bucket(INTERVAL '1 hour', timestamp) AS bucket,
               avg(value) AS avg_value
        FROM environmental_observations
        WHERE metric = :metric AND scope = 'outdoor'
          AND timestamp >= :start AND timestamp < :end
        GROUP BY bucket ORDER BY bucket ASC
    """), {"metric": metric, "start": start, "end": end}).fetchall()
    return [(r.bucket, float(r.avg_value)) for r in rows]


def _condition_holds(value: float, comparator: str, threshold: float) -> bool:
    return value <= threshold if comparator == "<=" else value >= threshold


def _hour_floor(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)


def _rate_ratio_ci(a: int, b: int, exposed_hours: int, baseline_hours: int):
    """Rate ratio + 95% log-Wald CI. Exactly one zero count gets a 0.5
    continuity correction on both counts (hours unchanged)."""
    corrected = False
    a_eff, b_eff = float(a), float(b)
    if (a == 0) != (b == 0):
        a_eff, b_eff = a + 0.5, b + 0.5
        corrected = True
    rr = (a_eff / exposed_hours) / (b_eff / baseline_hours)
    se = math.sqrt(1.0 / a_eff + 1.0 / b_eff)
    ci_low = math.exp(math.log(rr) - 1.96 * se)
    ci_high = math.exp(math.log(rr) + 1.96 * se)
    return rr, ci_low, ci_high, corrected


def _build_message(card: Dict, days: int) -> str:
    """Guardrailed wording: descriptive proximity in time, never causation,
    never advice."""
    outcome_label = card["outcome"]["label"]
    exposure_label = card["exposure"]["label"]
    w = card["window_hours"]
    rr = card["rate_ratio"]
    lo, hi = card["ci_low"], card["ci_high"]
    if lo > 1.0 or hi < 1.0:
        if rr >= 1.0:
            return (f"{outcome_label} were {rr:.1f}× more common within {w} hours "
                    f"of {exposure_label} (95% CI {lo:.1f}–{hi:.1f}, last {days} days).")
        return (f"{outcome_label} were {1.0 / rr:.1f}× less common within {w} hours "
                f"of {exposure_label} (95% CI {lo:.1f}–{hi:.1f}, last {days} days).")
    return (f"No clear difference in {outcome_label.lower()} near {exposure_label} "
            f"(rate ratio {rr:.1f}, 95% CI {lo:.1f}–{hi:.1f} — the interval includes 1).")


def _analyze_pair(
    db: Session, patient_id: int,
    exposure_key: str, outcome_key: str, window_hours: int,
    threshold: float, range_start: datetime, range_end: datetime, days: int,
) -> Dict:
    exp = EXPOSURES[exposure_key]
    label = exp["label"].format(threshold=threshold, abs_threshold=abs(threshold))
    card: Dict = {
        "exposure": {
            "key": exposure_key, "label": label, "metric": exp["metric"],
            "comparator": exp["comparator"], "threshold": threshold,
            "unit": exp["unit"], "quality": exp["quality"],
        },
        "outcome": {"key": outcome_key, "label": OUTCOMES[outcome_key]["label"]},
        "window_hours": window_hours,
    }

    series = _exposure_hour_series(db, exp["metric"], range_start, range_end)
    if not series:
        card.update(status="insufficient_data",
                    message=f"No {exp['metric'].replace('_', ' ')} data yet.")
        return card

    # Coverage clamp: only judge hours where the metric was actually observed,
    # so a partially backfilled series can't inflate the baseline.
    first_obs = series[0][0]
    last_obs = series[-1][0]
    total_hours = int((last_obs - first_obs).total_seconds() // 3600) + 1
    card["coverage"] = {
        "first_obs": first_obs.isoformat(),
        "last_obs": last_obs.isoformat(),
        "total_hours": total_hours,
    }

    exposed_source_hours = [ts for ts, v in series
                            if _condition_holds(v, exp["comparator"], threshold)]
    mask = set()
    for e in exposed_source_hours:
        for h in range(1, window_hours + 1):
            t = e + timedelta(hours=h)
            if t <= last_obs:
                mask.add(t)

    exposed_hours = len(mask)
    baseline_hours = total_hours - exposed_hours
    card["exposed_hours"] = exposed_hours
    card["baseline_hours"] = baseline_hours

    if exposed_hours < MIN_EXPOSED_HOURS:
        card.update(status="insufficient_data", message=(
            f"Only {exposed_hours} hours followed {label} in the last {days} days "
            f"— at least {MIN_EXPOSED_HOURS} are needed."))
        return card
    if baseline_hours < MIN_BASELINE_HOURS:
        card.update(status="insufficient_data", message=(
            f"Not enough baseline time yet — {baseline_hours} hours outside "
            f"exposure windows, at least {MIN_BASELINE_HOURS} needed."))
        return card

    events = fetch_outcome_events(db, patient_id, outcome_key,
                                  first_obs, last_obs + timedelta(hours=1))
    if outcome_key == "respiratory_care":
        card["outcome"]["matched_sources"] = sorted({e["label"] for e in events})

    a = b = 0
    for e in events:
        hour = _hour_floor(datetime.fromisoformat(e["ts"]))
        if hour in mask:
            a += 1
        else:
            b += 1
    card["exposed_events"] = a
    card["baseline_events"] = b

    if a + b < MIN_TOTAL_EVENTS:
        card.update(status="insufficient_data", message=(
            f"Not enough data yet — {a + b} of {MIN_TOTAL_EVENTS} needed "
            f"{OUTCOMES[outcome_key]['label'].lower()} in the last {days} days."))
        return card
    if a == 0 and b == 0:
        card.update(status="insufficient_data", message=(
            f"No {OUTCOMES[outcome_key]['label'].lower()} recorded in the last {days} days."))
        return card

    rr, lo, hi, corrected = _rate_ratio_ci(a, b, exposed_hours, baseline_hours)
    card.update(
        status="ok",
        rate_ratio=round(rr, 2), ci_low=round(lo, 2), ci_high=round(hi, 2),
        continuity_corrected=corrected,
    )
    card["message"] = _build_message(card, days)
    return card


def analyze_env_correlations(
    db: Session, patient_id: int, days: int = 90,
    window_hours: Optional[int] = None,
    thresholds: Optional[Dict[str, float]] = None,
) -> Dict:
    """
    Compute all curated (exposure, outcome) cards for a patient.

    ``thresholds`` maps exposure keys to overrides (route-validated against
    each exposure's bounds). ``window_hours`` overrides every pair's default
    window uniformly. Per-pair failures are logged and skipped, never raised.
    """
    thresholds = thresholds or {}
    range_end = _hour_floor(datetime.now(timezone.utc))
    range_start = range_end - timedelta(days=days)

    cards = []
    for exposure_key, outcome_key, default_window in PAIRS:
        try:
            cards.append(_analyze_pair(
                db, patient_id, exposure_key, outcome_key,
                window_hours or default_window,
                thresholds.get(exposure_key, EXPOSURES[exposure_key]["default_threshold"]),
                range_start, range_end, days,
            ))
        except Exception as e:
            logger.warning(
                f"env correlation pair ({exposure_key}, {outcome_key}) failed: {e}",
                exc_info=True,
            )

    return {
        "patient_id": patient_id,
        "range": {"from": range_start.isoformat(), "to": range_end.isoformat(), "days": days},
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "on_demand",
        "disclaimer": DISCLAIMER,
        "cards": cards,
    }


def get_clinical_events(db: Session, patient_id: int,
                        start: datetime, end: datetime) -> Dict:
    """All curated outcome streams for the overlay chart's event markers."""
    return {
        "from": start.isoformat(),
        "to": end.isoformat(),
        "events": {key: fetch_outcome_events(db, patient_id, key, start, end)
                   for key in OUTCOMES},
        "labels": {key: spec["label"] for key, spec in OUTCOMES.items()},
    }
