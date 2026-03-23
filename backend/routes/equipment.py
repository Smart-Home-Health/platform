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
from dependencies import get_optional_account_id
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
)
from crud.equipment import (
    get_equipment_list, log_equipment_change, receive_equipment, 
    open_equipment, get_equipment_change_history, get_equipment,
    get_equipment_categories, add_equipment, add_equipment_simple, add_equipment_category,
    update_equipment, update_equipment_category, delete_equipment,
    delete_equipment_category, search_equipment, get_equipment_due_count
)

logger = logging.getLogger("app")

router = APIRouter(prefix="/api/equipment", tags=["equipment"])


@router.post("")
async def api_add_equipment(
    data: EquipmentCreate,
    db: Session = Depends(get_db),
    account_id: Optional[int] = Depends(get_optional_account_id),
):
    """Add new equipment item. Scoped to current account when authenticated."""
    if data.scheduled_replacement and (not data.last_changed or not data.useful_days):
        return JSONResponse(status_code=400, content={"detail": "Last changed and useful days are required for scheduled replacements"})

    eid = add_equipment_simple(db, data.name, data.quantity, data.scheduled_replacement, data.last_changed, data.useful_days, data.patient_id, account_id=account_id)
    return {"id": eid, "status": "success"}


@router.get("", response_model=List[dict])
async def api_get_equipment(patient_id: int = None, db: Session = Depends(get_db)):
    """Get equipment list sorted by due next. Optionally filter by patient_id."""
    return get_equipment_list(db, patient_id=patient_id)


@router.post("/{equipment_id}/change")
async def api_log_equipment_change(equipment_id: int, data: EquipmentChangeLog, db: Session = Depends(get_db)):
    """Log a change and update last_changed."""
    
    # Check if equipment has scheduled replacement
    from models import Equipment
    equipment = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if not equipment:
        return JSONResponse(status_code=404, content={"detail": "Equipment not found"})
    
    if not equipment.scheduled_replacement:
        return JSONResponse(status_code=400, content={"detail": "Equipment does not have scheduled replacement"})
    
    success = log_equipment_change(db, equipment_id, data.changed_at)
    return {"success": success}


@router.get("/{equipment_id}/history")
async def api_get_equipment_history(equipment_id: int, db: Session = Depends(get_db)):
    """Get change history for equipment."""
    return get_equipment_change_history(db, equipment_id)


@router.post("/{equipment_id}/receive")
async def api_receive_equipment(equipment_id: int, data: EquipmentQuantityChange, db: Session = Depends(get_db)):
    """Increase equipment quantity (receive new stock)."""
    success = receive_equipment(db, equipment_id, data.amount)
    return {"success": success}


@router.post("/{equipment_id}/open")
async def api_open_equipment(equipment_id: int, data: EquipmentQuantityChange, db: Session = Depends(get_db)):
    """Decrease equipment quantity (open/use equipment)."""
    success = open_equipment(db, equipment_id, data.amount)
    return {"success": success}


@router.get("/history")
async def api_get_all_equipment_history(
    equipment_id: int = None,
    patient_id: int = None,
    start_date: str = None,
    end_date: str = None,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """Get change history for all equipment with optional filtering."""
    from schemas.equipment_change_log import EquipmentChangeLog as EquipmentChangeLogSchema
    from schemas.equipment import Equipment
    from sqlalchemy import desc
    
    try:
        query = db.query(EquipmentChangeLogSchema).join(
            Equipment, EquipmentChangeLogSchema.equipment_id == Equipment.id
        )
        
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


@router.put("/{equipment_id}")
async def api_update_equipment(equipment_id: int, data: EquipmentUpdate, db: Session = Depends(get_db)):
    """Update an equipment item."""
    success = update_equipment(
        db, 
        equipment_id, 
        name=data.name,
        quantity=data.quantity,
        scheduled_replacement=data.scheduled_replacement,
        last_changed=data.last_changed,
        useful_days=data.useful_days
    )
    if not success:
        return JSONResponse(status_code=404, content={"detail": "Equipment not found"})
    return {"status": "success"}


@router.delete("/{equipment_id}")
async def api_delete_equipment(equipment_id: int, db: Session = Depends(get_db)):
    """Delete an equipment item."""
    success = delete_equipment(db, equipment_id)
    if not success:
        return JSONResponse(status_code=404, content={"detail": "Equipment not found or could not be deleted"})
    return {"status": "success"}


@router.get("/due/count")
async def api_get_equipment_due_count(
    db: Session = Depends(get_db),
    account_id: Optional[int] = Depends(get_optional_account_id),
):
    """Get count of equipment items that are due for replacement. Scoped by account when authenticated."""
    return {"count": get_equipment_due_count(db, account_id=account_id)}
