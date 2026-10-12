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
"""Portable patient archives preserve care relationships across occupied accounts.

These tests use the isolated Postgres/TimescaleDB fixture and synthetic records.
They deliberately leave source rows and unrelated destination rows in place:
retaining a source foreign key can therefore succeed at the SQL level while
silently linking the restored patient to someone else's data.
"""

import io
import json
import tarfile
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from sqlalchemy import inspect, select, text
from sqlalchemy.exc import ProgrammingError

from crud.backup import export_patient_to_targz, restore_patient_from_targz
from models.custom_vital_definition import CustomVitalDefinition
from models.patient_env_range import PatientEnvRange
from models.patient_vent_pin import PatientVentPin, PatientVentPinState
from models.patient_vital_range import PatientVitalRange
from models.users import Account, User
from schemas.care_task import CareTask
from schemas.care_task_log import CareTaskLog
from schemas.clinical_results import LabResult
from schemas.dme_shipment import DMEShipment, DMEShipmentItem, DMEReceiptItem
from schemas.equipment import Equipment
from schemas.equipment_count_log import EquipmentCountLog
from schemas.external_alarm import ExternalAlarm
from schemas.medication import Medication
from schemas.medication_log import MedicationLog
from schemas.medication_schedule import MedicationSchedule
from schemas.monitoring_alert import MonitoringAlert
from schemas.nutrition_flush_followup import NutritionFlushFollowup
from schemas.nutrition_intake import NutritionIntake
from schemas.nutrition_item import NutritionItem
from schemas.nutrition_output import NutritionOutput
from schemas.nutrition_preset import NutritionPreset, NutritionPresetComponent
from schemas.nutrition_schedule import NutritionSchedule, NutritionScheduleComponent
from schemas.patient import Patient
from schemas.provider import Provider
from schemas.pulse_ox_data import PulseOxData
from schemas.vital import Vital


WHEN = datetime(2026, 7, 4, 13, 30, tzinfo=timezone.utc)
GROUP = "19c4d60e-8435-4268-afd3-6a93063e37dc"


def _add(db, model, **values):
    row = model(**values)
    db.add(row)
    db.flush()
    return row


def _members(archive):
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
        return {m.name: tar.extractfile(m).read() for m in tar if m.isfile()}


def _rewrite(archive, change):
    """Change JSON members without relying on the implementation's reader."""
    members = _members(archive)
    change(members)
    return _pack(members)


def _pack(members):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w:gz") as tar:
        for name, data in members.items():
            info = tarfile.TarInfo(name)
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
    return output.getvalue()


def _change_json(members, name, change):
    data = json.loads(members[name])
    change(data)
    members[name] = json.dumps(data).encode()


def _snapshot(row):
    return {col.key: getattr(row, col.key) for col in inspect(row).mapper.column_attrs}


