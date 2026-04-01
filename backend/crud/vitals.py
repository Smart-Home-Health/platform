"""
Core vital signs and sensor data CRUD operations
"""
import logging
import pytz
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from schemas.vital import Vital
from schemas.pulse_ox_data import PulseOxData
from crud.patients import get_or_create_default_patient, get_current_patient

logger = logging.getLogger('crud')


# --- Generic Vital CRUD ---
def save_vital(db: Session, vital_type, value, timestamp=None, notes=None, vital_group=None, patient_id=None):
    """
    Save a generic vital reading to database (Postgres)
    """
    now = datetime.now(timezone.utc)
    ts = timestamp or now
    
    # Get patient_id if not provided
    if patient_id is None:
        patient = get_or_create_default_patient(db)
        if not patient:
            logger.warning("No patient exists, cannot save vital")
            return None
        patient_id = patient.id
    
    # Ensure timestamp is timezone-aware (convert to UTC if naive)
    if ts and hasattr(ts, 'tzinfo') and ts.tzinfo is None:
        # Assume naive datetime is in local timezone and convert to UTC
        eastern = pytz.timezone('US/Eastern')
        ts = eastern.localize(ts).astimezone(timezone.utc)
    elif isinstance(ts, str):
        # Parse string timestamp and ensure it's UTC
        try:
            ts = datetime.fromisoformat(ts.replace('Z', '+00:00'))
        except:
            ts = now
    
    vital = Vital(
        patient_id=patient_id,
        timestamp=ts,
        vital_type=vital_type,
        value=value,
        notes=notes,
        vital_group=vital_group,
        created_at=now
    )
    db.add(vital)
    db.commit()
    db.refresh(vital)
    logger.info(f"Vital saved for patient {patient_id}: {vital_type}={value}, group={vital_group}")
    return vital.id


def save_blood_pressure(db: Session, systolic, diastolic, map_value=None, timestamp=None, notes=None, patient_id=None):
    """
    Save blood pressure reading as individual vital entries
    """
    vital_ids = []
    
    # Get patient_id if not provided
    if patient_id is None:
        patient = get_or_create_default_patient(db)
        if not patient:
            logger.warning("No patient exists, cannot save blood pressure as vitals")
            return []
        patient_id = patient.id
    
    # Calculate MAP if not provided
    if map_value is None and systolic and diastolic:
        map_value = round(diastolic + (systolic - diastolic) / 3)
    
    # Save systolic
    if systolic is not None:
        systolic_id = save_vital(db, 'blood_pressure', systolic, timestamp, notes, 'systolic', patient_id)
        vital_ids.append(systolic_id)
    
    # Save diastolic  
    if diastolic is not None:
        diastolic_id = save_vital(db, 'blood_pressure', diastolic, timestamp, notes, 'diastolic', patient_id)
        vital_ids.append(diastolic_id)
    
    # Save MAP
    if map_value is not None:
        map_id = save_vital(db, 'blood_pressure', map_value, timestamp, notes, 'map', patient_id)
        vital_ids.append(map_id)
    
    return vital_ids


def save_temperature(db: Session, body_temp=None, skin_temp=None, timestamp=None, notes=None, patient_id=None):
    """
    Save temperature readings as individual vital entries
    """
    vital_ids = []
    
    # Get patient_id if not provided
    if patient_id is None:
        patient = get_or_create_default_patient(db)
        if not patient:
            logger.warning("No patient exists, cannot save temperature as vitals")
            return []
        patient_id = patient.id
    
    # Save body temperature
    if body_temp is not None:
        body_id = save_vital(db, 'temperature', body_temp, timestamp, notes, 'body', patient_id)
        vital_ids.append(body_id)
    
    # Save skin temperature
    if skin_temp is not None:
        skin_id = save_vital(db, 'temperature', skin_temp, timestamp, notes, 'skin', patient_id)
        vital_ids.append(skin_id)
    
    return vital_ids


def get_distinct_vital_types(db: Session):
    logger.info(f"DB connection: {db.bind.url}")
    logger.info("Fetching distinct vital types...")
    types = db.query(Vital.vital_type).filter(Vital.vital_type.isnot(None)).filter(Vital.vital_type != '').distinct().all()
    logger.info(f"Distinct vital types fetched: {types}")
    return [t[0] for t in types]


