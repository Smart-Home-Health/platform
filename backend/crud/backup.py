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
"""
Patient backup / restore.

Export: serialize a single patient and all of their related rows into a
.tar.gz archive containing one JSON file per entity plus a manifest.

Restore: parse the archive, create a fresh patient under the importing
account, and replay every related row while remapping foreign keys
(old_id -> new_id). Any user-attribution column whose original user is
not present in the target account falls back to a per-account hidden
"__import_account_{N}__" user that is created lazily on first restore.
"""
from __future__ import annotations

import io
import json
import logging
import os
import tarfile
import tempfile
import uuid
from datetime import datetime, date
from decimal import Decimal
from typing import Any, Callable, Dict, List, Optional, Tuple

from sqlalchemy import inspect as sa_inspect, func, select
from sqlalchemy.orm import Session

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
from schemas.vital import Vital
from schemas.pulse_ox_data import PulseOxData
from schemas.monitoring_alert import MonitoringAlert
from schemas.ventilator_alert import VentilatorAlert
from schemas.symptom import Symptom
from schemas.diagnosis import Diagnosis, DiagnosisNote
from schemas.implant import Implant, ImplantNote
from schemas.nutrition_intake import NutritionIntake
from schemas.nutrition_output import NutritionOutput
from schemas.nutrition_schedule import NutritionSchedule
from schemas.nutrition_goal import NutritionGoal
from schemas.dme_shipment import DMEShipment, DMEShipmentItem, DMEReceiptItem, DMEShipmentAlert
from schemas.allergy import AllergyIntolerance
from schemas.clinical_results import DiagnosticReport, LabResult, ImagingStudy
from schemas.integration import Integration, PatientIntegration
from schemas.vent_import import VentImport
from schemas.vent_sample import VentSample
from schemas.vent_device_info import VentDeviceInfo
from models.custom_vital_definition import CustomVitalDefinition
from models.users import User

logger = logging.getLogger(__name__)

# Synthetic integration that owns data brought in via restore (e.g. ventilator
# imports, whose integration_id FK is NOT NULL). It is a DB-only catalog row —
# deliberately NOT registered in the in-code IntegrationRegistry — so it never
# appears in the "add integration" picker (registry-based) but does show on a
# patient that has it (the per-patient list reads metadata from the DB row).
IMPORTED_INTEGRATION_SLUG = "imported"

# v2 (2026-06-15) added: allergies, custom_vital_definitions, diagnostic_reports,
# lab_results, imaging_studies.
# v3 (2026-06-15) streams large sensor tables as NDJSON (`pulse_ox_data.ndjson`,
# `vent_samples.ndjson`) instead of one in-memory JSON array, to bound memory on
# multi-million-row patients, and adds the ventilator import set (vent_imports,
# vent_device_info, vent_samples). Restore stays backward-compatible: it reads
# the `.ndjson` member if present, else falls back to the legacy `.json` array.
BACKUP_FORMAT_VERSION = 3

# Rows per batch when streaming large tables in/out (server-side cursor + bulk insert).
STREAM_BATCH = 5000
IMPORT_USER_PREFIX = "__import_account_"


# ---------------------------------------------------------------------------
# JSON helpers
# ---------------------------------------------------------------------------

def _json_default(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def _row_to_dict(row) -> Dict[str, Any]:
    """Serialize a SQLAlchemy ORM row's mapped columns to a plain dict.

    Uses the mapper's ``column_attrs`` so the keys are Python attribute
    names (e.g. ``active``) rather than DB column names (e.g. ``is_active``)
    — the constructor we round-trip through accepts the former."""
    mapper = sa_inspect(row).mapper
    return {attr.key: getattr(row, attr.key) for attr in mapper.column_attrs}


def _dump_json_bytes(rows: List[Dict[str, Any]]) -> bytes:
    return json.dumps(rows, default=_json_default, indent=2).encode("utf-8")


def _add_to_tar(tar: tarfile.TarFile, name: str, data: bytes) -> None:
    info = tarfile.TarInfo(name=name)
    info.size = len(data)
    info.mtime = int(datetime.utcnow().timestamp())
    tar.addfile(info, io.BytesIO(data))


def _stream_table_to_tar(tar: tarfile.TarFile, db: Session, member_name: str,
                         table, where) -> int:
    """Stream a large table to the tar as NDJSON (one JSON object per line).

    Reads with a server-side cursor (`stream_results` + `yield_per`) over the
    raw table columns — no ORM identity map — and writes through a temp file so
    neither the row list nor a giant JSON string is ever fully in memory.
    Returns the row count.
    """
    stmt = select(table).where(where).execution_options(
        stream_results=True, yield_per=STREAM_BATCH,
    )
    count = 0
    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".ndjson",
                                      delete=False, encoding="utf-8")
    try:
        for row in db.execute(stmt).mappings():
            tmp.write(json.dumps(dict(row), default=_json_default))
            tmp.write("\n")
            count += 1
        tmp.close()
        tar.add(tmp.name, arcname=member_name)
    finally:
        tmp.close()
        os.unlink(tmp.name)
    return count


