"""
Monitoring and alerts CRUD operations
"""
import logging
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc, and_, or_
from schemas.vital import Vital
from schemas.blood_pressure import BloodPressure
from schemas.temperature import Temperature
from schemas.pulse_ox_data import PulseOxData
from schemas.setting import Setting
from schemas.monitoring_alert import MonitoringAlert

logger = logging.getLogger('crud')


def get_monitoring_alerts(db: Session, limit=50, include_acknowledged=False, detailed=False, patient_id=None):
    """
    Get monitoring alert history

    Args:
        limit (int): Maximum number of alerts to return
        include_acknowledged (bool): Whether to include acknowledged alerts
        detailed (bool): Whether to include detailed pulse ox data
        patient_id (int, optional): If set, filter to this patient only

    Returns:
        list: List of alert records
    """
    try:
        query = db.query(MonitoringAlert)

        if not include_acknowledged:
            query = query.filter(MonitoringAlert.acknowledged == False)

        if patient_id is not None:
            query = query.filter(MonitoringAlert.patient_id == patient_id)

        query = query.order_by(MonitoringAlert.start_time.desc()).limit(limit)

        results = query.all()
        alerts = []

        for row in results:
            alert = {
                'id': row.id,
                'start_time': row.start_time,
                'end_time': row.end_time,
                'start_data_id': row.start_data_id,
                'end_data_id': row.end_data_id,
                'spo2_min': row.spo2_min,
                'spo2_max': row.spo2_max,
                'bpm_min': row.bpm_min,
                'bpm_max': row.bpm_max,
                'spo2_alarm_triggered': row.spo2_alarm_triggered,
                'hr_alarm_triggered': row.hr_alarm_triggered,
                'external_alarm_triggered': row.external_alarm_triggered,
                'oxygen_used': row.oxygen_used,
                'oxygen_highest': row.oxygen_highest,
                'oxygen_unit': row.oxygen_unit,
                'acknowledged': row.acknowledged,
                'created_at': row.created_at
            }

            if detailed and row.start_data_id:
                # Get all pulse ox data between start and end
                data_query = db.query(PulseOxData).filter(
                    PulseOxData.id >= row.start_data_id,
                    (row.end_data_id is None) | (PulseOxData.id <= row.end_data_id)
                ).order_by(PulseOxData.timestamp.asc())

                data_results = data_query.all()
                alert['data_points'] = [
                    {
                        'id': data_row.id,
                        'timestamp': data_row.timestamp,
                        'spo2': data_row.spo2,
                        'bpm': data_row.bpm,
                        'pa': data_row.pa,
                        'status': data_row.status,
                        'motion': data_row.motion,
                        'spo2_alarm': data_row.spo2_alarm == 'ON',
                        'hr_alarm': data_row.hr_alarm == 'ON',
                        'perfusion': data_row.pa  # Rename pa to perfusion
                    }
                    for data_row in data_results
                ]

            alerts.append(alert)

        return alerts
    except Exception as e:
        logger.error(f"Error fetching monitoring alerts: {e}")
        return []


def get_unacknowledged_alerts_count(db: Session):
    """
    Get count of unacknowledged alerts

    Returns:
        int: Number of unacknowledged alerts
    """
    try:
        count = db.query(MonitoringAlert).filter(MonitoringAlert.acknowledged == False).count()
        return count
    except Exception as e:
        logger.error(f"Error getting unacknowledged alert count: {e}")
        db.rollback()  # Rollback the transaction on error
        return 0


def get_active_ventilator_alerts_count(db: Session):
    """
    Get count of active ventilator alerts
    Note: This is a placeholder function as VentilatorAlert model may not be fully implemented
    
    Returns:
        int: Number of active ventilator alerts (currently returns 0)
    """
    try:
        # Placeholder implementation - would need VentilatorAlert model to be properly implemented
        # For now, return 0 to prevent import errors
        return 0
    except Exception as e:
        logger.error(f"Error getting active ventilator alerts count: {e}")
        return 0


def record_ventilator_alarm(db: Session, device_id, pin):
    """Record a ventilator alarm event in the database"""
    try:
        # Placeholder implementation - would need VentilatorAlert model to be properly implemented
        logger.info(f"Ventilator alarm recorded for device {device_id} on pin {pin}")
        return True
    except Exception as e:
        logger.error(f"Error recording ventilator alarm: {e}")
        return False


def record_external_pulse_ox_alarm(db: Session, device_id, pin):
    """Record an external pulse oximeter alarm event in the database"""
    try:
        # Placeholder implementation - would need ExternalAlarm model to be properly implemented
        logger.info(f"External pulse ox alarm recorded for device {device_id} on pin {pin}")
        return True
    except Exception as e:
        logger.error(f"Error recording external pulse ox alarm: {e}")
        return False


def clear_external_alarm(db: Session, device_id):
    """Close any active external alarms for the given device"""
    try:
        # Placeholder implementation - would need ExternalAlarm model to be properly implemented
        logger.info(f"External alarms cleared for device {device_id}")
        return True
    except Exception as e:
        logger.error(f"Error clearing external alarm: {e}")
        return False


