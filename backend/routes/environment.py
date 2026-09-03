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
Environmental data routes: observation queries, metric/location discovery,
and connector configuration (GH #46/#47).
"""
import asyncio
import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from db import get_db
from dependencies import (require_full_auth, require_read_access,
                          require_permission, get_current_user,
                          get_current_account_id)
from crud.environment import (
    BUCKET_INTERVALS, DEFAULT_LIMIT, MAX_LIMIT,
    get_locations, get_observations, get_observations_bucketed,
)
from environment import metrics as env_metrics
from environment import service as env_service
from environment.registry import registry
from models.environment import BackfillRequest, ConnectorConfigUpdate
from pydantic import BaseModel

logger = logging.getLogger("app")

router = APIRouter(prefix="/api/environment", tags=["environment"])


@router.get("/observations")
async def list_observations(
    metric: Optional[str] = None,
    scope: Optional[str] = None,
    location: Optional[str] = None,
    from_: Optional[datetime] = Query(None, alias="from"),
    to: Optional[datetime] = None,
    limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    bucket: Optional[str] = None,
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access),
):
    """
    Observations in a time range (default: last 24h), newest first. Pass
    ``bucket`` (15m/1h/6h/1d) for time_bucket-downsampled avg/min/max series —
    the intended path for charting long ranges.
    """
    if metric is not None and metric not in env_metrics.METRICS:
        raise HTTPException(status_code=400, detail=f"Unknown metric: {metric}")
    if scope is not None and scope not in env_metrics.SCOPES:
        raise HTTPException(status_code=400, detail=f"Unknown scope: {scope}")
    if bucket is not None:
        if bucket not in BUCKET_INTERVALS:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown bucket: {bucket} (expected one of {sorted(BUCKET_INTERVALS)})",
            )
        return get_observations_bucketed(
            db, bucket, metric=metric, scope=scope, location=location,
            start=from_, end=to, limit=limit,
        )
    return get_observations(
        db, metric=metric, scope=scope, location=location,
        start=from_, end=to, limit=limit,
    )


@router.get("/locations")
async def list_locations(
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access),
):
    """Distinct (scope, location) pairs seen in the data, with last-seen."""
    return get_locations(db)


@router.get("/metrics")
async def list_metrics(_: bool = Depends(require_read_access)):
    """The metric catalog (controlled vocabulary + canonical units)."""
    return [
        {
            "name": name,
            "unit": spec["unit"],
            "label": spec["label"],
            "derived": bool(spec.get("derived")),
        }
        for name, spec in env_metrics.METRICS.items()
    ]


def _connector_info(db: Session, connector_cls) -> dict:
    slug = connector_cls.slug
    config = env_service.get_connector_config(db, slug)
    return {
        "slug": slug,
        "name": connector_cls.name,
        "description": connector_cls.description,
        "metrics_provided": list(connector_cls.metrics_provided),
        "poll_capable": connector_cls.poll_capable,
        "config_schema": connector_cls.get_config_schema(),
        "config": config,
        "configured": connector_cls.is_configured(config),
        "enabled": bool(config.get("enabled")),
        "state": env_service.get_connector_state(db, slug),
    }


@router.get("/connectors")
async def list_connectors(
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access),
):
    """Registered connectors with config, schema, and runtime state."""
    return [_connector_info(db, cls) for cls in registry.all()]


def _get_connector_or_404(slug: str):
    connector_cls = registry.get(slug)
    if connector_cls is None:
        raise HTTPException(status_code=404, detail=f"Unknown connector: {slug}")
    return connector_cls


@router.put("/connectors/{slug}/config")
async def update_connector_config(
    slug: str,
    body: ConnectorConfigUpdate,
    db: Session = Depends(get_db),
    _: bool = Depends(require_full_auth),
):
    connector_cls = _get_connector_or_404(slug)
    config = body.model_dump(exclude_none=True)
    if config.get("enabled") and not connector_cls.is_configured(config):
        raise HTTPException(
            status_code=400,
            detail="Connector cannot be enabled until required fields are set",
        )
    env_service.save_connector_config(db, slug, config)
    # Clear the poll clock so the loop picks up the new config on its next
    # 5-minute tick instead of waiting out the previous interval.
    env_service.save_connector_state(db, slug, last_poll_at=None)
    return _connector_info(db, connector_cls)


@router.post("/connectors/{slug}/test")
async def test_connector(
    slug: str,
    body: Optional[ConnectorConfigUpdate] = None,
    db: Session = Depends(get_db),
    _: bool = Depends(require_full_auth),
):
    """Reachability check with the submitted (or saved) config."""
    connector_cls = _get_connector_or_404(slug)
    config = (body.model_dump(exclude_none=True) if body is not None
              else env_service.get_connector_config(db, slug))
    if not connector_cls.is_configured(config):
        raise HTTPException(status_code=400, detail="Connector is not configured")
    ok = await connector_cls(config).test_connection()
    return {"ok": ok}


@router.post("/connectors/{slug}/backfill", status_code=202)
async def start_backfill(
    slug: str,
    body: BackfillRequest,
    db: Session = Depends(get_db),
    _: bool = Depends(require_full_auth),
):
    """
    Launch a historical backfill in the background (202). Progress/result is
    visible in the connector state via GET /connectors. 409 if one is already
    running for this connector.
    """
    from environment.poller import backfill_running, run_backfill

    connector_cls = _get_connector_or_404(slug)
    config = env_service.get_connector_config(db, slug)
    if not connector_cls.is_configured(config):
        raise HTTPException(status_code=400, detail="Connector is not configured")
    if backfill_running(slug):
        raise HTTPException(status_code=409, detail="Backfill already running")

    asyncio.create_task(run_backfill(slug, body.days))
    return {"status": "started", "days": body.days}


# ---------------------------------------------------------------------------
# Per-patient room bounds (what counts as a bad room for this patient).
# ---------------------------------------------------------------------------

class EnvRangeUpdate(BaseModel):
    metric: str
    caution_min: Optional[float] = None
    caution_max: Optional[float] = None
    critical_min: Optional[float] = None
    critical_max: Optional[float] = None
    note: Optional[str] = None


class EnvRangesUpdate(BaseModel):
    patient_id: int
    ranges: list[EnvRangeUpdate]


def _scoped_patient(db: Session, patient_id: int, account_id):
    from schemas.patient import Patient
    q = db.query(Patient).filter(Patient.id == patient_id)
    if account_id is not None:
        q = q.filter((Patient.account_id == account_id) | (Patient.account_id.is_(None)))
    return q.first()


def _ranges_payload(db: Session, patient_id: int):
    from crud.env_ranges import resolve_env_ranges
    return {"patient_id": patient_id, "ranges": resolve_env_ranges(db, patient_id)}


@router.get("/ranges")
async def get_env_ranges(
    patient_id: int = Query(...),
    db: Session = Depends(get_db),
    account_id=Depends(get_current_account_id),
):
    """Resolved room bounds for a patient — defaults where nothing is set.

    Not gated on require_read_access, matching /api/vitals/ranges: the
    timeline flags a bad room in monitoring mode too, and a read-restricted
    session losing the bounds would silently turn the flags off rather than
    hide them.
    """
    if not _scoped_patient(db, patient_id, account_id):
        raise HTTPException(status_code=404, detail="Patient not found")
    return _ranges_payload(db, patient_id)


@router.put("/ranges", dependencies=[Depends(require_permission("patients.update"))])
async def put_env_ranges(
    body: EnvRangesUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    account_id=Depends(get_current_account_id),
):
    from crud.env_ranges import upsert_patient_env_ranges
    if not _scoped_patient(db, body.patient_id, account_id):
        raise HTTPException(status_code=404, detail="Patient not found")
    upsert_patient_env_ranges(db, body.patient_id,
                              [r.model_dump() for r in body.ranges],
                              set_by=getattr(current_user, "id", None))
    return _ranges_payload(db, body.patient_id)