def _restore_stream_ndjson(db: Session, archive_bytes: bytes, member_name: str,
                           model, transform: Callable[[Dict[str, Any]], None]) -> int:
    """Stream an NDJSON tar member line-by-line and bulk-insert in batches.

    `transform` mutates each row dict in place (e.g. remap patient_id) and may
    return ``False`` to drop the row (e.g. an orphan whose parent didn't
    restore). The autoincrement `id` is dropped so the target DB assigns fresh
    ids. Returns the number of rows inserted. Missing member -> 0.
    """
    with tarfile.open(fileobj=io.BytesIO(archive_bytes), mode="r:gz") as tar:
        try:
            f = tar.extractfile(member_name)
        except KeyError:
            return 0
        if f is None:
            return 0
        inserted = 0
        batch: List[Dict[str, Any]] = []
        for raw in io.TextIOWrapper(f, encoding="utf-8"):
            raw = raw.strip()
            if not raw:
                continue
            row = json.loads(raw)
            row.pop("id", None)
            if transform(row) is False:
                continue
            batch.append(row)
            if len(batch) >= STREAM_BATCH:
                db.bulk_insert_mappings(model, batch)
                inserted += len(batch)
                batch.clear()
        if batch:
            db.bulk_insert_mappings(model, batch)
            inserted += len(batch)
    return inserted


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

