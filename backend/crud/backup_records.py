# Smart Home Health
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
"""Explicit portability contract for patient archives.

Order is dependency order, except shipment self-links (wired in a second pass).
Adding a patient table/column must update this contract and its roundtrip tests.
Account configuration and credentials are intentionally not portable patient data.
"""
from functools import lru_cache

from sqlalchemy import inspect as sa_inspect, or_

from schemas.patient import Patient
from schemas.provider import Provider
from schemas.medication import Medication
from schemas.medication_schedule import MedicationSchedule
from schemas.medication_log import MedicationLog
from schemas.care_task import CareTask
from schemas.care_task_schedule import CareTaskSchedule
from schemas.care_task_log import CareTaskLog
from schemas.equipment import Equipment
from schemas.equipment_change_log import EquipmentChangeLog
from schemas.equipment_count_log import EquipmentCountLog
from schemas.equipment_provider_alias import EquipmentProviderAlias
from schemas.vital import Vital
from schemas.pulse_ox_data import PulseOxData
from schemas.monitoring_alert import MonitoringAlert
from schemas.ventilator_alert import VentilatorAlert
from schemas.external_alarm import ExternalAlarm
from schemas.symptom import Symptom
from schemas.diagnosis import Diagnosis, DiagnosisNote
from schemas.implant import Implant, ImplantNote
from schemas.nutrition_item import NutritionItem
from schemas.nutrition_preset import NutritionPreset, NutritionPresetComponent
from schemas.nutrition_intake import NutritionIntake
from schemas.nutrition_output import NutritionOutput
from schemas.nutrition_schedule import NutritionSchedule, NutritionScheduleComponent
from schemas.nutrition_flush_followup import NutritionFlushFollowup
from schemas.nutrition_goal import NutritionGoal
from schemas.dme_shipment import (DMEShipment, DMEShipmentItem, DMEReceiptItem,
                                  DMEShipmentAlert, DMEShipmentDocument)
from schemas.allergy import AllergyIntolerance
from schemas.clinical_results import DiagnosticReport, LabResult, ImagingStudy, ClinicalDocument
from schemas.vent_import import VentImport
from schemas.vent_sample import VentSample
from schemas.vent_device_info import VentDeviceInfo
from models.custom_vital_definition import CustomVitalDefinition
from models.patient_vital_range import PatientVitalRange
from models.patient_env_range import PatientEnvRange
from models.patient_vent_pin import PatientVentPin, PatientVentPinState

# Stable archive names (legacy names are preserved) and FK dependency order.
MODELS = dict([
    ('patient', Patient), ('providers', Provider),
    ('medications', Medication), ('medication_schedules', MedicationSchedule),
    ('care_tasks', CareTask), ('care_task_schedules', CareTaskSchedule),
    ('care_task_logs', CareTaskLog), ('medication_logs', MedicationLog),
    ('equipment', Equipment), ('equipment_change_logs', EquipmentChangeLog),
    ('equipment_count_logs', EquipmentCountLog), ('equipment_provider_aliases', EquipmentProviderAlias),
    ('diagnoses', Diagnosis), ('diagnosis_notes', DiagnosisNote),
    ('implants', Implant), ('implant_notes', ImplantNote),
    ('allergies', AllergyIntolerance), ('custom_vital_definitions', CustomVitalDefinition),
    ('patient_vital_ranges', PatientVitalRange), ('patient_env_ranges', PatientEnvRange),
    ('patient_vent_pins', PatientVentPin), ('patient_vent_pin_state', PatientVentPinState),
    ('diagnostic_reports', DiagnosticReport), ('lab_results', LabResult),
    ('imaging_studies', ImagingStudy), ('clinical_documents', ClinicalDocument),
    ('vent_imports', VentImport), ('vent_device_info', VentDeviceInfo),
    ('vent_samples', VentSample), ('vitals', Vital), ('pulse_ox_data', PulseOxData),
    ('monitoring_alerts', MonitoringAlert), ('external_alarms', ExternalAlarm),
    ('ventilator_alerts', VentilatorAlert), ('symptoms', Symptom),
    ('nutrition_items', NutritionItem), ('nutrition_presets', NutritionPreset),
    ('nutrition_preset_components', NutritionPresetComponent),
    ('nutrition_schedules', NutritionSchedule), ('nutrition_schedule_components', NutritionScheduleComponent),
    ('nutrition_goals', NutritionGoal), ('nutrition_intakes', NutritionIntake),
    ('nutrition_outputs', NutritionOutput), ('nutrition_flush_followups', NutritionFlushFollowup),
    ('dme_shipments', DMEShipment), ('dme_shipment_items', DMEShipmentItem),
    ('dme_receipt_items', DMEReceiptItem), ('dme_shipment_alerts', DMEShipmentAlert),
    ('dme_shipment_documents', DMEShipmentDocument),
])
STREAMED = {'pulse_ox_data', 'vent_samples'}
TABLE_NAMES = {model.__tablename__: name for name, model in MODELS.items()}
SCHEMA_VERSION = 1

