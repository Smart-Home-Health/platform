"""
Monitoring and alerts routes
"""
import logging
from collections import defaultdict
from fastapi import APIRouter, Depends, Body, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from typing import Optional, List
from datetime import datetime, date, time, timedelta, timezone
import pytz
from db import get_db
from dependencies import require_read_access
from models.monitoring import (
    AlertAcknowledge,
    MonitoringAlertResponse,
    PulseOxReading,
    PulseOxDataResponse,
    MonitoringDataQuery,
)
from crud.monitoring import (get_monitoring_alerts, get_unacknowledged_alerts_count, update_monitoring_alert,
                             acknowledge_alert, get_pulse_ox_data_for_alert, get_available_pulse_ox_dates,
                             get_pulse_ox_data_by_date)
from crud.vitals import analyze_pulse_ox_day
from schemas.vital import Vital

logger = logging.getLogger("app")

router = APIRouter(prefix="/api/monitoring", tags=["monitoring"])


@router.get("/alerts")
async def get_monitoring_alerts_endpoint(
        limit: int = 50,
        include_acknowledged: bool = False,
        detailed: bool = False,
        patient_id: Optional[int] = None,
        db: Session = Depends(get_db),
        _: bool = Depends(require_read_access)
):
    """Get monitoring alerts"""
    return get_monitoring_alerts(db, limit, include_acknowledged, detailed, patient_id=patient_id)


@router.get("/alerts/count")
async def get_unacknowledged_alerts_count_endpoint(db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    """Get count of unacknowledged alerts"""
    return {"count": get_unacknowledged_alerts_count(db)}


@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert_endpoint(alert_id: int, data: AlertAcknowledge, db: Session = Depends(get_db)):
    """
    Acknowledge an alert and save oxygen usage data
    """
    try:
        logger.info(f"Acknowledging alert {alert_id} with data: {data.model_dump()}")

        # Extract oxygen data from the request
        oxygen_amount = data.oxygen_used or 0
        oxygen_highest = data.oxygen_highest
        oxygen_unit = data.oxygen_unit

        logger.info(f"Processed data: amount={oxygen_amount}, highest={oxygen_highest}, unit={oxygen_unit}")

        # Convert oxygen amount to boolean flag and store amount in oxygen_highest if not provided
        oxygen_used_flag = bool(oxygen_amount and oxygen_amount > 0)
        if oxygen_highest is None or oxygen_highest == "":
            oxygen_highest = float(oxygen_amount) if oxygen_amount else None

        # Update the alert with oxygen information
        success = update_monitoring_alert(
            db,
            alert_id,
            oxygen_used=oxygen_used_flag,
            oxygen_highest=oxygen_highest,
            oxygen_unit=oxygen_unit
        )

        # Then acknowledge the alert
        if success:
            ack_success = acknowledge_alert(db, alert_id)
            if ack_success:
                return {"status": "success", "message": "Alert acknowledged successfully"}
            else:
                return JSONResponse(status_code=500, content={"detail": "Failed to acknowledge alert"})
        else:
            return JSONResponse(status_code=404, content={"detail": "Alert not found"})
            
    except Exception as e:
        logger.error(f"Error acknowledging alert: {e}", exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"detail": f"Error acknowledging alert: {str(e)}"}
        )


@router.get("/data")
async def get_pulse_ox_data_endpoint(
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        limit: int = 1000,
        _: bool = Depends(require_read_access)
):
    """Get pulse ox data within a time range"""
    # This would require implementing a new function in crud.py
    # We'll just return a placeholder for now
    return {"message": "Feature coming soon"}


@router.get("/alerts/{alert_id}/data")
async def get_alert_data(alert_id: int, db: Session = Depends(get_db)):
    """Get detailed data for a specific alert event"""
    try:
        data = get_pulse_ox_data_for_alert(db, alert_id)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving alert data: {str(e)}")


# Pulse Ox History Analysis endpoints
@router.get("/history/dates")
async def get_available_dates(
        patient_id: Optional[int] = None,
        db: Session = Depends(get_db),
        _: bool = Depends(require_read_access)
):
    """Get list of dates that have pulse ox data"""
    try:
        logger.info("Fetching available pulse ox dates...")
        dates = get_available_pulse_ox_dates(db, patient_id=patient_id)
        logger.info(f"Returning dates response: {dates}")
        return dates
    except Exception as e:
        logger.error(f"Error in get_available_dates endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving available dates: {str(e)}")


@router.get("/history/analyze/{date}")
async def analyze_pulse_ox_history(
        date: str,
        patient_id: Optional[int] = None,
        db: Session = Depends(get_db)
):
    """Analyze pulse ox data for a specific date"""
    try:
        # Validate date format
        try:
            datetime.strptime(date, '%Y-%m-%d')
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
        
        analysis = analyze_pulse_ox_day(db, date, patient_id=patient_id)
        return analysis
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing pulse ox data: {str(e)}")


