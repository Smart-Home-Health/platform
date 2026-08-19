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
Equipment routes
"""
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Body
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import List, Optional

from db import get_db
from dependencies import get_optional_account_id, get_optional_user, require_permission
from models.equipment import (
    EquipmentCreate,
    EquipmentUpdate,
    EquipmentResponse,
    EquipmentChangeLog,
    EquipmentQuantityChange,
    EquipmentChangeHistoryResponse,
    EquipmentCategoryCreate,
    EquipmentCategoryUpdate,
    EquipmentCategoryResponse,
    CatalogImportRequest,
    EquipmentCountSet,
    EquipmentAliasCreate,
)
from crud.equipment import (
    get_equipment_list, log_equipment_change, receive_equipment,
    open_equipment, get_equipment_change_history, get_equipment,
    get_equipment_categories, add_equipment, add_equipment_simple, add_equipment_category,
    update_equipment, update_equipment_category, delete_equipment,
    delete_equipment_category, search_equipment, get_equipment_due_count,
    catalog_import, set_equipment_count, get_equipment_count_history,
    add_equipment_alias, delete_equipment_alias
)

logger = logging.getLogger("app")

router = APIRouter(prefix="/api/equipment", tags=["equipment"])


@router.post("", dependencies=[Depends(require_permission("equipment.create"))])
async def api_add_equipment(
    data: EquipmentCreate,
    db: Session = Depends(get_db),
    account_id: Optional[int] = Depends(get_optional_account_id),
):
    """Add new equipment item. Scoped to current account when authenticated."""
    if data.scheduled_replacement and (not data.last_changed or not data.useful_days):
        return JSONResponse(status_code=400, content={"detail": "Last changed and useful days are required for scheduled replacements"})

    eid = add_equipment_simple(
        db, data.name, data.quantity, data.scheduled_replacement, data.last_changed,
        data.useful_days, data.patient_id, account_id=account_id,
        item_number=data.item_number, description=data.description,
        category=data.category, tracking_level=data.tracking_level,
        default_manufacturer=data.default_manufacturer,
        unit_of_measure=data.unit_of_measure, unit_size=data.unit_size,
        unit_description=data.unit_description,
        reorder_point=data.reorder_point, par_level=data.par_level,
        storage_location=data.storage_location,
    )
    return {"id": eid, "status": "success"}


@router.get("", response_model=List[dict], dependencies=[Depends(require_permission("equipment.read"))])
async def api_get_equipment(
    patient_id: int = None,
    db: Session = Depends(get_db),
    account_id: Optional[int] = Depends(get_optional_account_id),
):
    """Get equipment list sorted by due next. Optionally filter by patient_id."""
    return get_equipment_list(db, patient_id=patient_id, account_id=account_id)


# NOTE: declared before the /{equipment_id} routes so the literal path
# "catalog-import" is never parsed as an equipment id.
@router.post("/catalog-import", dependencies=[Depends(require_permission("equipment.create"))])
async def api_catalog_import(
    data: CatalogImportRequest,
    db: Session = Depends(get_db),
    account_id: Optional[int] = Depends(get_optional_account_id),
    current_user=Depends(get_optional_user),
):
    """Bulk catalog creation for the Initial Inventory Setup wizard.

    Creates new supplies and/or attaches provider aliases to existing ones.
    Idempotent on item numbers already in the catalog (re-runs match instead
    of duplicating).
    """
    return catalog_import(
        db,
        data.items,
        account_id=account_id,
        patient_id=data.patient_id,
        supplier_id=data.supplier_id,
        created_by=current_user.id if current_user else None,
    )


@router.post("/{equipment_id}/change", dependencies=[Depends(require_permission("equipment.change"))])
async def api_log_equipment_change(
    equipment_id: int,
    data: EquipmentChangeLog,
    db: Session = Depends(get_db),
    account_id: Optional[int] = Depends(get_optional_account_id),
):
    """Log a change and update last_changed."""

    # Check if equipment has scheduled replacement
    from crud.equipment import _owned_equipment
    equipment = _owned_equipment(db, equipment_id, account_id)
    if not equipment:
        return JSONResponse(status_code=404, content={"detail": "Equipment not found"})
    
    if not equipment.scheduled_replacement:
        return JSONResponse(status_code=400, content={"detail": "Equipment does not have scheduled replacement"})

    # Inventory gate: a scheduled change consumes one unit. If tracked stock is
    # already exhausted, refuse and force a restock rather than going negative
    # (mirrors the medication out-of-stock 409 -> "update quantity" flow).
    tracked = (equipment.tracking_level or 'item') != 'none'
    if tracked and (equipment.quantity or 0) < 1:
        return JSONResponse(status_code=409, content={
            "detail": (
                f"{equipment.name} has 0 on hand. "
                "Update the on-hand quantity to continue — the change can't be "
                "recorded until you do."
            ),
            "error": "insufficient_quantity",
            "equipment_id": equipment.id,
            "equipment_name": equipment.name,
            "current_quantity": equipment.quantity,
            "unit_of_measure": equipment.unit_of_measure,
        })

    success = log_equipment_change(db, equipment_id, data.changed_at, account_id=account_id)
    return {"success": success}


@router.get("/{equipment_id}/history", dependencies=[Depends(require_permission("equipment.read"))])
async def api_get_equipment_history(
    equipment_id: int,
    db: Session = Depends(get_db),
    account_id: Optional[int] = Depends(get_optional_account_id),
):
    """Get change history for equipment."""
    return get_equipment_change_history(db, equipment_id, account_id=account_id)


@router.post("/{equipment_id}/receive", dependencies=[Depends(require_permission("equipment.update"))])
async def api_receive_equipment(
    equipment_id: int,
    data: EquipmentQuantityChange,
    db: Session = Depends(get_db),
    account_id: Optional[int] = Depends(get_optional_account_id),
):
    """Increase equipment quantity (receive new stock)."""
    success = receive_equipment(db, equipment_id, data.amount, account_id=account_id)
    return {"success": success}


@router.post("/{equipment_id}/open", dependencies=[Depends(require_permission("equipment.update"))])
async def api_open_equipment(
    equipment_id: int,
    data: EquipmentQuantityChange,
    db: Session = Depends(get_db),
    account_id: Optional[int] = Depends(get_optional_account_id),
):
    """Decrease equipment quantity (open/use equipment)."""
    success = open_equipment(db, equipment_id, data.amount, account_id=account_id)
    return {"success": success}


@router.post("/{equipment_id}/count", dependencies=[Depends(require_permission("equipment.update"))])
async def api_set_equipment_count(
    equipment_id: int,
    data: EquipmentCountSet,
    db: Session = Depends(get_db),
    account_id: Optional[int] = Depends(get_optional_account_id),
    current_user=Depends(get_optional_user),
):
    """Physical stocktake: set the absolute on-hand quantity (audited)."""
    result = set_equipment_count(
        db, equipment_id, data.quantity, note=data.note,
        counted_by=current_user.id if current_user else None,
        account_id=account_id,
    )
    if result is None:
        return JSONResponse(status_code=404, content={"detail": "Equipment not found"})
    return result


@router.get("/{equipment_id}/counts", dependencies=[Depends(require_permission("equipment.read"))])
async def api_get_equipment_count_history(
    equipment_id: int,
    db: Session = Depends(get_db),
    account_id: Optional[int] = Depends(get_optional_account_id),
):
    """Stocktake history for one supply, newest first."""
    return {"counts": get_equipment_count_history(db, equipment_id, account_id=account_id)}


@router.post("/{equipment_id}/aliases", dependencies=[Depends(require_permission("equipment.update"))])
async def api_add_equipment_alias(
    equipment_id: int,
    data: EquipmentAliasCreate,
    db: Session = Depends(get_db),
    account_id: Optional[int] = Depends(get_optional_account_id),
):
    """Attach a provider item number to a supply."""
    alias_id = add_equipment_alias(
        db, equipment_id, data.item_number,
        supplier_id=data.supplier_id, raw_description=data.raw_description,
        account_id=account_id,
    )
    if alias_id is None:
        return JSONResponse(status_code=409, content={"detail": "Alias already exists or equipment not found"})
    return {"id": alias_id, "status": "success"}


@router.delete("/{equipment_id}/aliases/{alias_id}", dependencies=[Depends(require_permission("equipment.update"))])
async def api_delete_equipment_alias(
    equipment_id: int,
    alias_id: int,
    db: Session = Depends(get_db),
    account_id: Optional[int] = Depends(get_optional_account_id),
):
    """Remove a provider alias from a supply."""
    success = delete_equipment_alias(db, equipment_id, alias_id, account_id=account_id)
    if not success:
        return JSONResponse(status_code=404, content={"detail": "Alias not found"})
    return {"status": "success"}


@router.get("/history", dependencies=[Depends(require_permission("equipment.read"))])
async def api_get_all_equipment_history(
    equipment_id: int = None,
    patient_id: int = None,
    start_date: str = None,
    end_date: str = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    account_id: Optional[int] = Depends(get_optional_account_id),
):
    """Get change history for all equipment with optional filtering."""
    from schemas.equipment_change_log import EquipmentChangeLog as EquipmentChangeLogSchema
    from schemas.equipment import Equipment
    from sqlalchemy import desc, or_

    try:
        query = db.query(EquipmentChangeLogSchema).join(
            Equipment, EquipmentChangeLogSchema.equipment_id == Equipment.id
        )

        # The join already reaches equipment; scope it the way the list does.
        if account_id is not None:
            query = query.filter(or_(Equipment.account_id == account_id,
                                     Equipment.account_id.is_(None)))

        if patient_id:
            query = query.filter(Equipment.patient_id == patient_id)
        
        if equipment_id:
            query = query.filter(EquipmentChangeLogSchema.equipment_id == equipment_id)
        
        if start_date:
            query = query.filter(EquipmentChangeLogSchema.changed_at >= start_date)
        
        if end_date:
            query = query.filter(EquipmentChangeLogSchema.changed_at <= end_date)
        
        changes = query.order_by(desc(EquipmentChangeLogSchema.changed_at)).limit(limit).all()
        
        result = []
        for change in changes:
            equipment = db.query(Equipment).filter(Equipment.id == change.equipment_id).first()
            result.append({
                'id': change.id,
                'equipment_id': change.equipment_id,
                'equipment_name': equipment.name if equipment else 'Unknown',
                'patient_id': change.patient_id,
                'changed_at': change.changed_at.isoformat() if change.changed_at else None,
                'notes': change.notes,
                'changed_by': change.changed_by,
                'created_at': change.created_at.isoformat() if change.created_at else None
            })
        
        return {"history": result, "total": len(result)}
    except Exception as e:
        logger.error(f"Error fetching equipment history: {e}")
        return {"history": [], "total": 0}


@router.put("/{equipment_id}", dependencies=[Depends(require_permission("equipment.update"))])
async def api_update_equipment(
    equipment_id: int,
    data: EquipmentUpdate,
    db: Session = Depends(get_db),
    account_id: Optional[int] = Depends(get_optional_account_id),
):
    """Update an equipment item."""
    success = update_equipment(
        db,
        equipment_id,
        account_id=account_id,
        name=data.name,
        quantity=data.quantity,
        scheduled_replacement=data.scheduled_replacement,
        last_changed=data.last_changed,
        useful_days=data.useful_days,
        item_number=data.item_number,
        description=data.description,
        category=data.category,
        tracking_level=data.tracking_level,
        default_manufacturer=data.default_manufacturer,
        unit_of_measure=data.unit_of_measure,
        unit_size=data.unit_size,
        unit_description=data.unit_description,
        reorder_point=data.reorder_point,
        par_level=data.par_level,
        storage_location=data.storage_location,
    )
    if not success:
        return JSONResponse(status_code=404, content={"detail": "Equipment not found"})
    return {"status": "success"}


@router.delete("/{equipment_id}", dependencies=[Depends(require_permission("equipment.delete"))])
async def api_delete_equipment(
    equipment_id: int,
    db: Session = Depends(get_db),
    account_id: Optional[int] = Depends(get_optional_account_id),
):
    """Delete an equipment item."""
    success = delete_equipment(db, equipment_id, account_id=account_id)
    if not success:
        return JSONResponse(status_code=404, content={"detail": "Equipment not found or could not be deleted"})
    return {"status": "success"}


@router.get("/due/count", dependencies=[Depends(require_permission("equipment.read"))])
async def api_get_equipment_due_count(
    patient_id: Optional[int] = None,
    db: Session = Depends(get_db),
    account_id: Optional[int] = Depends(get_optional_account_id),
):
    """Get count of equipment items that are due for replacement.

    Scoped by account when authenticated, and further scoped to a patient
    (their own items + shared items) when patient_id is provided — so a
    per-patient dashboard badge reflects only that patient.
    """
    return {"count": get_equipment_due_count(db, account_id=account_id, patient_id=patient_id)}
