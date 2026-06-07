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
Medication management CRUD operations
"""
import logging
from datetime import datetime, timedelta, timezone
from croniter import croniter
from sqlalchemy.orm import Session
from schemas.medication import Medication
from schemas.medication_schedule import MedicationSchedule
from schemas.medication_log import MedicationLog
from crud.settings import get_setting
from utils.datetime_utils import utc_now, utc_today, resolve_tz_for_patient, local_day_bounds
from utils.medication_quantity import InsufficientMedicationQuantityError

logger = logging.getLogger('crud')


def _utc_iso(dt):
    """Serialize a datetime as ISO 8601, tagging naive values as UTC.

    Some legacy columns (e.g. medication_log.scheduled_time) are TIMESTAMP
    WITHOUT TIME ZONE in the database but the values are written as UTC.
    Emitting a naive ISO string makes JS Date treat it as local time.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


# --- Medication CRUD ---
def add_medication(db: Session, name, concentration=None, quantity=None, quantity_unit=None, instructions=None, start_date=None, end_date=None, as_needed=False, notes=None, active=True, patient_id=None, prescriber_id=None, pharmacy_id=None):
    """
    Add a new medication to the database.
    
    Args:
        patient_id: If provided, medication is patient-specific. If None, medication is global.
        prescriber_id: Optional provider ID who prescribed this medication
        pharmacy_id: Optional business ID representing the pharmacy
    """
    now = utc_now()
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
        today = utc_today()
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
        today = utc_today()
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
        
        medication.updated_at = utc_now()
        
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
            medication.updated_at = utc_now()
            db.commit()
            logger.info(f"Medication deleted (soft): {medication.name}")
            return True
        return False
    except Exception as e:
        logger.error(f"Error deleting medication {med_id}: {e}")
        db.rollback()
        return False