def update_monitoring_alert(db: Session, alert_id, end_time=None, end_data_id=None, spo2=None, bpm=None,
                           spo2_alarm_triggered=None, hr_alarm_triggered=None,
                           external_alarm_triggered=None, oxygen_used=None,
                           oxygen_highest=None, oxygen_unit=None):
    """
    Update an existing monitoring alert

    Args:
        alert_id (int): ID of the alert to update
        end_time (str): End time if alert is completed
        end_data_id (int): ID of the final pulse_ox_data record
        spo2 (int): Current SpO2 reading to update min/max
        bpm (int): Current BPM reading to update min/max
        spo2_alarm_triggered (int): Whether SpO2 alarm was triggered
        hr_alarm_triggered (int): Whether heart rate alarm was triggered
        external_alarm_triggered (int): Whether external alarm was triggered
        oxygen_used (int): Whether oxygen was used
        oxygen_highest (float): Highest oxygen level used
        oxygen_unit (str): Unit of oxygen measurement

    Returns:
        bool: True if successful, False otherwise
    """
    try:
        # First, get current values
        alert = db.query(MonitoringAlert).filter(MonitoringAlert.id == alert_id).first()

        if not alert:
            logger.error(f"Alert ID {alert_id} not found for update")
            return False

        current_spo2_min = alert.spo2_min
        current_spo2_max = alert.spo2_max
        current_bpm_min = alert.bpm_min
        current_bpm_max = alert.bpm_max

        # Calculate new min/max values
        if spo2 is not None:
            if current_spo2_min is None or spo2 < current_spo2_min:
                current_spo2_min = spo2
            if current_spo2_max is None or spo2 > current_spo2_max:
                current_spo2_max = spo2

        if bpm is not None:
            if current_bpm_min is None or bpm < current_bpm_min:
                current_bpm_min = bpm
            if current_bpm_max is None or bpm > current_bpm_max:
                current_bpm_max = bpm

        # Build update query dynamically
        update_fields = {}

        if end_time:
            update_fields[MonitoringAlert.end_time] = end_time

        if end_data_id:
            update_fields[MonitoringAlert.end_data_id] = end_data_id

        if spo2 is not None:
            update_fields[MonitoringAlert.spo2_min] = current_spo2_min
            update_fields[MonitoringAlert.spo2_max] = current_spo2_max

        if bpm is not None:
            update_fields[MonitoringAlert.bpm_min] = current_bpm_min
            update_fields[MonitoringAlert.bpm_max] = current_bpm_max

        if spo2_alarm_triggered is not None:
            update_fields[MonitoringAlert.spo2_alarm_triggered] = spo2_alarm_triggered

        if hr_alarm_triggered is not None:
            update_fields[MonitoringAlert.hr_alarm_triggered] = hr_alarm_triggered

        if external_alarm_triggered is not None:
            update_fields[MonitoringAlert.external_alarm_triggered] = external_alarm_triggered

        if oxygen_used is not None:
            update_fields[MonitoringAlert.oxygen_used] = oxygen_used

        if oxygen_highest is not None:
            update_fields[MonitoringAlert.oxygen_highest] = oxygen_highest

        if oxygen_unit is not None:
            update_fields[MonitoringAlert.oxygen_unit] = oxygen_unit

        if not update_fields:
            logger.warning("No fields to update for alert")
            return True

        db.query(MonitoringAlert).filter(MonitoringAlert.id == alert_id).update(update_fields)
        db.commit()

        logger.info(f"Updated monitoring alert #{alert_id}")
        return True
    except Exception as e:
        logger.error(f"Error updating monitoring alert: {e}")
        return False


def acknowledge_alert(db: Session, alert_id):
    """
    Mark an alert as acknowledged

    Args:
        alert_id (int): ID of the alert to acknowledge

    Returns:
        bool: True if successful, False otherwise
    """
    try:
        result = db.query(MonitoringAlert).filter(MonitoringAlert.id == alert_id).update({
            MonitoringAlert.acknowledged: True
        })
        db.commit()

        success = result > 0
        if success:
            logger.info(f"Alert #{alert_id} acknowledged")
        else:
            logger.warning(f"Alert #{alert_id} not found for acknowledgment")

        return success
    except Exception as e:
        logger.error(f"Error acknowledging alert: {e}")
        return False


def get_pulse_ox_data_for_alert(db: Session, alert_id):
    """
    Get all pulse ox readings associated with an alert event

    Args:
        alert_id: The ID of the alert

    Returns:
        List of pulse ox readings during the alert period
    """
    try:
        # First get the alert to determine the time period
        alert = db.query(MonitoringAlert).filter(MonitoringAlert.id == alert_id).first()

        if not alert:
            return []

        start_time = alert.start_time
        end_time = alert.end_time or datetime.now().isoformat()

        # Get pulse ox data between the start and end times of the alert
        data = db.query(PulseOxData).filter(
            PulseOxData.timestamp >= start_time,
            PulseOxData.timestamp <= end_time
        ).order_by(PulseOxData.timestamp.asc()).all()

        for row in data:
            # Convert spo2_alarm and hr_alarm to booleans
            row.spo2_alarm = row.spo2_alarm == 'ON'
            row.hr_alarm = row.hr_alarm == 'ON'
            # Rename columns for frontend consistency
            row.perfusion = row.pa  # Rename pa to perfusion

        return data
    except Exception as e:
        logger.error(f"Error fetching pulse ox data for alert {alert_id}: {e}")
        return []


