from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from datetime import datetime, date
from typing import List, Optional
from pydantic import BaseModel, Field
from db import get_db
from crud.nutrition import (
    create_nutrition_intake, 
    get_nutrition_intake_by_id,
    get_patient_nutrition_intake,
    get_daily_nutrition_intake,
    get_nutrition_summary,
    update_nutrition_intake,
    delete_nutrition_intake,
    get_nutrition_intake_for_care_task
)
from crud.patients import get_active_patient

router = APIRouter(prefix="/api", tags=["nutrition"])

# Pydantic models for request/response
class NutritionIntakeCreate(BaseModel):
    care_task_log_id: Optional[int] = None
    item_name: str = Field(..., min_length=1, max_length=200)
    item_type: str = Field(..., pattern="^(food|liquid|supplement)$")
    amount: float = Field(..., gt=0)
    amount_unit: str = Field(..., min_length=1, max_length=50)
    calories: Optional[float] = Field(None, ge=0)
    protein_grams: Optional[float] = Field(None, ge=0)
    carbs_grams: Optional[float] = Field(None, ge=0)
    fat_grams: Optional[float] = Field(None, ge=0)
    fiber_grams: Optional[float] = Field(None, ge=0)
    sodium_mg: Optional[float] = Field(None, ge=0)
    consumed_at: Optional[datetime] = None
    meal_type: Optional[str] = Field(None, pattern="^(breakfast|lunch|dinner|snack|supplement)$")
    notes: Optional[str] = None
    recorded_by: Optional[str] = None

class NutritionIntakeUpdate(BaseModel):
    item_name: Optional[str] = Field(None, min_length=1, max_length=200)
    item_type: Optional[str] = Field(None, pattern="^(food|liquid|supplement)$")
    amount: Optional[float] = Field(None, gt=0)
    amount_unit: Optional[str] = Field(None, min_length=1, max_length=50)
    calories: Optional[float] = Field(None, ge=0)
    protein_grams: Optional[float] = Field(None, ge=0)
    carbs_grams: Optional[float] = Field(None, ge=0)
    fat_grams: Optional[float] = Field(None, ge=0)
    fiber_grams: Optional[float] = Field(None, ge=0)
    sodium_mg: Optional[float] = Field(None, ge=0)
    consumed_at: Optional[datetime] = None
    meal_type: Optional[str] = Field(None, pattern="^(breakfast|lunch|dinner|snack|supplement)$")
    notes: Optional[str] = None
    recorded_by: Optional[str] = None

class NutritionIntakeResponse(BaseModel):
    id: int
    patient_id: int
    care_task_log_id: Optional[int]
    item_name: str
    item_type: str
    amount: float
    amount_unit: str
    calories: Optional[float]
    protein_grams: Optional[float]
    carbs_grams: Optional[float]
    fat_grams: Optional[float]
    fiber_grams: Optional[float]
    sodium_mg: Optional[float]
    consumed_at: datetime
    meal_type: Optional[str]
    notes: Optional[str]
    recorded_by: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Simple endpoint for frontend compatibility
@router.post("/nutrition", response_model=NutritionIntakeResponse)
async def create_nutrition_simple(
    intake_data: NutritionIntakeCreate,
    db: Session = Depends(get_db)
):
    """Create a new nutrition intake record (simple endpoint)"""
    try:
        # Get the active patient
        active_patient = get_active_patient(db)
        if not active_patient:
            raise HTTPException(status_code=400, detail="No active patient found")
        
        # Convert consumed_at to datetime if it's a string
        data_dict = intake_data.model_dump()
        if 'consumed_at' in data_dict and isinstance(data_dict['consumed_at'], str):
            try:
                data_dict['consumed_at'] = datetime.fromisoformat(data_dict['consumed_at'].replace('Z', '+00:00'))
            except ValueError:
                # If parsing fails, use current time
                data_dict['consumed_at'] = datetime.utcnow()
        
        intake = create_nutrition_intake(
            db=db, 
            intake_data=data_dict, 
            patient_id=active_patient.id
        )
        return intake
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback
        print(f"Nutrition creation error: {str(e)}")
        print(f"Traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to create nutrition intake record: {str(e)}")

