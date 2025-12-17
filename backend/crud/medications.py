"""
Medication management CRUD operations
"""
import logging
from datetime import datetime, timedelta
from croniter import croniter
from sqlalchemy.orm import Session
from schemas.medication import Medication
from schemas.medication_schedule import MedicationSchedule
from schemas.medication_log import MedicationLog
from crud.settings import get_setting

logger = logging.getLogger('crud')


# --- Medication CRUD ---
def add_medication(db: Session, name, concentration=None, quantity=None, quantity_unit=None, instructions=None, start_date=None, end_date=None, as_needed=False, notes=None, active=True, patient_id=None, prescriber_id=None, pharmacy_id=None):
    """
    Add a new medication to the database.
    
    Args:
        patient_id: If provided, medication is patient-specific. If None, medication is global.
        prescriber_id: Optional provider ID who prescribed this medication
        pharmacy_id: Optional business ID representing the pharmacy
    """
    now = datetime.now()
    medication = Medication(
        patient_id=patient_id,
        name=name,
        concentration=concentration,
        quantity=quantity,
        quantity_unit=quantity_unit,
        instructions=instructions,
        start_date=start_date,
        end_date=end_date,
        as_needed=as_needed,
        notes=notes,
        active=active,
        prescriber_id=prescriber_id,
        pharmacy_id=pharmacy_id,
        created_at=now,
        updated_at=now
    )
    db.add(medication)
    db.commit()
    db.refresh(medication)
    logger.info(f"Medication added: {name}")
    return medication.id


def get_active_medications(db: Session):
    """
    Get all active medications for the current patient plus global medications
    (active=True and end_date is None or > today, and patient_id matches current patient or is None)
    """
    try:
        today = datetime.now().date()
        current_patient_id = get_setting(db, 'current_patient_id')
        
        # Convert to int if it's a string
        if current_patient_id:
            try:
                current_patient_id = int(current_patient_id)
            except (ValueError, TypeError):
                current_patient_id = None
        
        medications = db.query(Medication).filter(
            Medication.active == True,
            (Medication.end_date == None) | (Medication.end_date > today),
            (Medication.patient_id == current_patient_id) | (Medication.patient_id == None)
        ).order_by(Medication.name).all()
        
        return [
            {
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
                'schedules': []
            }
            for med in medications
        ]
    except Exception as e:
        logger.error(f"Error fetching active medications: {e}")
        return []


def get_inactive_medications(db: Session):
    """
    Get all inactive medications for the current patient plus global medications
    (active=False or end_date <= today, and patient_id matches current patient or is None)
    """
    try:
        today = datetime.now().date()
        current_patient_id = get_setting(db, 'current_patient_id')
        
        # Convert to int if it's a string
        if current_patient_id:
            try:
                current_patient_id = int(current_patient_id)
            except (ValueError, TypeError):
                current_patient_id = None
        
        medications = db.query(Medication).filter(
            (Medication.active == False) | (Medication.end_date <= today),
            (Medication.patient_id == current_patient_id) | (Medication.patient_id == None)
        ).order_by(Medication.name).all()
        
        return [
            {
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
                'schedules': []
            }
            for med in medications
        ]
    except Exception as e:
        logger.error(f"Error fetching inactive medications: {e}")
        return []


def update_medication(db: Session, med_id, **kwargs):
    """
    Update an existing medication
    """
    try:
        # Get the medication
        medication = db.query(Medication).filter(Medication.id == med_id).first()
        if not medication:
            return False
        
        # Update fields
        for key, value in kwargs.items():
            if hasattr(medication, key):
                setattr(medication, key, value)
        
        medication.updated_at = datetime.now()
        
        db.commit()
        logger.info(f"Medication updated: {medication.name}")
        return True
    except Exception as e:
        logger.error(f"Error updating medication: {e}")
        return False


def delete_medication(db: Session, med_id):
    """
    Delete a medication (soft delete by setting active=False)
    """
    try:
        medication = db.query(Medication).filter(Medication.id == med_id).first()
        if medication:
            medication.active = False
            medication.updated_at = datetime.now()
            db.commit()
            logger.info(f"Medication deleted (soft): {medication.name}")
            return True
        return False
    except Exception as e:
        logger.error(f"Error deleting medication {med_id}: {e}")
        db.rollback()
        return False