def get_pulse_ox_data_by_date(db: Session, date_str, patient_id=None):
    """
    Get all pulse oximeter readings for a specific date
    
    Args:
        date_str: Date in YYYY-MM-DD format
        patient_id (int, optional): If set, filter to this patient only
    
    Returns:
        List of pulse ox readings for that date
    """
    try:
        # Parse the date and create start/end timestamps
        target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        start_datetime = datetime.combine(target_date, datetime.min.time())
        end_datetime = datetime.combine(target_date, datetime.max.time())
        
        # Query for data within the date range
        query = db.query(PulseOxData).filter(
            PulseOxData.timestamp >= start_datetime.isoformat(),
            PulseOxData.timestamp <= end_datetime.isoformat()
        )
        if patient_id is not None:
            query = query.filter(PulseOxData.patient_id == patient_id)
        readings = query.order_by(PulseOxData.timestamp.asc()).all()
        
        logger.info(f"Retrieved {len(readings)} pulse ox readings for {date_str}")
        return readings
        
    except Exception as e:
        logger.error(f"Error getting pulse ox data for date {date_str}: {e}")
        return []


def analyze_pulse_ox_day(db: Session, date_str, patient_id=None):
    """
    Analyze pulse oximeter data for a specific day
    
    Args:
        date_str: Date in YYYY-MM-DD format
        patient_id (int, optional): If set, restrict to this patient only
    
    Returns:
        Dict with analysis results including averages, ranges, alert counts, etc.
    """
    try:
        readings = get_pulse_ox_data_by_date(db, date_str, patient_id=patient_id)
        
        if not readings:
            return {
                'date': date_str,
                'total_readings': 0,
                'analysis': None,
                'message': 'No data available for this date'
            }
        
        # Extract values for analysis, excluding -1 values (sensor errors)
        spo2_values = [r.spo2 for r in readings if r.spo2 is not None and r.spo2 > 0]
        bpm_values = [r.bpm for r in readings if r.bpm is not None and r.bpm > 0]
        pa_values = [r.pa for r in readings if r.pa is not None and r.pa > 0]
        
        # Calculate basic statistics
        spo2_stats = {
            'avg': sum(spo2_values) / len(spo2_values) if spo2_values else 0,
            'min': min(spo2_values) if spo2_values else 0,
            'max': max(spo2_values) if spo2_values else 0,
            'count': len(spo2_values)
        }
        
        bpm_stats = {
            'avg': sum(bpm_values) / len(bpm_values) if bpm_values else 0,
            'min': min(bpm_values) if bpm_values else 0,
            'max': max(bpm_values) if bpm_values else 0,
            'count': len(bpm_values)
        }
        
        pa_stats = {
            'avg': sum(pa_values) / len(pa_values) if pa_values else 0,
            'min': min(pa_values) if pa_values else 0,
            'max': max(pa_values) if pa_values else 0,
            'count': len(pa_values)
        }
        
        # Count alarm conditions (assuming normal ranges)
        spo2_alerts = len([v for v in spo2_values if v < 95 or v > 100])
        bpm_alerts = len([v for v in bpm_values if v < 60 or v > 100])
        
        # Time span analysis
        if readings:
            first_reading = readings[0].timestamp
            last_reading = readings[-1].timestamp
            
            # Convert to datetime if they're strings
            if isinstance(first_reading, str):
                first_reading = datetime.fromisoformat(first_reading)
            if isinstance(last_reading, str):
                last_reading = datetime.fromisoformat(last_reading)
                
            monitoring_duration = (last_reading - first_reading).total_seconds() / 3600  # hours
        else:
            monitoring_duration = 0
        
        return {
            'date': date_str,
            'total_readings': len(readings),
            'monitoring_duration_hours': round(monitoring_duration, 2),
            'spo2': spo2_stats,
            'heart_rate': bpm_stats,
            'perfusion': pa_stats,
            'alerts': {
                'spo2_alerts': spo2_alerts,
                'bpm_alerts': bpm_alerts,
                'total_alerts': spo2_alerts + bpm_alerts
            },
            'data_quality': {
                'readings_per_hour': len(readings) / monitoring_duration if monitoring_duration > 0 else 0,
                'coverage_percent': (monitoring_duration / 24) * 100 if monitoring_duration > 0 else 0
            }
        }
        
    except Exception as e:
        logger.error(f"Error analyzing pulse ox data for {date_str}: {e}")
        return {
            'date': date_str,
            'total_readings': 0,
            'analysis': None,
            'error': str(e)
        }


