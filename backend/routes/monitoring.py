"""
Monitoring and alerts routes
"""
import logging
from fastapi import APIRouter, Depends, Body, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import Optional
from db import get_db
from crud.monitoring import (get_monitoring_alerts, get_unacknowledged_alerts_count, update_monitoring_alert, 
                             acknowledge_alert, get_pulse_ox_data_for_alert, get_available_pulse_ox_dates,
                             get_pulse_ox_data_by_date)
from crud.vitals import analyze_pulse_ox_day

logger = logging.getLogger("app")

router = APIRouter(prefix="/api/monitoring", tags=["monitoring"])


@router.get("/alerts")
async def get_monitoring_alerts_endpoint(
        limit: int = 50,
        include_acknowledged: bool = False,
        detailed: bool = False,
        db: Session = Depends(get_db)
):
    """Get monitoring alerts"""
    return get_monitoring_alerts(db, limit, include_acknowledged, detailed)


@router.get("/alerts/count")
async def get_unacknowledged_alerts_count_endpoint(db: Session = Depends(get_db)):
    """Get count of unacknowledged alerts"""
    return {"count": get_unacknowledged_alerts_count(db)}


@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert_endpoint(alert_id: int, data: dict = Body(...), db: Session = Depends(get_db)):
    """
    Acknowledge an alert and save oxygen usage data
    """
    try:
        logger.info(f"Acknowledging alert {alert_id} with data: {data}")

        # Extract oxygen data from the request
        oxygen_amount = data.get('oxygen_used', 0)
        oxygen_highest = data.get('oxygen_highest')
        oxygen_unit = data.get('oxygen_unit')

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
        limit: int = 1000
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
async def get_available_dates(db: Session = Depends(get_db)):
    """Get list of dates that have pulse ox data"""
    try:
        logger.info("Fetching available pulse ox dates...")
        dates = get_available_pulse_ox_dates(db)
        logger.info(f"Returning dates response: {dates}")
        return dates
    except Exception as e:
        logger.error(f"Error in get_available_dates endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error retrieving available dates: {str(e)}")


@router.get("/history/analyze/{date}")
async def analyze_pulse_ox_history(date: str, db: Session = Depends(get_db)):
    """Analyze pulse ox data for a specific date"""
    try:
        # Validate date format
        from datetime import datetime
        try:
            datetime.strptime(date, '%Y-%m-%d')
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
        
        analysis = analyze_pulse_ox_day(db, date)
        return analysis
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error analyzing pulse ox data: {str(e)}")


@router.get("/history/raw/{date}")
async def get_raw_pulse_ox_data(date: str, db: Session = Depends(get_db)):
    """Get raw pulse ox data for a specific date"""
    try:
        # Validate date format
        from datetime import datetime
        try:
            datetime.strptime(date, '%Y-%m-%d')
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
        
        data = get_pulse_ox_data_by_date(db, date)
        
        # Convert to dictionaries for JSON response
        result = []
        for reading in data:
            result.append({
                'id': reading.id,
                'timestamp': reading.timestamp,
                'spo2': reading.spo2,
                'bpm': reading.bpm,
                'perfusion': reading.pa  # Use pa field as perfusion
            })
        
        return {
            'date': date,
            'readings': result,
            'count': len(result)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving raw pulse ox data: {str(e)}")