def administer_medication(db: Session, med_id, dose_amount, schedule_id=None, scheduled_time=None, notes=None, patient_id=None, administered_at=None):
    try:
        med = db.query(Medication).filter(Medication.id == med_id).first()
        if not med or med.quantity is None or dose_amount is None:
            return False

        # Use provided patient_id or fall back to current patient from settings
        current_patient_id = patient_id
        if current_patient_id is None:
            raw = get_setting(db, 'current_patient_id')
            if raw:
                try:
                    current_patient_id = int(raw)
                except (ValueError, TypeError):
                    current_patient_id = None

        # For patient-specific medications, we need a patient context (request body or current patient)
        if med.patient_id is not None and current_patient_id is None:
            logger.error("Cannot administer patient-specific medication without current patient set")
            return False
        if med.patient_id is not None and current_patient_id is not None and med.patient_id != current_patient_id:
            logger.error("Patient context does not match medication's patient")
            return False

        # Only deduct from quantity if dose_amount > 0 (don't deduct for skipped doses).
        # Refuse when there isn't enough on hand — the caller must update the
        # quantity first rather than administer a dose we don't have.
        if float(dose_amount) > 0:
            if med.quantity < float(dose_amount):
                logger.warning(f"Insufficient medication quantity. Available: {med.quantity}, Requested: {dose_amount}")
                raise InsufficientMedicationQuantityError(med, dose_amount)
            med.quantity = max(0, med.quantity - float(dose_amount))
        
        # Use timezone-aware UTC datetime
        now = datetime.now(timezone.utc)

        # Resolve the actual administered timestamp first, since the early/late
        # flags must be computed against that — not against request-time.
        # Priority:
        #   1. explicit `administered_at` from the caller (PRN retro-logging)
        #   2. scheduled_time for skipped doses (keep skip on timeline)
        #   3. now
        if administered_at is not None:
            if isinstance(administered_at, datetime):
                log_time = administered_at
                if log_time.tzinfo is None:
                    log_time = log_time.replace(tzinfo=timezone.utc)
            else:
                log_time = datetime.fromisoformat(str(administered_at).replace('Z', '+00:00'))
        elif float(dose_amount) == 0 and scheduled_time:
            if isinstance(scheduled_time, datetime):
                log_time = scheduled_time
                if log_time.tzinfo is None:
                    log_time = log_time.replace(tzinfo=timezone.utc)
            else:
                log_time = datetime.fromisoformat(str(scheduled_time).replace('Z', '+00:00'))
        else:
            log_time = now

        # Calculate timing flags only for actual administrations against a
        # scheduled dose. Skipped doses (dose_amount == 0) are not an
        # administration so they don't carry early/late flags.
        administered_early = False
        administered_late = False

        if schedule_id and scheduled_time and float(dose_amount) > 0:
            if isinstance(scheduled_time, datetime):
                scheduled_dt = scheduled_time
                if scheduled_dt.tzinfo is None:
                    scheduled_dt = scheduled_dt.replace(tzinfo=timezone.utc)
            else:
                scheduled_dt = datetime.fromisoformat(scheduled_time.replace('Z', '+00:00'))

            diff_minutes = (log_time - scheduled_dt).total_seconds() / 60

            if diff_minutes < -15:  # More than 15 minutes early
                administered_early = True
            elif diff_minutes > 15:  # More than 15 minutes late
                administered_late = True

        # Record log
        log = MedicationLog(
            medication_id=med_id,
            patient_id=current_patient_id,  # Always use current patient for logs
            schedule_id=schedule_id,
            administered_at=log_time,
            dose_amount=dose_amount,
            is_scheduled=bool(schedule_id),
            scheduled_time=scheduled_time,
            administered_early=administered_early,
            administered_late=administered_late,
            notes=notes,
            created_at=now
        )
        db.add(log)
        db.commit()
        # Tell live dashboards to refetch the (patient-scoped) medications badge.
        try:
            from event_publisher import publish_due_counts_changed
            publish_due_counts_changed("medications", current_patient_id)
        except Exception as e:
            logger.error(f"Failed to publish medications due-count change: {e}")
        return True
    except InsufficientMedicationQuantityError:
        db.rollback()
        raise  # let the route turn this into a 409 with update-quantity details
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
        today = utc_today()
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
        
        now = utc_now()
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
        
        schedule.updated_at = utc_now()
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
        schedule.updated_at = utc_now()
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
            target_date = utc_today()
        
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
                        # Croniter returns naive datetime - cron expressions are stored in UTC
                        # so we just need to mark it as UTC-aware
                        utc_time = next_time.replace(tzinfo=timezone.utc)
                        
                        scheduled_meds.append({
                            'schedule_id': schedule.id,
                            'medication_id': schedule.medication_id,
                            'medication_name': schedule.medication.name,
                            'dose_amount': schedule.dose_amount,
                            'dose_unit': schedule.medication.quantity_unit,
                            'scheduled_time': utc_time,
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
            target_date = (utc_now() - timedelta(days=1)).date()
        
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


def get_daily_medication_schedule(db: Session, patient_id=None, tz=None):
    """
    Get scheduled medications for today and yesterday in chronological order with status.
    Uses the patient's account-local timezone (``tz``, resolved from the account
    when not passed) to determine local day boundaries so evening doses aren't
    cut off by UTC date rollover. Shares one window with the care-task and
    nutrition badges.

    Args:
        patient_id: Optional patient ID to filter schedules. If None, uses current patient from settings
        tz: Optional ZoneInfo override; resolved from the patient's account otherwise

    Returns:
        Dict with 'scheduled_medications' list sorted chronologically
    """
    try:
        if tz is None:
            tz = resolve_tz_for_patient(db, patient_id)
        bounds = local_day_bounds(tz)
        current_time = bounds['now_utc']
        local_yesterday_start_utc = bounds['yesterday_start_utc']
        local_today_start_utc = bounds['today_start_utc']
        local_today_end_utc = bounds['today_end_utc']

        # Get cron-generated schedule entries for all UTC dates spanning the
        # local yesterday+today window.
        all_raw = []
        for utc_date in bounds['utc_dates']:
            all_raw.extend(get_scheduled_medications_for_date(db, utc_date, patient_id=patient_id))

        # Deduplicate by (schedule_id, scheduled_time)
        seen = set()
        deduped = []
        for item in all_raw:
            key = (item['schedule_id'], item['scheduled_time'])
            if key not in seen:
                seen.add(key)
                deduped.append(item)

        # Split into local yesterday and local today based on UTC boundaries
        yesterday_scheduled = [
            item for item in deduped
            if local_yesterday_start_utc <= item['scheduled_time'] < local_today_start_utc
        ]
        today_scheduled = [
            item for item in deduped
            if local_today_start_utc <= item['scheduled_time'] < local_today_end_utc
        ]
        
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
                    'is_completed': True,
                    'log_id': log_entry.id
                })
            else:
                # Show as missed if it's from yesterday (before local today start)
                if scheduled_time < local_today_start_utc:
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
                    'is_completed': True,
                    'log_id': log_entry.id
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
                    status = 'upcoming'
                elif time_diff <= 120:
                    # Within 2 hours of scheduled time — ready to take
                    status = 'ready'
                else:
                    # More than 2 hours late
                    status = 'missed'
                
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
            'generated_at': utc_now().isoformat()
        }


