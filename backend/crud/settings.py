"""
Settings management CRUD operations
"""
import logging
import json
from datetime import datetime
from sqlalchemy.orm import Session
from schemas.setting import Setting

logger = logging.getLogger('crud')


def save_setting(db: Session, key, value, data_type="string", description=None):
    """
    Save a setting to the database

    Args:
        key (str): Setting key/name
        value (any): Setting value (will be converted to string)
        data_type (str): Data type (string, int, float, bool, json)
        description (str, optional): Description of the setting
    """
    try:
        now = datetime.now().isoformat()

        # Convert value to string for storage
        str_value = str(value)

        # Check if setting exists
        exists = db.query(Setting).filter(Setting.key == key).first() is not None

        if exists:
            # Update existing setting
            db.query(Setting).filter(Setting.key == key).update({
                Setting.value: str_value,
                Setting.data_type: data_type,
                Setting.description: description,
                Setting.updated_at: now
            })
        else:
            # Create new setting
            setting = Setting(
                key=key,
                value=str_value,
                data_type=data_type,
                description=description,
                updated_at=now
            )
            db.add(setting)

        db.commit()
        logger.info(f"Setting saved: {key}={value}")
        
        # Publish MQTT update if nutrition targets changed
        if key in ['daily_calories', 'daily_water']:
            _publish_nutrition_targets_mqtt(db)
        
        return True
    except Exception as e:
        logger.error(f"Error saving setting: {e}")
        db.rollback()
        return False


def _publish_nutrition_targets_mqtt(db: Session):
    """Publish nutrition targets to MQTT when targets are updated"""
    try:
        from crud.patients import get_background_patient_id
        background_pid = get_background_patient_id(db)
        if background_pid is not None:
            from crud.nutrition import _publish_nutrition_targets_mqtt
            _publish_nutrition_targets_mqtt(db, background_pid)
            logger.info("Published nutrition targets MQTT after settings update")
    except Exception as e:
        logger.error(f"Error publishing nutrition targets to MQTT: {e}")


def get_setting(db: Session, key, default=None):
    """
    Get a setting from the database with proper type conversion

    Args:
        key (str): Setting key/name
        default (any, optional): Default value if setting not found

    Returns:
        any: The setting value with proper type conversion
    """
    try:
        row = db.query(Setting).filter(Setting.key == key).first()

        if not row:
            return default

        value = row.value
        data_type = row.data_type

        # Convert to appropriate type
        if data_type == 'int':
            return int(value)
        elif data_type == 'float':
            return float(value)
        elif data_type == 'bool':
            return value.lower() in ['true', '1', 'yes', 'on']
        elif data_type == 'json':
            try:
                return json.loads(value)
            except:
                return default
        else:
            return value

    except Exception as e:
        logger.error(f"Error fetching setting {key}: {e}")
        return default


def get_all_settings(db: Session):
    """
    Get all settings from the database

    Returns:
        dict: Dictionary of all settings with proper type conversion
    """
    try:
        rows = db.query(Setting).all()

        settings = {}
        for row in rows:
            settings[row.key] = get_setting(db, row.key)

        return settings

    except Exception as e:
        logger.error(f"Error fetching all settings: {e}")
        return {}


def delete_setting(db: Session, key):
    """
    Delete a setting from the database

    Args:
        key (str): Setting key/name

    Returns:
        bool: True if successful, False otherwise
    """
    try:
        result = db.query(Setting).filter(Setting.key == key).delete()
        db.commit()

        if result:
            logger.info(f"Setting deleted: {key}")
        else:
            logger.warning(f"Setting not found for deletion: {key}")

        return result > 0
    except Exception as e:
        logger.error(f"Error deleting setting {key}: {e}")
        return False