def administer_medication(db: Session, med_id, dose_amount, schedule_id=None, scheduled_time=None, notes=None):
    try:
        med = db.query(Medication).filter(Medication.id == med_id).first()
        if not med or med.quantity is None or dose_amount is None:
            return False
        
        # Get current patient ID
        current_patient_id = get_setting(db, 'current_patient_id')
        if current_patient_id:
            try:
                current_patient_id = int(current_patient_id)
            except (ValueError, TypeError):
                current_patient_id = None
        
        # For patient-specific medications, make sure we have a current patient
        if med.patient_id is not None and current_patient_id is None:
            logger.error("Cannot administer patient-specific medication without current patient set")
            return False
        
        # Only deduct from quantity if dose_amount > 0 (don't deduct for skipped doses)
        if float(dose_amount) > 0:
            if med.quantity < float(dose_amount):
                logger.warning(f"Insufficient medication quantity. Available: {med.quantity}, Requested: {dose_amount}")
                # Still allow administration but warn about low stock
            med.quantity = max(0, med.quantity - float(dose_amount))
        
        # Calculate timing flags if this is a scheduled dose
        administered_early = False
        administered_late = False
        
        if schedule_id and scheduled_time:
            # Handle both datetime objects (from Pydantic) and string (legacy)
            if isinstance(scheduled_time, datetime):
                scheduled_dt = scheduled_time
            else:
                scheduled_dt = datetime.fromisoformat(scheduled_time.replace('Z', '+00:00'))
            
            now = datetime.now()
            diff_minutes = (now - scheduled_dt).total_seconds() / 60
            
            if diff_minutes < -15:  # More than 15 minutes early
                administered_early = True
            elif diff_minutes > 15:  # More than 15 minutes late
                administered_late = True
        
        # Record log
        log = MedicationLog(
            medication_id=med_id,
            patient_id=current_patient_id,  # Always use current patient for logs
            schedule_id=schedule_id,
            administered_at=datetime.now(),
            dose_amount=dose_amount,
            is_scheduled=bool(schedule_id),
            scheduled_time=scheduled_time,
            administered_early=administered_early,
            administered_late=administered_late,
            notes=notes,
            created_at=datetime.now()
        )
        db.add(log)
        db.commit()
        return True
    except Exception as e:
        logger.error(f"Error administering medication: {e}")
        db.rollback()
        return False


def get_medication_names_for_dropdown(db: Session):
    """
    Get all medication names for dropdown selection for current patient plus global medications
    Returns active medications first, then inactive ones with indicators
    """
    try:
        today = datetime.now().date()
        current_patient_id = get_setting(db, 'current_patient_id')
        
        # Convert to int if it's a string
        if current_patient_id:
            try:
                current_patient_id = int(current_patient_id)
            except (ValueError, TypeError):
                current_patient_id = None
        
        # Get medications for current patient or global medications
        medications = db.query(Medication).filter(
            Medication.id.isnot(None),
            (Medication.patient_id == current_patient_id) | (Medication.patient_id == None)
        ).order_by(
            Medication.active.desc(),
            Medication.name.asc()
        ).all()
        
        result = []
        for med in medications:
            # Determine if medication is truly active
            is_currently_active = med.active and (med.end_date is None or med.end_date > today)
            
            name_display = med.name
            if not is_currently_active:
                name_display += " (Inactive)"
            if med.patient_id is None:
                name_display += " (Global)"
            
            result.append({
                'id': med.id,
                'name': name_display,
                'original_name': med.name,
                'active': is_currently_active,
                'concentration': med.concentration,
                'is_global': med.patient_id is None
            })
        
        return result
        
    except Exception as e:
        logger.error(f"Error getting medication names for dropdown: {e}")
        return []


# --- MedicationSchedule CRUD ---
def add_medication_schedule(db: Session, medication_id, cron_expression, description=None, dose_amount=None, active=True, notes=None, patient_id=None):
    """
    Add a new medication schedule
    """
    try:
        # Get the medication to inherit its patient_id if not explicitly provided
        medication = db.query(Medication).filter(Medication.id == medication_id).first()
        if not medication:
            logger.error(f"Medication with id {medication_id} not found")
            return None
        
        # Use provided patient_id if given, otherwise inherit from medication
        schedule_patient_id = patient_id if patient_id is not None else medication.patient_id
        
        now = datetime.now()
        schedule = MedicationSchedule(
            medication_id=medication_id,
            patient_id=schedule_patient_id,
            cron_expression=cron_expression,
            description=description,
            dose_amount=dose_amount,
            active=active,
            notes=notes,
            created_at=now,
            updated_at=now
        )
        db.add(schedule)
        db.commit()
        db.refresh(schedule)
        logger.info(f"Medication schedule added for medication {medication_id}: {cron_expression}")
        return schedule.id
    except Exception as e:
        logger.error(f"Error adding medication schedule: {e}")
        db.rollback()
        return None