# This obsolete GPIO alarm model was never created by the migration chain.
# A pre-migration installation may still contain the table and history. Only
# this known legacy table is optional; a missing migrated table remains an error.
OPTIONAL_LEGACY_TABLES = frozenset({'external_alarms'})

# These are foreign keys intentionally cleared, never retained as numeric IDs.
CLEARED_REFERENCES = {'businesses', 'care_task_category', 'organizations'}
EXCLUSIONS = {
    'accounts/users/roles/permissions/audit_log': 'Account credentials, roles and authentication audit are not transferred; match caregiver usernames and grant access separately.',
    'patient_access/organizations/organization_memberships': 'Access grants and organization ownership are not transferred.',
    'ha_seen_identities/ha_entity_mappings/readers': 'HA identities/mappings and reader registrations or pairing keys must be configured separately.',
    'integrations/patient_integrations/integration_devices/settings': 'Integration credentials, MQTT and account/system settings must be configured separately; ventilator history is attached to a new Imported Data integration.',
    'businesses/business_type_assignments/care_task_category': 'Supplier, pharmacy, provider-business and care-task-category links are cleared; reconcile them after import.',
    'environmental_observations': 'Account/room environmental history is shared, not patient-owned, and is not transferred.',
    'user_messages/user_message_acknowledgements': 'Operational messages and acknowledgement state contain source-specific links and are not transferred; destination generators recreate current notices.',
    'vent_ingested_files/vent_parameter_dictionary': 'Integration ingest deduplication ledgers and shared parser dictionaries are not transferred; reconcile live integration imports before enabling ingestion.',
}


@lru_cache(maxsize=None)
def fields(model):
    return {attr.key: attr.columns[0] for attr in sa_inspect(model).column_attrs}


@lru_cache(maxsize=None)
def user_fields(model):
    result = {key for key, column in fields(model).items()
              if any(fk.column.table.name == 'users' for fk in column.foreign_keys)}
    # Follow-up provenance predates database FK constraints.
    if model is NutritionFlushFollowup:
        result.update(('completed_by', 'voided_by'))
    return frozenset(result)


def row_dict(row):
    return {key: getattr(row, key) for key in fields(type(row))}


def gather_rows(db, patient_id, account_id):
    """Select the patient graph, including shared dependencies, never other patients.

    Read-only callers must freeze source writers (or use a consistent DB snapshot)
    for the duration of export. Voided rows are deliberately included as history.
    """
    def query(model):
        return db.query(model).execution_options(include_voided=True)

    patient = query(Patient).filter(Patient.id == patient_id, Patient.account_id == account_id).first()
    if patient is None:
        raise ValueError(f'Patient {patient_id} not found in account {account_id}')
    assert_coverage()
    rows = {'patient': [patient]}
    for name, model in MODELS.items():
        if name == 'patient' or name in STREAMED:
            continue
        if hasattr(model, 'patient_id'):
            rows[name] = query(model).filter(model.patient_id == patient_id).all()
        else:
            rows[name] = []

    # The reusable library available to this patient includes account-shared entries.
    # Restore scopes these copies to the new patient instead of mutating target globals.
    for name in ('nutrition_items', 'nutrition_presets'):
        model = MODELS[name]
        rows[name] += query(model).filter(model.patient_id.is_(None), model.account_id == account_id).all()

    def children(name, field, parents):
        model = MODELS[name]
        ids = [row.id for row in rows[parents]]
        if name in OPTIONAL_LEGACY_TABLES and ids and not sa_inspect(db.connection()).has_table(model.__tablename__):
            rows[name] = []
            return
        rows[name] = query(model).filter(getattr(model, field).in_(ids)).all() if ids else []

    for name, field, parent in (
        ('diagnosis_notes', 'diagnosis_id', 'diagnoses'),
        ('implant_notes', 'implant_id', 'implants'),
        ('vent_device_info', 'import_id', 'vent_imports'),
        ('external_alarms', 'alert_id', 'monitoring_alerts'),
        ('nutrition_preset_components', 'preset_id', 'nutrition_presets'),
        ('nutrition_schedule_components', 'schedule_id', 'nutrition_schedules'),
        ('dme_shipment_items', 'shipment_id', 'dme_shipments'),
        ('dme_receipt_items', 'shipment_item_id', 'dme_shipment_items'),
        ('dme_shipment_alerts', 'shipment_id', 'dme_shipments'),
        ('dme_shipment_documents', 'shipment_id', 'dme_shipments'),
    ):
        children(name, field, parent)

    def dependencies(name, references):
        model = MODELS[name]
        present = {r.id for r in rows[name]}
        required = {getattr(r, field) for entity, field in references for r in rows[entity]
                    if getattr(r, field) is not None}
        missing = required - present
        if missing:
            rows[name] += query(model).filter(model.id.in_(missing)).all()
        if required - {r.id for r in rows[name]}:
            raise ValueError(f'Missing source dependency in {name}')

    dependencies('medications', [('medication_logs', 'medication_id'), ('medication_schedules', 'medication_id')])
    dependencies('care_tasks', [('care_task_logs', 'care_task_id'), ('care_task_schedules', 'care_task_id')])
    dependencies('equipment', [('equipment_change_logs', 'equipment_id'), ('dme_shipment_items', 'equipment_id')])
    dependencies('nutrition_items', [(name, 'item_id') for name in (
        'nutrition_intakes', 'nutrition_preset_components', 'nutrition_schedule_components', 'nutrition_flush_followups')])
    for name, field, parent in (
        ('medication_schedules', 'medication_id', 'medications'),
        ('care_task_schedules', 'care_task_id', 'care_tasks'),
    ):
        model = MODELS[name]
        ids = [r.id for r in rows[parent]]
        rows[name] = query(model).filter(getattr(model, field).in_(ids),
            or_(model.patient_id == patient_id, model.patient_id.is_(None))).all() if ids else []
    children('equipment_count_logs', 'equipment_id', 'equipment')
    children('equipment_provider_aliases', 'equipment_id', 'equipment')

    # Malformed legacy cross-account or cross-patient references must fail loudly.
    result = {}
    for name, values in rows.items():
        result[name] = [row_dict(row) for row in values]
        for row in result[name]:
            if 'account_id' in row and row['account_id'] not in (None, account_id):
                raise ValueError(f'Cross-account source dependency in {name}')
            if 'patient_id' in row and row['patient_id'] not in (None, patient_id):
                raise ValueError(f'Cross-patient source dependency in {name}')
    return result