def get_available_pulse_ox_dates(db: Session, limit=30, patient_id=None):
    """
    Get list of dates that have pulse oximeter data
    
    Args:
        limit: Maximum number of dates to return
        patient_id (int, optional): If set, filter to this patient only
    
    Returns:
        Dict with list of date strings in YYYY-MM-DD format
    """
    try:
        # Get distinct dates from pulse ox data
        from sqlalchemy import func, distinct
        
        # Query for distinct dates using func.date for TIMESTAMP fields
        query = db.query(
            func.date(PulseOxData.timestamp).label('date')
        ).distinct()
        if patient_id is not None:
            query = query.filter(PulseOxData.patient_id == patient_id)
        results = query.order_by(
            func.date(PulseOxData.timestamp).desc()
        ).limit(limit).all()
        
        dates = [result.date.strftime('%Y-%m-%d') if hasattr(result.date, 'strftime') else str(result.date) for result in results]
        logger.info(f"Found {len(dates)} dates with pulse ox data: {dates}")
        return {'dates': dates}
        
    except Exception as e:
        logger.error(f"Error getting available pulse ox dates: {e}")
        return {'dates': []}


def start_monitoring_alert(db: Session, spo2=None, bpm=None, data_id=None, spo2_alarm_triggered=None, hr_alarm_triggered=None, external_alarm_triggered=None, patient_id=None):
    """
    Start a new monitoring alert event

    Args:
        spo2 (int): Initial SpO2 reading
        bpm (int): Initial BPM reading
        data_id (int): ID of the pulse_ox_data record
        spo2_alarm_triggered (int): Whether SpO2 alarm was triggered
        hr_alarm_triggered (int): Whether heart rate alarm was triggered
        external_alarm_triggered (int): Whether external alarm was triggered
        patient_id (int): Patient ID, creates default if not provided

    Returns:
        int: ID of the inserted alert or None on error
    """
    try:
        now = datetime.now().isoformat()
        
        # Get patient_id if not provided
        if patient_id is None:
            from state_manager import ensure_default_patient
            patient_id = ensure_default_patient()

        alert = MonitoringAlert(
            patient_id=patient_id,
            start_time=now,
            start_data_id=data_id,
            spo2_min=spo2,
            spo2_max=spo2,
            bpm_min=bpm,
            bpm_max=bpm,
            spo2_alarm_triggered=spo2_alarm_triggered,
            hr_alarm_triggered=hr_alarm_triggered,
            external_alarm_triggered=external_alarm_triggered,
            created_at=now
        )

        db.add(alert)
        db.commit()
        db.refresh(alert)
        logger.info(f"Started monitoring alert #{alert.id} for patient {patient_id} - SpO2: {spo2}%, BPM: {bpm}")
        return alert.id
    except Exception as e:
        logger.error(f"Error starting monitoring alert: {e}")
        return None


