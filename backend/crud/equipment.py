"""
Equipment management CRUD operations
"""
import logging
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from schemas.equipment import Equipment
from schemas.equipment_change_log import EquipmentChangeLog
from crud.patients import get_or_create_default_patient

logger = logging.getLogger('crud')


# --- Equipment CRUD ---
def add_equipment_simple(db: Session, name, quantity=1, scheduled_replacement=True, last_changed=None, useful_days=None, patient_id=None):
    """
    Simple add equipment function matching the original signature for routes compatibility
    """
    try:
        equipment = Equipment(
            name=name,
            patient_id=patient_id,  # Can be None for shared equipment
            quantity=quantity,
            scheduled_replacement=scheduled_replacement,
            last_changed=last_changed if scheduled_replacement else None,
            useful_days=useful_days if scheduled_replacement else None,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.add(equipment)
        db.commit()
        db.refresh(equipment)
        patient_info = f" for patient {patient_id}" if patient_id else " (shared)"
        logger.info(f"Equipment added: {name}{patient_info}")
        return equipment.id
    except Exception as e:
        logger.error(f"Error adding equipment: {e}")
        db.rollback()
        return None


def get_equipment(db: Session, equipment_id):
    """
    Get a specific equipment item by ID
    """
    try:
        equipment = db.query(Equipment).filter(Equipment.id == equipment_id).first()
        if equipment:
            return {
                'id': equipment.id,
                'name': equipment.name,
                'patient_id': equipment.patient_id,
                'quantity': equipment.quantity,
                'scheduled_replacement': equipment.scheduled_replacement,
                'last_changed': equipment.last_changed.isoformat() if equipment.last_changed else None,
                'useful_days': equipment.useful_days,
                'created_at': equipment.created_at.isoformat() if equipment.created_at else None,
                'updated_at': equipment.updated_at.isoformat() if equipment.updated_at else None
            }
        return None
    except Exception as e:
        logger.error(f"Error fetching equipment {equipment_id}: {e}")
        return None


def update_equipment(db: Session, equipment_id, name=None, quantity=None, scheduled_replacement=None, last_changed=None, useful_days=None, patient_id=None):
    """
    Update an equipment item
    """
    try:
        equipment = db.query(Equipment).filter(Equipment.id == equipment_id).first()
        if not equipment:
            return False
        
        if name is not None:
            equipment.name = name
        if quantity is not None:
            equipment.quantity = quantity
        if scheduled_replacement is not None:
            equipment.scheduled_replacement = scheduled_replacement
        if last_changed is not None:
            equipment.last_changed = last_changed
        if useful_days is not None:
            equipment.useful_days = useful_days
        if patient_id is not None:
            equipment.patient_id = patient_id
            
        equipment.updated_at = datetime.utcnow()
        db.commit()
        logger.info(f"Equipment updated: {equipment.name}")
        return True
    except Exception as e:
        logger.error(f"Error updating equipment {equipment_id}: {e}")
        db.rollback()
        return False


def list_equipment(db: Session, patient_id=None, shared_only=False, skip=0, limit=100):
    """
    List equipment with optional patient filtering
    
    Args:
        patient_id: Filter to specific patient equipment
        shared_only: If True, return only shared equipment (patient_id is None)
        skip: Number of records to skip
        limit: Maximum number of records to return
    """
    try:
        query = db.query(Equipment)
        
        if shared_only:
            query = query.filter(Equipment.patient_id.is_(None))
        elif patient_id is not None:
            query = query.filter(Equipment.patient_id == patient_id)
        
        equipment_list = query.offset(skip).limit(limit).all()
        
        return [
            {
                'id': eq.id,
                'name': eq.name,
                'patient_id': eq.patient_id,
                'quantity': eq.quantity,
                'scheduled_replacement': eq.scheduled_replacement,
                'last_changed': eq.last_changed.isoformat() if eq.last_changed else None,
                'useful_days': eq.useful_days,
                'created_at': eq.created_at.isoformat() if eq.created_at else None,
                'updated_at': eq.updated_at.isoformat() if eq.updated_at else None
            }
            for eq in equipment_list
        ]
    except Exception as e:
        logger.error(f"Error listing equipment: {e}")
        return []


def delete_equipment(db: Session, equipment_id):
    """
    Delete an equipment item
    """
    try:
        equipment = db.query(Equipment).filter(Equipment.id == equipment_id).first()
        if not equipment:
            return False
        
        db.delete(equipment)
        db.commit()
        logger.info(f"Equipment deleted: {equipment.name}")
        return True
    except Exception as e:
        logger.error(f"Error deleting equipment {equipment_id}: {e}")
        db.rollback()
        return False


def search_equipment(db: Session, query):
    """
    Search equipment by name
    """
    try:
        equipment_list = db.query(Equipment).filter(
            Equipment.name.ilike(f'%{query}%')
        ).all()
        
        return [
            {
                'id': eq.id,
                'name': eq.name,
                'quantity': eq.quantity,
                'scheduled_replacement': eq.scheduled_replacement,
                'last_changed': eq.last_changed.isoformat() if eq.last_changed else None,
                'useful_days': eq.useful_days
            }
            for eq in equipment_list
        ]
    except Exception as e:
        logger.error(f"Error searching equipment: {e}")
        return []


# --- Equipment Change Management ---
def get_equipment_list(db: Session):
    """
    Get equipment list with calculated due dates for scheduled replacements
    """
    try:
        equipment = db.query(Equipment).all()
        result = []
        
        for item in equipment:
            item_dict = {
                'id': item.id,
                'name': item.name,
                'quantity': item.quantity,
                'scheduled_replacement': item.scheduled_replacement,
                'last_changed': item.last_changed.isoformat() if item.last_changed else None,
                'useful_days': item.useful_days,
                'due_date': None
            }
            
            # Only calculate due date if scheduled replacement is enabled
            if (item.scheduled_replacement and item.last_changed and item.useful_days):
                if isinstance(item.last_changed, str):
                    last = datetime.fromisoformat(item.last_changed)
                else:
                    last = item.last_changed
                due = last + timedelta(days=item.useful_days)
                item_dict['due_date'] = due.isoformat()
            
            result.append(item_dict)
        
        # Sort by due_date (scheduled items first, then by due date)
        def sort_key(x):
            if not x['scheduled_replacement']:
                return (1, x['name'])  # Non-scheduled items go to end, sorted by name
            elif x['due_date']:
                return (0, x['due_date'])  # Scheduled items sorted by due date
            else:
                return (0, '9999-12-31')  # Scheduled items without due date go to end of scheduled
        
        result.sort(key=sort_key)
        return result
    except Exception as e:
        logger.error(f"Error fetching equipment list: {e}")
        return []


def log_equipment_change(db: Session, equipment_id, changed_at, patient_id=None, notes=None, changed_by=None):
    """
    Log an equipment change and update the last_changed date
    """
    try:
        # Create change log entry
        change_log = EquipmentChangeLog(
            equipment_id=equipment_id,
            patient_id=patient_id,
            changed_at=changed_at,
            notes=notes,
            changed_by=changed_by,
            created_at=datetime.utcnow()
        )
        db.add(change_log)

        # Update last_changed in equipment
        equipment = db.query(Equipment).filter(Equipment.id == equipment_id).first()
        if equipment:
            equipment.last_changed = changed_at
            equipment.updated_at = datetime.utcnow()

        db.commit()
        logger.info(f"Equipment change logged for ID {equipment_id}")
        return True
    except Exception as e:
        logger.error(f"Error logging equipment change: {e}")
        db.rollback()
        return False


def get_equipment_change_history(db: Session, equipment_id):
    """
    Get change history for equipment
    """
    try:
        changes = db.query(EquipmentChangeLog).filter(
            EquipmentChangeLog.equipment_id == equipment_id
        ).order_by(EquipmentChangeLog.changed_at.desc()).all()
        
        return [
            {
                'id': change.id,
                'equipment_id': change.equipment_id,
                'changed_at': change.changed_at.isoformat() if change.changed_at else None
            }
            for change in changes
        ]
    except Exception as e:
        logger.error(f"Error fetching equipment change history: {e}")
        return []


def receive_equipment(db: Session, equipment_id: int, amount: int = 1):
    """
    Increase equipment quantity (receive new stock)
    """
    try:
        equipment = db.query(Equipment).filter(Equipment.id == equipment_id).first()
        if not equipment:
            return False
        
        equipment.quantity += amount
        db.commit()
        
        logger.info(f"Equipment {equipment.name} received {amount} units. New quantity: {equipment.quantity}")
        return True
    except Exception as e:
        logger.error(f"Error receiving equipment: {e}")
        db.rollback()
        return False


def open_equipment(db: Session, equipment_id: int, amount: int = 1):
    """
    Decrease equipment quantity (open/use equipment) and log the action
    """
    try:
        equipment = db.query(Equipment).filter(Equipment.id == equipment_id).first()
        if not equipment:
            return False
        
        # Check if enough quantity is available
        if equipment.quantity < amount:
            logger.warning(f"Not enough quantity available for equipment {equipment.name}. Available: {equipment.quantity}, Requested: {amount}")
            return False
            
        # Deduct quantity
        equipment.quantity -= amount
        
        # Update last_changed date if the equipment supports scheduled replacement
        if equipment.scheduled_replacement:
            equipment.last_changed = datetime.now()
        
        # Log the action in equipment change history
        if equipment.scheduled_replacement:
            change_log = EquipmentChangeLog(
                equipment_id=equipment_id,
                changed_at=datetime.now()
            )
            db.add(change_log)
        
        db.commit()
        logger.info(f"Equipment {equipment.name} used {amount} units. New quantity: {equipment.quantity}")
        return True
    except Exception as e:
        logger.error(f"Error opening equipment: {e}")
        db.rollback()
        return False


def get_equipment_due_count(db: Session):
    """Return the count of equipment items where due_date is today or past."""
    try:
        equipment = db.query(Equipment).filter(Equipment.scheduled_replacement == True).all()
        due_count = 0
        today = datetime.now().date()
        
        for item in equipment:
            if item.last_changed and item.useful_days:
                if isinstance(item.last_changed, str):
                    last = datetime.fromisoformat(item.last_changed)
                else:
                    last = item.last_changed
                due_date = (last.date() if hasattr(last, 'date') else last) + timedelta(days=item.useful_days)
                if due_date <= today:
                    due_count += 1
        return due_count
    except Exception as e:
        logger.error(f"Error calculating equipment due count: {e}")
        return 0


def get_equipment_due_soon(db: Session, days_ahead=7):
    """
    Get equipment items that are due for replacement within the specified number of days
    """
    try:
        equipment = db.query(Equipment).filter(Equipment.scheduled_replacement == True).all()
        due_soon = []
        target_date = datetime.now().date() + timedelta(days=days_ahead)
        
        for item in equipment:
            if item.last_changed and item.useful_days:
                if isinstance(item.last_changed, str):
                    last = datetime.fromisoformat(item.last_changed)
                else:
                    last = item.last_changed
                due_date = (last.date() if hasattr(last, 'date') else last) + timedelta(days=item.useful_days)
                if due_date <= target_date:
                    due_soon.append({
                        'id': item.id,
                        'name': item.name,
                        'quantity': item.quantity,
                        'due_date': due_date.isoformat(),
                        'days_until_due': (due_date - datetime.now().date()).days
                    })
        
        return sorted(due_soon, key=lambda x: x['days_until_due'])
    except Exception as e:
        logger.error(f"Error getting equipment due soon: {e}")
        return []


# --- Placeholder functions for category management (not implemented in current model) ---
def get_equipment_categories(db: Session):
    """Placeholder - equipment categories not implemented in current model"""
    return []

def add_equipment_category(db: Session, name, description=None):
    """Placeholder - equipment categories not implemented in current model"""
    return None

def update_equipment_category(db: Session, category_id, name=None, description=None):
    """Placeholder - equipment categories not implemented in current model"""
    return False

def delete_equipment_category(db: Session, category_id):
    """Placeholder - equipment categories not implemented in current model"""
    return False

def add_equipment(db: Session, name, category_id=None, brand=None, model=None, serial_number=None, 
                 purchase_date=None, warranty_expiry=None, maintenance_schedule=None, 
                 location=None, quantity=1, notes=None, active=True):
    """Placeholder - comprehensive equipment add not implemented in current model"""
    # Fall back to simple add
    return add_equipment_simple(db, name, quantity)