@pytest.fixture
def migration_graph(db_session, account, patient, admin_user):
    db = db_session
    patient.account_id = account.id
    patient.ha_user_id = "a" * 32
    patient.care_area = "Bedroom"
    db.flush()
    target = _add(db, Account, name="Existing production family",
                  slug="backup-target", password_hash="unused-test-hash",
                  timezone="America/New_York", is_default=False)
    resident = _add(db, Patient, account_id=target.id, first_name="Existing",
                    last_name="Resident", ha_user_id="b" * 32,
                    created_at=WHEN, updated_at=WHEN)
    unrelated_item = _add(db, NutritionItem, account_id=target.id,
                          patient_id=None, name="Formula", item_type="tube_feed",
                          calories_per_unit=9.9)
    formula = _add(db, NutritionItem, account_id=account.id, patient_id=patient.id,
                   name="Formula", item_type="tube_feed", calories_per_unit=1.5,
                   default_amount=240, default_amount_unit="ml")
    water = _add(db, NutritionItem, account_id=account.id, patient_id=None,
                 name="Water", item_type="liquid", default_amount_unit="ml")
    preset = _add(db, NutritionPreset, account_id=account.id, patient_id=patient.id,
                  name="Evening feed", meal_type="dinner")
    _add(db, NutritionPresetComponent, preset_id=preset.id, item_id=formula.id,
         amount=240, amount_unit="ml", feed_route="pump", rate_ml_per_hr=120,
         sort_order=0)
    _add(db, NutritionPresetComponent, preset_id=preset.id, item_id=water.id,
         amount=60, amount_unit="ml", sort_order=1)
    shared_preset = _add(db, NutritionPreset, account_id=account.id, patient_id=None,
                         name="Shared hydration", meal_type="snack")
    _add(db, NutritionPresetComponent, preset_id=shared_preset.id, item_id=water.id,
         amount=90, amount_unit="ml", sort_order=0)
    schedule = _add(db, NutritionSchedule, patient_id=patient.id,
                    schedule_type="meal", name="Evening feed",
                    cron_expression="30 17 * * *", fills_fluid_goal=True,
                    fluid_min_ml=30, fluid_max_ml=90)
    _add(db, NutritionScheduleComponent, schedule_id=schedule.id,
         item_id=formula.id, amount=240, amount_unit="ml", feed_route="pump",
         rate_ml_per_hr=120, duration_minutes=120, sort_order=0)
    _add(db, NutritionScheduleComponent, schedule_id=schedule.id,
         item_id=water.id, amount=60, amount_unit="ml", is_flush=True, sort_order=1)
    care = _add(db, CareTask, account_id=account.id, patient_id=patient.id,
                name="Synthetic care task", created_at=WHEN, updated_at=WHEN)
    care_log = _add(db, CareTaskLog, care_task_id=care.id, patient_id=patient.id,
                    completed_at=WHEN, performed_by=admin_user.id, created_at=WHEN,
                    voided_at=WHEN + timedelta(minutes=5), voided_by=admin_user.id)
    intake = _add(db, NutritionIntake, account_id=account.id, patient_id=patient.id,
                  schedule_id=schedule.id, care_task_log_id=care_log.id,
                  item_id=formula.id, item_name="Formula", item_type="tube_feed",
                  amount=240, amount_unit="ml", calories=360,
                  event_group_id=GROUP, consumed_at=WHEN,
                  recorded_by=admin_user.id, created_at=WHEN, updated_at=WHEN)
    _add(db, NutritionIntake, account_id=account.id, patient_id=patient.id,
         item_id=water.id, item_name="Water", item_type="liquid", amount=60,
         amount_unit="ml", event_group_id=GROUP, consumed_at=WHEN,
         recorded_by=admin_user.id, created_at=WHEN, updated_at=WHEN,
         voided_at=WHEN + timedelta(minutes=5), voided_by=admin_user.id)
    _add(db, NutritionOutput, account_id=account.id, patient_id=patient.id,
         care_task_log_id=care_log.id, output_type="urine", occurred_at=WHEN,
         recorded_by=admin_user.id, amount=150, amount_unit="ml",
         voided_at=WHEN + timedelta(minutes=5), voided_by=admin_user.id)
    for status, group, voided in [
        ("pending", GROUP, False),
        ("completed", "86e25bdd-ad51-44ec-b6ba-096cc74df481", False),
        ("pending", "6ae2814e-4ef3-4073-8996-6596ed717ff3", True),
    ]:
        _add(db, NutritionFlushFollowup, account_id=account.id,
             patient_id=patient.id, schedule_id=schedule.id, item_id=water.id,
             item_name="Water", amount=60, amount_unit="ml",
             source_event_group_id=group, feed_scheduled_time=WHEN,
             due_at=WHEN + timedelta(hours=2), status=status,
             completed_by=admin_user.id if status == "completed" else None,
             completed_at=WHEN + timedelta(hours=2) if status == "completed" else None,
             completed_intake_group_id=GROUP if status == "completed" else None,
             voided_at=WHEN if voided else None,
             voided_by=admin_user.id if voided else None)
    med = _add(db, Medication, account_id=account.id, patient_id=patient.id,
               name="Synthetic medication", quantity=20, quantity_unit="ml",
               created_at=WHEN, updated_at=WHEN)
    med_schedule = _add(db, MedicationSchedule, medication_id=med.id,
                        patient_id=patient.id, cron_expression="0 10 * * *",
                        dose_amount=2, grace_period_hours=3.5,
                        created_at=WHEN, updated_at=WHEN)
    _add(db, MedicationLog, medication_id=med.id, patient_id=patient.id,
         schedule_id=med_schedule.id, administered_at=WHEN, dose_amount=2,
         administered_by=admin_user.id, created_at=WHEN,
         voided_at=WHEN + timedelta(minutes=5), voided_by=admin_user.id)
    vital = _add(db, Vital, account_id=account.id, patient_id=patient.id,
                 timestamp=WHEN, vital_type="spo2", value=97, unit="%",
                 source="capture", recorded_by=admin_user.id, encounter_uid=GROUP,
                 reference_low=92, reference_high=100, confirmed_against_warning=False,
                 created_at=WHEN)
    for seconds, spo2 in ((0, 97), (5, 98), (10, 96)):
        _add(db, PulseOxData, patient_id=patient.id,
             timestamp=WHEN + timedelta(seconds=seconds), spo2=spo2, bpm=75,
             pa=1.2, raw_data="synthetic reader sample", created_at=WHEN)
    equipment = _add(db, Equipment, account_id=account.id, patient_id=patient.id,
                     name="Synthetic supply", quantity=18, scheduled_replacement=False,
                     created_at=WHEN, updated_at=WHEN)
    _add(db, EquipmentCountLog, equipment_id=equipment.id, quantity_before=20,
         quantity_after=18, counted_by=admin_user.id, counted_at=WHEN, note="Shelf count")
    template = _add(db, DMEShipment, account_id=account.id, patient_id=patient.id,
                    is_template=True, order_number="template", created_by=admin_user.id,
                    created_at=WHEN, updated_at=WHEN)
    delivery = _add(db, DMEShipment, account_id=account.id, patient_id=patient.id,
                    template_source_id=template.id, order_number="delivery",
                    created_by=admin_user.id, finalized_by=admin_user.id,
                    created_at=WHEN, updated_at=WHEN)
    shipment_item = _add(db, DMEShipmentItem, shipment_id=delivery.id,
                         equipment_id=equipment.id, qty_ordered=10, qty_shipped=8,
                         qty_backordered=2, created_at=WHEN)
    _add(db, DMEReceiptItem, shipment_item_id=shipment_item.id, qty_received=8,
         received_by=admin_user.id, received_at=WHEN, created_at=WHEN)
    _add(db, PatientVitalRange, patient_id=patient.id, vital_key="spo2",
         expected_min=92, expected_max=100, required=True,
         set_by=admin_user.id, set_at=WHEN)
    _add(db, PatientEnvRange, patient_id=patient.id, metric="co2",
         caution_max=1200, critical_max=1800, set_by=admin_user.id, set_at=WHEN)
    _add(db, PatientVentPin, patient_id=patient.id, vendor="vocsn",
         parameter_key="9408", position=0, set_by=admin_user.id, set_at=WHEN)
    for vendor in ("vocsn", "deliberately-empty"):
        _add(db, PatientVentPinState, patient_id=patient.id, vendor=vendor,
             configured=True, set_by=admin_user.id, set_at=WHEN)
    db.commit()
    return SimpleNamespace(
        source=patient, source_account=account, source_user=admin_user,
        target=target, resident=resident, unrelated_item=unrelated_item,
        formula=formula, water=water, schedule=schedule, preset=preset,
        care_log=care_log, intake=intake, vital=vital, equipment=equipment,
        template=template, delivery=delivery,
    )


