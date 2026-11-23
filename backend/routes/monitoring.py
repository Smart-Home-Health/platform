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
Monitoring and alerts routes
"""
import logging
import math
from fastapi import APIRouter, Depends, Body, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, text
from typing import Optional, List
from datetime import datetime, timedelta, timezone
from utils.datetime_utils import local_day_range_utc, resolve_tz_for_patient, utc_now
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
from crud.monitoring_timeline import day_streams

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
async def get_unacknowledged_alerts_count_endpoint(
        patient_id: Optional[int] = None,
        db: Session = Depends(get_db),
        _: bool = Depends(require_read_access)
):
    """Get count of unacknowledged alerts (one patient's when patient_id is given)"""
    return {"count": get_unacknowledged_alerts_count(db, patient_id=patient_id)}


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


# Buckets the recent-history endpoint may snap to. Coarser than 5 minutes is
# never needed: 24 h / 300 s ≈ 288 points.
RECENT_BUCKET_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300]


@router.get("/history/recent")
async def get_recent_pulse_ox_history(
        patient_id: int,
        minutes: int = 15,
        max_points: int = 600,
        db: Session = Depends(get_db),
        _: bool = Depends(require_read_access)
):
    """Recent pulse-ox series for the live dashboard charts, downsampled
    server-side (TimescaleDB time_bucket) so any window returns a bounded
    number of points. Excludes the in-band disconnect sentinel (spo2 = -1)."""
    minutes = max(1, min(minutes, 1440))
    max_points = max(50, min(max_points, 2000))
    raw_bucket = math.ceil(minutes * 60 / max_points)
    bucket_seconds = next((s for s in RECENT_BUCKET_STEPS if s >= raw_bucket), RECENT_BUCKET_STEPS[-1])

    start = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    params = {"pid": patient_id, "start": start}

    if bucket_seconds == 1:
        rows = db.execute(text("""
            SELECT timestamp AS ts, spo2::float AS spo2, bpm::float AS bpm, pa AS perfusion
            FROM pulse_ox_data
            WHERE patient_id = :pid AND timestamp >= :start AND spo2 <> -1
            ORDER BY timestamp
        """), params).all()
    else:
        params["bucket"] = bucket_seconds
        rows = db.execute(text("""
            SELECT time_bucket(make_interval(secs => :bucket), timestamp) AS ts,
                   AVG(spo2)::float AS spo2, AVG(bpm)::float AS bpm, AVG(pa)::float AS perfusion
            FROM pulse_ox_data
            WHERE patient_id = :pid AND timestamp >= :start AND spo2 <> -1
            GROUP BY 1 ORDER BY 1
        """), params).all()

    def epoch_ms(ts):
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return int(ts.timestamp() * 1000)

    points = [
        {
            "t": epoch_ms(r.ts),
            "spo2": round(r.spo2, 1) if r.spo2 is not None else None,
            "bpm": round(r.bpm, 1) if r.bpm is not None else None,
            "perfusion": round(r.perfusion, 2) if r.perfusion is not None else None,
        }
        for r in rows
    ]

    return {
        "patient_id": patient_id,
        "minutes": minutes,
        "bucket_seconds": bucket_seconds,
        "count": len(points),
        "points": points,
    }


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
        tz = resolve_tz_for_patient(db, patient_id)
        today = utc_now().astimezone(tz).date()
        if target_date:
            try:
                date_obj = datetime.strptime(target_date, '%Y-%m-%d').date()
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
        else:
            date_obj = today

        # Keep these instants timezone-aware through the SQL comparison.
        # PostgreSQL interprets naive bounds in the database session's timezone.
        start_dt, end_dt = local_day_range_utc(date_obj, tz=tz)

        return {
            'date': date_obj.isoformat(), 'today': today.isoformat(), 'timezone': str(tz),
            'day_start': start_dt.isoformat(), 'day_end': end_dt.isoformat(),
            **day_streams(db, patient_id, start_dt, end_dt),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error building timeline data: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error building timeline data: {str(e)}")
