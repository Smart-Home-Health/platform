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
Medication management CRUD operations
"""
import logging
from datetime import datetime, timedelta, timezone
from croniter import croniter
from crud.reminder_windows import new_reminder_window, medication_window_fields
from sqlalchemy.orm import Session
from schemas.medication import Medication
from schemas.medication_schedule import MedicationSchedule
from schemas.medication_log import MedicationLog
from crud.settings import get_setting
from utils.datetime_utils import utc_now, utc_today, make_utc, resolve_tz_for_patient, local_day_bounds
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
def stage_medication(db: Session, **fields) -> Medication:
    """Insert in the caller's transaction so medication plan edits can be atomic."""
    now = utc_now()
    medication = Medication(created_at=now, updated_at=now, **fields)
    db.add(medication)
    db.flush()
    return medication


def add_medication(db: Session, name, concentration=None, quantity=None, quantity_unit=None, instructions=None, start_date=None, end_date=None, as_needed=False, notes=None, active=True, patient_id=None, prescriber_id=None, pharmacy_id=None, low_stock_threshold=None, low_stock_threshold_type='quantity'):
    """
    Add a new medication to the database.
    
    Args:
        patient_id: If provided, medication is patient-specific. If None, medication is global.
        prescriber_id: Optional provider ID who prescribed this medication
        pharmacy_id: Optional business ID representing the pharmacy
    """
    medication = stage_medication(
        db, patient_id=patient_id,
        name=name,
        concentration=concentration,
        quantity=quantity,
        quantity_unit=quantity_unit,
        low_stock_threshold=low_stock_threshold,
        low_stock_threshold_type=low_stock_threshold_type,
        instructions=instructions,
        start_date=start_date,
        end_date=end_date,
        as_needed=as_needed,
        notes=notes,
        active=active,
        prescriber_id=prescriber_id,
        pharmacy_id=pharmacy_id,
    )
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
                'low_stock_threshold': med.low_stock_threshold,
                'low_stock_threshold_type': med.low_stock_threshold_type,
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
                'low_stock_threshold': med.low_stock_threshold,
                'low_stock_threshold_type': med.low_stock_threshold_type,
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


def set_low_stock_days_for_scheduled_meds(db: Session, days: float):
    """Apply a days-of-supply low-stock threshold to every active medication
    that has at least one active schedule (PRN-only meds have no schedule to
    project consumption from, so they are left untouched). Returns the names
    of the medications updated."""
    meds = db.query(Medication).filter(
        Medication.active == True,  # noqa: E712
        Medication.id.in_(
            db.query(MedicationSchedule.medication_id).filter(
                MedicationSchedule.active == True  # noqa: E712
            )
        )
    ).all()
    now = utc_now()
    for med in meds:
        med.low_stock_threshold = days
        med.low_stock_threshold_type = 'days'
        med.updated_at = now
    db.commit()
    logger.info(f"Applied {days}-day low-stock threshold to {len(meds)} scheduled medications")
    return [med.name for med in meds]


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