def get_due_and_upcoming_medications_count(db: Session, patient_id=None, tz=None):
    """
    Count scheduled medication occurrences that are "due" for the badge/summary.

    An occurrence counts when it is NOT yet completed/skipped AND its scheduled
    time falls within the window [start of the local prior day, now + 1 hour].
    The daily schedule (account-local today+yesterday) spans the window and
    matches administrations to occurrences by ``scheduled_time`` (so a dose
    logged late on the next calendar day is still recognised as completed), so we
    only need the open occurrences up to the one-hour lookahead. This is the same
    rule used by the admin dashboard summary, keeping both views consistent.
    """
    try:
        schedule_data = get_daily_medication_schedule(db, patient_id=patient_id, tz=tz)
        meds = schedule_data.get('scheduled_medications', [])
        return _count_due_and_upcoming(meds)
    except Exception as e:
        logger.error(f"Error getting due/upcoming medications count: {e}")
        return 0


def _count_due_and_upcoming(items):
    """
    Shared "due now or within the next hour" counter for schedule items.

    Counts items whose ``is_completed`` flag is falsy and whose ``scheduled_time``
    is at or before now + 1 hour. The lower bound (start of the prior day) is
    inherent to the daily-schedule range passed in.
    """
    cutoff = utc_now() + timedelta(hours=1)
    count = 0
    for item in items:
        if item.get('is_completed'):
            continue
        scheduled_time = item.get('scheduled_time')
        if isinstance(scheduled_time, str):
            scheduled_time = datetime.fromisoformat(scheduled_time)
        if scheduled_time is None:
            continue
        if scheduled_time.tzinfo is None:
            scheduled_time = scheduled_time.replace(tzinfo=timezone.utc)
        if scheduled_time <= cutoff:
            count += 1
    return count


def _count_overdue(items):
    """
    Count open (not completed) occurrences whose scheduled hour has fully passed.

    An occurrence stays "normal" during its own hour and only becomes overdue
    once the clock ticks past that hour — so we compare against the start of the
    current hour, not against ``now``. This is a subset of _count_due_and_upcoming.
    """
    hour_start = utc_now().replace(minute=0, second=0, microsecond=0)
    count = 0
    for item in items:
        if item.get('is_completed'):
            continue
        scheduled_time = item.get('scheduled_time')
        if isinstance(scheduled_time, str):
            scheduled_time = datetime.fromisoformat(scheduled_time)
        if scheduled_time is None:
            continue
        if scheduled_time.tzinfo is None:
            scheduled_time = scheduled_time.replace(tzinfo=timezone.utc)
        if scheduled_time < hour_start:
            count += 1
    return count