def get_medication_schedules(db: Session, medication_id):
    """
    Get all schedules for a specific medication
    """
    try:
        schedules = db.query(MedicationSchedule).filter(
            MedicationSchedule.medication_id == medication_id
        ).order_by(MedicationSchedule.created_at.desc()).all()
        
        return [
            {
                'id': s.id,
                'medication_id': s.medication_id,
                'cron_expression': s.cron_expression,
                'description': s.description,
                'dose_amount': s.dose_amount,
                'active': s.active,
                'notes': s.notes,
                'created_at': s.created_at,
                'updated_at': s.updated_at
            }
            for s in schedules
        ]
    except Exception as e:
        logger.error(f"Error fetching medication schedules for medication {medication_id}: {e}")
        return []


def get_all_medication_schedules(db: Session, active_only=True):
    """
    Get all medication schedules, optionally filtering by active status
    """
    try:
        query = db.query(MedicationSchedule)
        if active_only:
            query = query.filter(MedicationSchedule.active == True)
        
        schedules = query.order_by(MedicationSchedule.created_at.desc()).all()
        
        return [
            {
                'id': s.id,
                'medication_id': s.medication_id,
                'cron_expression': s.cron_expression,
                'description': s.description,
                'dose_amount': s.dose_amount,
                'active': s.active,
                'notes': s.notes,
                'created_at': s.created_at,
                'updated_at': s.updated_at
            }
            for s in schedules
        ]
    except Exception as e:
        logger.error(f"Error fetching all medication schedules: {e}")
        return []


def update_medication_schedule(db: Session, schedule_id, **kwargs):
    """
    Update an existing medication schedule
    """
    try:
        schedule = db.query(MedicationSchedule).filter(MedicationSchedule.id == schedule_id).first()
        if not schedule:
            return False
        
        # Update fields if provided
        for key, value in kwargs.items():
            if hasattr(schedule, key):
                setattr(schedule, key, value)
        
        schedule.updated_at = datetime.now()
        db.commit()
        logger.info(f"Medication schedule {schedule_id} updated")
        return True
    except Exception as e:
        logger.error(f"Error updating medication schedule {schedule_id}: {e}")
        db.rollback()
        return False


def delete_medication_schedule(db: Session, schedule_id):
    """
    Delete a medication schedule (hard delete since it's not critical data)
    """
    try:
        schedule = db.query(MedicationSchedule).filter(MedicationSchedule.id == schedule_id).first()
        if not schedule:
            return False
        
        db.delete(schedule)
        db.commit()
        logger.info(f"Medication schedule {schedule_id} deleted")
        return True
    except Exception as e:
        logger.error(f"Error deleting medication schedule {schedule_id}: {e}")
        db.rollback()
        return False


def toggle_medication_schedule_active(db: Session, schedule_id):
    """
    Toggle the active status of a medication schedule
    """
    try:
        schedule = db.query(MedicationSchedule).filter(MedicationSchedule.id == schedule_id).first()
        if not schedule:
            return False, None
        
        schedule.active = not schedule.active
        schedule.updated_at = datetime.now()
        db.commit()
        logger.info(f"Medication schedule {schedule_id} active status toggled to {schedule.active}")
        return True, schedule.active
    except Exception as e:
        logger.error(f"Error toggling medication schedule {schedule_id}: {e}")
        db.rollback()
        return False, None