def export_patient_to_targz(db: Session, patient_id: int, account_id: int) -> Tuple[bytes, str]:
    """
    Build a .tar.gz archive containing every row tied to this patient.

    Returns (archive_bytes, suggested_filename).
    """
    patient: Optional[Patient] = (
        db.query(Patient)
        .filter(Patient.id == patient_id, Patient.account_id == account_id)
        .first()
    )
    if patient is None:
        raise ValueError(f"Patient {patient_id} not found in account {account_id}")

    # ---- gather rows ------------------------------------------------------
    providers = db.query(Provider).filter(Provider.patient_id == patient_id).all()
    provider_ids = [p.id for p in providers]

    medications = db.query(Medication).filter(Medication.patient_id == patient_id).all()
    medication_ids = [m.id for m in medications]
    medication_schedules = (
        db.query(MedicationSchedule)
        .filter(MedicationSchedule.medication_id.in_(medication_ids))
        .all()
        if medication_ids else []
    )
    medication_logs = db.query(MedicationLog).filter(MedicationLog.patient_id == patient_id).all()

    care_tasks = db.query(CareTask).filter(CareTask.patient_id == patient_id).all()
    care_task_ids = [c.id for c in care_tasks]
    care_task_schedules = (
        db.query(CareTaskSchedule)
        .filter(CareTaskSchedule.care_task_id.in_(care_task_ids))
        .all()
        if care_task_ids else []
    )
    care_task_logs = db.query(CareTaskLog).filter(CareTaskLog.patient_id == patient_id).all()

    equipment = db.query(Equipment).filter(Equipment.patient_id == patient_id).all()
    equipment_change_logs = (
        db.query(EquipmentChangeLog).filter(EquipmentChangeLog.patient_id == patient_id).all()
    )

    vitals = db.query(Vital).filter(Vital.patient_id == patient_id).all()
    # pulse_ox_data is streamed (can be millions of rows) — only need its count here.
    pulse_ox_count = db.query(func.count(PulseOxData.id)).filter(PulseOxData.patient_id == patient_id).scalar()
    monitoring_alerts = db.query(MonitoringAlert).filter(MonitoringAlert.patient_id == patient_id).all()
    ventilator_alerts = db.query(VentilatorAlert).filter(VentilatorAlert.patient_id == patient_id).all()
    symptoms = db.query(Symptom).filter(Symptom.patient_id == patient_id).all()

    diagnoses = db.query(Diagnosis).filter(Diagnosis.patient_id == patient_id).all()
    diagnosis_ids = [d.id for d in diagnoses]
    diagnosis_notes = (
        db.query(DiagnosisNote).filter(DiagnosisNote.diagnosis_id.in_(diagnosis_ids)).all()
        if diagnosis_ids else []
    )

    implants = db.query(Implant).filter(Implant.patient_id == patient_id).all()
    implant_ids = [i.id for i in implants]
    implant_notes = (
        db.query(ImplantNote).filter(ImplantNote.implant_id.in_(implant_ids)).all()
        if implant_ids else []
    )

    nutrition_intakes = db.query(NutritionIntake).filter(NutritionIntake.patient_id == patient_id).all()
    nutrition_outputs = db.query(NutritionOutput).filter(NutritionOutput.patient_id == patient_id).all()
    nutrition_schedules = db.query(NutritionSchedule).filter(NutritionSchedule.patient_id == patient_id).all()
    nutrition_goals = db.query(NutritionGoal).filter(NutritionGoal.patient_id == patient_id).all()

    dme_shipments = db.query(DMEShipment).filter(DMEShipment.patient_id == patient_id).all()
    shipment_ids = [s.id for s in dme_shipments]
    dme_shipment_items = (
        db.query(DMEShipmentItem).filter(DMEShipmentItem.shipment_id.in_(shipment_ids)).all()
        if shipment_ids else []
    )
    item_ids = [i.id for i in dme_shipment_items]
    dme_receipt_items = (
        db.query(DMEReceiptItem).filter(DMEReceiptItem.shipment_item_id.in_(item_ids)).all()
        if item_ids else []
    )
    dme_shipment_alerts = (
        db.query(DMEShipmentAlert).filter(DMEShipmentAlert.shipment_id.in_(shipment_ids)).all()
        if shipment_ids else []
    )

    # ---- clinical extras (allergies, custom vital defs, diagnostic reports) ----
    allergies = db.query(AllergyIntolerance).filter(AllergyIntolerance.patient_id == patient_id).all()
    custom_vital_definitions = db.query(CustomVitalDefinition).filter(CustomVitalDefinition.patient_id == patient_id).all()
    diagnostic_reports = db.query(DiagnosticReport).filter(DiagnosticReport.patient_id == patient_id).all()
    lab_results = db.query(LabResult).filter(LabResult.patient_id == patient_id).all()
    imaging_studies = db.query(ImagingStudy).filter(ImagingStudy.patient_id == patient_id).all()

    # ---- ventilator imports + device info (small); samples streamed below ----
    vent_imports = db.query(VentImport).filter(VentImport.patient_id == patient_id).all()
    vent_import_ids = [vi.id for vi in vent_imports]
    vent_device_info = (
        db.query(VentDeviceInfo).filter(VentDeviceInfo.import_id.in_(vent_import_ids)).all()
        if vent_import_ids else []
    )
    vent_samples_count = db.query(func.count(VentSample.id)).filter(VentSample.patient_id == patient_id).scalar()

    # ---- collect referenced user ids for attribution preservation --------
    referenced_user_ids: set = set()
    def _collect(rows, *fields):
        for r in rows:
            for f in fields:
                v = getattr(r, f, None)
                if v is not None:
                    referenced_user_ids.add(v)

    _collect([patient], "owner_user_id")
    _collect(medication_logs, "administered_by")
    _collect(care_task_logs, "performed_by")
    _collect(equipment_change_logs, "changed_by")
    _collect(diagnoses, "created_by")
    _collect(diagnosis_notes, "created_by")
    _collect(implants, "created_by")
    _collect(implant_notes, "created_by")
    _collect(nutrition_intakes, "recorded_by")
    _collect(nutrition_outputs, "recorded_by")
    _collect(dme_shipments, "created_by", "finalized_by")
    _collect(dme_receipt_items, "received_by")
    _collect(dme_shipment_alerts, "resolved_by")
    _collect(allergies, "created_by")
    _collect(vent_imports, "uploaded_by")

    users_referenced = {}
    if referenced_user_ids:
        for u in db.query(User).filter(User.id.in_(referenced_user_ids)).all():
            users_referenced[u.id] = {"username": u.username, "full_name": u.full_name}

    # ---- build archive ---------------------------------------------------
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        manifest = {
            "format_version": BACKUP_FORMAT_VERSION,
            "exported_at": datetime.utcnow().isoformat() + "Z",
            "source_account_id": account_id,
            "patient": {
                "id": patient.id,
                "first_name": patient.first_name,
                "last_name": patient.last_name,
                "medical_record_number": patient.medical_record_number,
            },
            "counts": {
                "providers": len(providers),
                "medications": len(medications),
                "medication_schedules": len(medication_schedules),
                "medication_logs": len(medication_logs),
                "care_tasks": len(care_tasks),
                "care_task_schedules": len(care_task_schedules),
                "care_task_logs": len(care_task_logs),
                "equipment": len(equipment),
                "equipment_change_logs": len(equipment_change_logs),
                "vitals": len(vitals),
                "pulse_ox_data": pulse_ox_count,
                "monitoring_alerts": len(monitoring_alerts),
                "ventilator_alerts": len(ventilator_alerts),
                "symptoms": len(symptoms),
                "diagnoses": len(diagnoses),
                "diagnosis_notes": len(diagnosis_notes),
                "implants": len(implants),
                "implant_notes": len(implant_notes),
                "nutrition_intakes": len(nutrition_intakes),
                "nutrition_outputs": len(nutrition_outputs),
                "nutrition_schedules": len(nutrition_schedules),
                "nutrition_goals": len(nutrition_goals),
                "dme_shipments": len(dme_shipments),
                "dme_shipment_items": len(dme_shipment_items),
                "dme_receipt_items": len(dme_receipt_items),
                "dme_shipment_alerts": len(dme_shipment_alerts),
                "allergies": len(allergies),
                "custom_vital_definitions": len(custom_vital_definitions),
                "diagnostic_reports": len(diagnostic_reports),
                "lab_results": len(lab_results),
                "imaging_studies": len(imaging_studies),
                "vent_imports": len(vent_imports),
                "vent_device_info": len(vent_device_info),
                "vent_samples": vent_samples_count,
                "users_referenced": len(users_referenced),
            },
        }

        _add_to_tar(tar, "manifest.json", json.dumps(manifest, indent=2, default=_json_default).encode("utf-8"))
        _add_to_tar(tar, "patient.json", _dump_json_bytes([_row_to_dict(patient)]))
        _add_to_tar(tar, "providers.json", _dump_json_bytes([_row_to_dict(r) for r in providers]))
        _add_to_tar(tar, "medications.json", _dump_json_bytes([_row_to_dict(r) for r in medications]))
        _add_to_tar(tar, "medication_schedules.json", _dump_json_bytes([_row_to_dict(r) for r in medication_schedules]))
        _add_to_tar(tar, "medication_logs.json", _dump_json_bytes([_row_to_dict(r) for r in medication_logs]))
        _add_to_tar(tar, "care_tasks.json", _dump_json_bytes([_row_to_dict(r) for r in care_tasks]))
        _add_to_tar(tar, "care_task_schedules.json", _dump_json_bytes([_row_to_dict(r) for r in care_task_schedules]))
        _add_to_tar(tar, "care_task_logs.json", _dump_json_bytes([_row_to_dict(r) for r in care_task_logs]))
        _add_to_tar(tar, "equipment.json", _dump_json_bytes([_row_to_dict(r) for r in equipment]))
        _add_to_tar(tar, "equipment_change_logs.json", _dump_json_bytes([_row_to_dict(r) for r in equipment_change_logs]))
        _add_to_tar(tar, "vitals.json", _dump_json_bytes([_row_to_dict(r) for r in vitals]))
        _stream_table_to_tar(tar, db, "pulse_ox_data.ndjson",
                             PulseOxData.__table__, PulseOxData.patient_id == patient_id)
        _add_to_tar(tar, "monitoring_alerts.json", _dump_json_bytes([_row_to_dict(r) for r in monitoring_alerts]))
        _add_to_tar(tar, "ventilator_alerts.json", _dump_json_bytes([_row_to_dict(r) for r in ventilator_alerts]))
        _add_to_tar(tar, "symptoms.json", _dump_json_bytes([_row_to_dict(r) for r in symptoms]))
        _add_to_tar(tar, "diagnoses.json", _dump_json_bytes([_row_to_dict(r) for r in diagnoses]))
        _add_to_tar(tar, "diagnosis_notes.json", _dump_json_bytes([_row_to_dict(r) for r in diagnosis_notes]))
        _add_to_tar(tar, "implants.json", _dump_json_bytes([_row_to_dict(r) for r in implants]))
        _add_to_tar(tar, "implant_notes.json", _dump_json_bytes([_row_to_dict(r) for r in implant_notes]))
        _add_to_tar(tar, "nutrition_intakes.json", _dump_json_bytes([_row_to_dict(r) for r in nutrition_intakes]))
        _add_to_tar(tar, "nutrition_outputs.json", _dump_json_bytes([_row_to_dict(r) for r in nutrition_outputs]))
        _add_to_tar(tar, "nutrition_schedules.json", _dump_json_bytes([_row_to_dict(r) for r in nutrition_schedules]))
        _add_to_tar(tar, "nutrition_goals.json", _dump_json_bytes([_row_to_dict(r) for r in nutrition_goals]))
        _add_to_tar(tar, "dme_shipments.json", _dump_json_bytes([_row_to_dict(r) for r in dme_shipments]))
        _add_to_tar(tar, "dme_shipment_items.json", _dump_json_bytes([_row_to_dict(r) for r in dme_shipment_items]))
        _add_to_tar(tar, "dme_receipt_items.json", _dump_json_bytes([_row_to_dict(r) for r in dme_receipt_items]))
        _add_to_tar(tar, "dme_shipment_alerts.json", _dump_json_bytes([_row_to_dict(r) for r in dme_shipment_alerts]))
        _add_to_tar(tar, "allergies.json", _dump_json_bytes([_row_to_dict(r) for r in allergies]))
        _add_to_tar(tar, "custom_vital_definitions.json", _dump_json_bytes([_row_to_dict(r) for r in custom_vital_definitions]))
        _add_to_tar(tar, "diagnostic_reports.json", _dump_json_bytes([_row_to_dict(r) for r in diagnostic_reports]))
        _add_to_tar(tar, "lab_results.json", _dump_json_bytes([_row_to_dict(r) for r in lab_results]))
        _add_to_tar(tar, "imaging_studies.json", _dump_json_bytes([_row_to_dict(r) for r in imaging_studies]))
        _add_to_tar(tar, "vent_imports.json", _dump_json_bytes([_row_to_dict(r) for r in vent_imports]))
        _add_to_tar(tar, "vent_device_info.json", _dump_json_bytes([_row_to_dict(r) for r in vent_device_info]))
        _stream_table_to_tar(tar, db, "vent_samples.ndjson",
                             VentSample.__table__, VentSample.patient_id == patient_id)
        _add_to_tar(tar, "users_referenced.json", json.dumps(users_referenced, default=_json_default, indent=2).encode("utf-8"))

    safe_last = "".join(c for c in (patient.last_name or "patient") if c.isalnum() or c in "-_") or "patient"
    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    filename = f"shh-backup-{safe_last}-{patient.id}-{timestamp}.tar.gz"
    return buf.getvalue(), filename