@router.post("/nutrition-intake", response_model=NutritionIntakeResponse)
async def create_nutrition_intake_endpoint(
    intake_data: NutritionIntakeCreate,
    patient_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Create a new nutrition intake record"""
    try:
        intake = create_nutrition_intake(
            db=db, 
            intake_data=intake_data.model_dump(), 
            patient_id=patient_id
        )
        return intake
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to create nutrition intake record")

@router.get("/nutrition-intake/{intake_id}", response_model=NutritionIntakeResponse)
async def get_nutrition_intake_endpoint(
    intake_id: int,
    db: Session = Depends(get_db)
):
    """Get a specific nutrition intake record"""
    intake = get_nutrition_intake_by_id(db, intake_id)
    if not intake:
        raise HTTPException(status_code=404, detail="Nutrition intake record not found")
    return intake

@router.get("/patients/{patient_id}/nutrition-intake", response_model=List[NutritionIntakeResponse])
async def get_patient_nutrition_intake_endpoint(
    patient_id: int,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """Get nutrition intake records for a patient"""
    intake_records = get_patient_nutrition_intake(db, patient_id, limit)
    return intake_records

@router.get("/patients/{patient_id}/nutrition-intake/daily")
async def get_daily_nutrition_intake_endpoint(
    patient_id: int,
    target_date: Optional[date] = None,
    db: Session = Depends(get_db)
):
    """Get nutrition intake records for a specific day"""
    intake_records = get_daily_nutrition_intake(db, patient_id, target_date)
    return {
        "date": target_date or date.today(),
        "intake_records": intake_records
    }

@router.get("/patients/{patient_id}/nutrition-summary")
async def get_nutrition_summary_endpoint(
    patient_id: int,
    target_date: Optional[date] = None,
    db: Session = Depends(get_db)
):
    """Get daily nutrition summary with totals"""
    summary = get_nutrition_summary(db, patient_id, target_date)
    return {
        "date": target_date or date.today(),
        "summary": summary
    }

@router.get("/nutrition-intake/active-patient")
async def get_active_patient_nutrition_endpoint(
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """Get nutrition intake records for the active patient"""
    active_patient = get_active_patient(db)
    if not active_patient:
        raise HTTPException(status_code=404, detail="No active patient found")
    
    intake_records = get_patient_nutrition_intake(db, active_patient.id, limit)
    return {
        "patient": active_patient,
        "intake_records": intake_records
    }

@router.get("/nutrition-summary/active-patient")
async def get_active_patient_nutrition_summary_endpoint(
    target_date: Optional[date] = None,
    db: Session = Depends(get_db)
):
    """Get nutrition summary for the active patient"""
    active_patient = get_active_patient(db)
    if not active_patient:
        raise HTTPException(status_code=404, detail="No active patient found")
    
    summary = get_nutrition_summary(db, active_patient.id, target_date)
    return {
        "patient": active_patient,
        "date": target_date or date.today(),
        "summary": summary
    }

@router.put("/nutrition-intake/{intake_id}", response_model=NutritionIntakeResponse)
async def update_nutrition_intake_endpoint(
    intake_id: int,
    update_data: NutritionIntakeUpdate,
    db: Session = Depends(get_db)
):
    """Update a nutrition intake record"""
    try:
        # Only include non-None values in update
        update_dict = {k: v for k, v in update_data.model_dump().items() if v is not None}
        
        intake = update_nutrition_intake(db, intake_id, update_dict)
        if not intake:
            raise HTTPException(status_code=404, detail="Nutrition intake record not found")
        return intake
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to update nutrition intake record")

@router.delete("/nutrition-intake/{intake_id}")
async def delete_nutrition_intake_endpoint(
    intake_id: int,
    db: Session = Depends(get_db)
):
    """Delete a nutrition intake record"""
    try:
        success = delete_nutrition_intake(db, intake_id)
        if not success:
            raise HTTPException(status_code=404, detail="Nutrition intake record not found")
        return {"message": "Nutrition intake record deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to delete nutrition intake record")

@router.get("/care-task-logs/{care_task_log_id}/nutrition-intake", response_model=List[NutritionIntakeResponse])
async def get_care_task_nutrition_intake_endpoint(
    care_task_log_id: int,
    db: Session = Depends(get_db)
):
    """Get nutrition intake records linked to a specific care task completion"""
    intake_records = get_nutrition_intake_for_care_task(db, care_task_log_id)
    return intake_records

# Common nutrition items/presets for quick entry
@router.get("/nutrition-presets")
async def get_nutrition_presets():
    """Get common nutrition items for quick entry"""
    return {
        "liquids": [
            {
                "name": "Water",
                "item_type": "liquid",
                "default_unit": "ml",
                "calories_per_ml": 0
            },
            {
                "name": "Peptamen",
                "item_type": "supplement",
                "default_unit": "ml",
                "calories_per_ml": 1.5,
                "protein_per_ml": 0.04,
                "carbs_per_ml": 0.127,
                "fat_per_ml": 0.058
            },
            {
                "name": "Orange Juice",
                "item_type": "liquid",
                "default_unit": "ml",
                "calories_per_ml": 0.45
            }
        ],
        "foods": [
            {
                "name": "Apple",
                "item_type": "food",
                "default_unit": "medium (182g)",
                "calories_per_serving": 95,
                "carbs_per_serving": 25,
                "fiber_per_serving": 4
            },
            {
                "name": "Banana",
                "item_type": "food",
                "default_unit": "medium (118g)",
                "calories_per_serving": 105,
                "carbs_per_serving": 27,
                "fiber_per_serving": 3
            }
        ],
        "meal_types": [
            "breakfast",
            "lunch", 
            "dinner",
            "snack",
            "supplement"
        ],
        "common_units": {
            "liquids": ["ml", "oz", "cups", "liters"],
            "foods": ["grams", "oz", "servings", "pieces"]
        }
    }
