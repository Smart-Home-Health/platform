"""
Vitals and sensor data routes
"""
import logging
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from db import get_db
from crud.vitals import (get_vitals_by_type, get_distinct_vital_types, get_vitals_by_type_paginated, 
                  save_blood_pressure, save_temperature, save_vital, 
                  save_blood_pressure_as_vitals, save_temperature_as_vitals)
from crud.nutrition import create_nutrition_intake

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
                temp_ids = save_temperature_as_vitals(db, body_temp=value, timestamp=datetime_val, notes=notes, patient_id=patient_id)
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
                        bp_ids = save_blood_pressure_as_vitals(db, systolic, diastolic, map_bp, datetime_val, notes, patient_id=patient_id)
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
                    bp_ids = save_blood_pressure_as_vitals(db, systolic, diastolic, map_bp, datetime_val, notes, patient_id=patient_id)
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
                temp_ids = save_temperature_as_vitals(db, body_temp=body_temp, skin_temp=skin_temp, timestamp=datetime_val, notes=notes, patient_id=patient_id)
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
        for vital in vitals_saved:
            print(f"[vitals] Publishing {vital['type']} to event system")
            publish_event("vital_saved", {
                "vital_type": vital['type'], 
                "vital_data": vital['data'],
                "from_manual": True
            })
        
        return {"status": "success", "message": "Vitals saved successfully"}
    except Exception as e:
        print(f"Error saving manual vitals: {str(e)}")
        return {"status": "error", "message": str(e)}


@router.get("/types")
def get_vital_types(db: Session = Depends(get_db)):
    """Get a distinct list of vital_type values from the vitals table"""
    return get_distinct_vital_types(db)


@router.get("/patient/{patient_id}")
def get_patient_vitals(
    patient_id: int, 
    vital_type: str = None, 
    start_date: str = None, 
    end_date: str = None,
    limit: int = 100, 
    db: Session = Depends(get_db)
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
def get_vital_history_paginated(vital_type: str, page: int = 1, page_size: int = 20, db: Session = Depends(get_db)):
    """Get paginated history for a specific vital type"""
    return get_vitals_by_type_paginated(db, vital_type, page, page_size)


@router.get("/{vital_type}")
def get_vital_history(vital_type: str, limit: int = 100, db: Session = Depends(get_db)):
    return get_vitals_by_type(db, vital_type, limit)
