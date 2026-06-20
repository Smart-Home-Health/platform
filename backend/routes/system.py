# Smart Home Health Hub
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
System Health HTTP routes (admin → Configuration → System Health).

GET  /api/system/health               -> DB size/health + per-table storage
POST /api/system/maintenance/prune    -> drop hypertable chunks older than N days
POST /api/system/maintenance/compress -> compress hypertable chunks older than N days
POST /api/system/maintenance/vacuum   -> VACUUM ANALYZE

Restricted to system administrators: these expose cluster-wide metrics and run
destructive / heavy maintenance.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from db import get_db
from dependencies import get_current_user
from models.users import User
from crud import system_health

logger = logging.getLogger("routes.system")

router = APIRouter(prefix="/api/system", tags=["system"])


def _require_system_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="System administrator access required")
    return current_user


class PruneRequest(BaseModel):
    table: str
    older_than_days: int = Field(..., ge=1)


class CompressRequest(BaseModel):
    table: str
    older_than_days: int = Field(..., ge=1)


class VacuumRequest(BaseModel):
    table: str | None = None


@router.get("/health")
def system_health_overview(
    db: Session = Depends(get_db),
    _: User = Depends(_require_system_admin),
):
    try:
        return system_health.get_system_health(db)
    except Exception as e:  # surface a clean error rather than a 500 traceback
        logger.exception("Failed to gather system health")
        raise HTTPException(status_code=500, detail=f"Failed to gather system health: {e}")


@router.post("/maintenance/prune")
def prune(
    body: PruneRequest,
    db: Session = Depends(get_db),
    _: User = Depends(_require_system_admin),
):
    try:
        return system_health.prune_hypertable(db, body.table, body.older_than_days)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/maintenance/compress")
def compress(
    body: CompressRequest,
    db: Session = Depends(get_db),
    _: User = Depends(_require_system_admin),
):
    try:
        return system_health.compress_old_chunks(db, body.table, body.older_than_days)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/maintenance/vacuum")
def vacuum(
    body: VacuumRequest,
    _: User = Depends(_require_system_admin),
):
    try:
        return system_health.vacuum_analyze(body.table)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
