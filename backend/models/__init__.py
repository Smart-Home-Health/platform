# Smart Home Health Hub
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
Pydantic models for API request/response validation
"""

# Import User model first since other schemas reference it
from models.users import User, Role, Permission, AuditLog, Organization, OrganizationMembership, OrganizationType, Account

# Re-export SQLAlchemy models from schemas for backward compatibility
from schemas.business import Business, BusinessTypeAssignment
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
from schemas.symptom import Symptom
from schemas.patient import Patient, PatientAccess, AccessLevel
from schemas.diagnosis import Diagnosis, DiagnosisNote
from schemas.allergy import AllergyIntolerance
from schemas.clinical_results import DiagnosticReport, LabResult, ClinicalDocument, ImagingStudy
from schemas.implant import Implant, ImplantNote
from schemas.vent_import import VentImport
from schemas.vent_parameter_dictionary import VentParameterDictionary
from schemas.vent_sample import VentSample
from schemas.vent_device_info import VentDeviceInfo
from models.readers import Reader
from models.custom_vital_definition import CustomVitalDefinition

# Schedule-related Pydantic models
from models.schedule import CompleteItemRequest, BulkCompleteRequest

__all__ = [
    'Business', 'Provider', 'NutritionIntake', 'CareTaskCategory', 'CareTask',
    'CareTaskSchedule', 'CareTaskLog', 'Medication', 'MedicationSchedule',
    'MedicationLog', 'Equipment', 'EquipmentChangeLog', 'MonitoringAlert',
    'VentilatorAlert', 'ExternalAlarm', 'PulseOxData', 'Setting',
    'Vital', 'Symptom', 'Patient', 'User', 'Role',
    'Permission', 'AuditLog', 'Diagnosis', 'DiagnosisNote', 'AllergyIntolerance',
    'DiagnosticReport', 'LabResult', 'ClinicalDocument', 'ImagingStudy', 'Implant', 'ImplantNote',
    'VentImport', 'VentParameterDictionary', 'VentSample', 'VentDeviceInfo',
    'CompleteItemRequest', 'BulkCompleteRequest', 'Organization', 'OrganizationMembership',
    'OrganizationType', 'PatientAccess', 'AccessLevel', 'Reader', 'CustomVitalDefinition'
]
