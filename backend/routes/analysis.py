import logging
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from dependencies import get_db, require_read_access
from routes.auth import require_full_auth
from analysis.med_vital_correlation import analyze_med_effects, get_patient_medications_for_analysis

logger = logging.getLogger("analysis")

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


@router.get("/patients/{patient_id}/medications")
async def list_medications_for_analysis(
    patient_id: int,
    db: Session = Depends(get_db),
    _auth=Depends(require_full_auth),
    _read=Depends(require_read_access),
):
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
):
    return analyze_med_effects(db, patient_id, medication_id,
                               pre_start, pre_end, post_start, post_end)
