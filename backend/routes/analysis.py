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
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from dependencies import get_db, get_current_user, require_read_access
from models.users import User
from routes.auth import require_full_auth
from analysis.med_vital_correlation import analyze_med_effects, get_patient_medications_for_analysis
from analysis.env_correlation import analyze_env_correlations, get_clinical_events

logger = logging.getLogger("analysis")

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


def _ensure_patient_visible(db: Session, user: User, patient_id: int) -> None:
    """Enforce PatientAccess scoping (same source of truth as /api/patients).

    404 rather than 403 so an unauthorized caller can't probe which patient
    ids exist.
    """
    from crud.patients import get_visible_patient_ids
    allowed = get_visible_patient_ids(db, user)
    if allowed is not None and patient_id not in allowed:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Patient not found")


@router.get("/patients/{patient_id}/medications")
async def list_medications_for_analysis(
    patient_id: int,
    db: Session = Depends(get_db),
    _auth=Depends(require_full_auth),
    _read=Depends(require_read_access),
    current_user: User = Depends(get_current_user),
):
    _ensure_patient_visible(db, current_user, patient_id)
    return get_patient_medications_for_analysis(db, patient_id)


@router.get("/patients/{patient_id}/med-effects/{medication_id}")
async def get_med_effects(
    patient_id: int,
    medication_id: int,
    pre_start: int = Query(60, ge=5, le=10080),
    pre_end: int = Query(5, ge=0, le=60),
    post_start: int = Query(15, ge=0, le=1440),
    post_end: int = Query(120, ge=30, le=10080),
    db: Session = Depends(get_db),
    _auth=Depends(require_full_auth),
    _read=Depends(require_read_access),
    current_user: User = Depends(get_current_user),
):
    _ensure_patient_visible(db, current_user, patient_id)
    return analyze_med_effects(db, patient_id, medication_id,
                               pre_start, pre_end, post_start, post_end)


@router.get("/patients/{patient_id}/env-correlations")
async def get_env_correlations(
    patient_id: int,
    days: int = Query(90, ge=7, le=365),
    window_hours: Optional[int] = Query(None, ge=1, le=48),
    pressure_drop_6h_threshold: Optional[float] = Query(None, ge=-20, le=-1),
    pressure_drop_24h_threshold: Optional[float] = Query(None, ge=-30, le=-2),
    pressure_rise_6h_threshold: Optional[float] = Query(None, ge=1, le=20),
    low_humidity_threshold: Optional[float] = Query(None, ge=10, le=45),
    high_pm25_threshold: Optional[float] = Query(None, ge=10, le=150),
    db: Session = Depends(get_db),
    _auth=Depends(require_full_auth),
    _read=Depends(require_read_access),
    current_user: User = Depends(get_current_user),
):
    """Personal environmental correlation cards (descriptive, non-causal)."""
    _ensure_patient_visible(db, current_user, patient_id)
    thresholds = {
        key: value for key, value in {
            "pressure_drop_6h": pressure_drop_6h_threshold,
            "pressure_drop_24h": pressure_drop_24h_threshold,
            "pressure_rise_6h": pressure_rise_6h_threshold,
            "low_humidity": low_humidity_threshold,
            "high_pm25": high_pm25_threshold,
        }.items() if value is not None
    }
    return analyze_env_correlations(db, patient_id, days=days,
                                    window_hours=window_hours,
                                    thresholds=thresholds)


@router.get("/patients/{patient_id}/clinical-events")
async def list_clinical_events(
    patient_id: int,
    from_: datetime = Query(..., alias="from"),
    to: datetime = Query(...),
    db: Session = Depends(get_db),
    _auth=Depends(require_full_auth),
    _read=Depends(require_read_access),
    current_user: User = Depends(get_current_user),
):
    """Curated clinical event streams for the environment overlay chart."""
    _ensure_patient_visible(db, current_user, patient_id)
    if from_ >= to:
        raise HTTPException(status_code=422, detail="'from' must be before 'to'")
    if to - from_ > timedelta(days=366):
        raise HTTPException(status_code=422, detail="Range cannot exceed 366 days")
    return get_clinical_events(db, patient_id, from_, to)