def get_medication_schedule_counts(db: Session, patient_id=None, tz=None):
    """Return {'due', 'overdue'} medication counts from one schedule fetch."""
    try:
        schedule_data = get_daily_medication_schedule(db, patient_id=patient_id, tz=tz)
        meds = schedule_data.get('scheduled_medications', [])
        return {'due': _count_due_and_upcoming(meds), 'overdue': _count_overdue(meds)}
    except Exception as e:
        logger.error(f"Error getting medication schedule counts: {e}")
        return {'due': 0, 'overdue': 0}


def get_medication_history(db: Session, limit=25, medication_name=None, start_date=None, end_date=None, status_filter=None, patient_id=None):
    """
    Get medication administration history with filtering options
    
    Args:
        db: Database session
        limit: Maximum number of records to return (default 25)
        medication_name: Filter by medication name (partial match)
        start_date: Filter by start date (YYYY-MM-DD format)
        end_date: Filter by end date (YYYY-MM-DD format)  
        status_filter: Filter by status ('late', 'early', 'skipped', 'on-time')
        patient_id: Filter by patient ID
    
    Returns:
        List of medication administration records with related data
    """
    try:
        # Start with base query joining medication log with medication and schedule
        query = db.query(MedicationLog).join(Medication).outerjoin(MedicationSchedule)
        
        # Filter by patient_id
        if patient_id:
            query = query.filter(MedicationLog.patient_id == patient_id)
        
        # Filter by medication name (partial match, case insensitive)
        if medication_name:
            query = query.filter(Medication.name.ilike(f'%{medication_name}%'))
        
        # Filter by date range
        if start_date:
            start_dt = datetime.strptime(start_date, '%Y-%m-%d')
            query = query.filter(MedicationLog.administered_at >= start_dt)
        
        if end_date:
            end_dt = datetime.strptime(end_date, '%Y-%m-%d') + timedelta(days=1)  # Include full end day
            query = query.filter(MedicationLog.administered_at < end_dt)
        
        # Filter by status
        if status_filter:
            if status_filter == 'late':
                query = query.filter(MedicationLog.administered_late == True, MedicationLog.dose_amount > 0)
            elif status_filter == 'early':
                query = query.filter(MedicationLog.administered_early == True, MedicationLog.dose_amount > 0)
            elif status_filter == 'on-time':
                query = query.filter(
                    MedicationLog.administered_late == False, 
                    MedicationLog.administered_early == False,
                    MedicationLog.dose_amount > 0
                )
            elif status_filter == 'skipped':
                query = query.filter(MedicationLog.dose_amount == 0)
        
        # Order by most recent first and apply limit
        records = query.order_by(MedicationLog.administered_at.desc()).limit(limit).all()
        
        # Format the results
        result = []
        for log in records:
            # Check for skipped first (dose_amount == 0)
            if log.dose_amount == 0:
                status = 'skipped'
            elif log.administered_early:
                status = 'early'
            elif log.administered_late:
                status = 'late'
            else:
                status = 'on-time'
            
            result.append({
                'id': log.id,
                'medication_id': log.medication_id,
                'medication_name': log.medication.name,
                'concentration': log.medication.concentration,
                'dose_amount': log.dose_amount,
                'dose_unit': log.medication.quantity_unit,
                'administered_at': _utc_iso(log.administered_at),
                'scheduled_time': _utc_iso(log.scheduled_time),
                'is_scheduled': log.is_scheduled,
                'status': status,
                'notes': log.notes,
                'patient_id': log.patient_id,
                'schedule_id': log.schedule_id,
                'schedule_description': log.schedule.description if log.schedule else None
            })
        
        return result
    
    except Exception as e:
        logger.error(f"Error getting medication history: {e}")
        return []