def _export(db, graph):
    return export_patient_to_targz(db, graph.source.id, graph.source_account.id)[0]


def _prepare_matching_caregiver(db, graph):
    # Real source and destination are separate databases. This test uses one
    # database, so free the globally unique name after taking the archive.
    username = graph.source_user.username
    graph.source_user.username = "source-only-caregiver"
    db.flush()
    target_user = _add(db, User, account_id=graph.target.id, username=username,
                       full_name="Production caregiver", password_hash="unused-test-hash")
    db.commit()
    return target_user


def _patient_rows(db, model, patient_id):
    return (db.query(model).execution_options(include_voided=True)
            .filter_by(patient_id=patient_id).all())


@pytest.mark.parametrize("explicit_nulls", [True, False], ids=["nulls", "values"])
def test_roundtrip_preserves_explicit_values_in_columns_with_defaults(
    db_session, migration_graph, explicit_nulls,
):
    """Historical SQL NULLs must survive string, boolean, integer and date defaults."""
    db, g = db_session, migration_graph
    lab = _add(db, LabResult, account_id=g.source_account.id, patient_id=g.source.id,
               created_at=WHEN)
    alert = _add(db, MonitoringAlert, account_id=g.source_account.id,
                 patient_id=g.source.id, start_time=WHEN, created_at=WHEN)
    custom = _add(db, CustomVitalDefinition, patient_id=g.source.id,
                  name="synthetic_custom_vital", created_at=WHEN.replace(tzinfo=None))
    cases = [
        ("vitals", g.vital, {"code_system": "", "source": "device-import"}),
        ("lab_results", lab, {"code_system": "urn:synthetic-lab", "source": "lab-import"}),
        ("monitoring_alerts", alert, {"acknowledged": True, "oxygen_used": False}),
        ("nutrition_schedules", g.schedule, {"reminder_minutes_before": 0}),
        ("custom_vital_definitions", custom, {"created_at": WHEN.replace(tzinfo=None)}),
    ]
    expected = []
    for name, row, non_null_values in cases:
        values = {field: None if explicit_nulls else value
                  for field, value in non_null_values.items()}
        model = type(row)
        # UPDATE stores actual SQL NULLs. Seeding model(field=None) would itself
        # apply the insert default and fail to reproduce historical records.
        db.execute(model.__table__.update().where(model.id == row.id).values(**values))
        expected.append((name, model, row.id, values))
    # JSON None means JSON null, not SQL NULL; keep that existing distinction.
    json_value = None if explicit_nulls else {"synthetic": [0, False, None]}
    db.execute(Vital.__table__.update().where(Vital.id == g.vital.id).values(raw_data=json_value))
    db.commit()
    db.expire_all()
    assert db.scalar(select(Vital.raw_data.is_(None)).where(Vital.id == g.vital.id)) is False

    archive = _export(db, g)
    members = _members(archive)
    for name, model, source_id, values in expected:
        exported = next(row for row in json.loads(members[name + ".json"])
                        if row["id"] == source_id)
        for field, value in values.items():
            assert exported[field] == (value.isoformat() if isinstance(value, datetime) else value)

    result = restore_patient_from_targz(db, archive, g.target.id)
    db.expire_all()
    restored_id = result["new_patient_id"]
    for name, model, source_id, values in expected:
        restored, = _patient_rows(db, model, restored_id)
        source, = (db.query(model).execution_options(include_voided=True)
                   .filter(model.id == source_id).all())
        for field, value in values.items():
            assert getattr(restored, field) == value, (name, field)
            assert getattr(source, field) == value, (name, field, "source changed")
    restored_vital, = _patient_rows(db, Vital, restored_id)
    assert restored_vital.raw_data == json_value
    assert db.scalar(select(Vital.raw_data.is_(None)).where(Vital.id == restored_vital.id)) is False