def get_scheduled_medications_for_date(db: Session, target_date=None, patient_id=None):
    """
    Get all medications scheduled for a specific date for the current patient plus global medications
    
    Args:
        target_date: datetime.date object, defaults to today
        patient_id: Optional patient ID to filter schedules. If None, uses current patient from settings
    
    Returns:
        List of scheduled medication entries with calculated times
    """
    try:
        if target_date is None:
            target_date = datetime.now().date()
        
        # Use provided patient_id or fall back to current patient from settings
        if patient_id is None:
            current_patient_id = get_setting(db, 'current_patient_id')
            
            # Convert to int if it's a string
            if current_patient_id:
                try:
                    current_patient_id = int(current_patient_id)
                except (ValueError, TypeError):
                    current_patient_id = None
        else:
            current_patient_id = patient_id
        
        # Get all active medication schedules for current patient or global medications
        schedules = db.query(MedicationSchedule).filter(
            MedicationSchedule.active == True,
            (MedicationSchedule.patient_id == current_patient_id) | (MedicationSchedule.patient_id == None)
        ).join(Medication).filter(
            Medication.active == True,
            (Medication.patient_id == current_patient_id) | (Medication.patient_id == None)
        ).all()
        
        scheduled_meds = []
        
        for schedule in schedules:
            try:
                # Create datetime for start of target date
                start_of_day = datetime.combine(target_date, datetime.min.time())
                end_of_day = datetime.combine(target_date, datetime.max.time())
                
                # Initialize croniter with a time before the target date
                base_time = start_of_day - timedelta(days=1)
                cron = croniter(schedule.cron_expression, base_time)
                
                # Find all scheduled times for the target date
                while True:
                    next_time = cron.get_next(datetime)
                    if next_time.date() > target_date:
                        break
                    if next_time.date() == target_date:
                        scheduled_meds.append({
                            'schedule_id': schedule.id,
                            'medication_id': schedule.medication_id,
                            'medication_name': schedule.medication.name,
                            'dose_amount': schedule.dose_amount,
                            'dose_unit': schedule.medication.quantity_unit,
                            'scheduled_time': next_time,
                            'description': schedule.description,
                            'cron_expression': schedule.cron_expression
                        })
            except Exception as cron_error:
                logger.error(f"Error processing cron expression {schedule.cron_expression}: {cron_error}")
                continue
        
        return sorted(scheduled_meds, key=lambda x: x['scheduled_time'])
        
    except Exception as e:
        logger.error(f"Error getting scheduled medications: {e}")
        return []


def get_missed_medications(db: Session, target_date=None):
    """
    Get medications that were scheduled but not taken for a specific date
    
    Args:
        target_date: datetime.date object, defaults to yesterday
    
    Returns:
        List of missed medication entries
    """
    try:
        if target_date is None:
            target_date = (datetime.now() - timedelta(days=1)).date()
        
        # Get all scheduled medications for the target date
        scheduled = get_scheduled_medications_for_date(db, target_date)
        
        missed_meds = []
        
        for scheduled_med in scheduled:
            # Check if this scheduled dose was logged
            scheduled_time = scheduled_med['scheduled_time']
            schedule_id = scheduled_med['schedule_id']
            
            # Look for a log entry within a reasonable window (e.g., ±2 hours)
            time_window_start = scheduled_time - timedelta(hours=2)
            time_window_end = scheduled_time + timedelta(hours=2)
            
            log_entry = db.query(MedicationLog).filter(
                MedicationLog.schedule_id == schedule_id,
                MedicationLog.administered_at >= time_window_start,
                MedicationLog.administered_at <= time_window_end
            ).first()
            
            if not log_entry:
                # This scheduled dose was missed
                missed_meds.append({
                    **scheduled_med,
                    'missed_date': target_date,
                    'status': 'missed'
                })
        
        return missed_meds
        
    except Exception as e:
        logger.error(f"Error getting missed medications: {e}")
        return []


