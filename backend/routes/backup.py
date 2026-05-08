"""
Patient backup / restore HTTP routes.

GET  /api/backup/export/{patient_id}  -> .tar.gz download
POST /api/backup/import                -> multipart upload of .tar.gz, returns summary

Restricted to system admins because the operation reads / writes every
patient-scoped table.
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response
from sqlalchemy.orm import Session

from db import get_db
from dependencies import get_current_user, get_current_account_id
from models.users import User
from crud.backup import export_patient_to_targz, restore_patient_from_targz

router = APIRouter(prefix="/api/backup", tags=["backup"])


def _require_system_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_system_admin:
        raise HTTPException(status_code=403, detail="System administrator access required")
    return current_user


@router.get("/export/{patient_id}")
def export_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    account_id: int = Depends(get_current_account_id),
    _: User = Depends(_require_system_admin),
):
    try:
        archive_bytes, filename = export_patient_to_targz(db, patient_id, account_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return Response(
        content=archive_bytes,
        media_type="application/gzip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/import")
async def import_patient(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    account_id: int = Depends(get_current_account_id),
    _: User = Depends(_require_system_admin),
):
    archive_bytes = await file.read()
    if not archive_bytes:
        raise HTTPException(status_code=400, detail="Empty upload")
    try:
        result = restore_patient_from_targz(db, archive_bytes, account_id)
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Restore failed: {e}")
    return result