def test_cross_account_roundtrip_remaps_care_graph_and_preserves_target(db_session, migration_graph):
    db, g = db_session, migration_graph
    resident_before = _snapshot(g.resident)
    item_before = _snapshot(g.unrelated_item)
    archive = _export(db, g)
    caregiver = _prepare_matching_caregiver(db, g)
    summary = restore_patient_from_targz(db, archive, g.target.id)
    restored_id = summary["new_patient_id"]
    assert restored_id not in (g.source.id, g.resident.id)
    restored = db.get(Patient, restored_id)
    assert restored.account_id == g.target.id
    assert restored.care_area == "Bedroom"
    assert restored.ha_user_id is None
    assert any("ha" in warning.lower() and "link" in warning.lower()
               for warning in summary["warnings"])

    items = {row.name: row for row in _patient_rows(db, NutritionItem, restored_id)}
    assert set(items) == {"Formula", "Water"}
    assert items["Formula"].calories_per_unit == 1.5
    assert all(row.account_id == g.target.id for row in items.values())
    assert items["Formula"].id not in (g.formula.id, g.unrelated_item.id)
    assert items["Water"].id != g.water.id
    presets = {row.name: row for row in _patient_rows(db, NutritionPreset, restored_id)}
    assert set(presets) == {"Evening feed", "Shared hydration"}
    assert all(row.account_id == g.target.id for row in presets.values())
    preset = presets["Evening feed"]
    assert preset.id != g.preset.id
    assert preset.account_id == g.target.id
    components = db.query(NutritionPresetComponent).filter_by(preset_id=preset.id).order_by(NutritionPresetComponent.sort_order).all()
    assert [(row.item_id, row.amount) for row in components] == [
        (items["Formula"].id, 240), (items["Water"].id, 60)]
    shared_component, = db.query(NutritionPresetComponent).filter_by(
        preset_id=presets["Shared hydration"].id).all()
    assert (shared_component.item_id, shared_component.amount) == (items["Water"].id, 90)
    schedule, = _patient_rows(db, NutritionSchedule, restored_id)
    assert schedule.id != g.schedule.id
    assert (schedule.fills_fluid_goal, schedule.fluid_min_ml, schedule.fluid_max_ml) == (True, 30, 90)
    schedule_components = db.query(NutritionScheduleComponent).filter_by(schedule_id=schedule.id).order_by(NutritionScheduleComponent.sort_order).all()
    assert [(row.item_id, row.is_flush) for row in schedule_components] == [
        (items["Formula"].id, False), (items["Water"].id, True)]
    assert schedule_components[0].duration_minutes == 120
    intakes = _patient_rows(db, NutritionIntake, restored_id)
    assert len(intakes) == 2
    formula_intake = next(row for row in intakes if row.item_name == "Formula")
    assert (formula_intake.item_id, formula_intake.schedule_id) == (items["Formula"].id, schedule.id)
    care_log, = _patient_rows(db, CareTaskLog, restored_id)
    assert formula_intake.care_task_log_id == care_log.id != g.care_log.id
    assert all(row.recorded_by == caregiver.id for row in intakes)
    assert len({row.event_group_id for row in intakes}) == 1
    flushes = _patient_rows(db, NutritionFlushFollowup, restored_id)
    assert len(flushes) == 3
    assert all((row.item_id, row.schedule_id, row.account_id) ==
               (items["Water"].id, schedule.id, g.target.id) for row in flushes)
    completed = next(row for row in flushes if row.status == "completed")
    assert completed.completed_by == caregiver.id
    assert completed.completed_intake_group_id == formula_intake.event_group_id
    pending = next(row for row in flushes if row.status == "pending" and row.voided_at is None)
    assert pending.source_event_group_id == formula_intake.event_group_id

    vital, = _patient_rows(db, Vital, restored_id)
    assert vital.recorded_by == caregiver.id != g.source_user.id
    assert (vital.timestamp, vital.value, vital.reference_low, vital.reference_high) == (WHEN, 97, 92, 100)
    samples = sorted(_patient_rows(db, PulseOxData, restored_id), key=lambda row: row.timestamp)
    assert [(row.timestamp, row.spo2, row.bpm) for row in samples] == [
        (WHEN + timedelta(seconds=seconds), spo2, 75)
        for seconds, spo2 in ((0, 97), (5, 98), (10, 96))]
    med_schedule, = _patient_rows(db, MedicationSchedule, restored_id)
    assert med_schedule.grace_period_hours == 3.5
    shipments = {row.order_number: row for row in _patient_rows(db, DMEShipment, restored_id)}
    assert shipments["delivery"].template_source_id == shipments["template"].id != g.template.id
    assert shipments["delivery"].created_by == caregiver.id
    equipment, = _patient_rows(db, Equipment, restored_id)
    assert equipment.quantity == 18
    count, = db.query(EquipmentCountLog).filter_by(equipment_id=equipment.id).all()
    assert (count.quantity_before, count.quantity_after, count.counted_by) == (20, 18, caregiver.id)
    line, = db.query(DMEShipmentItem).filter_by(shipment_id=shipments["delivery"].id).all()
    assert line.equipment_id == equipment.id != g.equipment.id
    receipt, = db.query(DMEReceiptItem).filter_by(shipment_item_id=line.id).all()
    assert (receipt.qty_received, receipt.received_by) == (8, caregiver.id)

    for model in (PatientVitalRange, PatientEnvRange, PatientVentPin):
        row, = _patient_rows(db, model, restored_id)
        assert row.set_by == caregiver.id
    vital_range, = _patient_rows(db, PatientVitalRange, restored_id)
    assert (vital_range.expected_min, vital_range.required) == (92, True)
    env_range, = _patient_rows(db, PatientEnvRange, restored_id)
    assert env_range.critical_max == 1800
    pin_states = _patient_rows(db, PatientVentPinState, restored_id)
    assert {row.vendor for row in pin_states} == {"vocsn", "deliberately-empty"}
    assert all(row.configured and row.set_by == caregiver.id for row in pin_states)
    assert not db.query(PatientVentPin).filter_by(patient_id=restored_id, vendor="deliberately-empty").count()
    db.refresh(g.resident)
    db.refresh(g.unrelated_item)
    assert _snapshot(g.resident) == resident_before
    assert _snapshot(g.unrelated_item) == item_before
    assert g.source.ha_user_id == "a" * 32


