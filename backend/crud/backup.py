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
from datetime import datetime, date
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import inspect as sa_inspect
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
from models.users import User

logger = logging.getLogger(__name__)

BACKUP_FORMAT_VERSION = 1
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
    pulse_ox = db.query(PulseOxData).filter(PulseOxData.patient_id == patient_id).all()
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
                "pulse_ox_data": len(pulse_ox),
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
        _add_to_tar(tar, "pulse_ox_data.json", _dump_json_bytes([_row_to_dict(r) for r in pulse_ox]))
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

    manifest = contents.get("manifest.json") or {}
    if not manifest or manifest.get("format_version") != BACKUP_FORMAT_VERSION:
        raise ValueError(f"Unsupported or missing manifest (expected version {BACKUP_FORMAT_VERSION})")

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

    # ---- vitals + alerts + symptoms (simple patient_id-only rows) -------
    for r in contents.get("vitals.json") or []:
        r = dict(r)
        r["patient_id"] = new_patient_id
        _insert(Vital, r)
    inserted_counts["vitals"] = len(contents.get("vitals.json") or [])

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