# ---------------------------------------------------------------------------
# Restore
# ---------------------------------------------------------------------------

def get_or_create_import_user(db: Session, account_id: int) -> User:
    """Lazily create the per-account hidden import user used as a fallback
    for any user-attribution columns whose original user does not exist in
    the target account. Created inactive with an unguessable password hash
    so it cannot be logged into."""
    username = f"{IMPORT_USER_PREFIX}{account_id}__"
    user = db.query(User).filter(User.username == username).first()
    if user is not None:
        return user

    # bcrypt-shaped placeholder; never matches a real password
    sentinel_hash = "!disabled!" + os.urandom(32).hex()
    user = User(
        account_id=account_id,
        username=username,
        full_name="Imported (legacy attribution)",
        email=None,
        password_hash=sentinel_hash,
        is_active=False,
        is_system_admin=False,
    )
    db.add(user)
    db.flush()
    logger.info("Created hidden import user id=%s for account %s", user.id, account_id)
    return user


def get_or_create_imported_integration(db: Session, account_id: int, patient_id: int) -> int:
    """Create (and return the id of) a synthetic 'Imported Data' patient
    integration for `patient_id`, used as the FK target for restored device
    imports (ventilator logs etc.). Mirrors the hidden import-user pattern.

    The catalog row (slug ``imported``) is created once and is NOT in the code
    registry, so it stays out of the 'add integration' picker; the per-patient
    PatientIntegration row makes it visible on patients that actually have it."""
    now = datetime.utcnow()
    catalog = db.query(Integration).filter(Integration.slug == IMPORTED_INTEGRATION_SLUG).first()
    if catalog is None:
        catalog = Integration(
            name="Imported Data",
            slug=IMPORTED_INTEGRATION_SLUG,
            description="Holds data brought in via backup/restore (e.g. ventilator imports). Not connectable.",
            auth_type="none",
            is_active=False,  # never offered as a new connection
            created_at=now,
            updated_at=now,
        )
        db.add(catalog)
        db.flush()

    pi = PatientIntegration(
        account_id=account_id,
        patient_id=patient_id,
        integration_id=catalog.id,
        credentials=None,
        settings={"imported": True},
        is_enabled=True,
        created_at=now,
        updated_at=now,
    )
    db.add(pi)
    db.flush()
    logger.info("Created imported-data integration id=%s for patient %s", pi.id, patient_id)
    return pi.id