def get_vitals_by_type_paginated(db: Session, vital_type, page=1, page_size=20):
    """
    Get paginated history of a specific vital type
    """
    query = db.query(Vital).filter(Vital.vital_type == vital_type)
    total = query.count()
    records = query.order_by(Vital.timestamp.desc()).offset((page-1)*page_size).limit(page_size).all()
    total_pages = (total + page_size - 1) // page_size
    return {
        'records': [
            {
                'datetime': v.timestamp,
                'value': v.value,
                'notes': v.notes,
                'vital_group': v.vital_group
            } for v in records
        ],
        'total': total,
        'page': page,
        'page_size': page_size,
        'total_pages': total_pages
    }


def get_vitals_by_type(db: Session, vital_type, limit=100):
    """
    Get history of a specific vital type

    Args:
        vital_type (str): Type of vital (weight, calories, water, etc.)
        limit (int): Maximum number of records to return

    Returns:
        list: List of dictionaries containing readings
    """
    try:
        results = db.query(Vital).filter(Vital.vital_type == vital_type).order_by(Vital.timestamp.desc()).limit(limit).all()

        # For multi-value vitals like blood_pressure and temperature, group by timestamp
        if vital_type in ['blood_pressure', 'temperature']:
            return _group_multi_value_vitals(results, vital_type)
        
        # For single-value vitals
        return [
            {
                'datetime': row.timestamp,
                'value': row.value,
                'notes': row.notes,
                'vital_group': row.vital_group
            }
            for row in results
        ]
    except Exception as e:
        logger.error(f"Error fetching {vital_type} history: {e}")
        return []


def _group_multi_value_vitals(results, vital_type):
    """
    Group multi-value vitals by timestamp to create combined entries.
    Accepts both ORM objects and dict-like items (e.g. from alternate query paths).
    """
    from collections import defaultdict

    def _ts(v):
        return v.timestamp if hasattr(v, "timestamp") else v.get("timestamp") if isinstance(v, dict) else None

    def _get(v, key, default=None):
        return getattr(v, key, default) if not isinstance(v, dict) else v.get(key, default)

    grouped = defaultdict(dict)

    for vital in results:
        ts_key = _ts(vital)
        if ts_key is None:
            continue
        if ts_key not in grouped:
            grouped[ts_key] = {
                "datetime": ts_key,
                "notes": _get(vital, "notes"),
            }
        if vital_type == "blood_pressure":
            grp = _get(vital, "vital_group")
            val = _get(vital, "value")
            if val is not None:
                try:
                    val = int(val)
                except (TypeError, ValueError):
                    pass
            if grp == "systolic":
                grouped[ts_key]["systolic"] = val
            elif grp == "diastolic":
                grouped[ts_key]["diastolic"] = val
            elif grp == "map":
                grouped[ts_key]["map"] = val
        elif vital_type == "temperature":
            grp = _get(vital, "vital_group")
            val = _get(vital, "value")
            if grp == "body":
                grouped[ts_key]["body"] = val
            elif grp == "skin":
                grouped[ts_key]["skin"] = val

    result = list(grouped.values())
    result.sort(key=lambda x: x["datetime"] if x.get("datetime") is not None else "", reverse=True)
    return result


# --- Pulse Oximeter CRUD ---
def save_pulse_ox_data(db: Session, spo2, bpm, pa, status=None, motion=None, spo2_alarm=None, hr_alarm=None, raw_data=None, timestamp=None, patient_id=None):
    """
    Save pulse oximeter reading to database

    Args:
        spo2 (int): Blood oxygen level
        bpm (int): Pulse rate
        pa (float): Perfusion index
        status (str): Device status
        motion (str): Motion detection ("ON" or "OFF")
        spo2_alarm (str): SpO2 alarm status ("ON" or "OFF")
        hr_alarm (str): Heart rate alarm status ("ON" or "OFF")
        raw_data (str): Raw data string received from sensor
        timestamp (str): Optional ISO timestamp, defaults to now if not provided
        patient_id (int): Patient ID, creates default if not provided

    Returns:
        int: ID of the inserted record or None on error
    """
    try:
        now = datetime.now().isoformat()
        ts = timestamp or now  # Use provided timestamp or current time
        
        # Get patient_id if not provided
        if patient_id is None:
            patient = get_current_patient(db)
            if not patient:
                patient = get_or_create_default_patient(db)
            if not patient:
                logger.warning("No patient exists, cannot save pulse ox data")
                return None
            patient_id = patient.id

        pulse_ox = PulseOxData(
            patient_id=patient_id,
            timestamp=ts,
            spo2=spo2,
            bpm=bpm,
            pa=pa,
            status=status,
            motion=motion,
            spo2_alarm=spo2_alarm,
            hr_alarm=hr_alarm,
            raw_data=raw_data,
            created_at=now
        )

        db.add(pulse_ox)
        db.commit()
        db.refresh(pulse_ox)
        logger.info(f"Pulse ox data saved: SpO2: {spo2}%, BPM: {bpm}, PA: {pa}")
        return pulse_ox.id
    except Exception as e:
        logger.error(f"Error saving pulse ox data: {e}")
        return None


