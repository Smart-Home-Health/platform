"""
Vitals and sensor data routes
"""
import logging
from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, cast, Date
from datetime import datetime, timedelta
from db import get_db
from dependencies import require_read_access
from crud.vitals import (get_vitals_by_type, get_distinct_vital_types, get_vitals_by_type_paginated,
                  save_blood_pressure, save_temperature, save_vital)
from crud.nutrition import create_nutrition_intake
from crud.patients import get_current_patient

logger = logging.getLogger("app")

def publish_event(event_type: str, data: dict):
    """Helper function to publish events to the event bus"""
    try:
        from main import get_modules
        modules = get_modules()
        event_bus = modules.get("event_bus")
        if event_bus:
            import asyncio
            # Create a simple event dict
            event = {"type": event_type, "data": data}
            asyncio.create_task(event_bus.publish(event, topic=event_type))
    except Exception as e:
        logger.error(f"Failed to publish event {event_type}: {e}")

router = APIRouter(prefix="/api/vitals", tags=["vitals"])


@router.get("/patient/{patient_id}/summary")
async def get_vitals_summary(
    patient_id: int,
    days: int = Query(30, ge=1, le=90, description="Number of days to aggregate"),
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access)
):
    """
    Get aggregated vitals summary for charts (daily min/avg/max).
    Returns data optimized for 30-day trend charts.
    """
    from schemas.vital import Vital
    
    try:
        # Calculate date range
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        
        # Generate list of all dates in range for null filling
        date_range = []
        current = start_date.date()
        while current <= end_date.date():
            date_range.append(current.isoformat())
            current += timedelta(days=1)
        
        # Query aggregated vitals grouped by date and type
        results = db.query(
            cast(Vital.timestamp, Date).label('date'),
            Vital.vital_type,
            Vital.vital_group,
            func.min(Vital.value).label('min_val'),
            func.avg(Vital.value).label('avg_val'),
            func.max(Vital.value).label('max_val'),
            func.count(Vital.id).label('count')
        ).filter(
            Vital.patient_id == patient_id,
            Vital.timestamp >= start_date,
            Vital.timestamp <= end_date
        ).group_by(
            cast(Vital.timestamp, Date),
            Vital.vital_type,
            Vital.vital_group
        ).order_by(
            cast(Vital.timestamp, Date)
        ).all()
        
        # Organize results by vital type
        vitals_map = {
            'spo2': {},
            'heart_rate': {},
            'respiratory_rate': {},
            'temperature': {},
            'blood_pressure': {}  # Will aggregate MAP
        }
        
        # Process results
        for row in results:
            date_str = row.date.isoformat()
            vital_type = row.vital_type
            vital_group = row.vital_group
            
            # Handle blood pressure specially - we want MAP average
            if vital_type == 'blood_pressure' and vital_group == 'map':
                vitals_map['blood_pressure'][date_str] = {
                    'date': date_str,
                    'min': round(float(row.min_val), 1) if row.min_val else None,
                    'avg': round(float(row.avg_val), 1) if row.avg_val else None,
                    'max': round(float(row.max_val), 1) if row.max_val else None,
                    'count': row.count
                }
            elif vital_type == 'temperature' and vital_group in ['body', 'core', None]:
                # Use body/core temp, not skin temp
                if date_str not in vitals_map['temperature']:
                    vitals_map['temperature'][date_str] = {
                        'date': date_str,
                        'min': round(float(row.min_val), 1) if row.min_val else None,
                        'avg': round(float(row.avg_val), 1) if row.avg_val else None,
                        'max': round(float(row.max_val), 1) if row.max_val else None,
                        'count': row.count
                    }
            elif vital_type in vitals_map and vital_type not in ['blood_pressure', 'temperature']:
                vitals_map[vital_type][date_str] = {
                    'date': date_str,
                    'min': round(float(row.min_val), 1) if row.min_val else None,
                    'avg': round(float(row.avg_val), 1) if row.avg_val else None,
                    'max': round(float(row.max_val), 1) if row.max_val else None,
                    'count': row.count
                }
        
        # Convert to arrays with null filling for missing dates
        result = {}
        for vital_type, data_map in vitals_map.items():
            result[vital_type] = []
            for date_str in date_range:
                if date_str in data_map:
                    result[vital_type].append(data_map[date_str])
                else:
                    result[vital_type].append({
                        'date': date_str,
                        'min': None,
                        'avg': None,
                        'max': None,
                        'count': 0
                    })
        
        return result
        
    except Exception as e:
        logger.error(f"Error getting vitals summary for patient {patient_id}: {e}")
        return JSONResponse(status_code=500, content={"detail": str(e)})


