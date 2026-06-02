"""
Medication management routes
"""
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, Body
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import Optional, List
from db import get_db
from dependencies import require_read_access
from models.medications import (
    MedicationCreate,
    MedicationUpdate,
    MedicationResponse,
    MedicationScheduleCreate,
    MedicationScheduleUpdate,
    MedicationScheduleResponse,
    MedicationAdminister,
    ProviderInfo,
    PharmacyInfo,
)
from crud.medications import (add_medication, get_active_medications, get_inactive_medications, update_medication, 
                  delete_medication, add_medication_schedule, get_medication_schedules, 
                  get_all_medication_schedules, update_medication_schedule, delete_medication_schedule, 
                  toggle_medication_schedule_active, get_daily_medication_schedule, administer_medication,
                  get_medication_history, get_medication_names_for_dropdown)
from crud.settings import get_setting
from models import Medication
from utils.early_administration import guard_early_administration
from utils.medication_quantity import insufficient_quantity_response, InsufficientMedicationQuantityError

logger = logging.getLogger("app")

router = APIRouter(prefix="/api", tags=["medications"])


def _next_due_from_schedules(schedules):
    """Given a list of medication schedule dicts, return the soonest upcoming
    occurrence (UTC ISO string) across all active schedules, or None."""
    from croniter import croniter
    from datetime import timezone as tz
    if not schedules:
        return None
    now = datetime.now(tz.utc)
    next_times = []
    for s in schedules:
        if not s.get('active'):
            continue
        cron = s.get('cron_expression')
        if not cron:
            continue
        try:
            it = croniter(cron, now)
            next_times.append(it.get_next(datetime))
        except Exception:
            continue
    if not next_times:
        return None
    soonest = min(next_times)
    # croniter returns naive datetimes; the rest of this code treats schedule
    # times as UTC, so tag accordingly.
    if soonest.tzinfo is None:
        soonest = soonest.replace(tzinfo=tz.utc)
    return soonest.isoformat()