def validate_legacy_target_tables(db, rows):
    """Reject legacy history an unmigrated destination cannot store, before writes."""
    for name in OPTIONAL_LEGACY_TABLES:
        if rows.get(name) and not sa_inspect(db.connection()).has_table(MODELS[name].__tablename__):
            raise ValueError(
                f'Archive contains legacy {name} records, but the destination lacks '
                'that table; reconcile the legacy schema before restoring. '
                'No legacy alarm history was discarded.'
            )


def validate_rows(rows, *, strict, patient_id, account_id):
    """Check shapes, field compatibility, scoping and relational closure before writes."""
    ids = {}
    for name, values in rows.items():
        if name not in MODELS or name in STREAMED:
            continue
        if not isinstance(values, list) or any(not isinstance(row, dict) for row in values):
            raise ValueError(f'{name} must be an array of records')
        seen = set()
        allowed = fields(MODELS[name])
        for row in values:
            unknown = set(row) - set(allowed)
            if unknown:
                raise ValueError(f'Unsupported fields in {name}: {", ".join(sorted(unknown))}; use a matching application version')
            if strict and set(row) != set(allowed):
                raise ValueError(f'Missing fields in {name}: {", ".join(sorted(set(allowed) - set(row)))}')
            old_id = row.get('id')
            if old_id is None or isinstance(old_id, bool) or not isinstance(old_id, (int, str)) or old_id in seen:
                raise ValueError(f'Missing or duplicate id in {name}')
            seen.add(old_id)
            if 'account_id' in row and row['account_id'] not in (None, account_id):
                raise ValueError(f'Cross-account record in {name}')
            if 'patient_id' in row and row['patient_id'] not in (None, patient_id):
                raise ValueError(f'Cross-patient record in {name}')
        ids[name] = seen
    for name, values in rows.items():
        if name not in MODELS or name in STREAMED:
            continue
        for row in values:
            for field, column in fields(MODELS[name]).items():
                value = row.get(field)
                if value is None:
                    continue
                for fk in column.foreign_keys:
                    table = fk.column.table.name
                    if table in ('users', 'accounts', 'patients', 'patient_integrations') or table in CLEARED_REFERENCES:
                        continue
                    target = TABLE_NAMES.get(table)
                    if target is None:
                        raise ValueError(f'Unsupported relationship {name}.{field}')
                    if value not in ids.get(target, set()):
                        # Old archives omitted these dependencies. They can be imported
                        # only by explicitly clearing optional missing references.
                        if not strict and column.nullable:
                            continue
                        raise ValueError(f'Missing dependency for {name}.{field}={value}')
    return ids


# Direct patient tables excluded above; this guard catches future omissions at
# export time instead of advertising an incomplete archive as a successful backup.
EXCLUDED_PATIENT_TABLES = {'patient_access', 'readers', 'ha_entity_mappings',
                           'patient_integrations', 'user_messages'}
EXCLUDED_CHILD_TABLES = {'vent_ingested_files', 'user_message_acknowledgements', 'integration_devices'}


def assert_coverage():
    metadata = Patient.metadata
    covered = set(TABLE_NAMES)
    for table in metadata.tables.values():
        parents = {fk.column.table.name for fk in table.foreign_keys}
        if ('patients' in parents or parents & covered) and table.name not in covered:
            if table.name not in EXCLUDED_PATIENT_TABLES | EXCLUDED_CHILD_TABLES:
                raise ValueError(f'Patient backup coverage must be updated for table {table.name}')