def test_voided_history_survives_but_remains_hidden_from_normal_reads(db_session, migration_graph):
    db, g = db_session, migration_graph
    archive = _export(db, g)
    caregiver = _prepare_matching_caregiver(db, g)
    restored_id = restore_patient_from_targz(db, archive, g.target.id)["new_patient_id"]
    for model in (MedicationLog, CareTaskLog, NutritionIntake, NutritionOutput, NutritionFlushFollowup):
        all_rows = _patient_rows(db, model, restored_id)
        voided = [row for row in all_rows if row.voided_at is not None]
        assert len(voided) == 1, model.__tablename__
        assert voided[0].voided_by == caregiver.id, model.__tablename__
        visible = db.query(model).filter_by(patient_id=restored_id).all()
        assert len(visible) == len(all_rows) - 1, model.__tablename__


def test_missing_caregiver_becomes_target_import_user_not_source_user(db_session, migration_graph):
    db, g = db_session, migration_graph
    restored_id = restore_patient_from_targz(db, _export(db, g), g.target.id)["new_patient_id"]
    vital, = _patient_rows(db, Vital, restored_id)
    author = db.get(User, vital.recorded_by)
    assert author.id != g.source_user.id
    assert author.account_id == g.target.id
    assert author.username.startswith("__import_account_")
    assert not author.is_active