@router.post("/manual")
async def add_manual_vitals(vital_data: dict, db: Session = Depends(get_db)):
    try:
        datetime_val = vital_data.get("datetime") or vital_data.get("timestamp")
        notes = vital_data.get("notes")
        patient_id = vital_data.get("patient_id")  # Get patient_id from request
        vitals_saved = []  # Track what vitals were actually saved
        
        # Check if this is a single vital entry format
        if "vital_type" in vital_data and "value" in vital_data:
            vital_type = vital_data.get("vital_type")
            value = vital_data.get("value")
            
            # Handle specific vital types with special logic
            if vital_type == "temperature":
                # For unified storage, save to vitals table
                temp_ids = save_temperature(db, body_temp=value, timestamp=datetime_val, notes=notes, patient_id=patient_id)
                if temp_ids:
                    vitals_saved.append({
                        'type': 'temperature',
                        'data': {'temperature': value}
                    })
            elif vital_type == "blood_pressure":
                # For BP, expect value to be an object with systolic/diastolic
                if isinstance(value, dict):
                    systolic = value.get("systolic")
                    diastolic = value.get("diastolic")
                    map_bp = value.get("map")
                    if systolic and diastolic:
                        # Save to unified vitals table
                        bp_ids = save_blood_pressure(db, systolic, diastolic, map_bp, datetime_val, notes, patient_id=patient_id)
                        if bp_ids:
                            vitals_saved.append({
                                'type': 'blood_pressure',
                                'data': {'systolic': systolic, 'diastolic': diastolic, 'map': map_bp}
                            })
            else:
                # Generic vital type
                vital_id = save_vital(db, vital_type, value, datetime_val, notes, patient_id=patient_id)
                if vital_id:
                    vitals_saved.append({
                        'type': vital_type,
                        'data': {vital_type: value}
                    })
        else:
            # Handle the complex object format (original logic)
            # Handle blood pressure
            bp = vital_data.get("bp", {})
            if bp and (bp.get("systolic_bp") or bp.get("diastolic_bp")):
                systolic = bp.get("systolic_bp")
                diastolic = bp.get("diastolic_bp")
                map_bp = bp.get("map_bp")
                if systolic and diastolic:
                    # Save to unified vitals table
                    bp_ids = save_blood_pressure(db, systolic, diastolic, map_bp, datetime_val, notes, patient_id=patient_id)
                    if bp_ids:
                        vitals_saved.append({
                            'type': 'blood_pressure',
                            'data': {'systolic_bp': systolic, 'diastolic_bp': diastolic, 'map_bp': map_bp, 'notes': notes}
                        })
                    
            # Handle temperature
            temp = vital_data.get("temp", {})
            if temp and temp.get("body_temp"):
                body_temp = temp.get("body_temp")
                skin_temp = temp.get("skin_temp")  # Include skin temp if provided
                # Save to unified vitals table
                temp_ids = save_temperature(db, body_temp=body_temp, skin_temp=skin_temp, timestamp=datetime_val, notes=notes, patient_id=patient_id)
                if temp_ids:
                    vitals_saved.append({
                        'type': 'temperature',
                        'data': {'body_temp': body_temp, 'skin_temp': skin_temp, 'notes': notes}
                    })
                
            # Handle bathroom
            bathroom_type = vital_data.get("bathroom_type")
            bathroom_size = vital_data.get("bathroom_size")
            bathroom_size_map = ["smear", "s", "m", "l", "xl"]
            if bathroom_type and bathroom_size:
                size_numeric = bathroom_size_map.index(bathroom_size) if bathroom_size in bathroom_size_map else 0
                vital_id = save_vital(db, "bathroom", size_numeric, datetime_val, notes, vital_group=bathroom_type, patient_id=patient_id)
                if vital_id:
                    vitals_saved.append({
                        'type': 'bathroom',
                        'data': {'bathroom_type': bathroom_type, 'bathroom_size': bathroom_size, 'value': size_numeric, 'notes': notes}
                    })
            
            # Handle nutrition data (from frontend format)
            nutrition = vital_data.get("nutrition", {})
            if nutrition:
                calories = nutrition.get("calories")
                water = nutrition.get("water")
                
                # Save calories to nutrition_intake table
                if calories is not None and calories != "":
                    try:
                        intake_data = {
                            "item_name": "Manual Entry - Calories",
                            "item_type": "manual",
                            "amount": calories,
                            "amount_unit": "calories",
                            "calories": calories,
                            "consumed_at": datetime_val,
                            "notes": notes
                        }
                        nutrition_record = create_nutrition_intake(db, intake_data)
                        vitals_saved.append({
                            'type': 'calories', 
                            'data': {'value': calories, 'notes': notes, 'nutrition_id': nutrition_record.id}
                        })
                        logger.info(f"Saved calories to nutrition_intake: {nutrition_record.id}")
                    except Exception as e:
                        logger.error(f"Error saving calories to nutrition_intake: {str(e)}")
                
                # Save water to nutrition_intake table
                if water is not None and water != "":
                    try:
                        intake_data = {
                            "item_name": "Manual Entry - Water",
                            "item_type": "fluid",
                            "amount": water,
                            "amount_unit": "ml",
                            "calories": 0,  # Water has 0 calories
                            "consumed_at": datetime_val,
                            "notes": notes
                        }
                        nutrition_record = create_nutrition_intake(db, intake_data)
                        vitals_saved.append({
                            'type': 'water',
                            'data': {'value': water, 'notes': notes, 'nutrition_id': nutrition_record.id}
                        })
                        logger.info(f"Saved water to nutrition_intake: {nutrition_record.id}")
                    except Exception as e:
                        logger.error(f"Error saving water to nutrition_intake: {str(e)}")
            
            # Handle weight
            weight = vital_data.get("weight")
            if weight is not None and weight != "":
                weight_id = save_vital(db, "weight", weight, datetime_val, notes)
                if weight_id:
                    vitals_saved.append({
                        'type': 'weight',
                        'data': {'value': weight, 'notes': notes}
                    })
                
            # Dynamically handle any remaining vitals (excluding already processed ones)
            processed_keys = ["datetime", "timestamp", "bp", "temp", "nutrition", "weight", "notes", "bathroom_type", "bathroom_size", "vital_type", "value"]
            for key, value in vital_data.items():
                if key not in processed_keys and value is not None and value != "":
                    vital_id = save_vital(db, key, value, datetime_val, notes)
                    if vital_id:
                        vitals_saved.append({
                            'type': key,
                            'data': {'value': value, 'notes': notes}
                        })
            
        # Publish vitals events to trigger WebSocket broadcast and MQTT publishing
        event_patient_id = patient_id
        if event_patient_id is None:
            current = get_current_patient(db)
            if current:
                event_patient_id = current.id
        for vital in vitals_saved:
            print(f"[vitals] Publishing {vital['type']} to event system")
            evt = {
                "vital_type": vital['type'],
                "vital_data": vital['data'],
                "from_manual": True,
            }
            if event_patient_id is not None:
                evt["patient_id"] = event_patient_id
            publish_event("vital_saved", evt)
        
        return {"status": "success", "message": "Vitals saved successfully"}
    except Exception as e:
        print(f"Error saving manual vitals: {str(e)}")
        return {"status": "error", "message": str(e)}


