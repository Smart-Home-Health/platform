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
Read-side queries for environmental observations.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from schemas.environmental_observation import EnvironmentalObservation

logger = logging.getLogger("crud")

# `bucket` query param -> Postgres interval literal (fixed map: never
# interpolate user input into the time_bucket SQL).
BUCKET_INTERVALS = {
    "15m": "15 minutes",
    "1h": "1 hour",
    "6h": "6 hours",
    "1d": "1 day",
}

DEFAULT_WINDOW = timedelta(hours=24)
DEFAULT_LIMIT = 1000
MAX_LIMIT = 10000


def _base_query_filters(query, metric, scope, location, start, end):
    query = query.filter(
        EnvironmentalObservation.timestamp >= start,
        EnvironmentalObservation.timestamp <= end,
    )
    if metric:
        query = query.filter(EnvironmentalObservation.metric == metric)
    if scope:
        query = query.filter(EnvironmentalObservation.scope == scope)
    if location is not None:
        query = query.filter(EnvironmentalObservation.location == location)
    return query


def get_observations(
    db: Session,
    metric: Optional[str] = None,
    scope: Optional[str] = None,
    location: Optional[str] = None,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    limit: int = DEFAULT_LIMIT,
) -> List[Dict]:
    """Raw observations in a time range, newest first."""
    end = end or datetime.now(timezone.utc)
    start = start or end - DEFAULT_WINDOW

    query = _base_query_filters(
        db.query(EnvironmentalObservation), metric, scope, location, start, end
    )
    rows = (query.order_by(EnvironmentalObservation.timestamp.desc())
            .limit(min(limit, MAX_LIMIT)).all())
    return [{
        "ts": r.timestamp.isoformat(),
        "metric": r.metric,
        "value": r.value,
        "unit": r.unit,
        "scope": r.scope,
        "location": r.location,
        "source_type": r.source_type,
        "source_id": r.source_id,
        "quality": r.quality,
    } for r in rows]


def get_observations_bucketed(
    db: Session,
    bucket: str,
    metric: Optional[str] = None,
    scope: Optional[str] = None,
    location: Optional[str] = None,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    limit: int = DEFAULT_LIMIT,
) -> List[Dict]:
    """
    time_bucket-downsampled series (avg/min/max per bucket), grouped by
    metric/scope/location, newest bucket first. Cheap on the hypertable and
    the intended path for charting long ranges (#49).
    """
    interval = BUCKET_INTERVALS[bucket]  # KeyError guarded at the route
    end = end or datetime.now(timezone.utc)
    start = start or end - DEFAULT_WINDOW

    bucket_col = func.time_bucket(text(f"INTERVAL '{interval}'"),
                                  EnvironmentalObservation.timestamp).label("bucket")
    query = db.query(
        bucket_col,
        EnvironmentalObservation.metric,
        EnvironmentalObservation.scope,
        EnvironmentalObservation.location,
        EnvironmentalObservation.unit,
        func.avg(EnvironmentalObservation.value).label("avg"),
        func.min(EnvironmentalObservation.value).label("min"),
        func.max(EnvironmentalObservation.value).label("max"),
        func.count().label("samples"),
    )
    query = _base_query_filters(query, metric, scope, location, start, end)
    rows = (query.group_by(bucket_col, EnvironmentalObservation.metric,
                           EnvironmentalObservation.scope,
                           EnvironmentalObservation.location,
                           EnvironmentalObservation.unit)
            .order_by(bucket_col.desc())
            .limit(min(limit, MAX_LIMIT)).all())
    return [{
        "ts": r.bucket.isoformat(),
        "metric": r.metric,
        "scope": r.scope,
        "location": r.location,
        "unit": r.unit,
        "avg": round(r.avg, 2),
        "min": r.min,
        "max": r.max,
        "samples": r.samples,
    } for r in rows]


def get_locations(db: Session) -> List[Dict]:
    """Distinct (scope, location) pairs with last-seen and metric coverage."""
    rows = (
        db.query(
            EnvironmentalObservation.scope,
            EnvironmentalObservation.location,
            func.max(EnvironmentalObservation.timestamp).label("last_seen"),
            func.count(func.distinct(EnvironmentalObservation.metric)).label("metric_count"),
        )
        .group_by(EnvironmentalObservation.scope, EnvironmentalObservation.location)
        .order_by(EnvironmentalObservation.scope, EnvironmentalObservation.location)
        .all()
    )
    return [{
        "scope": r.scope,
        "location": r.location,
        "last_seen": r.last_seen.isoformat() if r.last_seen else None,
        "metric_count": r.metric_count,
    } for r in rows]