def _read_archive(archive_bytes: bytes) -> Dict[str, Any]:
    """Parse the .tar.gz into a dict of {member_name -> python data}."""
    contents: Dict[str, Any] = {}
    with tarfile.open(fileobj=io.BytesIO(archive_bytes), mode="r:gz") as tar:
        for member in tar.getmembers():
            if not member.isfile() or not member.name.endswith(".json"):
                continue
            f = tar.extractfile(member)
            if f is None:
                continue
            try:
                contents[member.name] = json.loads(f.read().decode("utf-8"))
            except json.JSONDecodeError as e:
                raise ValueError(f"Corrupt JSON in archive member {member.name}: {e}")
    return contents


def _build_user_id_resolver(db: Session, account_id: int, users_referenced: Dict[str, Any]):
    """Return a function old_user_id -> new_user_id that maps backup user
    references onto users in the target account by username, falling back
    to the per-account import user."""
    # Cache the import user lazily — only created if at least one row needs it
    cache: Dict[str, Optional[User]] = {"import_user": None}

    # Pre-resolve usernames present in the target account
    backup_usernames = [info.get("username") for info in users_referenced.values() if info.get("username")]
    target_users_by_username: Dict[str, int] = {}
    if backup_usernames:
        for u in db.query(User).filter(User.account_id == account_id, User.username.in_(backup_usernames)).all():
            target_users_by_username[u.username] = u.id

    def resolve(old_id: Optional[int]) -> Optional[int]:
        if old_id is None:
            return None
        info = users_referenced.get(str(old_id)) or users_referenced.get(old_id)
        if info:
            uname = info.get("username")
            if uname and uname in target_users_by_username:
                return target_users_by_username[uname]
        # Fallback: hidden import user
        if cache["import_user"] is None:
            cache["import_user"] = get_or_create_import_user(db, account_id)
        return cache["import_user"].id

    return resolve


def _strip_unmapped(row: Dict[str, Any], drop: List[str]) -> Dict[str, Any]:
    return {k: v for k, v in row.items() if k not in drop}