@router.get("/types")
def get_vital_types(db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    """Get a distinct list of vital_type values from the vitals table"""
    return get_distinct_vital_types(db)


@router.get("/patient/{patient_id}")
def get_patient_vitals(
    patient_id: int,
    vital_type: str = None,
    start_date: str = None,
    end_date: str = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access)
):
    """Get all vitals for a specific patient with optional filtering"""
    from schemas.vital import Vital
    from datetime import datetime
    
    query = db.query(Vital).filter(Vital.patient_id == patient_id)
    
    if vital_type:
        query = query.filter(Vital.vital_type == vital_type)
    
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date)
            query = query.filter(Vital.timestamp >= start_dt)
        except:
            pass
    
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date)
            query = query.filter(Vital.timestamp <= end_dt)
        except:
            pass
    
    results = query.order_by(Vital.timestamp.desc()).limit(limit).all()
    
    # Group multi-value vitals (BP, temperature) by timestamp
    from collections import defaultdict
    grouped = defaultdict(lambda: {'values': {}})
    single_vitals = []
    
    for v in results:
        if v.vital_type in ['blood_pressure', 'temperature'] and v.vital_group:
            key = (v.timestamp, v.vital_type)
            grouped[key]['timestamp'] = v.timestamp
            grouped[key]['vital_type'] = v.vital_type
            grouped[key]['notes'] = v.notes
            grouped[key]['patient_id'] = v.patient_id
            grouped[key]['values'][v.vital_group] = v.value
        else:
            single_vitals.append({
                'id': v.id,
                'timestamp': v.timestamp,
                'vital_type': v.vital_type,
                'value': v.value,
                'notes': v.notes,
                'patient_id': v.patient_id,
                'source': 'manual'
            })
    
    # Convert grouped vitals to list format
    for key, data in grouped.items():
        if data['vital_type'] == 'blood_pressure':
            single_vitals.append({
                'timestamp': data['timestamp'],
                'vital_type': 'blood_pressure',
                'systolic': data['values'].get('systolic'),
                'diastolic': data['values'].get('diastolic'),
                'map': data['values'].get('map'),
                'notes': data['notes'],
                'patient_id': data['patient_id'],
                'source': 'manual'
            })
        elif data['vital_type'] == 'temperature':
            single_vitals.append({
                'timestamp': data['timestamp'],
                'vital_type': 'temperature',
                'value': data['values'].get('body') or data['values'].get('core'),
                'notes': data['notes'],
                'patient_id': data['patient_id'],
                'source': 'manual'
            })
    
    # Sort by timestamp descending
    single_vitals.sort(key=lambda x: x['timestamp'] if x['timestamp'] else '', reverse=True)
    
    return single_vitals


@router.get("/nutrition")
def get_nutrition_history(limit: int = 100, db: Session = Depends(get_db)):
    """Get combined nutrition history (calories and water)"""
    return {
        "calories": get_vitals_by_type(db, "calories", limit),
        "water": get_vitals_by_type(db, "water", limit)
    }


@router.get("/history")
def get_vital_history_paginated(vital_type: str, page: int = 1, page_size: int = 20, db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    """Get paginated history for a specific vital type"""
    return get_vitals_by_type_paginated(db, vital_type, page, page_size)


@router.get("/{vital_type}")
def get_vital_history(vital_type: str, limit: int = 100, db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    return get_vitals_by_type(db, vital_type, limit)