# Medication CRUD endpoints
@router.post("/add/medication")
async def api_add_medication(data: MedicationCreate, db: Session = Depends(get_db)):
    """Add a new medication entry."""

    # Extract fields from Pydantic model
    is_patient_specific = data.is_patient_specific
    admin_patient_id = data.admin_patient_id
    prescriber_id = data.prescriber_id
    pharmacy_id = data.pharmacy_id
    
    # Determine patient_id
    patient_id = None
    if is_patient_specific:
        if admin_patient_id:
            # Admin specified a specific patient
            patient_id = admin_patient_id
        else:
            # Use current patient from settings
            current_patient_id = get_setting(db, 'current_patient_id')
            if current_patient_id:
                try:
                    patient_id = int(current_patient_id)
                except (ValueError, TypeError):
                    return JSONResponse(status_code=400, content={"detail": "Invalid current patient ID"})
            else:
                return JSONResponse(status_code=400, content={"detail": "No current patient set for patient-specific medication"})

    try:
        med_id = add_medication(
            db,
            name=data.name,
            concentration=data.concentration,
            quantity=data.quantity,
            quantity_unit=data.quantity_unit,
            instructions=data.instructions,
            start_date=data.start_date,
            end_date=data.end_date,
            as_needed=data.as_needed,
            notes=data.notes,
            patient_id=patient_id,
            prescriber_id=prescriber_id,
            pharmacy_id=pharmacy_id
        )
        return {"id": med_id, "status": "success"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": str(e)})


@router.get("/medications/active", response_model=List[dict])
async def get_active_medications_endpoint(db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    """Get all active medications."""
    return get_active_medications(db)


@router.get("/medications/inactive", response_model=List[dict])
async def get_inactive_medications_endpoint(db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    """Get all inactive medications."""
    return get_inactive_medications(db)


# Admin-specific endpoints with patient filtering
@router.get("/admin/medications/active")
async def get_admin_active_medications_endpoint(patient_id: Optional[int] = None, db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    """Get active medications for admin view - can filter by patient_id or show all"""
    from schemas.medication_log import MedicationLog


    try:
        if patient_id:
            # Get medications for specific patient + global medications
            medications = db.query(Medication).filter(
                Medication.active == True,
                (Medication.end_date == None) | (Medication.end_date > datetime.now().date()),
                (Medication.patient_id == patient_id) | (Medication.patient_id == None)
            ).order_by(Medication.name).all()
        else:
            # Get all active medications (admin overview)
            medications = db.query(Medication).filter(
                Medication.active == True,
                (Medication.end_date == None) | (Medication.end_date > datetime.now().date())
            ).order_by(Medication.name).all()
        
        # Get the most recent log per medication in one query (timestamp + dose
        # amount). Postgres DISTINCT ON keeps the first row per partition once
        # ordered, so this is one round-trip instead of a join+subquery.
        med_ids = [med.id for med in medications]
        last_log_query = db.query(
            MedicationLog.medication_id,
            MedicationLog.administered_at,
            MedicationLog.dose_amount,
        ).filter(
            MedicationLog.medication_id.in_(med_ids)
        )
        if patient_id:
            last_log_query = last_log_query.filter(
                MedicationLog.patient_id == patient_id
            )
        last_log_query = last_log_query.distinct(MedicationLog.medication_id).order_by(
            MedicationLog.medication_id,
            MedicationLog.administered_at.desc(),
        )
        last_log_map = {row.medication_id: row for row in last_log_query.all()}
        
        result = []
        for med in medications:
            schedules = get_medication_schedules(db, med.id)
            result.append({
                'id': med.id,
                'patient_id': med.patient_id,
                'name': med.name,
                'concentration': med.concentration,
                'quantity': med.quantity,
                'quantity_unit': med.quantity_unit,
                'instructions': med.instructions,
                'start_date': med.start_date.isoformat() if med.start_date else None,
                'end_date': med.end_date.isoformat() if med.end_date else None,
                'as_needed': med.as_needed,
                'notes': med.notes,
                'active': med.active,
                'created_at': med.created_at.isoformat() if med.created_at else None,
                'updated_at': med.updated_at.isoformat() if med.updated_at else None,
                'is_global': med.patient_id is None,
                'prescriber_id': med.prescriber_id,
                'prescriber_name': f"{med.prescriber.first_name} {med.prescriber.last_name}".strip() if med.prescriber and (med.prescriber.first_name or med.prescriber.last_name) else (med.prescriber.name if med.prescriber else None),
                'pharmacy_id': med.pharmacy_id,
                'last_administered': last_log_map[med.id].administered_at.isoformat() if med.id in last_log_map else None,
                'last_dose_amount': last_log_map[med.id].dose_amount if med.id in last_log_map else None,
                'next_due': _next_due_from_schedules(schedules),
                'schedules': schedules,
            })
        return result
    except Exception as e:
        logger.error(f"Error fetching admin active medications: {e}")
        return JSONResponse(status_code=500, content={"detail": str(e)})


@router.get("/admin/medications/inactive")
async def get_admin_inactive_medications_endpoint(patient_id: Optional[int] = None, db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    """Get inactive medications for admin view - can filter by patient_id or show all"""
    try:
        today = datetime.now().date()
        
        if patient_id:
            # Get medications for specific patient + global medications
            medications = db.query(Medication).filter(
                (Medication.active == False) | (Medication.end_date <= today),
                (Medication.patient_id == patient_id) | (Medication.patient_id == None)
            ).order_by(Medication.name).all()
        else:
            # Get all inactive medications (admin overview)
            medications = db.query(Medication).filter(
                (Medication.active == False) | (Medication.end_date <= today)
            ).order_by(Medication.name).all()
        
        result = []
        for med in medications:
            schedules = get_medication_schedules(db, med.id)
            result.append({
                'id': med.id,
                'patient_id': med.patient_id,
                'name': med.name,
                'concentration': med.concentration,
                'quantity': med.quantity,
                'quantity_unit': med.quantity_unit,
                'instructions': med.instructions,
                'start_date': med.start_date.isoformat() if med.start_date else None,
                'end_date': med.end_date.isoformat() if med.end_date else None,
                'as_needed': med.as_needed,
                'notes': med.notes,
                'active': med.active,
                'created_at': med.created_at.isoformat() if med.created_at else None,
                'updated_at': med.updated_at.isoformat() if med.updated_at else None,
                'is_global': med.patient_id is None,
                'prescriber_id': med.prescriber_id,
                'pharmacy_id': med.pharmacy_id,
                'next_due': _next_due_from_schedules(schedules),
                'schedules': schedules,
            })
        return result
    except Exception as e:
        logger.error(f"Error fetching admin inactive medications: {e}")
        return JSONResponse(status_code=500, content={"detail": str(e)})


@router.put("/medications/{med_id}")
async def update_medication_endpoint(med_id: int, data: MedicationUpdate, db: Session = Depends(get_db)):
    """Update an existing medication."""
    # Filter out None values
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    
    success = update_medication(db, med_id, **update_data)
    if not success:
        return JSONResponse(status_code=404, content={"detail": "Medication not found"})
    
    return {"status": "success"}


@router.delete("/medications/{med_id}")
async def delete_medication_endpoint(med_id: int, db: Session = Depends(get_db)):
    """Delete (soft delete) a medication."""
    success = delete_medication(db, med_id)
    if not success:
        return JSONResponse(status_code=404, content={"detail": "Medication not found"})
    
    return {"status": "success"}


@router.post("/medications/{med_id}/toggle-active")
async def toggle_medication_active_endpoint(med_id: int, db: Session = Depends(get_db)):
    """Toggle the active status of a medication."""
    # Get current medication
    medication = db.query(Medication).filter(Medication.id == med_id).first()
    if not medication:
        return JSONResponse(status_code=404, content={"detail": "Medication not found"})
    
    # Toggle active status
    success = update_medication(db, med_id, active=not medication.active)
    if not success:
        return JSONResponse(status_code=500, content={"detail": "Failed to update medication"})
    
    return {"status": "success", "active": not medication.active}


@router.post("/medications/{med_id}/administer")
async def administer_medication_endpoint(med_id: int, data: MedicationAdminister, db: Session = Depends(get_db)):
    """Record a medication administration and deduct from quantity. Pass patient_id when administering a patient-specific medication without a global current patient."""
    # Block administrations >1h before the scheduled time unless the caller confirmed.
    # Skip doses (dose_amount == 0) are exempt — they are explicitly *not* an administration.
    if data.dose_amount > 0:
        early = guard_early_administration(
            data.scheduled_time,
            early_override=data.early_override,
            item_label="medication",
            schedule_id=data.schedule_id,
        )
        if early is not None:
            return early

    try:
        result = administer_medication(
            db, med_id, data.dose_amount, data.schedule_id, data.scheduled_time, data.notes,
            patient_id=data.patient_id, administered_at=data.administered_at,
        )
    except InsufficientMedicationQuantityError as e:
        # Refuse — the caller must update on-hand quantity first.
        return insufficient_quantity_response(e.medication, e.dose)
    if not result:
        return JSONResponse(status_code=400, content={"detail": "Failed to administer medication"})
    return {"success": True}


# Medication Schedule endpoints
@router.post("/add/schedule/{medication_id}")
async def api_add_medication_schedule(
    medication_id: int, 
    data: MedicationScheduleCreate, 
    db: Session = Depends(get_db)
):
    """Add a new medication schedule entry."""
    try:
        
        # Verify medication exists
        medication = db.query(Medication).filter(Medication.id == medication_id).first()
        if not medication:
            return JSONResponse(status_code=404, content={"detail": "Medication not found"})
        
        # For global medications, use provided patient_id; otherwise inherit from medication
        patient_id = None
        if medication.patient_id is None:  # Global medication
            patient_id = data.patient_id
            if not patient_id:
                # Fallback to current patient if no patient_id provided for global medication
                current_patient_id = get_setting(db, 'current_patient_id')
                if current_patient_id:
                    try:
                        patient_id = int(current_patient_id)
                    except (ValueError, TypeError):
                        pass  # Leave patient_id as None
        
        schedule_id = add_medication_schedule(
            db,
            medication_id=medication_id,
            cron_expression=data.cron_expression,
            description=data.description,
            dose_amount=data.dose_amount,
            active=data.active,
            notes=data.notes or '',
            patient_id=patient_id
        )
        
        if schedule_id:
            return {"id": schedule_id, "status": "success"}
        else:
            return JSONResponse(status_code=500, content={"detail": "Failed to create medication schedule"})
    
    except Exception as e:
        return JSONResponse(status_code=500, content={"detail": f"Internal server error: {str(e)}"})


@router.get("/medications/{medication_id}/schedules")
async def get_medication_schedules_endpoint(medication_id: int, db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    """Get all schedules for a specific medication."""
    # Verify medication exists
    medication = db.query(Medication).filter(Medication.id == medication_id).first()
    if not medication:
        return JSONResponse(status_code=404, content={"detail": "Medication not found"})
    
    schedules = get_medication_schedules(db, medication_id)
    return {"schedules": schedules}


@router.get("/schedules")
async def get_all_medication_schedules_endpoint(active_only: bool = True, db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    """Get all medication schedules, optionally filtering by active status."""
    schedules = get_all_medication_schedules(db, active_only)
    return {"schedules": schedules}


@router.put("/schedules/{schedule_id}")
async def update_medication_schedule_endpoint(
    schedule_id: int, 
    data: MedicationScheduleUpdate, 
    db: Session = Depends(get_db)
):
    """Update an existing medication schedule."""
    # Filter out None values
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    
    success = update_medication_schedule(db, schedule_id, **update_data)
    if not success:
        return JSONResponse(status_code=404, content={"detail": "Medication schedule not found"})
    
    return {"status": "success"}


@router.delete("/schedules/{schedule_id}")
async def delete_medication_schedule_endpoint(schedule_id: int, db: Session = Depends(get_db)):
    """Delete a medication schedule."""
    success = delete_medication_schedule(db, schedule_id)
    if not success:
        return JSONResponse(status_code=404, content={"detail": "Medication schedule not found"})
    
    return {"status": "success"}


@router.post("/schedules/{schedule_id}/toggle-active")
async def toggle_medication_schedule_active_endpoint(schedule_id: int, db: Session = Depends(get_db)):
    """Toggle the active status of a medication schedule."""
    success, new_active_status = toggle_medication_schedule_active(db, schedule_id)
    if not success:
        return JSONResponse(status_code=404, content={"detail": "Medication schedule not found"})
    
    return {"status": "success", "active": new_active_status}


@router.get("/schedules/daily")
async def get_daily_medication_schedule_endpoint(patient_id: Optional[int] = None, db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    """Get today's scheduled medications plus yesterday's missed medications."""
    try:
        daily_schedule = get_daily_medication_schedule(db, patient_id=patient_id)
        return daily_schedule
    except Exception as e:
        logger.error(f"Error getting daily medication schedule: {e}")
        return JSONResponse(
            status_code=500, 
            content={"detail": f"Error retrieving daily schedule: {str(e)}"}
        )


# Medication history and reporting
@router.get("/medications/history")
async def get_medication_history_endpoint(
    limit: int = 25,
    medication_name: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    status_filter: Optional[str] = None,
    patient_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access)
):
    """
    Get medication administration history with filtering options
    
    Query parameters:
    - limit: Maximum number of records (default 25)
    - medication_name: Filter by medication name (partial match)
    - start_date: Filter by start date (YYYY-MM-DD format)
    - end_date: Filter by end date (YYYY-MM-DD format)
    - status_filter: Filter by status ('late', 'early', 'skipped', 'on-time')
    - patient_id: Filter by patient ID
    """
    try:
        history = get_medication_history(
            db=db,
            limit=limit,
            medication_name=medication_name,
            start_date=start_date,
            end_date=end_date,
            status_filter=status_filter,
            patient_id=patient_id
        )
        return {"history": history, "count": len(history)}
    except Exception as e:
        logger.error(f"Error getting medication history: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error retrieving medication history: {str(e)}"}
        )


@router.get("/medications/names")
async def get_medication_names_endpoint(db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    """
    Get all medication names for dropdown selection
    Returns active medications first, then inactive ones with indicators
    """
    try:
        medication_names = get_medication_names_for_dropdown(db)
        return {"medication_names": medication_names}
    except Exception as e:
        logger.error(f"Error getting medication names: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error retrieving medication names: {str(e)}"}
        )


@router.get("/medications/providers")
async def get_providers_for_medication(patient_id: Optional[int] = None, db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    """Get providers that can prescribe medications for the given patient or all providers"""
    from models import Provider
    try:
        if patient_id:
            # Get providers associated with this patient
            providers = db.query(Provider).filter(
                Provider.patient_id == patient_id,
                Provider.active == True
            ).all()
        else:
            # Get all active providers
            providers = db.query(Provider).filter(Provider.active == True).all()
        
        return {
            "providers": [
                ProviderInfo(
                    id=p.id,
                    name=f"{p.first_name} {p.last_name}".strip(),
                    specialty=p.specialty,
                    type=p.provider_type
                ).model_dump()
                for p in providers
            ]
        }
    except Exception as e:
        logger.error(f"Error getting providers: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error retrieving providers: {str(e)}"}
        )


@router.get("/medications/pharmacies")
async def get_pharmacies_for_medication(db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    """Get businesses that are pharmacies"""
    from models import Business
    from schemas.business import BusinessTypeAssignment
    try:
        # Get businesses that have 'pharmacy' type
        pharmacies = db.query(Business).join(BusinessTypeAssignment).filter(
            BusinessTypeAssignment.type_name == 'pharmacy',
            Business.active == True
        ).all()
        
        return {
            "pharmacies": [
                PharmacyInfo(
                    id=p.id,
                    name=p.name,
                    phone=p.phone,
                    address=f"{p.address_line1 or ''} {p.address_line2 or ''}".strip() or None
                ).model_dump()
                for p in pharmacies
            ]
        }
    except Exception as e:
        logger.error(f"Error getting pharmacies: {e}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error retrieving pharmacies: {str(e)}"}
        )