def restore_patient_from_targz(
    db: Session,
    archive_bytes: bytes,
    account_id: int,
) -> Dict[str, Any]:
    """
    Replay a backup archive into the target account.

    All rows are inserted with new auto-assigned ids; foreign keys are
    remapped using old_id -> new_id maps. Account/organization scoping is
    rewritten to the target account. Unknown user references collapse to
    the hidden per-account import user.
    """
    contents = _read_archive(archive_bytes)
    # All member names (incl. streamed .ndjson files, which _read_archive skips).
    with tarfile.open(fileobj=io.BytesIO(archive_bytes), mode="r:gz") as _tar:
        archive_members = set(_tar.getnames())

    manifest = contents.get("manifest.json") or {}
    fmt = manifest.get("format_version")
    # Accept any archive from v1 up to the current version (newer files are simply
    # absent in older archives). Reject only missing manifests or future versions.
    if not manifest or not isinstance(fmt, int) or fmt < 1 or fmt > BACKUP_FORMAT_VERSION:
        raise ValueError(
            f"Unsupported or missing manifest (supported format versions 1–{BACKUP_FORMAT_VERSION})"
        )

    patient_rows = contents.get("patient.json") or []
    if not patient_rows:
        raise ValueError("Archive is missing patient.json")
    patient_row = patient_rows[0]

    users_referenced = contents.get("users_referenced.json") or {}
    resolve_user = _build_user_id_resolver(db, account_id, users_referenced)

    id_maps: Dict[str, Dict[int, int]] = {
        "patient": {},
        "provider": {},
        "medication": {},
        "medication_schedule": {},
        "care_task": {},
        "care_task_schedule": {},
        "care_task_log": {},
        "equipment": {},
        "diagnosis": {},
        "implant": {},
        "dme_shipment": {},
        "dme_shipment_item": {},
        "diagnostic_report": {},
    }

    inserted_counts: Dict[str, int] = {}

    def _insert(model, data: Dict[str, Any], map_name: Optional[str] = None) -> int:
        old_id = data.pop("id", None)
        # Always normalize account scoping and strip cross-account fields
        if "account_id" in data:
            data["account_id"] = account_id
        obj = model(**data)
        db.add(obj)
        db.flush()
        if map_name is not None and old_id is not None:
            id_maps[map_name][old_id] = obj.id
        return obj.id

    # ---- patient ---------------------------------------------------------
    p = dict(patient_row)
    p["account_id"] = account_id
    p["owner_user_id"] = resolve_user(p.get("owner_user_id"))
    p["creating_org_id"] = None
    p["claimed_at"] = None
    # Avoid MRN unique-constraint collisions when restoring into the same DB
    if p.get("medical_record_number"):
        from schemas.patient import Patient as _P
        existing = db.query(_P).filter(_P.medical_record_number == p["medical_record_number"]).first()
        if existing is not None:
            p["medical_record_number"] = f"{p['medical_record_number']}-restored-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
    new_patient_id = _insert(Patient, p, map_name="patient")
    id_maps["patient"][patient_row["id"]] = new_patient_id
    inserted_counts["patient"] = 1

    # ---- providers (depend on patient) ----------------------------------
    for r in contents.get("providers.json") or []:
        r = dict(r)
        r["patient_id"] = new_patient_id
        r["business_id"] = None  # business records are not exported
        _insert(Provider, r, map_name="provider")
    inserted_counts["providers"] = len(contents.get("providers.json") or [])

    # ---- medications -----------------------------------------------------
    for r in contents.get("medications.json") or []:
        r = dict(r)
        r["patient_id"] = new_patient_id
        r["prescriber_id"] = id_maps["provider"].get(r.get("prescriber_id")) if r.get("prescriber_id") else None
        r["pharmacy_id"] = None
        _insert(Medication, r, map_name="medication")
    inserted_counts["medications"] = len(contents.get("medications.json") or [])

    # ---- medication schedules -------------------------------------------
    for r in contents.get("medication_schedules.json") or []:
        r = dict(r)
        old_med_id = r.get("medication_id")
        if old_med_id not in id_maps["medication"]:
            continue  # orphan
        r["medication_id"] = id_maps["medication"][old_med_id]
        r["patient_id"] = new_patient_id
        _insert(MedicationSchedule, r, map_name="medication_schedule")
    inserted_counts["medication_schedules"] = len(contents.get("medication_schedules.json") or [])

    # ---- care tasks ------------------------------------------------------
    for r in contents.get("care_tasks.json") or []:
        r = dict(r)
        r["patient_id"] = new_patient_id
        r["category_id"] = None  # categories are account-scoped, skip remap
        _insert(CareTask, r, map_name="care_task")
    inserted_counts["care_tasks"] = len(contents.get("care_tasks.json") or [])

    # ---- care task schedules --------------------------------------------
    for r in contents.get("care_task_schedules.json") or []:
        r = dict(r)
        old_ct_id = r.get("care_task_id")
        if old_ct_id not in id_maps["care_task"]:
            continue
        r["care_task_id"] = id_maps["care_task"][old_ct_id]
        r["patient_id"] = new_patient_id
        _insert(CareTaskSchedule, r, map_name="care_task_schedule")
    inserted_counts["care_task_schedules"] = len(contents.get("care_task_schedules.json") or [])

    # ---- care task logs --------------------------------------------------
    for r in contents.get("care_task_logs.json") or []:
        r = dict(r)
        old_ct_id = r.get("care_task_id")
        if old_ct_id not in id_maps["care_task"]:
            continue
        r["care_task_id"] = id_maps["care_task"][old_ct_id]
        r["patient_id"] = new_patient_id
        old_sched = r.get("schedule_id")
        r["schedule_id"] = id_maps["care_task_schedule"].get(old_sched) if old_sched else None
        r["performed_by"] = resolve_user(r.get("performed_by"))
        old_id_for_log = r.get("id")
        new_id = _insert(CareTaskLog, r)
        if old_id_for_log is not None:
            id_maps["care_task_log"][old_id_for_log] = new_id
    inserted_counts["care_task_logs"] = len(contents.get("care_task_logs.json") or [])

    # ---- medication logs (after schedules) ------------------------------
    for r in contents.get("medication_logs.json") or []:
        r = dict(r)
        old_med_id = r.get("medication_id")
        if old_med_id not in id_maps["medication"]:
            continue
        r["medication_id"] = id_maps["medication"][old_med_id]
        r["patient_id"] = new_patient_id
        old_sched = r.get("schedule_id")
        r["schedule_id"] = id_maps["medication_schedule"].get(old_sched) if old_sched else None
        r["administered_by"] = resolve_user(r.get("administered_by"))
        _insert(MedicationLog, r)
    inserted_counts["medication_logs"] = len(contents.get("medication_logs.json") or [])

    # ---- equipment + change logs ----------------------------------------
    for r in contents.get("equipment.json") or []:
        r = dict(r)
        r["patient_id"] = new_patient_id
        _insert(Equipment, r, map_name="equipment")
    inserted_counts["equipment"] = len(contents.get("equipment.json") or [])

    for r in contents.get("equipment_change_logs.json") or []:
        r = dict(r)
        old_eq = r.get("equipment_id")
        if old_eq not in id_maps["equipment"]:
            continue
        r["equipment_id"] = id_maps["equipment"][old_eq]
        r["patient_id"] = new_patient_id
        r["changed_by"] = resolve_user(r.get("changed_by"))
        _insert(EquipmentChangeLog, r)
    inserted_counts["equipment_change_logs"] = len(contents.get("equipment_change_logs.json") or [])

    # ---- diagnoses + notes ----------------------------------------------
    for r in contents.get("diagnoses.json") or []:
        r = dict(r)
        r["patient_id"] = new_patient_id
        r["diagnosing_provider_id"] = id_maps["provider"].get(r.get("diagnosing_provider_id")) if r.get("diagnosing_provider_id") else None
        r["managing_provider_id"] = id_maps["provider"].get(r.get("managing_provider_id")) if r.get("managing_provider_id") else None
        r["created_by"] = resolve_user(r.get("created_by"))
        _insert(Diagnosis, r, map_name="diagnosis")
    inserted_counts["diagnoses"] = len(contents.get("diagnoses.json") or [])

    for r in contents.get("diagnosis_notes.json") or []:
        r = dict(r)
        old_dx = r.get("diagnosis_id")
        if old_dx not in id_maps["diagnosis"]:
            continue
        r["diagnosis_id"] = id_maps["diagnosis"][old_dx]
        r["provider_id"] = id_maps["provider"].get(r.get("provider_id")) if r.get("provider_id") else None
        r["created_by"] = resolve_user(r.get("created_by"))
        _insert(DiagnosisNote, r)
    inserted_counts["diagnosis_notes"] = len(contents.get("diagnosis_notes.json") or [])

    # ---- implants + notes -----------------------------------------------
    for r in contents.get("implants.json") or []:
        r = dict(r)
        r["patient_id"] = new_patient_id
        r["implanting_provider_id"] = id_maps["provider"].get(r.get("implanting_provider_id")) if r.get("implanting_provider_id") else None
        r["managing_provider_id"] = id_maps["provider"].get(r.get("managing_provider_id")) if r.get("managing_provider_id") else None
        r["created_by"] = resolve_user(r.get("created_by"))
        _insert(Implant, r, map_name="implant")
    inserted_counts["implants"] = len(contents.get("implants.json") or [])

    for r in contents.get("implant_notes.json") or []:
        r = dict(r)
        old_im = r.get("implant_id")
        if old_im not in id_maps["implant"]:
            continue
        r["implant_id"] = id_maps["implant"][old_im]
        r["provider_id"] = id_maps["provider"].get(r.get("provider_id")) if r.get("provider_id") else None
        r["created_by"] = resolve_user(r.get("created_by"))
        _insert(ImplantNote, r)
    inserted_counts["implant_notes"] = len(contents.get("implant_notes.json") or [])

    # ---- allergies + custom vital definitions (patient_id-only) ---------
    for r in contents.get("allergies.json") or []:
        r = dict(r)
        r["patient_id"] = new_patient_id
        r["created_by"] = resolve_user(r.get("created_by"))
        _insert(AllergyIntolerance, r)
    inserted_counts["allergies"] = len(contents.get("allergies.json") or [])

    for r in contents.get("custom_vital_definitions.json") or []:
        r = dict(r)
        r["patient_id"] = new_patient_id
        _insert(CustomVitalDefinition, r)
    inserted_counts["custom_vital_definitions"] = len(contents.get("custom_vital_definitions.json") or [])

    # ---- diagnostic reports + children (lab results, imaging studies) ---
    for r in contents.get("diagnostic_reports.json") or []:
        r = dict(r)
        r["patient_id"] = new_patient_id
        _insert(DiagnosticReport, r, map_name="diagnostic_report")
    inserted_counts["diagnostic_reports"] = len(contents.get("diagnostic_reports.json") or [])

    for r in contents.get("lab_results.json") or []:
        r = dict(r)
        r["patient_id"] = new_patient_id
        old_rep = r.get("diagnostic_report_id")
        r["diagnostic_report_id"] = id_maps["diagnostic_report"].get(old_rep) if old_rep else None
        _insert(LabResult, r)
    inserted_counts["lab_results"] = len(contents.get("lab_results.json") or [])

    for r in contents.get("imaging_studies.json") or []:
        r = dict(r)
        r["patient_id"] = new_patient_id
        old_rep = r.get("diagnostic_report_id")
        r["diagnostic_report_id"] = id_maps["diagnostic_report"].get(old_rep) if old_rep else None
        _insert(ImagingStudy, r)
    inserted_counts["imaging_studies"] = len(contents.get("imaging_studies.json") or [])

    # ---- ventilator imports + device info + samples ---------------------
    # vent_imports has a string UUID PK and a NOT-NULL integration_id; mint a new
    # UUID per import (str->str map for samples) and point them at a synthetic
    # "Imported Data" integration (integrations themselves are not exported).
    vent_import_id_map: Dict[str, str] = {}
    vent_imports_in = contents.get("vent_imports.json") or []
    imported_integration_id = (
        get_or_create_imported_integration(db, account_id, new_patient_id)
        if vent_imports_in else None
    )
    for r in vent_imports_in:
        r = dict(r)
        old_id = r.get("id")
        new_id = str(uuid.uuid4())
        r["id"] = new_id
        r["patient_id"] = new_patient_id
        r["integration_id"] = imported_integration_id
        r["uploaded_by"] = resolve_user(r.get("uploaded_by"))
        db.add(VentImport(**r))
        db.flush()
        if old_id is not None:
            vent_import_id_map[old_id] = new_id
    inserted_counts["vent_imports"] = len(vent_imports_in)

    for r in contents.get("vent_device_info.json") or []:
        r = dict(r)
        old_imp = r.get("import_id")
        if old_imp not in vent_import_id_map:
            continue  # orphan (parent import didn't restore)
        r.pop("id", None)
        r["import_id"] = vent_import_id_map[old_imp]
        db.add(VentDeviceInfo(**r))
    db.flush()
    inserted_counts["vent_device_info"] = len(contents.get("vent_device_info.json") or [])

    # vent_samples: streamed NDJSON (v3+). Remap patient_id + import_id; drop orphans.
    def _remap_vent_sample(r):
        new_imp = vent_import_id_map.get(r.get("import_id"))
        if new_imp is None:
            return False
        r["import_id"] = new_imp
        r["patient_id"] = new_patient_id
    inserted_counts["vent_samples"] = _restore_stream_ndjson(
        db, archive_bytes, "vent_samples.ndjson", VentSample, _remap_vent_sample)

    # ---- vitals + alerts + symptoms (simple patient_id-only rows) -------
    for r in contents.get("vitals.json") or []:
        r = dict(r)
        r["patient_id"] = new_patient_id
        _insert(Vital, r)
    inserted_counts["vitals"] = len(contents.get("vitals.json") or [])

    # pulse_ox_data: streamed NDJSON (v3+); fall back to the legacy JSON array.
    if "pulse_ox_data.ndjson" in archive_members:
        def _remap_pulse_ox(r):
            r["patient_id"] = new_patient_id
        inserted_counts["pulse_ox_data"] = _restore_stream_ndjson(
            db, archive_bytes, "pulse_ox_data.ndjson", PulseOxData, _remap_pulse_ox)
    else:
        for r in contents.get("pulse_ox_data.json") or []:
            r = dict(r)
            r["patient_id"] = new_patient_id
            _insert(PulseOxData, r)
        inserted_counts["pulse_ox_data"] = len(contents.get("pulse_ox_data.json") or [])

    for r in contents.get("monitoring_alerts.json") or []:
        r = dict(r)
        r["patient_id"] = new_patient_id
        _insert(MonitoringAlert, r)
    inserted_counts["monitoring_alerts"] = len(contents.get("monitoring_alerts.json") or [])

    for r in contents.get("ventilator_alerts.json") or []:
        r = dict(r)
        r["patient_id"] = new_patient_id
        _insert(VentilatorAlert, r)
    inserted_counts["ventilator_alerts"] = len(contents.get("ventilator_alerts.json") or [])

    for r in contents.get("symptoms.json") or []:
        r = dict(r)
        r["patient_id"] = new_patient_id
        _insert(Symptom, r)
    inserted_counts["symptoms"] = len(contents.get("symptoms.json") or [])

    # ---- nutrition (schedules first so intakes can reference them) ------
    nutrition_schedule_id_map: Dict[int, int] = {}
    for r in contents.get("nutrition_schedules.json") or []:
        r = dict(r)
        old_id = r.get("id")
        r["patient_id"] = new_patient_id
        new_id = _insert(NutritionSchedule, r)
        if old_id is not None:
            nutrition_schedule_id_map[old_id] = new_id
    inserted_counts["nutrition_schedules"] = len(contents.get("nutrition_schedules.json") or [])

    for r in contents.get("nutrition_goals.json") or []:
        r = dict(r)
        r["patient_id"] = new_patient_id
        _insert(NutritionGoal, r)
    inserted_counts["nutrition_goals"] = len(contents.get("nutrition_goals.json") or [])

    for r in contents.get("nutrition_intakes.json") or []:
        r = dict(r)
        r["patient_id"] = new_patient_id
        old_log = r.get("care_task_log_id")
        r["care_task_log_id"] = id_maps["care_task_log"].get(old_log) if old_log else None
        old_sched = r.get("schedule_id")
        r["schedule_id"] = nutrition_schedule_id_map.get(old_sched) if old_sched else None
        r["recorded_by"] = resolve_user(r.get("recorded_by"))
        _insert(NutritionIntake, r)
    inserted_counts["nutrition_intakes"] = len(contents.get("nutrition_intakes.json") or [])

    for r in contents.get("nutrition_outputs.json") or []:
        r = dict(r)
        r["patient_id"] = new_patient_id
        old_log = r.get("care_task_log_id")
        r["care_task_log_id"] = id_maps["care_task_log"].get(old_log) if old_log else None
        r["recorded_by"] = resolve_user(r.get("recorded_by"))
        _insert(NutritionOutput, r)
    inserted_counts["nutrition_outputs"] = len(contents.get("nutrition_outputs.json") or [])

    # ---- DME shipments ---------------------------------------------------
    # First pass: insert shipments with parent_shipment_id stripped, second pass to wire it back.
    parent_links: List[Tuple[int, int]] = []  # (new_id, old_parent_id)
    for r in contents.get("dme_shipments.json") or []:
        r = dict(r)
        old_id = r.get("id")
        old_parent = r.get("parent_shipment_id")
        r["patient_id"] = new_patient_id
        r["supplier_id"] = None
        r["created_by"] = resolve_user(r.get("created_by"))
        r["finalized_by"] = resolve_user(r.get("finalized_by"))
        r["parent_shipment_id"] = None
        new_id = _insert(DMEShipment, r, map_name="dme_shipment")
        if old_id is not None and old_parent is not None:
            parent_links.append((new_id, old_parent))
    # Second pass: update parent links if both ends were imported
    for new_id, old_parent in parent_links:
        new_parent = id_maps["dme_shipment"].get(old_parent)
        if new_parent is not None:
            db.query(DMEShipment).filter(DMEShipment.id == new_id).update(
                {"parent_shipment_id": new_parent}
            )
    inserted_counts["dme_shipments"] = len(contents.get("dme_shipments.json") or [])

    for r in contents.get("dme_shipment_items.json") or []:
        r = dict(r)
        old_ship = r.get("shipment_id")
        if old_ship not in id_maps["dme_shipment"]:
            continue
        r["shipment_id"] = id_maps["dme_shipment"][old_ship]
        old_eq = r.get("equipment_id")
        r["equipment_id"] = id_maps["equipment"].get(old_eq) if old_eq else None
        # Decimal columns came back as strings; ORM accepts either
        _insert(DMEShipmentItem, r, map_name="dme_shipment_item")
    inserted_counts["dme_shipment_items"] = len(contents.get("dme_shipment_items.json") or [])

    for r in contents.get("dme_receipt_items.json") or []:
        r = dict(r)
        old_item = r.get("shipment_item_id")
        if old_item not in id_maps["dme_shipment_item"]:
            continue
        r["shipment_item_id"] = id_maps["dme_shipment_item"][old_item]
        r["received_by"] = resolve_user(r.get("received_by"))
        _insert(DMEReceiptItem, r)
    inserted_counts["dme_receipt_items"] = len(contents.get("dme_receipt_items.json") or [])

    for r in contents.get("dme_shipment_alerts.json") or []:
        r = dict(r)
        old_ship = r.get("shipment_id")
        if old_ship not in id_maps["dme_shipment"]:
            continue
        r["shipment_id"] = id_maps["dme_shipment"][old_ship]
        old_item = r.get("shipment_item_id")
        r["shipment_item_id"] = id_maps["dme_shipment_item"].get(old_item) if old_item else None
        old_followup = r.get("followup_shipment_id")
        r["followup_shipment_id"] = id_maps["dme_shipment"].get(old_followup) if old_followup else None
        r["resolved_by"] = resolve_user(r.get("resolved_by"))
        _insert(DMEShipmentAlert, r)
    inserted_counts["dme_shipment_alerts"] = len(contents.get("dme_shipment_alerts.json") or [])

    db.commit()

    return {
        "new_patient_id": new_patient_id,
        "source_patient": manifest.get("patient", {}),
        "inserted": inserted_counts,
        "format_version": manifest.get("format_version"),
        "exported_at": manifest.get("exported_at"),
    }
