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
Persistence and shared logic for environmental observations.

- ``emit_observations``: the single write path all connectors use. Validates
  vocabulary, inserts with ON CONFLICT DO NOTHING (idempotent re-polls and
  backfills), and publishes bus events for fresh readings.
- ``compute_pressure_deltas``: materializes pressure-change metrics from the
  stored surface-pressure series. Lives here (not in a connector) so any
  pressure-reporting connector gets deltas for free.
- Connector config/state accessors over the account-level settings table.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from environment import metrics as env_metrics
from environment.base import EnvObservation
from event_publisher import publish_event
from events import EnvironmentalObservationRecorded, EventSource
from schemas.environmental_observation import EnvironmentalObservation

logger = logging.getLogger("environment")

# Observations older than this at ingest time are considered historical and
# don't get a bus event (bulk backfill would flood the bus; consumers of the
# event care about "now", not history).
FRESHNESS_WINDOW = timedelta(hours=2)

_INSERT_CHUNK = 500

CONFIG_KEY_TEMPLATE = "environment.connector.{slug}.config"
STATE_KEY_TEMPLATE = "environment.connector.{slug}.state"


def emit_observations(
    db: Session,
    source_type: str,
    observations: List[EnvObservation],
    *,
    publish_events: bool = True,
) -> int:
    """
    Persist normalized observations for a connector. Returns the number of
    rows actually inserted (duplicates are skipped via the dedup unique
    constraint). The caller owns the commit.

    Raises ValueError on vocabulary violations — a connector emitting an
    unknown metric or non-canonical unit is a bug that should be loud.
    """
    if not observations:
        return 0

    now = datetime.now(timezone.utc)
    rows = []
    for obs in observations:
        env_metrics.validate_observation(obs.metric, obs.unit, obs.scope, obs.quality)
        rows.append({
            "timestamp": obs.timestamp,
            "metric": obs.metric,
            "value": obs.value,
            "unit": obs.unit,
            "scope": obs.scope,
            "location": obs.location or "",
            "source_type": source_type,
            "source_id": obs.source_id,
            "quality": obs.quality,
        })

    inserted = 0
    table = EnvironmentalObservation.__table__
    for start in range(0, len(rows), _INSERT_CHUNK):
        chunk = rows[start:start + _INSERT_CHUNK]
        stmt = pg_insert(table).values(chunk).on_conflict_do_nothing(
            constraint="uq_env_obs_source_metric_place_ts"
        )
        result = db.execute(stmt)
        inserted += result.rowcount or 0

    if publish_events:
        for obs in observations:
            ts = obs.timestamp
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            if now - ts <= FRESHNESS_WINDOW:
                publish_event(EnvironmentalObservationRecorded(
                    ts=obs.timestamp, metric=obs.metric, value=obs.value,
                    unit=obs.unit, scope=obs.scope, location=obs.location or "",
                    source_type=source_type, quality=obs.quality,
                    source=EventSource.SYSTEM,
                ))

    return inserted


def compute_pressure_deltas(
    db: Session,
    source_type: str,
    scope: str = "outdoor",
    location: str = "",
    since: Optional[datetime] = None,
) -> List[EnvObservation]:
    """
    Build pressure-delta observations from the stored surface-pressure series.

    For each stored ``barometric_pressure`` timestamp ``t`` at/after ``since``
    and each window ``w``, emits ``pressure_delta_<w>h = v(t) - v(t-w)`` when a
    reading exists at exactly ``t - w hours`` (Open-Meteo and other hourly
    sources sit on an exact hourly grid; irregular sources simply produce
    fewer deltas). Base metric is surface pressure — the locally felt value —
    rather than MSL. Results go back through ``emit_observations``, so
    re-computation is idempotent.
    """
    max_window = max(env_metrics.PRESSURE_DELTA_WINDOWS)
    query = (
        db.query(EnvironmentalObservation.timestamp, EnvironmentalObservation.value,
                 EnvironmentalObservation.source_id)
        .filter(
            EnvironmentalObservation.source_type == source_type,
            EnvironmentalObservation.metric == "barometric_pressure",
            EnvironmentalObservation.scope == scope,
            EnvironmentalObservation.location == (location or ""),
        )
    )
    if since is not None:
        query = query.filter(
            EnvironmentalObservation.timestamp >= since - timedelta(hours=max_window)
        )
    rows = query.order_by(EnvironmentalObservation.timestamp.asc()).all()
    if not rows:
        return []

    by_ts = {r.timestamp: r for r in rows}
    deltas: List[EnvObservation] = []
    for ts, row in by_ts.items():
        if since is not None and ts < since:
            continue  # lead-in rows are only delta bases, not delta targets
        for w in env_metrics.PRESSURE_DELTA_WINDOWS:
            base = by_ts.get(ts - timedelta(hours=w))
            if base is None:
                continue
            deltas.append(EnvObservation(
                timestamp=ts,
                metric=f"pressure_delta_{w}h",
                value=round(row.value - base.value, 2),
                unit="hPa",
                scope=scope,
                location=location or "",
                source_id=row.source_id,
                quality="estimated",
            ))
    return deltas


# ---------------------------------------------------------------------------
# Connector config/state (account-level settings table)
# ---------------------------------------------------------------------------
# Two keys per connector so hourly machine-state writes never race a user's
# config save.

def get_connector_config(db: Session, slug: str) -> Dict:
    from crud.settings import get_setting
    return get_setting(db, CONFIG_KEY_TEMPLATE.format(slug=slug)) or {}


def save_connector_config(db: Session, slug: str, config: Dict) -> None:
    from crud.settings import save_setting
    import json
    save_setting(db, CONFIG_KEY_TEMPLATE.format(slug=slug), json.dumps(config),
                 data_type="json", description=f"Environment connector config: {slug}")


def get_connector_state(db: Session, slug: str) -> Dict:
    from crud.settings import get_setting
    return get_setting(db, STATE_KEY_TEMPLATE.format(slug=slug)) or {}


def save_connector_state(db: Session, slug: str, **updates) -> Dict:
    """Merge ``updates`` into the connector's persisted state and return it."""
    from crud.settings import save_setting
    import json
    state = get_connector_state(db, slug)
    state.update(updates)
    save_setting(db, STATE_KEY_TEMPLATE.format(slug=slug), json.dumps(state),
                 data_type="json", description=f"Environment connector state: {slug}")
    return state
