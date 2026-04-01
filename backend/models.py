from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey, Boolean, DateTime
from sqlalchemy import TIMESTAMP
from sqlalchemy.orm import declarative_base, relationship

# Import Base from schemas for new schema models
from schemas import Base as SchemaBase

# Maintain backward compatibility with existing code
Base = declarative_base()

# Import models from schemas (migrated)
from schemas.business import Business
from schemas.provider import Provider
from schemas.nutrition_intake import NutritionIntake
from schemas.care_task_category import CareTaskCategory
from schemas.care_task import CareTask
from schemas.care_task_schedule import CareTaskSchedule
from schemas.care_task_log import CareTaskLog
from schemas.medication import Medication
from schemas.medication_schedule import MedicationSchedule
from schemas.medication_log import MedicationLog
from schemas.equipment import Equipment
from schemas.equipment_change_log import EquipmentChangeLog
from schemas.monitoring_alert import MonitoringAlert
from schemas.ventilator_alert import VentilatorAlert
from schemas.external_alarm import ExternalAlarm
from schemas.pulse_ox_data import PulseOxData
from schemas.setting import Setting
from schemas.vital import Vital
from schemas.patient import Patient