def test_same_named_shared_and_patient_items_remain_distinct(db_session, migration_graph):
    db, g = db_session, migration_graph
    shared_formula = _add(db, NutritionItem, account_id=g.source_account.id,
                          patient_id=None, name="Formula", item_type="tube_feed",
                          calories_per_unit=2.0)
    # This legitimate source name is exactly the first suffix a collision
    # resolver would choose for the shared Formula. A second unique name is
    # needed, without dropping or aliasing any of the three formulas.
    _add(db, NutritionItem, account_id=g.source_account.id,
         patient_id=g.source.id, name=f"Formula (imported {shared_formula.id})",
         item_type="tube_feed", calories_per_unit=3.0)
    shared_preset = _add(db, NutritionPreset, account_id=g.source_account.id,
                         patient_id=None, name="Different formula recipe")
    _add(db, NutritionPresetComponent, preset_id=shared_preset.id,
         item_id=shared_formula.id, amount=125, amount_unit="ml")
    db.commit()
    summary = restore_patient_from_targz(db, _export(db, g), g.target.id)
    restored_id = summary["new_patient_id"]
    items = _patient_rows(db, NutritionItem, restored_id)
    formulas = [row for row in items if row.item_type == "tube_feed"]
    assert sorted(row.calories_per_unit for row in formulas) == [1.5, 2.0, 3.0]
    assert len({row.name for row in formulas}) == 3
    preset = db.query(NutritionPreset).filter_by(
        patient_id=restored_id, name="Different formula recipe").one()
    component = db.query(NutritionPresetComponent).filter_by(preset_id=preset.id).one()
    assert db.get(NutritionItem, component.item_id).calories_per_unit == 2.0
    assert component.item_id not in (shared_formula.id, g.formula.id, g.unrelated_item.id)
    assert summary["warnings"]


def test_dme_template_links_restore_when_delivery_precedes_template(db_session, migration_graph):
    db, g = db_session, migration_graph

    def reorder(members):
        _change_json(members, "dme_shipments.json",
                     lambda rows: rows.sort(key=lambda row: row["is_template"]))

    archive = _rewrite(_export(db, g), reorder)
    restored_id = restore_patient_from_targz(db, archive, g.target.id)["new_patient_id"]
    shipments = {row.order_number: row for row in _patient_rows(db, DMEShipment, restored_id)}
    assert shipments["delivery"].template_source_id == shipments["template"].id
    assert shipments["delivery"].template_source_id != g.template.id


def _counts(db):
    return {model.__tablename__: db.query(model).execution_options(include_voided=True).count()
            for model in (Patient, User, NutritionItem, NutritionPreset,
                          NutritionIntake, NutritionFlushFollowup, DMEShipment, Vital)}


@pytest.mark.parametrize("corruption", [
    "future_schema", "missing_member", "unknown_field", "missing_row_field",
    "missing_users_member", "missing_user_metadata", "missing_dependency",
])
def test_incompatible_or_incomplete_archive_fails_without_partial_restore(db_session, migration_graph, corruption):
    db, g = db_session, migration_graph
    archive = _export(db, g)
    before = _counts(db)

    def corrupt(members):
        if corruption == "future_schema":
            _change_json(members, "manifest.json", lambda row: row.update(schema_version=999999))
        elif corruption == "missing_member":
            del members["nutrition_items.json"]
        elif corruption == "unknown_field":
            _change_json(members, "nutrition_intakes.json", lambda rows: rows[0].update(future_clinical_field="must not be dropped"))
        elif corruption == "missing_row_field":
            # Nullable is deliberate: SQL would accept silently losing this
            # value unless the complete v4 row layout is checked first.
            _change_json(members, "nutrition_intakes.json", lambda rows: rows[0].pop("calories"))
        elif corruption == "missing_users_member":
            del members["users_referenced.json"]
        elif corruption == "missing_user_metadata":
            _change_json(members, "users_referenced.json", lambda rows: rows.clear())
            _change_json(members, "manifest.json", lambda row: row["counts"].update(users_referenced=0))
        else:
            # Counts remain honest: the failure must detect a dangling
            # dependency even though its old numeric ID exists in this DB.
            _change_json(members, "nutrition_items.json", lambda rows: rows.clear())
            _change_json(members, "manifest.json", lambda row: row["counts"].update(nutrition_items=0))

    with pytest.raises(ValueError):
        restore_patient_from_targz(db, _rewrite(archive, corrupt), g.target.id)
    assert _counts(db) == before
    assert db.get(Patient, g.resident.id).ha_user_id == "b" * 32


def test_patient_export_cannot_follow_foreign_account_nutrition_dependency(db_session, migration_graph):
    db, g = db_session, migration_graph
    g.intake.item_id = g.unrelated_item.id
    db.commit()
    with pytest.raises(ValueError):
        _export(db, g)