def save_pulse_ox_data(db: Session, spo2, bpm, pa, status=None, motion=None, spo2_alarm=None, hr_alarm=None, raw_data=None, timestamp=None):
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

    Returns:
        int: ID of the inserted record or None on error
    """
    try:
        now = datetime.now().isoformat()
        ts = timestamp or now  # Use provided timestamp or current time

        pulse_ox = PulseOxData(
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


def get_alerts_list(db: Session, limit=25, offset=0, severity_filter=None, vital_type_filter=None, start_date=None, end_date=None):
    """
    Get alerts list with filtering and pagination
    
    Args:
        limit: Maximum number of alerts to return
        offset: Number of alerts to skip (for pagination)
        severity_filter: Filter by severity ('low', 'high', 'critical')
        vital_type_filter: Filter by vital type ('spo2', 'bpm', 'blood_pressure', 'temperature')
        start_date: Filter by start date (YYYY-MM-DD format)
        end_date: Filter by end date (YYYY-MM-DD format)
    
    Returns:
        Dict with alerts list and pagination info
    """
    try:
        alerts = []
        
        # Get threshold settings
        min_spo2 = float(get_setting_value(db, 'MIN_SPO2', 95))
        max_spo2 = float(get_setting_value(db, 'MAX_SPO2', 100))
        min_bpm = float(get_setting_value(db, 'MIN_BPM', 60))
        max_bpm = float(get_setting_value(db, 'MAX_BPM', 100))
        min_temp = float(get_setting_value(db, 'MIN_TEMP', 96.0))
        max_temp = float(get_setting_value(db, 'MAX_TEMP', 99.5))
        max_systolic = float(get_setting_value(db, 'MAX_SYSTOLIC', 140))
        max_diastolic = float(get_setting_value(db, 'MAX_DIASTOLIC', 90))
        min_systolic = float(get_setting_value(db, 'MIN_SYSTOLIC', 90))
        min_diastolic = float(get_setting_value(db, 'MIN_DIASTOLIC', 60))
        
        # Date filtering
        date_filter = []
        if start_date:
            start_dt = datetime.strptime(start_date, '%Y-%m-%d')
            date_filter.append(lambda table: table.created_at >= start_dt)
        if end_date:
            end_dt = datetime.strptime(end_date, '%Y-%m-%d') + timedelta(days=1)
            date_filter.append(lambda table: table.created_at < end_dt)
        
        # Check pulse oximeter readings
        if not vital_type_filter or vital_type_filter in ['spo2', 'bpm']:
            pulse_ox_query = db.query(PulseOxData)
            
            # Apply date filters
            for date_f in date_filter:
                pulse_ox_query = pulse_ox_query.filter(date_f(PulseOxData))
            
            # Add alert conditions
            pulse_ox_alerts = pulse_ox_query.filter(
                or_(
                    PulseOxData.spo2 < min_spo2,
                    PulseOxData.spo2 > max_spo2,
                    PulseOxData.bpm < min_bpm,
                    PulseOxData.bpm > max_bpm
                )
            ).order_by(desc(PulseOxData.created_at)).all()
            
            for reading in pulse_ox_alerts:
                # Determine severity and type
                spo2_severity = None
                bpm_severity = None
                
                if reading.spo2 < min_spo2:
                    if reading.spo2 < min_spo2 - 5:
                        spo2_severity = 'critical'
                    elif reading.spo2 < min_spo2 - 2:
                        spo2_severity = 'high'
                    else:
                        spo2_severity = 'low'
                elif reading.spo2 > max_spo2:
                    spo2_severity = 'low'
                
                if reading.bpm < min_bpm:
                    if reading.bpm < min_bpm - 20:
                        bpm_severity = 'critical'
                    elif reading.bpm < min_bpm - 10:
                        bpm_severity = 'high'
                    else:
                        bpm_severity = 'low'
                elif reading.bpm > max_bpm:
                    if reading.bpm > max_bpm + 30:
                        bpm_severity = 'critical'
                    elif reading.bpm > max_bpm + 15:
                        bpm_severity = 'high'
                    else:
                        bpm_severity = 'low'
                
                # Add SpO2 alert if needed
                if spo2_severity and (not vital_type_filter or vital_type_filter == 'spo2'):
                    if not severity_filter or severity_filter == spo2_severity:
                        alerts.append({
                            'id': f"spo2_{reading.id}",
                            'vital_type': 'spo2',
                            'value': reading.spo2,
                            'threshold_min': min_spo2,
                            'threshold_max': max_spo2,
                            'severity': spo2_severity,
                            'timestamp': reading.created_at.isoformat(),
                            'message': f"SpO2 {reading.spo2}% is {'below' if reading.spo2 < min_spo2 else 'above'} normal range ({min_spo2}-{max_spo2}%)"
                        })
                
                # Add BPM alert if needed
                if bpm_severity and (not vital_type_filter or vital_type_filter == 'bpm'):
                    if not severity_filter or severity_filter == bpm_severity:
                        alerts.append({
                            'id': f"bpm_{reading.id}",
                            'vital_type': 'bpm',
                            'value': reading.bpm,
                            'threshold_min': min_bpm,
                            'threshold_max': max_bpm,
                            'severity': bpm_severity,
                            'timestamp': reading.created_at.isoformat(),
                            'message': f"Heart rate {reading.bpm} BPM is {'below' if reading.bpm < min_bpm else 'above'} normal range ({min_bpm}-{max_bpm} BPM)"
                        })
        
        # Check blood pressure readings
        if not vital_type_filter or vital_type_filter == 'blood_pressure':
            bp_query = db.query(BloodPressure)
            
            # Apply date filters
            for date_f in date_filter:
                bp_query = bp_query.filter(date_f(BloodPressure))
            
            bp_alerts = bp_query.filter(
                or_(
                    BloodPressure.systolic > max_systolic,
                    BloodPressure.diastolic > max_diastolic,
                    BloodPressure.systolic < min_systolic,
                    BloodPressure.diastolic < min_diastolic
                )
            ).order_by(desc(BloodPressure.created_at)).all()
            
            for bp in bp_alerts:
                severity = 'low'
                
                # Determine severity based on how far out of range
                if (bp.systolic > max_systolic + 20 or bp.diastolic > max_diastolic + 15 or
                    bp.systolic < min_systolic - 20 or bp.diastolic < min_diastolic - 15):
                    severity = 'critical'
                elif (bp.systolic > max_systolic + 10 or bp.diastolic > max_diastolic + 10 or
                      bp.systolic < min_systolic - 10 or bp.diastolic < min_diastolic - 10):
                    severity = 'high'
                
                if not severity_filter or severity_filter == severity:
                    # Determine which value(s) are out of range
                    issues = []
                    if bp.systolic > max_systolic:
                        issues.append(f"systolic {bp.systolic} above {max_systolic}")
                    elif bp.systolic < min_systolic:
                        issues.append(f"systolic {bp.systolic} below {min_systolic}")
                    
                    if bp.diastolic > max_diastolic:
                        issues.append(f"diastolic {bp.diastolic} above {max_diastolic}")
                    elif bp.diastolic < min_diastolic:
                        issues.append(f"diastolic {bp.diastolic} below {min_diastolic}")
                    
                    alerts.append({
                        'id': f"bp_{bp.id}",
                        'vital_type': 'blood_pressure',
                        'value': f"{bp.systolic}/{bp.diastolic}",
                        'threshold_min': f"{min_systolic}/{min_diastolic}",
                        'threshold_max': f"{max_systolic}/{max_diastolic}",
                        'severity': severity,
                        'timestamp': bp.created_at.isoformat(),
                        'message': f"Blood pressure {bp.systolic}/{bp.diastolic} mmHg - {', '.join(issues)}"
                    })
        
        # Check temperature readings
        if not vital_type_filter or vital_type_filter == 'temperature':
            temp_query = db.query(Temperature)
            
            # Apply date filters
            for date_f in date_filter:
                temp_query = temp_query.filter(date_f(Temperature))
            
            temp_alerts = temp_query.filter(
                or_(
                    Temperature.temperature < min_temp,
                    Temperature.temperature > max_temp
                )
            ).order_by(desc(Temperature.created_at)).all()
            
            for temp in temp_alerts:
                severity = 'low'
                
                if temp.temperature > max_temp + 2 or temp.temperature < min_temp - 2:
                    severity = 'critical'
                elif temp.temperature > max_temp + 1 or temp.temperature < min_temp - 1:
                    severity = 'high'
                
                if not severity_filter or severity_filter == severity:
                    alerts.append({
                        'id': f"temp_{temp.id}",
                        'vital_type': 'temperature',
                        'value': temp.temperature,
                        'threshold_min': min_temp,
                        'threshold_max': max_temp,
                        'severity': severity,
                        'timestamp': temp.created_at.isoformat(),
                        'message': f"Temperature {temp.temperature}°F is {'below' if temp.temperature < min_temp else 'above'} normal range ({min_temp}-{max_temp}°F)"
                    })
        
        # Sort all alerts by timestamp (most recent first)
        alerts.sort(key=lambda x: x['timestamp'], reverse=True)
        
        # Apply pagination
        total_alerts = len(alerts)
        paginated_alerts = alerts[offset:offset + limit]
        
        return {
            'alerts': paginated_alerts,
            'total_count': total_alerts,
            'limit': limit,
            'offset': offset,
            'has_more': offset + limit < total_alerts
        }
        
    except Exception as e:
        logger.error(f"Error getting alerts list: {e}")
        return {
            'alerts': [],
            'total_count': 0,
            'limit': limit,
            'offset': offset,
            'has_more': False
        }


def get_setting_value(db: Session, key, default=None):
    """
    Helper function to get setting value with default
    """
    try:
        setting = db.query(Setting).filter(Setting.key == key).first()
        if setting:
            return setting.value
        return default
    except Exception:
        return default


def get_alert_summary(db: Session, hours=24):
    """
    Get summary of alerts in the last N hours
    
    Args:
        hours: Number of hours to look back (default 24)
    
    Returns:
        Dict with alert counts by severity and type
    """
    try:
        cutoff_time = datetime.now() - timedelta(hours=hours)
        
        # Get alerts for the time period
        alerts_data = get_alerts_list(
            db, 
            limit=1000,  # Large limit to get all alerts
            start_date=cutoff_time.strftime('%Y-%m-%d')
        )
        
        alerts = alerts_data['alerts']
        
        # Count by severity
        severity_counts = {
            'critical': 0,
            'high': 0,
            'low': 0
        }
        
        # Count by vital type
        type_counts = {
            'spo2': 0,
            'bpm': 0,
            'blood_pressure': 0,
            'temperature': 0
        }
        
        for alert in alerts:
            # Filter by time more precisely (since we used date filtering above)
            alert_time = datetime.fromisoformat(alert['timestamp'])
            if alert_time >= cutoff_time:
                severity_counts[alert['severity']] += 1
                type_counts[alert['vital_type']] += 1
        
        total_alerts = sum(severity_counts.values())
        
        return {
            'total_alerts': total_alerts,
            'time_period_hours': hours,
            'by_severity': severity_counts,
            'by_type': type_counts,
            'generated_at': datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error getting alert summary: {e}")
        return {
            'total_alerts': 0,
            'time_period_hours': hours,
            'by_severity': {'critical': 0, 'high': 0, 'low': 0},
            'by_type': {'spo2': 0, 'bpm': 0, 'blood_pressure': 0, 'temperature': 0},
            'generated_at': datetime.now().isoformat()
        }


def get_active_alerts_count(db: Session):
    """
    Get count of active/recent alerts (last 2 hours)
    """
    try:
        cutoff_time = datetime.now() - timedelta(hours=2)
        
        alerts_data = get_alerts_list(
            db,
            limit=1000,
            start_date=cutoff_time.strftime('%Y-%m-%d')
        )
        
        # Filter to only alerts from last 2 hours
        recent_alerts = []
        for alert in alerts_data['alerts']:
            alert_time = datetime.fromisoformat(alert['timestamp'])
            if alert_time >= cutoff_time:
                recent_alerts.append(alert)
        
        return len(recent_alerts)
        
    except Exception as e:
        logger.error(f"Error getting active alerts count: {e}")
        return 0


def get_monitoring_dashboard_data(db: Session):
    """
    Get comprehensive monitoring dashboard data
    
    Returns:
        Dict with current vital status, recent trends, and alert summaries
    """
    try:
        now = datetime.now()
        
        # Get latest readings for each vital type
        latest_pulse_ox = db.query(PulseOxData).order_by(desc(PulseOxData.created_at)).first()
        latest_bp = db.query(BloodPressure).order_by(desc(BloodPressure.created_at)).first()
        latest_temp = db.query(Temperature).order_by(desc(Temperature.created_at)).first()
        latest_vital = db.query(Vital).order_by(desc(Vital.created_at)).first()
        
        # Get thresholds
        min_spo2 = float(get_setting_value(db, 'MIN_SPO2', 95))
        max_spo2 = float(get_setting_value(db, 'MAX_SPO2', 100))
        min_bpm = float(get_setting_value(db, 'MIN_BPM', 60))
        max_bpm = float(get_setting_value(db, 'MAX_BPM', 100))
        min_temp = float(get_setting_value(db, 'MIN_TEMP', 96.0))
        max_temp = float(get_setting_value(db, 'MAX_TEMP', 99.5))
        max_systolic = float(get_setting_value(db, 'MAX_SYSTOLIC', 140))
        max_diastolic = float(get_setting_value(db, 'MAX_DIASTOLIC', 90))
        min_systolic = float(get_setting_value(db, 'MIN_SYSTOLIC', 90))
        min_diastolic = float(get_setting_value(db, 'MIN_DIASTOLIC', 60))
        
        # Determine status for each vital
        def get_vital_status(value, min_val, max_val):
            if min_val <= value <= max_val:
                return 'normal'
            elif value < min_val - (min_val * 0.1) or value > max_val + (max_val * 0.1):
                return 'critical'
            else:
                return 'warning'
        
        current_vitals = {
            'spo2': {
                'value': latest_pulse_ox.spo2 if latest_pulse_ox else None,
                'status': get_vital_status(latest_pulse_ox.spo2, min_spo2, max_spo2) if latest_pulse_ox else 'no_data',
                'timestamp': latest_pulse_ox.created_at.isoformat() if latest_pulse_ox else None,
                'unit': '%'
            },
            'heart_rate': {
                'value': latest_pulse_ox.bpm if latest_pulse_ox else None,
                'status': get_vital_status(latest_pulse_ox.bpm, min_bpm, max_bpm) if latest_pulse_ox else 'no_data',
                'timestamp': latest_pulse_ox.created_at.isoformat() if latest_pulse_ox else None,
                'unit': 'BPM'
            },
            'blood_pressure': {
                'value': f"{latest_bp.systolic}/{latest_bp.diastolic}" if latest_bp else None,
                'systolic': latest_bp.systolic if latest_bp else None,
                'diastolic': latest_bp.diastolic if latest_bp else None,
                'status': 'normal' if latest_bp and (min_systolic <= latest_bp.systolic <= max_systolic and min_diastolic <= latest_bp.diastolic <= max_diastolic) else ('warning' if latest_bp else 'no_data'),
                'timestamp': latest_bp.created_at.isoformat() if latest_bp else None,
                'unit': 'mmHg'
            },
            'temperature': {
                'value': latest_temp.temperature if latest_temp else None,
                'status': get_vital_status(latest_temp.temperature, min_temp, max_temp) if latest_temp else 'no_data',
                'timestamp': latest_temp.created_at.isoformat() if latest_temp else None,
                'unit': '°F'
            }
        }
        
        # Get recent trends (last 6 hours)
        six_hours_ago = now - timedelta(hours=6)
        
        recent_pulse_ox = db.query(PulseOxData).filter(
            PulseOxData.created_at >= six_hours_ago
        ).order_by(PulseOxData.created_at).all()
        
        recent_bp = db.query(BloodPressure).filter(
            BloodPressure.created_at >= six_hours_ago
        ).order_by(BloodPressure.created_at).all()
        
        recent_temp = db.query(Temperature).filter(
            Temperature.created_at >= six_hours_ago
        ).order_by(Temperature.created_at).all()
        
        trends = {
            'spo2': [{'timestamp': r.created_at.isoformat(), 'value': r.spo2} for r in recent_pulse_ox],
            'heart_rate': [{'timestamp': r.created_at.isoformat(), 'value': r.bpm} for r in recent_pulse_ox],
            'blood_pressure_systolic': [{'timestamp': r.created_at.isoformat(), 'value': r.systolic} for r in recent_bp],
            'blood_pressure_diastolic': [{'timestamp': r.created_at.isoformat(), 'value': r.diastolic} for r in recent_bp],
            'temperature': [{'timestamp': r.created_at.isoformat(), 'value': r.temperature} for r in recent_temp]
        }
        
        # Get alert summary
        alert_summary = get_alert_summary(db, 24)
        active_alerts_count = get_active_alerts_count(db)
        
        # Overall system status
        critical_vitals = sum(1 for vital in current_vitals.values() if vital['status'] == 'critical')
        warning_vitals = sum(1 for vital in current_vitals.values() if vital['status'] == 'warning')
        
        if critical_vitals > 0 or active_alerts_count > 0:
            system_status = 'critical'
        elif warning_vitals > 0:
            system_status = 'warning'
        else:
            system_status = 'normal'
        
        return {
            'system_status': system_status,
            'current_vitals': current_vitals,
            'trends': trends,
            'alert_summary': alert_summary,
            'active_alerts_count': active_alerts_count,
            'data_freshness': {
                'pulse_ox_age_minutes': (now - latest_pulse_ox.created_at).total_seconds() / 60 if latest_pulse_ox else None,
                'bp_age_minutes': (now - latest_bp.created_at).total_seconds() / 60 if latest_bp else None,
                'temp_age_minutes': (now - latest_temp.created_at).total_seconds() / 60 if latest_temp else None
            },
            'generated_at': now.isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error getting monitoring dashboard data: {e}")
        return {
            'system_status': 'error',
            'current_vitals': {},
            'trends': {},
            'alert_summary': {'total_alerts': 0},
            'active_alerts_count': 0,
            'data_freshness': {},
            'generated_at': datetime.now().isoformat()
        }


def get_vital_history_for_monitoring(db: Session, vital_type, hours=24, limit=100):
    """
    Get vital sign history for monitoring charts
    
    Args:
        vital_type: Type of vital ('spo2', 'bpm', 'blood_pressure', 'temperature')
        hours: Number of hours to look back
        limit: Maximum number of data points
    
    Returns:
        List of data points with timestamps and values
    """
    try:
        cutoff_time = datetime.now() - timedelta(hours=hours)
        
        if vital_type == 'spo2':
            readings = db.query(PulseOxData).filter(
                PulseOxData.created_at >= cutoff_time
            ).order_by(desc(PulseOxData.created_at)).limit(limit).all()
            
            return [
                {
                    'timestamp': r.created_at.isoformat(),
                    'value': r.spo2,
                    'unit': '%'
                }
                for r in reversed(readings)
            ]
        
        elif vital_type == 'bpm':
            readings = db.query(PulseOxData).filter(
                PulseOxData.created_at >= cutoff_time
            ).order_by(desc(PulseOxData.created_at)).limit(limit).all()
            
            return [
                {
                    'timestamp': r.created_at.isoformat(),
                    'value': r.bpm,
                    'unit': 'BPM'
                }
                for r in reversed(readings)
            ]
        
        elif vital_type == 'blood_pressure':
            readings = db.query(BloodPressure).filter(
                BloodPressure.created_at >= cutoff_time
            ).order_by(desc(BloodPressure.created_at)).limit(limit).all()
            
            return [
                {
                    'timestamp': r.created_at.isoformat(),
                    'systolic': r.systolic,
                    'diastolic': r.diastolic,
                    'unit': 'mmHg'
                }
                for r in reversed(readings)
            ]
        
        elif vital_type == 'temperature':
            readings = db.query(Temperature).filter(
                Temperature.created_at >= cutoff_time
            ).order_by(desc(Temperature.created_at)).limit(limit).all()
            
            return [
                {
                    'timestamp': r.created_at.isoformat(),
                    'value': r.temperature,
                    'unit': '°F'
                }
                for r in reversed(readings)
            ]
        
        else:
            return []
            
    except Exception as e:
        logger.error(f"Error getting vital history for monitoring: {e}")
        return []


def check_system_health(db: Session):
    """
    Check overall system health status
    
    Returns:
        Dict with system health indicators
    """
    try:
        now = datetime.now()
        
        # Check data freshness
        latest_pulse_ox = db.query(PulseOxData).order_by(desc(PulseOxData.created_at)).first()
        latest_bp = db.query(BloodPressure).order_by(desc(BloodPressure.created_at)).first()
        latest_temp = db.query(Temperature).order_by(desc(Temperature.created_at)).first()
        
        data_freshness = {
            'pulse_ox_minutes_ago': (now - latest_pulse_ox.created_at).total_seconds() / 60 if latest_pulse_ox else None,
            'bp_minutes_ago': (now - latest_bp.created_at).total_seconds() / 60 if latest_bp else None,
            'temp_minutes_ago': (now - latest_temp.created_at).total_seconds() / 60 if latest_temp else None
        }
        
        # Check for stale data (no readings in last 30 minutes)
        stale_data_threshold = 30  # minutes
        data_warnings = []
        
        if data_freshness['pulse_ox_minutes_ago'] and data_freshness['pulse_ox_minutes_ago'] > stale_data_threshold:
            data_warnings.append(f"Pulse oximeter data is {int(data_freshness['pulse_ox_minutes_ago'])} minutes old")
        
        if data_freshness['bp_minutes_ago'] and data_freshness['bp_minutes_ago'] > stale_data_threshold:
            data_warnings.append(f"Blood pressure data is {int(data_freshness['bp_minutes_ago'])} minutes old")
        
        if data_freshness['temp_minutes_ago'] and data_freshness['temp_minutes_ago'] > stale_data_threshold:
            data_warnings.append(f"Temperature data is {int(data_freshness['temp_minutes_ago'])} minutes old")
        
        # Get active alerts
        active_alerts = get_active_alerts_count(db)
        
        # Determine overall health status
        if active_alerts > 0:
            health_status = 'critical'
            health_message = f"{active_alerts} active alert(s)"
        elif data_warnings:
            health_status = 'warning'
            health_message = f"Data freshness issues: {', '.join(data_warnings)}"
        else:
            health_status = 'healthy'
            health_message = "All systems operational"
        
        return {
            'status': health_status,
            'message': health_message,
            'active_alerts': active_alerts,
            'data_freshness': data_freshness,
            'data_warnings': data_warnings,
            'checked_at': now.isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error checking system health: {e}")
        return {
            'status': 'error',
            'message': f"Health check failed: {str(e)}",
            'active_alerts': 0,
            'data_freshness': {},
            'data_warnings': [],
            'checked_at': datetime.now().isoformat()
        }