def save_pulse_ox_batch(db: Session, data_points):
    """
    Save a batch of pulse oximeter readings to database

    Args:
        db (Session): Database session
        data_points (list): List of pulse ox data dictionaries

    Returns:
        bool: True if successful, False otherwise
    """
    try:
        now = datetime.now().isoformat()

        # Resolve patient_id once for the batch
        patient = get_current_patient(db)
        batch_patient_id = patient.id if patient else None

        for data_point in data_points:
            pid = data_point.get('patient_id') or batch_patient_id
            pulse_ox = PulseOxData(
                patient_id=pid,
                timestamp=data_point.get('timestamp', now),
                spo2=data_point.get('spo2'),
                bpm=data_point.get('bpm'),
                pa=data_point.get('pa'),
                status=data_point.get('status'),
                motion=data_point.get('motion'),
                spo2_alarm=data_point.get('spo2_alarm'),
                hr_alarm=data_point.get('hr_alarm'),
                raw_data=data_point.get('raw_data'),
                created_at=now
            )
            db.add(pulse_ox)
        
        db.commit()
        logger.info(f"Batch saved {len(data_points)} pulse ox readings")
        return True
    except Exception as e:
        logger.error(f"Error saving pulse ox batch: {e}")
        db.rollback()
        return False


def get_pulse_ox_data_by_date(db: Session, date_str, patient_id=None):
    """
    Get all pulse ox data for a specific date

    Args:
        db (Session): Database session
        date_str (str): Date string in YYYY-MM-DD format
        patient_id (int, optional): If set, filter to this patient only

    Returns:
        list: List of pulse ox readings for the date
    """
    try:
        # Parse the date and create start/end datetime objects
        from datetime import datetime, time
        date_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
        start_datetime = datetime.combine(date_obj, time.min)
        end_datetime = datetime.combine(date_obj, time.max)
        
        query = db.query(PulseOxData).filter(
            PulseOxData.timestamp >= start_datetime,
            PulseOxData.timestamp <= end_datetime
        )
        if patient_id is not None:
            query = query.filter(PulseOxData.patient_id == patient_id)
        data = query.order_by(PulseOxData.timestamp.asc()).all()
        
        return data
    except Exception as e:
        logger.error(f"Error getting pulse ox data for date {date_str}: {e}")
        return []