def test_export_existing_patient_with_missing_avatar_is_422(admin_client, db_session, patient, account, monkeypatch, tmp_path):
    import avatar_store

    monkeypatch.setattr(avatar_store, "PHOTOS_DIR", str(tmp_path / "photos"))
    patient.account_id = account.id
    patient.avatar_photo = "f" * 32 + ".png"
    db_session.commit()
    response = admin_client.get(f"/api/backup/export/{patient.id}")
    assert response.status_code == 422, response.text
    assert "attachment" in response.json()["detail"].lower()
    assert "missing" in response.json()["detail"].lower()


@pytest.mark.parametrize("version", [1, 2, 3])
def test_legacy_archive_restores_with_explicit_incompleteness_warnings(
    db_session, account, patient, admin_user, version, monkeypatch, tmp_path,
):
    """Build old-format members literally; do not relabel a modern export."""
    import avatar_store

    db = db_session
    monkeypatch.setattr(avatar_store, "PHOTOS_DIR", str(tmp_path / "photos"))
    patient.account_id = account.id
    task = _add(db, CareTask, account_id=account.id, patient_id=patient.id,
                name="Unrelated target task", created_at=WHEN, updated_at=WHEN)
    log = _add(db, CareTaskLog, care_task_id=task.id, patient_id=patient.id,
               completed_at=WHEN, performed_by=admin_user.id, created_at=WHEN)
    db.commit()
    target_log_before = _snapshot(log)
    source_id = patient.id + 10000
    source_account = account.id + 10000
    stamp = WHEN.isoformat()
    patient_row = {
        "id": source_id, "account_id": source_account, "first_name": "Legacy",
        "last_name": "Synthetic", "is_active": True,
        "avatar_photo": "a" * 32 + ".png", "created_at": stamp, "updated_at": stamp,
    }
    intake_row = {
        "id": 700, "patient_id": source_id, "account_id": source_account,
        "care_task_log_id": log.id, "item_name": "Water", "item_type": "liquid",
        "amount": 60, "amount_unit": "ml", "consumed_at": stamp,
        "recorded_by": admin_user.id, "created_at": stamp, "updated_at": stamp,
    }
    provider_row = {
        "id": 701, "patient_id": source_id, "account_id": source_account,
        "first_name": "Legacy", "last_name": "Provider", "provider_type": "medical",
        "created_at": stamp, "updated_at": stamp,
    }
    pulse_rows = [{
        "id": 702, "patient_id": source_id, "timestamp": stamp,
        "spo2": 97, "bpm": 75, "created_at": stamp,
    }]
    vital_base = {
        "patient_id": source_id, "timestamp": stamp, "vital_type": "spo2",
        "value": 97, "created_at": stamp,
    }
    vital_rows = [
        dict(vital_base, id=703),  # Omitted legacy fields should still default.
        dict(vital_base, id=704, code_system=None, source=None),
    ]
    manifest = {
        "format_version": version, "source_account_id": source_account,
        "exported_at": stamp, "patient": {"id": source_id, "first_name": "Legacy"},
    }
    json_members = {
        "manifest.json": manifest, "patient.json": [patient_row],
        "providers.json": [provider_row], "nutrition_intakes.json": [intake_row],
        "vitals.json": vital_rows,
        "users_referenced.json": {
            str(admin_user.id): {"username": "unavailable-external-caregiver", "full_name": "Old caregiver"}},
    }
    members = {name: json.dumps(value).encode() for name, value in json_members.items()}
    if version < 3:
        members["pulse_ox_data.json"] = json.dumps(pulse_rows).encode()
    else:
        members["pulse_ox_data.ndjson"] = b"".join(json.dumps(row).encode() + b"\n" for row in pulse_rows)

    result = restore_patient_from_targz(db, _pack(members), account.id)
    restored_id = result["new_patient_id"]
    assert restored_id != patient.id
    assert result["format_version"] == version
    restored = db.get(Patient, restored_id)
    assert restored.first_name == "Legacy"
    assert restored.avatar_photo is None
    restored_provider, = _patient_rows(db, Provider, restored_id)
    assert restored_provider.last_name == "Provider"
    restored_intake, = _patient_rows(db, NutritionIntake, restored_id)
    assert restored_intake.care_task_log_id is None, "never attach an unavailable source log by its numeric target ID"
    assert restored_intake.amount == 60
    author = db.get(User, restored_intake.recorded_by)
    assert author.account_id == account.id
    assert author.id != admin_user.id
    assert not author.is_active
    assert author.username.startswith("__import_account_")
    sample, = _patient_rows(db, PulseOxData, restored_id)
    assert (sample.timestamp, sample.spo2, sample.bpm) == (WHEN, 97, 75)
    legacy_vitals = sorted(_patient_rows(db, Vital, restored_id), key=lambda row: row.id)
    assert [(row.code_system, row.source) for row in legacy_vitals] == [
        ("http://loinc.org", "manual"), (None, None),
    ]
    warnings = " ".join(result["warnings"]).lower()
    assert "legacy" in warnings and "omitted" in warnings
    assert "attachment" in warnings
    assert "care_task_log_id" in warnings and "cleared" in warnings
    assert "caregiver" in warnings and "imported" in warnings
    db.refresh(log)
    assert _snapshot(log) == target_log_before