def get_daily_medication_schedule(db: Session, patient_id=None):
    """
    Get scheduled medications for today and yesterday in chronological order with status
    
    Args:
        patient_id: Optional patient ID to filter schedules. If None, uses current patient from settings
    
    Returns:
        Dict with 'scheduled_medications' list sorted chronologically
    """
    try:
        today = datetime.now().date()
        yesterday = today - timedelta(days=1)
        current_time = datetime.now()
        
        # Get scheduled meds for yesterday and today
        yesterday_scheduled = get_scheduled_medications_for_date(db, yesterday, patient_id=patient_id)
        today_scheduled = get_scheduled_medications_for_date(db, today, patient_id=patient_id)
        
        all_scheduled = []
        
        # Process yesterday's schedules (check if missed)
        for item in yesterday_scheduled:
            scheduled_time = item['scheduled_time']
            schedule_id = item['schedule_id']
            
            # Check if this was taken - look for any log entry for this schedule and date
            # First try exact schedule_id match
            log_entry = db.query(MedicationLog).filter(
                MedicationLog.schedule_id == schedule_id,
                MedicationLog.scheduled_time == scheduled_time
            ).first()
            
            # If no exact match, check within time window (±4 hours for more flexibility)
            if not log_entry:
                time_window_start = scheduled_time - timedelta(hours=4)
                time_window_end = scheduled_time + timedelta(hours=4)
                
                log_entry = db.query(MedicationLog).filter(
                    MedicationLog.schedule_id == schedule_id,
                    MedicationLog.administered_at >= time_window_start,
                    MedicationLog.administered_at <= time_window_end
                ).first()
            
            if log_entry:
                # Check if dose was skipped (actual_dose = 0)
                if log_entry.dose_amount == 0:
                    status = 'skipped'
                else:
                    # Calculate timing status for completed dose
                    # Ensure both datetimes are timezone-naive for comparison
                    administered_at = log_entry.administered_at
                    if administered_at.tzinfo is not None:
                        administered_at = administered_at.replace(tzinfo=None)
                    
                    scheduled_time_naive = scheduled_time
                    if scheduled_time_naive.tzinfo is not None:
                        scheduled_time_naive = scheduled_time_naive.replace(tzinfo=None)
                    
                    time_diff = (administered_at - scheduled_time_naive).total_seconds() / 60  # minutes
                    if abs(time_diff) <= 60:  # Within 1 hour
                        status = 'completed_on_time'
                    elif abs(time_diff) <= 120:  # 1-2 hours early/late
                        status = 'completed_warning'
                    else:  # More than 2 hours early/late
                        status = 'completed_late'
                
                # Show all completed medications from yesterday (including on-time ones)
                all_scheduled.append({
                    **item,
                    'status': status,
                    'administered_at': log_entry.administered_at,
                    'actual_dose': log_entry.dose_amount,
                    'is_completed': True
                })
            else:
                # Show as missed if it's from yesterday or earlier
                if scheduled_time.date() < today:
                    all_scheduled.append({
                        **item,
                        'status': 'missed',
                        'is_completed': False
                    })
        
        # Process today's schedules
        for item in today_scheduled:
            scheduled_time = item['scheduled_time']
            schedule_id = item['schedule_id']
            
            # Check if this was taken - look for any log entry for this schedule and date
            # First try exact schedule_id and scheduled_time match
            log_entry = db.query(MedicationLog).filter(
                MedicationLog.schedule_id == schedule_id,
                MedicationLog.scheduled_time == scheduled_time
            ).first()
            
            # If no exact match, check within time window (±4 hours for more flexibility)
            if not log_entry:
                time_window_start = scheduled_time - timedelta(hours=4)
                time_window_end = scheduled_time + timedelta(hours=4)
                
                log_entry = db.query(MedicationLog).filter(
                    MedicationLog.schedule_id == schedule_id,
                    MedicationLog.administered_at >= time_window_start,
                    MedicationLog.administered_at <= time_window_end
                ).first()
            
            if log_entry:
                # Check if dose was skipped (actual_dose = 0)
                if log_entry.dose_amount == 0:
                    status = 'skipped'
                else:
                    # Calculate timing status for completed dose
                    # Ensure both datetimes are timezone-naive for comparison
                    administered_at = log_entry.administered_at
                    if administered_at.tzinfo is not None:
                        administered_at = administered_at.replace(tzinfo=None)
                    
                    scheduled_time_naive = scheduled_time
                    if scheduled_time_naive.tzinfo is not None:
                        scheduled_time_naive = scheduled_time_naive.replace(tzinfo=None)
                    
                    time_diff = (administered_at - scheduled_time_naive).total_seconds() / 60  # minutes
                    if abs(time_diff) <= 60:  # Within 1 hour
                        status = 'completed_on_time'
                    elif abs(time_diff) <= 120:  # 1-2 hours early/late
                        status = 'completed_warning'
                    else:  # More than 2 hours early/late
                        status = 'completed_late'
                
                all_scheduled.append({
                    **item,
                    'status': status,
                    'administered_at': log_entry.administered_at,
                    'actual_dose': log_entry.dose_amount,
                    'is_completed': True
                })
            else:
                # Check timing status for pending dose
                # Ensure both datetimes are timezone-naive for comparison
                current_time_naive = current_time
                if current_time_naive.tzinfo is not None:
                    current_time_naive = current_time_naive.replace(tzinfo=None)
                
                scheduled_time_naive = scheduled_time
                if scheduled_time_naive.tzinfo is not None:
                    scheduled_time_naive = scheduled_time_naive.replace(tzinfo=None)
                
                time_diff = (current_time_naive - scheduled_time_naive).total_seconds() / 60  # minutes
                
                if scheduled_time_naive > current_time_naive:
                    # Future dose
                    status = 'pending'
                elif time_diff <= 60:
                    # Within 1 hour of scheduled time
                    status = 'due_on_time'
                elif time_diff <= 120:
                    # 1-2 hours late
                    status = 'due_warning'
                else:
                    # More than 2 hours late
                    status = 'due_late'
                
                all_scheduled.append({
                    **item,
                    'status': status,
                    'is_completed': False
                })
        
        # Sort by scheduled time chronologically
        all_scheduled.sort(key=lambda x: x['scheduled_time'])
        
        return {
            'scheduled_medications': all_scheduled,
            'generated_at': current_time.isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error getting daily medication schedule: {e}")
        return {
            'scheduled_medications': [],
            'generated_at': datetime.now().isoformat()
        }


def get_due_and_upcoming_medications_count(db: Session):
    """
    Returns the count of scheduled medications that are:
    - missed (for today or yesterday)
    - due_late or due_warning (for today or yesterday)
    - due_on_time or pending (for today or yesterday) and scheduled within the next hour
    """
    try:
        schedule_data = get_daily_medication_schedule(db)
        meds = schedule_data.get('scheduled_medications', [])
        now = datetime.now()
        count = 0
        for med in meds:
            status = med.get('status', '')
            scheduled_time = med.get('scheduled_time')
            if isinstance(scheduled_time, str):
                scheduled_time = datetime.fromisoformat(scheduled_time)
            
            if status in ['missed', 'due_late', 'due_warning']:
                count += 1
            elif status in ['due_on_time', 'pending'] and scheduled_time and (scheduled_time - now).total_seconds() <= 3600:
                count += 1
        return count
    except Exception as e:
        logger.error(f"Error getting due/upcoming medications count: {e}")
        return 0


def get_medication_history(db: Session, limit=25, medication_name=None, start_date=None, end_date=None, status_filter=None):
    """
    Get medication administration history with filtering options
    
    Args:
        db: Database session
        limit: Maximum number of records to return (default 25)
        medication_name: Filter by medication name (partial match)
        start_date: Filter by start date (YYYY-MM-DD format)
        end_date: Filter by end date (YYYY-MM-DD format)  
        status_filter: Filter by status ('late', 'early', 'missed', 'on-time')
    
    Returns:
        List of medication administration records with related data
    """
    try:
        # Start with base query joining medication log with medication and schedule
        query = db.query(MedicationLog).join(Medication).outerjoin(MedicationSchedule)
        
        # Filter by medication name (partial match, case insensitive)
        if medication_name:
            query = query.filter(Medication.name.ilike(f'%{medication_name}%'))
        
        # Filter by date range
        if start_date:
            start_dt = datetime.strptime(start_date, '%Y-%m-%d')
            query = query.filter(MedicationLog.administered_at >= start_dt)
        
        if end_date:
            end_dt = datetime.strptime(end_date, '%Y-%m-%d')
            query = query.filter(MedicationLog.administered_at <= end_dt)
        
        # Filter by status
        if status_filter:
            if status_filter == 'late':
                query = query.filter(MedicationLog.administered_late == True)
            elif status_filter == 'early':
                query = query.filter(MedicationLog.administered_early == True)
            elif status_filter == 'on-time':
                query = query.filter(MedicationLog.administered_late == False, MedicationLog.administered_early == False)
            elif status_filter == 'missed':
                # This would need to be implemented differently since missed meds aren't logged
                pass
        
        # Order by most recent first and apply limit
        records = query.order_by(MedicationLog.administered_at.desc()).limit(limit).all()
        
        # Format the results
        result = []
        for log in records:
            status = 'on-time'
            if log.administered_early:
                status = 'early'
            elif log.administered_late:
                status = 'late'
            
            result.append({
                'id': log.id,
                'medication_name': log.medication.name,
                'dose_amount': log.dose_amount,
                'administered_at': log.administered_at.isoformat(),
                'scheduled_time': log.scheduled_time,
                'is_scheduled': log.is_scheduled,
                'status': status,
                'notes': log.notes,
                'schedule_description': log.schedule.description if log.schedule else None
            })
        
        return result
    
    except Exception as e:
        logger.error(f"Error getting medication history: {e}")
        return []