def analyze_pulse_ox_day(db: Session, date_str, patient_id=None):
    """
    Analyze pulse ox data for a specific day and return SpO2 distribution

    Args:
        db (Session): Database session
        date_str (str): Date string in YYYY-MM-DD format
        patient_id (int, optional): If set, restrict to this patient only

    Returns:
        dict: Analysis results including time logged, SpO2 distribution, etc.
    """
    try:
        data = get_pulse_ox_data_by_date(db, date_str, patient_id=patient_id)
        
        if not data:
            return {
                'date': date_str,
                'total_readings': 0,
                'time_logged_minutes': 0,
                'spo2_distribution': {}
            }
        
        # Filter out None values, 0 values, and -1 values (sensor errors)
        valid_spo2_readings = [reading for reading in data if reading.spo2 is not None and reading.spo2 > 0]
        valid_bpm_readings = [reading for reading in data if reading.bpm is not None and reading.bpm > 0]
        
        # Count zero/error readings for reporting
        error_spo2_readings = [reading for reading in data if reading.spo2 is not None and reading.spo2 <= 0]
        error_bpm_readings = [reading for reading in data if reading.bpm is not None and reading.bpm <= 0]
        
        # Calculate time logged (assume readings every ~5 seconds, so multiply by 5 and convert to minutes)
        time_logged_minutes = (len(data) * 5) / 60
        
        # Categorize SpO2 readings - Full breakdown
        spo2_distribution = {
            'high_90s_97_plus': 0,
            'mid_90s_94_96': 0,
            'low_90s_90_93': 0,
            'high_eighties_85_89': 0,
            'low_eighties_80_84': 0,
            'seventies_70_79': 0,
            'sixties_60_69': 0,
            'fifties_50_59': 0,
            'forties_40_49': 0,
            'thirties_30_39': 0,
            'twenties_20_29': 0,
            'below_twenty': 0,
            'zero_errors': 0
        }
        
        for reading in valid_spo2_readings:
            spo2 = reading.spo2
            if spo2 >= 97:
                spo2_distribution['high_90s_97_plus'] += 1
            elif spo2 >= 94:
                spo2_distribution['mid_90s_94_96'] += 1
            elif spo2 >= 90:
                spo2_distribution['low_90s_90_93'] += 1
            elif spo2 >= 85:
                spo2_distribution['high_eighties_85_89'] += 1
            elif spo2 >= 80:
                spo2_distribution['low_eighties_80_84'] += 1
            elif spo2 >= 70:
                spo2_distribution['seventies_70_79'] += 1
            elif spo2 >= 60:
                spo2_distribution['sixties_60_69'] += 1
            elif spo2 >= 50:
                spo2_distribution['fifties_50_59'] += 1
            elif spo2 >= 40:
                spo2_distribution['forties_40_49'] += 1
            elif spo2 >= 30:
                spo2_distribution['thirties_30_39'] += 1
            elif spo2 >= 20:
                spo2_distribution['twenties_20_29'] += 1
            else:
                spo2_distribution['below_twenty'] += 1
        
        # Count zero/error readings separately
        spo2_distribution['zero_errors'] = len(error_spo2_readings)
        
        # Convert counts to objects with count and percentage
        total_all_readings = len(valid_spo2_readings) + len(error_spo2_readings)
        distribution_with_details = {}
        if total_all_readings > 0:
            for key, count in spo2_distribution.items():
                distribution_with_details[key] = {
                    'count': count,
                    'percentage': round((count / total_all_readings) * 100, 1)
                }
        else:
            for key, count in spo2_distribution.items():
                distribution_with_details[key] = {
                    'count': count,
                    'percentage': 0
                }
        
        # Calculate basic statistics (excluding zero/error readings for averages)
        spo2_values = [r.spo2 for r in valid_spo2_readings]
        bpm_values = [r.bpm for r in valid_bpm_readings]
        
        result = {
            'date': date_str,
            'total_readings': len(data),
            'valid_spo2_readings': len(valid_spo2_readings),
            'valid_bpm_readings': len(valid_bpm_readings),
            'error_spo2_readings': len(error_spo2_readings),
            'error_bpm_readings': len(error_bpm_readings),
            'time_logged_minutes': round(time_logged_minutes, 1) if time_logged_minutes else 0,
            'time_logged_hours': round(time_logged_minutes / 60, 2) if time_logged_minutes else 0,
            'spo2_distribution': distribution_with_details,
            'avg_spo2': round(sum(spo2_values) / len(spo2_values), 1) if spo2_values else None,
            'min_spo2': min(spo2_values) if spo2_values else None,
            'max_spo2': max(spo2_values) if spo2_values else None,
            'avg_bpm': round(sum(bpm_values) / len(bpm_values), 1) if bpm_values else None,
            'min_bpm': min(bpm_values) if bpm_values else None,
            'max_bpm': max(bpm_values) if bpm_values else None
        }
        
        return result
        
    except Exception as e:
        logger.error(f"Error analyzing pulse ox data for date {date_str}: {e}")
        return {
            'date': date_str,
            'error': str(e),
            'total_readings': 0,
            'time_logged_minutes': 0,
            'spo2_distribution': {}
        }


def get_available_pulse_ox_dates(db: Session, limit=30):
    """
    Get list of dates that have pulse ox data

    Args:
        db (Session): Database session
        limit (int): Maximum number of dates to return

    Returns:
        dict: Dict with list of dates that have pulse ox data
    """
    try:
        from sqlalchemy import func, distinct
        
        # Get distinct dates from pulse ox data
        dates = db.query(
            func.date(PulseOxData.timestamp).label('date')
        ).distinct().order_by(
            func.date(PulseOxData.timestamp).desc()
        ).limit(limit).all()
        
        return {'dates': [date.date.strftime('%Y-%m-%d') for date in dates]}
        
    except Exception as e:
        logger.error(f"Error getting available pulse ox dates: {e}")
        return {'dates': []}