def test_alert_sample_boundaries_remap_and_preserve_reader_sample_order(db_session, migration_graph):
    db, g = db_session, migration_graph
    source_samples = sorted(_patient_rows(db, PulseOxData, g.source.id), key=lambda row: row.id)
    # Leave an unreferenced sample before a boundary. Batched insert flushing
    # must not place that sample after the boundary and change ID-range reads.
    alert = _add(db, MonitoringAlert, account_id=g.source_account.id,
                 patient_id=g.source.id, start_time=source_samples[1].timestamp,
                 end_time=source_samples[2].timestamp, start_data_id=source_samples[1].id,
                 end_data_id=source_samples[2].id, spo2_min=96, created_at=WHEN)
    db.commit()
    restored_id = restore_patient_from_targz(db, _export(db, g), g.target.id)["new_patient_id"]
    restored_alert, = _patient_rows(db, MonitoringAlert, restored_id)
    samples = sorted(_patient_rows(db, PulseOxData, restored_id), key=lambda row: row.id)
    assert [row.timestamp for row in samples] == [row.timestamp for row in source_samples]
    assert restored_alert.start_data_id == samples[1].id != alert.start_data_id
    assert restored_alert.end_data_id == samples[2].id != alert.end_data_id
    within_alert = db.query(PulseOxData).filter(
        PulseOxData.patient_id == restored_id,
        PulseOxData.id.between(restored_alert.start_data_id, restored_alert.end_data_id),
    ).order_by(PulseOxData.id).all()
    assert [row.spo2 for row in within_alert] == [98, 96]


def _legacy_alarm_archive(db, graph):
    # Some installations predate the consolidated migrations and retain this
    # table. DDL is inside the isolated test's outer rollback transaction.
    ExternalAlarm.__table__.create(db.connection(), checkfirst=True)
    alert = _add(db, MonitoringAlert, account_id=graph.source_account.id,
                 patient_id=graph.source.id, start_time=WHEN, created_at=WHEN)
    legacy = _add(db, ExternalAlarm, alert_id=alert.id, device_id="synthetic-gpio",
                  pin=17, start_time=WHEN, last_activity=WHEN, created_at=WHEN)
    db.commit()
    return _export(db, graph), legacy.id


def test_legacy_external_alarm_history_restores_when_destination_supports_it(db_session, migration_graph):
    db, g = db_session, migration_graph
    archive, source_id = _legacy_alarm_archive(db, g)
    result = restore_patient_from_targz(db, archive, g.target.id)
    restored_alert, = _patient_rows(db, MonitoringAlert, result["new_patient_id"])
    legacy = db.query(ExternalAlarm).filter_by(alert_id=restored_alert.id).one()
    assert legacy.id != source_id
    assert (legacy.device_id, legacy.pin, legacy.start_time) == ("synthetic-gpio", 17, WHEN)


def test_legacy_external_alarm_history_rejected_before_writes_without_target_table(db_session, migration_graph):
    db, g = db_session, migration_graph
    archive, _ = _legacy_alarm_archive(db, g)
    # Reproduce a normal destination built solely by the actual migrations.
    # The archive is the recovery copy of the synthetic source row.
    ExternalAlarm.__table__.drop(db.connection())
    db.commit()
    before = _counts(db)
    with pytest.raises(ValueError, match="legacy external_alarms.*destination"):
        restore_patient_from_targz(db, archive, g.target.id)
    assert _counts(db) == before
    assert not inspect(db.connection()).has_table("external_alarms")


def test_missing_required_table_is_not_treated_as_empty_legacy_history(db_session, migration_graph):
    db, g = db_session, migration_graph
    # A transaction-local rename reproduces a broken required schema without
    # dropping any synthetic records. Rolling back restores the original name.
    db.execute(text("ALTER TABLE nutrition_items RENAME TO backup_test_missing_nutrition_items"))
    try:
        with pytest.raises(ProgrammingError, match="nutrition_items"):
            _export(db, g)
    finally:
        db.rollback()
    assert inspect(db.connection()).has_table("nutrition_items")
