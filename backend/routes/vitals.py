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
        vitals_saved = []  # Track what vitals were actually saved
        
        # Check if this is a single vital entry format
        if "vital_type" in vital_data and "value" in vital_data:
            vital_type = vital_data.get("vital_type")
            value = vital_data.get("value")
            
            # Handle specific vital types with special logic
            if vital_type == "temperature":
                # For unified storage, save to vitals table
                temp_ids = save_temperature_as_vitals(db, body_temp=value, timestamp=datetime_val, notes=notes)
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
                        bp_ids = save_blood_pressure_as_vitals(db, systolic, diastolic, map_bp, datetime_val, notes)
                        if bp_ids:
                            vitals_saved.append({
                                'type': 'blood_pressure',
                                'data': {'systolic': systolic, 'diastolic': diastolic, 'map': map_bp}
                            })
            else:
                # Generic vital type
                vital_id = save_vital(db, vital_type, value, datetime_val, notes)
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
                    bp_ids = save_blood_pressure_as_vitals(db, systolic, diastolic, map_bp, datetime_val, notes)
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
                temp_ids = save_temperature_as_vitals(db, body_temp=body_temp, skin_temp=skin_temp, timestamp=datetime_val, notes=notes)
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
                vital_id = save_vital(db, "bathroom", size_numeric, datetime_val, notes, bathroom_type)
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