def administer_medication(db: Session, med_id, dose_amount, schedule_id=None, scheduled_time=None,
                          notes=None, patient_id=None, administered_at=None, administered_by=None):
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
        
        now = utc_now()
        if isinstance(scheduled_time, str):
            scheduled_time = datetime.fromisoformat(scheduled_time.replace('Z', '+00:00'))
        scheduled_dt = make_utc(scheduled_time) if scheduled_time is not None else None

        if isinstance(administered_at, str):
            administered_at = datetime.fromisoformat(administered_at.replace('Z', '+00:00'))
        if administered_at is not None:
            log_time = make_utc(administered_at)
        elif float(dose_amount) == 0 and scheduled_dt is not None:
            log_time = scheduled_dt
        else:
            log_time = now

        administered_early = administered_late = False
        if schedule_id and scheduled_dt is not None and float(dose_amount) > 0:
            offset = log_time - scheduled_dt
            administered_early = offset < -timedelta(minutes=15)
            administered_late = offset > timedelta(minutes=15)

        # Older charting clients may supply the schedule but omit its firing.
        # The schedule view credits the nearest firing within its matching window.
        if schedule_id and scheduled_dt is None and current_patient_id is not None:
            from crud.medication_occurrences import nearest_logged_firing
            from crud.schedule_manager import lock_patient
            from schemas.schedule_reminder import ScheduleReminder

            schedule = db.query(MedicationSchedule).filter_by(id=schedule_id, medication_id=med_id).first()
            if schedule is not None:
                lock_patient(db, current_patient_id)
                firing = nearest_logged_firing(schedule.cron_expression, log_time)
                if firing is not None:
                    db.query(ScheduleReminder).filter_by(patient_id=current_patient_id, category='medications',
                        schedule_id=schedule.id, scheduled_at=firing).update({
                        ScheduleReminder.remind_at: None, ScheduleReminder.notified_at: None,
                        ScheduleReminder.updated_at: now, ScheduleReminder.updated_by: administered_by,
                    })
        # Record log
        log = MedicationLog(
            medication_id=med_id,
            patient_id=current_patient_id,  # Always use current patient for logs
            schedule_id=schedule_id,
            administered_at=log_time,
            dose_amount=dose_amount,
            is_scheduled=bool(schedule_id),
            # Migration 001 stores this occurrence as a naive UTC timestamp.
            scheduled_time=scheduled_dt.replace(tzinfo=None) if scheduled_dt is not None else None,
            administered_early=administered_early,
            administered_late=administered_late,
            # Who gave the dose. The column has existed since the initial
            # migration but nothing ever wrote it, so `completed_by` came back
            # None for every medication while care tasks recorded it properly.
            administered_by=administered_by,
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
def stage_medication_schedule(db: Session, **fields) -> MedicationSchedule:
    now = utc_now()
    if fields.get("grace_period_hours") is None:
        fields["reminder_window_minutes"] = new_reminder_window(db, fields.get("patient_id"), fields.get("reminder_window_minutes"))
    schedule = MedicationSchedule(created_at=now, updated_at=now, **medication_window_fields(fields))
    db.add(schedule)
    db.flush()
    return schedule


def add_medication_schedule(db: Session, medication_id, cron_expression, description=None, dose_amount=None, active=True, notes=None, patient_id=None, grace_period_hours=None, reminder_window_minutes=None):
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
        
        schedule = stage_medication_schedule(
            db, medication_id=medication_id,
            patient_id=schedule_patient_id,
            cron_expression=cron_expression,
            description=description,
            dose_amount=dose_amount,
            active=active,
            notes=notes,
            grace_period_hours=grace_period_hours,
            reminder_window_minutes=reminder_window_minutes,
        )
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
                'patient_id': s.patient_id,
                'cron_expression': s.cron_expression,
                'description': s.description,
                'dose_amount': s.dose_amount,
                'active': s.active,
                'notes': s.notes,
                'grace_period_hours': s.grace_period_hours,
                'reminder_window_minutes': s.reminder_window_minutes,
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
                'grace_period_hours': s.grace_period_hours,
                'reminder_window_minutes': s.reminder_window_minutes,
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
        for key, value in medication_window_fields(kwargs).items():
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
    from crud.reminder_timeline import timeline_rows

    try:
        if patient_id is None:
            try:
                patient_id = int(get_setting(db, 'current_patient_id'))
            except (ValueError, TypeError):
                patient_id = None
        if tz is None:
            tz = resolve_tz_for_patient(db, patient_id)
        bounds = local_day_bounds(tz)
        current_time = bounds['now_utc']

        # Use the same occurrence and log as the daily Schedule, including when
        # the dose was given or recorded on another day.
        rows = timeline_rows(db, patient_id, 'medications', [bounds['local_yesterday'], bounds['local_today']],
                             tz, current_time, grace_before=bounds['today_start_utc'])
        all_scheduled = []
        for item in rows:
            if item.get('is_prn'):
                continue
            item['is_completed'] = item['completed']
            if item['completed']:
                administered_at = datetime.fromisoformat(item['completed_at'])
                item['administered_at'] = administered_at
                offset = abs(administered_at - item['scheduled_time'])
                if item['skipped']:
                    status = 'skipped'
                elif offset <= timedelta(hours=1):
                    status = 'completed_on_time'
                elif offset <= timedelta(hours=2):
                    status = 'completed_warning'
                else:
                    status = 'completed_late'
            elif item['reminder_state'] in ('snoozed', 'missed'):
                status = item['reminder_state']
            elif item['is_yesterday'] or item.get('in_grace'):
                status = 'missed'
            elif item['effective_time'] > current_time:
                status = 'upcoming'
            elif current_time - item['effective_time'] <= timedelta(hours=2):
                status = 'ready'
            else:
                status = 'missed'
            item['status'] = status
            item.pop('_reminder_alert', None)
            all_scheduled.append(item)
        all_scheduled.sort(key=lambda item: item['effective_time'])

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
    return get_medication_schedule_counts(db, patient_id=patient_id, tz=tz)['due']


def get_medication_schedule_counts(db: Session, patient_id=None, tz=None):
    """Count actionable occurrences using the same reminder timeline as Home Assistant."""
    from crud.schedule_status import dashboard_schedule_counts
    now = local_day_bounds(tz or resolve_tz_for_patient(db, patient_id))['now_utc']
    counts = dashboard_schedule_counts(db, patient_id, 'meds_counts', now, tz)
    return {'due': counts['due'], 'overdue': counts['overdue']}


def get_medication_due_now_late_counts(db: Session, patient_id=None, tz=None):
    from crud.schedule_status import dashboard_schedule_counts
    now = local_day_bounds(tz or resolve_tz_for_patient(db, patient_id))['now_utc']
    counts = dashboard_schedule_counts(db, patient_id, 'meds_counts', now, tz)
    return {'due_now': counts['due_now'], 'late': counts['late']}


def get_medication_history(db: Session, limit=25, medication_name=None, start_date=None, end_date=None, status_filter=None, patient_id=None, medication_id=None):
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
        medication_id: Filter to exactly one medication. Prefer this over
            medication_name when the caller already knows the id — the name
            filter is a substring match, so 'Pro' also returns Propranolol.
    
    Returns:
        List of medication administration records with related data
    """
    try:
        # Start with base query joining medication log with medication and schedule
        query = db.query(MedicationLog).join(Medication).outerjoin(MedicationSchedule)
        
        # Filter by patient_id
        if patient_id:
            query = query.filter(MedicationLog.patient_id == patient_id)
        
        # Filter to one medication by id (exact; see the docstring on why this
        # is not the same as filtering by name). Explicit None check rather
        # than truthiness — the parameter is Optional[int], and "not provided"
        # is the only case that should skip the filter.
        if medication_id is not None:
            query = query.filter(MedicationLog.medication_id == medication_id)

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
                # Now that administer paths write it, surface it — the dose
                # detail pane shows who gave each dose.
                'administered_by': log.administered_by,
                'notes': log.notes,
                'patient_id': log.patient_id,
                'schedule_id': log.schedule_id,
                'schedule_description': log.schedule.description if log.schedule else None
            })
        
        return result

    except Exception as e:
        logger.error(f"Error getting medication history: {e}")
        return []


def estimate_daily_consumption(db: Session, medication_id: int) -> float:
    """Average dose units consumed per day across a med's active schedules,
    projected over the next 7 days via croniter (so weekly patterns like
    Mon/Wed/Fri average out correctly). Returns 0 if nothing is scheduled."""
    schedules = db.query(MedicationSchedule).filter(
        MedicationSchedule.medication_id == medication_id,
        MedicationSchedule.active == True  # noqa: E712
    ).all()

    now = utc_now()
    horizon = now + timedelta(days=7)
    total = 0.0
    for schedule in schedules:
        dose = float(schedule.dose_amount or 0)
        if dose <= 0:
            continue
        try:
            cron = croniter(schedule.cron_expression, now)
            occurrence = cron.get_next(type(now))
            while occurrence < horizon:
                total += dose
                occurrence = cron.get_next(type(now))
        except Exception as e:
            logger.warning(f"Skipping bad cron '{schedule.cron_expression}' on schedule {schedule.id}: {e}")
    return total / 7


def get_medication_stock_status(db: Session, med: Medication) -> dict:
    """Single source of truth for "is this medication low on stock", shared by
    the low-stock Messages generator (crud/user_messages.py) and the admin
    medications list endpoints, so alerts and UI always agree.

    threshold_type 'quantity' compares the raw on-hand amount; 'days' projects
    days of supply left from the med's active schedules and compares against
    the threshold in days (meds with no scheduled consumption can't be
    projected, so days_left is None and low stays False for them).
    """
    threshold = med.low_stock_threshold
    threshold_type = med.low_stock_threshold_type or 'quantity'
    quantity = float(med.quantity) if med.quantity is not None else 0.0
    out_of_stock = quantity <= 0

    low = False
    days_left = None
    daily_rate = None
    if not out_of_stock and threshold is not None:
        if threshold_type == 'days':
            daily_rate = estimate_daily_consumption(db, med.id)
            if daily_rate > 0:
                days_left = quantity / daily_rate
                low = days_left <= float(threshold)
        else:
            low = quantity <= float(threshold)

    return {
        'out_of_stock': out_of_stock,
        'low': out_of_stock or low,
        'days_left': round(days_left, 1) if days_left is not None else None,
        'daily_rate': daily_rate,
    }
