from sqlalchemy.orm import Session
from sqlalchemy import desc, and_, func
from datetime import datetime, date
from typing import List, Optional
from models import NutritionIntake, Patient
import logging

logger = logging.getLogger(__name__)

def create_nutrition_intake(db: Session, intake_data: dict, patient_id: int = None) -> NutritionIntake:
    """Create a new nutrition intake record"""
    try:
        # Use provided patient_id or get active patient
        if not patient_id:
            active_patient = db.query(Patient).filter(Patient.is_active == True).first()
            if not active_patient:
                raise ValueError("No active patient found")
            patient_id = active_patient.id
        
        # Create the nutrition intake record
        nutrition_intake = NutritionIntake(
            patient_id=patient_id,
            care_task_log_id=intake_data.get('care_task_log_id'),
            item_name=intake_data['item_name'],
            item_type=intake_data['item_type'],
            amount=intake_data['amount'],
            amount_unit=intake_data['amount_unit'],
            calories=intake_data.get('calories'),
            protein_grams=intake_data.get('protein_grams'),
            carbs_grams=intake_data.get('carbs_grams'),
            fat_grams=intake_data.get('fat_grams'),
            fiber_grams=intake_data.get('fiber_grams'),
            sodium_mg=intake_data.get('sodium_mg'),
            consumed_at=intake_data.get('consumed_at') or datetime.utcnow(),
            meal_type=intake_data.get('meal_type'),
            notes=intake_data.get('notes'),
            recorded_by=intake_data.get('recorded_by'),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        db.add(nutrition_intake)
        db.commit()
        db.refresh(nutrition_intake)
        
        logger.info(f"Created nutrition intake record: {nutrition_intake.id}")
        return nutrition_intake
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating nutrition intake: {str(e)}")
        raise

def get_nutrition_intake_by_id(db: Session, intake_id: int) -> Optional[NutritionIntake]:
    """Get a nutrition intake record by ID"""
    return db.query(NutritionIntake).filter(NutritionIntake.id == intake_id).first()

def get_patient_nutrition_intake(db: Session, patient_id: int, limit: int = 50) -> List[NutritionIntake]:
    """Get nutrition intake records for a patient"""
    return db.query(NutritionIntake)\
        .filter(NutritionIntake.patient_id == patient_id)\
        .order_by(desc(NutritionIntake.consumed_at))\
        .limit(limit)\
        .all()

def get_daily_nutrition_intake(db: Session, patient_id: int, target_date: date = None) -> List[NutritionIntake]:
    """Get nutrition intake records for a specific day"""
    if not target_date:
        target_date = date.today()
    
    start_of_day = datetime.combine(target_date, datetime.min.time())
    end_of_day = datetime.combine(target_date, datetime.max.time())
    
    return db.query(NutritionIntake)\
        .filter(
            and_(
                NutritionIntake.patient_id == patient_id,
                NutritionIntake.consumed_at >= start_of_day,
                NutritionIntake.consumed_at <= end_of_day
            )
        )\
        .order_by(NutritionIntake.consumed_at)\
        .all()

def get_nutrition_summary(db: Session, patient_id: int, target_date: date = None) -> dict:
    """Get daily nutrition summary (totals for calories, water, etc.)"""
    daily_intake = get_daily_nutrition_intake(db, patient_id, target_date)
    
    summary = {
        'total_calories': 0,
        'total_protein': 0,
        'total_carbs': 0,
        'total_fat': 0,
        'total_fiber': 0,
        'total_sodium': 0,
        'total_liquids_ml': 0,
        'meal_breakdown': {
            'breakfast': {'count': 0, 'calories': 0},
            'lunch': {'count': 0, 'calories': 0},
            'dinner': {'count': 0, 'calories': 0},
            'snack': {'count': 0, 'calories': 0},
            'supplement': {'count': 0, 'calories': 0}
        },
        'items': []
    }
    
    for intake in daily_intake:
        # Add to totals
        if intake.calories:
            summary['total_calories'] += intake.calories
        if intake.protein_grams:
            summary['total_protein'] += intake.protein_grams
        if intake.carbs_grams:
            summary['total_carbs'] += intake.carbs_grams
        if intake.fat_grams:
            summary['total_fat'] += intake.fat_grams
        if intake.fiber_grams:
            summary['total_fiber'] += intake.fiber_grams
        if intake.sodium_mg:
            summary['total_sodium'] += intake.sodium_mg
            
        # Track liquids (in ml)
        if intake.item_type == 'liquid':
            amount_ml = intake.amount
            # Convert common units to ml
            if intake.amount_unit.lower() in ['oz', 'ounces']:
                amount_ml = intake.amount * 29.5735  # oz to ml
            elif intake.amount_unit.lower() in ['cup', 'cups']:
                amount_ml = intake.amount * 236.588  # cups to ml
            elif intake.amount_unit.lower() in ['liter', 'liters', 'l']:
                amount_ml = intake.amount * 1000  # liters to ml
            
            summary['total_liquids_ml'] += amount_ml
        
        # Meal breakdown
        meal_type = intake.meal_type or 'snack'
        if meal_type in summary['meal_breakdown']:
            summary['meal_breakdown'][meal_type]['count'] += 1
            if intake.calories:
                summary['meal_breakdown'][meal_type]['calories'] += intake.calories
        
        # Add to items list
        summary['items'].append({
            'id': intake.id,
            'item_name': intake.item_name,
            'item_type': intake.item_type,
            'amount': intake.amount,
            'amount_unit': intake.amount_unit,
            'calories': intake.calories,
            'consumed_at': intake.consumed_at.isoformat(),
            'meal_type': intake.meal_type,
            'notes': intake.notes
        })
    
    return summary

def update_nutrition_intake(db: Session, intake_id: int, update_data: dict) -> Optional[NutritionIntake]:
    """Update a nutrition intake record"""
    try:
        intake = db.query(NutritionIntake).filter(NutritionIntake.id == intake_id).first()
        if not intake:
            return None
            
        # Update fields
        for field, value in update_data.items():
            if hasattr(intake, field) and field not in ['id', 'created_at']:
                setattr(intake, field, value)
        
        intake.updated_at = datetime.utcnow()
        
        db.commit()
        db.refresh(intake)
        
        logger.info(f"Updated nutrition intake record: {intake_id}")
        return intake
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating nutrition intake {intake_id}: {str(e)}")
        raise

def delete_nutrition_intake(db: Session, intake_id: int) -> bool:
    """Delete a nutrition intake record"""
    try:
        intake = db.query(NutritionIntake).filter(NutritionIntake.id == intake_id).first()
        if not intake:
            return False
            
        db.delete(intake)
        db.commit()
        
        logger.info(f"Deleted nutrition intake record: {intake_id}")
        return True
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting nutrition intake {intake_id}: {str(e)}")
        raise

def get_nutrition_intake_for_care_task(db: Session, care_task_log_id: int) -> List[NutritionIntake]:
    """Get nutrition intake records linked to a specific care task completion"""
    return db.query(NutritionIntake)\
        .filter(NutritionIntake.care_task_log_id == care_task_log_id)\
        .order_by(NutritionIntake.consumed_at)\
        .all()