@router.get("/history/raw/{date}", response_model=PulseOxDataResponse)
async def get_raw_pulse_ox_data(
        date: str,
        patient_id: Optional[int] = None,
        db: Session = Depends(get_db),
        _: bool = Depends(require_read_access)
):
    """Get raw pulse ox data for a specific date"""
    try:
        # Validate date format
        try:
            datetime.strptime(date, '%Y-%m-%d')
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
        
        data = get_pulse_ox_data_by_date(db, date, patient_id=patient_id)
        
        # Convert to Pydantic models
        readings = [
            PulseOxReading(
                id=reading.id,
                timestamp=reading.timestamp,
                spo2=reading.spo2,
                bpm=reading.bpm,
                perfusion=reading.pa  # Use pa field as perfusion
            )
            for reading in data
        ]
        
        return PulseOxDataResponse(
            date=date,
            readings=readings,
            count=len(readings)
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving raw pulse ox data: {str(e)}")


@router.get("/timeline")
async def get_timeline_data(
        patient_id: int,
        target_date: Optional[str] = None,
        db: Session = Depends(get_db),
        _: bool = Depends(require_read_access)
):
    """
    Get aggregated timeline data for a single day.
    Returns downsampled pulse ox (1-min averages), medications, care tasks,
    nutrition intake/output, manual vitals, and alerts.
    """
    try:
        # Parse date
        if target_date:
            try:
                date_obj = datetime.strptime(target_date, '%Y-%m-%d').date()
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
        else:
            date_obj = date.today()

        date_str = date_obj.strftime('%Y-%m-%d')

        # Compute local Eastern day boundaries in UTC
        eastern = pytz.timezone('US/Eastern')
        local_start = eastern.localize(datetime.combine(date_obj, time.min))
        local_end = eastern.localize(datetime.combine(date_obj, time.max))
        start_dt = local_start.astimezone(pytz.utc).replace(tzinfo=None)
        end_dt = local_end.astimezone(pytz.utc).replace(tzinfo=None)

        # 1. Pulse ox - get raw data and downsample to 1-minute averages
        from schemas.pulse_ox_data import PulseOxData as PulseOxModel
        pulse_query = db.query(PulseOxModel).filter(
            PulseOxModel.timestamp >= start_dt,
            PulseOxModel.timestamp <= end_dt
        )
        if patient_id is not None:
            pulse_query = pulse_query.filter(PulseOxModel.patient_id == patient_id)
        raw_pulse_ox = pulse_query.order_by(PulseOxModel.timestamp.asc()).all()

        # Group by minute and average (exclude -1 invalid/disconnected reads)
        minute_buckets = defaultdict(lambda: {'spo2': [], 'bpm': [], 'perfusion': []})
        for reading in raw_pulse_ox:
            minute_key = reading.timestamp.replace(second=0, microsecond=0)
            if reading.spo2 is not None and reading.spo2 != -1:
                minute_buckets[minute_key]['spo2'].append(reading.spo2)
            if reading.bpm is not None and reading.bpm != -1:
                minute_buckets[minute_key]['bpm'].append(reading.bpm)
            if reading.pa is not None and reading.pa != -1:
                minute_buckets[minute_key]['perfusion'].append(reading.pa)

        pulse_ox_data = []
        for ts in sorted(minute_buckets.keys()):
            bucket = minute_buckets[ts]
            # Skip minutes with no valid readings
            if not bucket['spo2'] and not bucket['bpm']:
                continue
            pulse_ox_data.append({
                'ts': ts.isoformat(),
                'spo2': round(sum(bucket['spo2']) / len(bucket['spo2']), 1) if bucket['spo2'] else None,
                'bpm': round(sum(bucket['bpm']) / len(bucket['bpm']), 1) if bucket['bpm'] else None,
                'perfusion': round(sum(bucket['perfusion']) / len(bucket['perfusion']), 2) if bucket['perfusion'] else None
            })

        # 2. Medications administered that day
        # Query directly with UTC boundaries instead of date strings
        from schemas.medication_log import MedicationLog
        from schemas.medication import Medication
        med_logs = db.query(MedicationLog).join(Medication).filter(
            MedicationLog.patient_id == patient_id,
            MedicationLog.administered_at >= start_dt,
            MedicationLog.administered_at <= end_dt
        ).order_by(MedicationLog.administered_at.asc()).all()
        medications = [{
            'ts': m.administered_at.isoformat() if m.administered_at else None,
            'name': m.medication.name if m.medication else 'Unknown',
            'dose': f"{m.dose_amount} {m.medication.quantity_unit}" if m.medication else str(m.dose_amount or ''),
            'status': 'skipped' if m.dose_amount == 0 else ('late' if m.administered_late else 'on-time'),
            'notes': m.notes or ''
        } for m in med_logs]

        # 3. Care tasks completed that day
        from schemas.care_task_log import CareTaskLog
        from schemas.care_task import CareTask
        task_log_query = db.query(CareTaskLog).join(CareTask).filter(
            CareTaskLog.patient_id == patient_id,
            CareTaskLog.completed_at >= start_dt,
            CareTaskLog.completed_at <= end_dt
        ).order_by(CareTaskLog.completed_at.asc()).all()
        care_tasks = [{
            'ts': t.completed_at.isoformat() if t.completed_at else None,
            'name': t.care_task.name if t.care_task else 'Unknown',
            'category': t.care_task.category.name if t.care_task and t.care_task.category else '',
            'status': 'completed',
            'notes': t.notes or ''
        } for t in task_log_query]

        # 4. Nutrition intake
        from schemas.nutrition_intake import NutritionIntake
        intake_records = db.query(NutritionIntake).filter(
            NutritionIntake.patient_id == patient_id,
            NutritionIntake.consumed_at >= start_dt,
            NutritionIntake.consumed_at <= end_dt
        ).order_by(NutritionIntake.consumed_at.asc()).all()
        nutrition_intake = [{
            'ts': r.consumed_at.isoformat() if r.consumed_at else None,
            'item_name': r.item_name,
            'item_type': r.item_type,
            'amount': r.amount,
            'amount_unit': r.amount_unit,
            'calories': r.calories
        } for r in intake_records if r.consumed_at]

        # 5. Nutrition output
        from schemas.nutrition_output import NutritionOutput
        output_records = db.query(NutritionOutput).filter(
            NutritionOutput.patient_id == patient_id,
            NutritionOutput.occurred_at >= start_dt,
            NutritionOutput.occurred_at <= end_dt
        ).order_by(NutritionOutput.occurred_at.asc()).all()
        nutrition_output = [{
            'ts': r.occurred_at.isoformat() if r.occurred_at else None,
            'output_type': r.output_type,
            'is_diaper': r.is_diaper,
            'diaper_wetness': r.diaper_wetness,
            'diaper_soiled': r.diaper_soiled,
            'consistency': r.consistency,
            'color': r.color,
            'amount': r.amount,
            'notes': r.notes
        } for r in output_records if r.occurred_at]

        # 6. Vitals recorded that day
        vitals_query = db.query(Vital).filter(
            Vital.patient_id == patient_id,
            Vital.timestamp >= start_dt,
            Vital.timestamp <= end_dt
        ).order_by(Vital.timestamp.asc()).all()

        vitals = [{
            'ts': v.timestamp.isoformat(),
            'vital_type': v.vital_type,
            'vital_group': v.vital_group,
            'value': v.value,
            'unit': v.unit,
            'notes': v.notes
        } for v in vitals_query]

        # 7. Monitoring alerts for that day
        all_alerts = get_monitoring_alerts(
            db, limit=200, include_acknowledged=True, patient_id=patient_id
        )
        alerts = []
        for a in all_alerts:
            start_time = a.get('start_time')
            if start_time:
                if isinstance(start_time, str):
                    alert_dt = datetime.fromisoformat(start_time)
                else:
                    alert_dt = start_time
                # Check if alert falls within local day boundaries (in UTC)
                naive_alert = alert_dt.replace(tzinfo=None) if alert_dt.tzinfo else alert_dt
                if start_dt <= naive_alert <= end_dt:
                    end_time = a.get('end_time')
                    alerts.append({
                        'start': start_time.isoformat() if hasattr(start_time, 'isoformat') else start_time,
                        'end': end_time.isoformat() if end_time and hasattr(end_time, 'isoformat') else end_time,
                        'spo2_alarm': a.get('spo2_alarm_triggered', False),
                        'hr_alarm': a.get('hr_alarm_triggered', False),
                        'spo2_min': a.get('spo2_min'),
                        'bpm_min': a.get('bpm_min'),
                        'oxygen_used': a.get('oxygen_used', False),
                        'acknowledged': a.get('acknowledged', False)
                    })

        return {
            'date': date_str,
            'pulse_ox': pulse_ox_data,
            'medications': medications,
            'care_tasks': care_tasks,
            'nutrition_intake': nutrition_intake,
            'nutrition_output': nutrition_output,
            'vitals': vitals,
            'alerts': alerts
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error building timeline data: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error building timeline data: {str(e)}")
