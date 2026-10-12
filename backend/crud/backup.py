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
from typing import Any, Dict, Optional, Tuple

from sqlalchemy import null, select
from sqlalchemy.orm import Session

from schemas.patient import Patient
from schemas.dme_shipment import DMEShipment
from schemas.integration import Integration, PatientIntegration
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
# v4 adds full portable care coverage, explicit schema/count checks and attachments.
BACKUP_FORMAT_VERSION = 4

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
    stmt = select(table).where(where).order_by(table.c.id).execution_options(
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


def export_patient_to_targz(db: Session, patient_id: int, account_id: int) -> Tuple[bytes, str]:
    """Export one complete portable patient graph (freeze source writers first)."""
    from crud.backup_records import (MODELS, STREAMED, SCHEMA_VERSION, EXCLUSIONS,
                                    gather_rows, fields, user_fields, validate_rows)
    from crud.backup_attachments import export_attachments

    rows = gather_rows(db, patient_id, account_id)
    validate_rows(rows, strict=True, patient_id=patient_id, account_id=account_id)
    patient = rows['patient'][0]
    # These historical sample links predate SQL foreign-key constraints.
    alert_samples = {row.get(field) for row in rows['monitoring_alerts']
                     for field in ('start_data_id', 'end_data_id') if row.get(field) is not None}
    if alert_samples:
        pulse = MODELS['pulse_ox_data']
        present = {sample_id for sample_id, in db.query(pulse.id).filter(
            pulse.patient_id == patient_id, pulse.id.in_(alert_samples)).all()}
        if alert_samples - present:
            raise ValueError('Monitoring alert history references missing patient pulse-ox samples')
    referenced = {row[field] for name, values in rows.items() for row in values
                  for field in user_fields(MODELS[name]) if row.get(field) is not None}
    users = db.query(User).filter(User.id.in_(referenced)).all() if referenced else []
    if any(user.account_id != account_id for user in users):
        raise ValueError('Patient history references a user from a different account')
    if referenced - {user.id for user in users}:
        raise ValueError('Patient history references a missing caregiver')
    users_referenced = {user.id: {'username': user.username, 'full_name': user.full_name}
                        for user in users}
    contents = {name + '.json': values for name, values in rows.items()}
    contents['users_referenced.json'] = users_referenced
    manifest = {
        'format_version': BACKUP_FORMAT_VERSION,
        'schema_version': SCHEMA_VERSION,
        'tables': {name: sorted(fields(model)) for name, model in MODELS.items()},
        'exported_at': datetime.utcnow().isoformat() + 'Z',
        'source_account_id': account_id,
        'patient': {key: patient.get(key) for key in ('id', 'first_name', 'last_name', 'medical_record_number')},
        'counts': {name: len(values) for name, values in rows.items()},
        'exclusions': dict(EXCLUSIONS),
    }
    manifest['counts']['users_referenced'] = len(users_referenced)
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode='w:gz') as tar:
        # Must run before JSON serialization: DB blobs are moved into attachment members.
        manifest['attachments'] = export_attachments(tar, contents, patient_id, account_id)
        for name in sorted(STREAMED):
            model = MODELS[name]
            manifest['counts'][name] = _stream_table_to_tar(
                tar, db, name + '.ndjson', model.__table__, model.patient_id == patient_id)
        for member, values in contents.items():
            _add_to_tar(tar, member, json.dumps(values, default=_json_default).encode('utf-8'))
        _add_to_tar(tar, 'manifest.json', json.dumps(manifest, default=_json_default).encode('utf-8'))
    safe_last = ''.join(c for c in (patient.get('last_name') or 'patient') if c.isalnum() or c in '-_') or 'patient'
    filename = f"shh-backup-{safe_last}-{patient_id}-{datetime.utcnow().strftime('%Y%m%d-%H%M%S')}.tar.gz"
    return buf.getvalue(), filename


def get_or_create_import_user(db: Session, account_id: int) -> User:
    """Lazily create the per-account hidden import user used as a fallback
    for any user-attribution columns whose original user does not exist in
    the target account. Created inactive with an unguessable password hash
    so it cannot be logged into."""
    username = f"{IMPORT_USER_PREFIX}{account_id}__"
    user = db.query(User).filter(User.username == username).first()
    if user is not None:
        if user.account_id != account_id or user.is_active:
            raise ValueError('Reserved import username belongs to an incompatible existing user')
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
    """Read only record members; attachment bytes are handled separately."""
    contents = {}
    try:
        with tarfile.open(fileobj=io.BytesIO(archive_bytes), mode='r:gz') as tar:
            names = set()
            for member in tar.getmembers():
                if not member.isfile() or member.name in names:
                    raise ValueError('Archive contains a non-file or duplicate member')
                names.add(member.name)
                if member.name.endswith('.json') and '/' not in member.name:
                    with tar.extractfile(member) as f:
                        contents[member.name] = json.loads(f.read().decode('utf-8'))
    except (tarfile.TarError, UnicodeError, json.JSONDecodeError, OSError) as exc:
        raise ValueError('Invalid patient backup archive') from exc
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


def _validate_archive(archive_bytes, contents):
    from crud.backup_records import MODELS, STREAMED, SCHEMA_VERSION, fields, validate_rows

    manifest = contents.get('manifest.json')
    if not isinstance(manifest, dict):
        raise ValueError('Unsupported or missing manifest')
    fmt = manifest.get('format_version')
    if type(fmt) is not int or not 1 <= fmt <= BACKUP_FORMAT_VERSION:
        raise ValueError(f'Unsupported format version (supported 1–{BACKUP_FORMAT_VERSION})')
    strict = fmt >= 4
    patients = contents.get('patient.json')
    if not isinstance(patients, list) or len(patients) != 1 or not isinstance(patients[0], dict):
        raise ValueError('Archive must contain exactly one patient in patient.json')
    patient = patients[0]
    source_account = manifest.get('source_account_id', patient.get('account_id'))
    source_patient = patient.get('id')
    if strict and (type(source_account) is not int or type(source_patient) is not int):
        raise ValueError('Manifest is missing source account or patient identity')
    users = contents.get('users_referenced.json', {})
    if not isinstance(users, dict) or any(not isinstance(info, dict) or
            not isinstance(info.get('username'), str) for info in users.values()):
        raise ValueError('Invalid caregiver reference metadata')
    with tarfile.open(fileobj=io.BytesIO(archive_bytes), mode='r:gz') as tar:
        members = set(tar.getnames())
    expected = {name + '.json' for name in MODELS if name not in STREAMED}
    expected.update(name + '.ndjson' for name in STREAMED)
    expected.update(('manifest.json', 'users_referenced.json'))
    attachments = manifest.get('attachments')
    if attachments is not None:
        if not isinstance(attachments, dict) or not isinstance(attachments.get('files'), list):
            raise ValueError('Invalid attachment manifest')
        for item in attachments['files']:
            if not isinstance(item, dict) or not isinstance(item.get('member'), str):
                raise ValueError('Invalid attachment member')
            expected.add(item['member'])
    if strict:
        schema = {name: sorted(fields(model)) for name, model in MODELS.items()}
        if manifest.get('schema_version') != SCHEMA_VERSION or manifest.get('tables') != schema:
            raise ValueError('Unsupported backup schema; export and restore using a matching application version')
        if attachments is None:
            raise ValueError('Archive is missing attachment manifest')
        if members != expected:
            raise ValueError('Archive has missing or unsupported members: ' + ', '.join(sorted(members ^ expected)))
        counts = manifest.get('counts')
        if not isinstance(counts, dict) or set(counts) != set(MODELS) | {'users_referenced'}:
            raise ValueError('Manifest is missing required table counts')
        if any(type(value) is not int or value < 0 for value in counts.values()):
            raise ValueError('Invalid manifest row count')
        if not isinstance(manifest.get('patient'), dict) or manifest['patient'].get('id') != source_patient:
            raise ValueError('Manifest patient does not match patient.json')
    else:
        expected.update(name + '.json' for name in STREAMED)
        if members - expected:
            raise ValueError('Archive contains unsupported members: ' + ', '.join(sorted(members - expected)))
    rows = {name: contents.get(name + '.json', []) for name in MODELS if name not in STREAMED}
    validate_rows(rows, strict=strict, patient_id=source_patient, account_id=source_account)
    if strict:
        for name, values in rows.items():
            if len(values) != manifest['counts'][name]:
                raise ValueError(f'Row count mismatch for {name}')
        if len(users) != manifest['counts']['users_referenced']:
            raise ValueError('Row count mismatch for users_referenced')
        from crud.backup_records import user_fields
        referenced = {str(row[field]) for name, values in rows.items() for row in values
                      for field in user_fields(MODELS[name]) if row.get(field) is not None}
        if set(users) != referenced:
            raise ValueError('Caregiver metadata does not match history attribution references')
        if any(set(info) != {'username', 'full_name'} for info in users.values()):
            raise ValueError('Unsupported caregiver reference fields')
    return manifest, rows, members


def restore_patient_from_targz(db: Session, archive_bytes: bytes, account_id: int) -> Dict[str, Any]:
    """Create a new patient atomically; never merge or overwrite target records.

    Import is deliberately not idempotent. A caller losing its connection must
    check whether the patient was created before submitting the archive again.
    """
    from crud.backup_attachments import AttachmentRestore
    from crud.backup_records import validate_legacy_target_tables
    contents = _read_archive(archive_bytes)
    manifest, rows, members = _validate_archive(archive_bytes, contents)
    validate_legacy_target_tables(db, rows)
    try:
        with AttachmentRestore(archive_bytes, manifest.get('attachments')) as attachments:
            return _restore_records(db, archive_bytes, account_id, manifest, rows,
                                    contents, members, attachments)
    except Exception:
        db.rollback()
        raise


def _restored_orm_row(model, values):
    """Keep archived SQL NULLs from being replaced by ORM insert defaults.

    Missing legacy fields still use their normal defaults. Types which evaluate
    None themselves (notably JSON) retain their existing serialization behavior.
    """
    from crud.backup_records import fields

    columns = fields(model)
    return model(**{
        field: null() if (
            value is None and columns[field].nullable
            and not columns[field].type.should_evaluate_none
            and (columns[field].default is not None or columns[field].server_default is not None)
        ) else value
        for field, value in values.items()
    })


def _restore_records(db, archive_bytes, account_id, manifest, rows, contents, members, attachments):
    from crud.backup_records import (MODELS, STREAMED, TABLE_NAMES, CLEARED_REFERENCES,
                                    EXCLUSIONS, fields, user_fields)
    strict = manifest['format_version'] >= 4
    warnings = list(EXCLUSIONS.values())
    if not strict:
        warnings.append('Legacy backup: tables, attachments and voided history omitted by older exporters cannot be recovered from this archive; compare against the source before use.')
    base_resolve_user = _build_user_id_resolver(db, account_id, contents.get('users_referenced.json') or {})
    fallback_ids, resolved_users = set(), {}
    def resolve_user(old_id):
        if old_id is None:
            return None
        if old_id not in resolved_users:
            new_id = base_resolve_user(old_id)
            target = db.get(User, new_id)
            if target and target.username.startswith(IMPORT_USER_PREFIX):
                fallback_ids.add(old_id)
            resolved_users[old_id] = new_id
        return resolved_users[old_id]
    maps = {name: {} for name in MODELS}
    inserted = {}
    source_patient = rows['patient'][0]
    p = dict(source_patient)
    old_patient_id = p.pop('id')
    p['account_id'] = account_id
    p['owner_user_id'] = resolve_user(p.get('owner_user_id'))
    p['creating_org_id'] = None
    p['claimed_at'] = None
    if p.get('ha_user_id'):
        warnings.append('The source HA identity link was cleared; link the restored patient to the intended Home Assistant identity separately.')
    p['ha_user_id'] = None
    if p.get('medical_record_number') and db.query(Patient).filter(Patient.medical_record_number == p['medical_record_number']).first():
        p['medical_record_number'] += '-restored-' + uuid.uuid4().hex[:12]
        warnings.append('The medical record number already existed and received a restored suffix.')
    patient = _restored_orm_row(Patient, p)
    db.add(patient)
    db.flush()
    new_patient_id = patient.id
    maps['patient'][old_patient_id] = new_patient_id
    inserted['patient'] = 1
    vent_ids = {row['id']: str(uuid.uuid4()) for row in rows['vent_imports']}
    attachments.restore(contents, new_patient_id, account_id, vent_ids)
    # Attachment restoration updates contents in place, including optional legacy clears.
    for name in rows:
        rows[name] = contents.get(name + '.json', [])
    patient.avatar_photo = rows['patient'][0].get('avatar_photo')
    warnings.extend(attachments.warnings)
    imported_integration = (get_or_create_imported_integration(db, account_id, new_patient_id)
                            if vent_ids else None)
    event_groups = {}
    self_links = []
    nutrition_names = set()
    pulse_links = {row.get(field) for row in rows['monitoring_alerts']
                   for field in ('start_data_id', 'end_data_id') if row.get(field) is not None}

    def remap(name, source):
        model = MODELS[name]
        row = dict(source)
        old_id = row.pop('id', None)
        columns = fields(model)
        unknown = set(row) - set(columns)
        if strict and set(source) != set(columns):
            raise ValueError(f'Missing or unsupported fields in {name}')
        if 'account_id' in source and source['account_id'] not in (None, manifest.get('source_account_id', source_patient.get('account_id'))):
            raise ValueError(f'Cross-account record in {name}')
        if unknown:
            raise ValueError(f'Unsupported fields in {name}: {", ".join(sorted(unknown))}')
        if 'account_id' in columns:
            row['account_id'] = account_id
        if 'patient_id' in columns:
            if source.get('patient_id') not in (None, old_patient_id):
                raise ValueError(f'Cross-patient record in {name}')
            row['patient_id'] = new_patient_id
        for field in user_fields(model):
            if field in row:
                row[field] = resolve_user(row[field])
        for field, column in columns.items():
            if field in user_fields(model) or field in ('account_id', 'patient_id'):
                continue
            value = row.get(field)
            if value is None:
                continue
            for fk in column.foreign_keys:
                table = fk.column.table.name
                if table in CLEARED_REFERENCES:
                    row[field] = None
                elif table == 'patient_integrations' and name == 'vent_imports':
                    row[field] = imported_integration
                elif table in TABLE_NAMES:
                    target = TABLE_NAMES[table]
                    if target == name and name == 'dme_shipments':
                        self_links.append((old_id, field, value))
                        row[field] = None
                    elif value in maps[target]:
                        row[field] = maps[target][value]
                    elif not strict and column.nullable:
                        row[field] = None
                        warnings.append(f'Legacy reference {name}.{field} was unavailable and was cleared.')
                    else:
                        raise ValueError(f'Missing dependency for {name}.{field}={value}')
                else:
                    raise ValueError(f'Unsupported relationship {name}.{field}')
        for field in ('event_group_id', 'source_event_group_id', 'completed_intake_group_id', 'encounter_uid'):
            if row.get(field):
                row[field] = event_groups.setdefault(row[field], str(uuid.uuid4()))
        if name == 'nutrition_items':
            original = row['name']
            if original in nutrition_names:
                suffix = f' (imported {old_id})'
                row['name'] = original[:200-len(suffix)] + suffix
                attempt = 1
                while row['name'] in nutrition_names:
                    suffix = f' (imported {old_id}-{attempt})'
                    row['name'] = original[:200-len(suffix)] + suffix
                    attempt += 1
                warnings.append('A shared nutrition item name duplicated a patient item; the imported copy was renamed to preserve both.')
            nutrition_names.add(row['name'])
        if name == 'vent_imports':
            row['id'] = vent_ids[old_id]
        if name == 'monitoring_alerts':
            for field in ('start_data_id', 'end_data_id'):
                value = row.get(field)
                if value is not None:
                    if value not in maps['pulse_ox_data']:
                        if strict:
                            raise ValueError(f'Missing pulse-ox sample for monitoring_alerts.{field}')
                        warnings.append(f'Legacy monitoring alert {field} was unavailable and was cleared.')
                    row[field] = maps['pulse_ox_data'].get(value)
        return old_id, row

    def stream_rows(name):
        member = name + '.ndjson'
        if member in members:
            with tarfile.open(fileobj=io.BytesIO(archive_bytes), mode='r:gz') as tar:
                with tar.extractfile(member) as source:
                    for raw in source:
                        if raw.strip():
                            try:
                                row = json.loads(raw)
                            except (UnicodeError, json.JSONDecodeError) as exc:
                                raise ValueError(f'Invalid NDJSON in {name}') from exc
                            if not isinstance(row, dict):
                                raise ValueError(f'{name} must contain records')
                            yield row
        else:
            values = contents.get(name + '.json', [])
            if not isinstance(values, list):
                raise ValueError(f'{name} must contain records')
            yield from values

    for name, model in MODELS.items():
        if name == 'patient':
            continue
        count = 0
        batch = []
        last_stream_id = None
        values = stream_rows(name) if name in STREAMED else rows[name]
        for source in values:
            if not isinstance(source, dict):
                raise ValueError(f'Invalid record in {name}')
            if name in STREAMED and strict:
                old_stream_id = source.get('id')
                if type(old_stream_id) is not int or (last_stream_id is not None and old_stream_id <= last_stream_id):
                    raise ValueError(f'Duplicate, unordered or missing source id in {name}')
                last_stream_id = old_stream_id
            old_id, row = remap(name, source)
            if name in STREAMED and not (name == 'pulse_ox_data' and old_id in pulse_links):
                batch.append(row)
                if len(batch) >= STREAM_BATCH:
                    db.bulk_insert_mappings(model, batch)
                    batch.clear()
            else:
                # Flush earlier samples before referenced samples, preserving source
                # ordering for monitoring-alert start/end ID range queries.
                if batch:
                    db.bulk_insert_mappings(model, batch)
                    batch.clear()
                obj = _restored_orm_row(model, row)
                db.add(obj)
                db.flush()
                maps[name][old_id] = obj.id
            count += 1
        if batch:
            db.bulk_insert_mappings(model, batch)
        if strict and count != manifest['counts'][name]:
            raise ValueError(f'Row count mismatch for {name}')
        inserted[name] = count
    for old_id, field, old_parent in self_links:
        new_parent = maps['dme_shipments'].get(old_parent)
        if new_parent is None:
            if strict:
                raise ValueError(f'Missing DME shipment {field} dependency')
            warnings.append(f'Legacy shipment {field} link was unavailable and was cleared.')
        db.query(DMEShipment).filter(DMEShipment.id == maps['dme_shipments'][old_id]).update({field: new_parent})
    if fallback_ids:
        warnings.append(f'{len(fallback_ids)} source caregiver(s) could not be matched by username; their history is attributed to the hidden Imported user.')
    db.commit()
    attachments.commit()
    return {'new_patient_id': new_patient_id, 'source_patient': manifest.get('patient', {}),
            'inserted': inserted, 'format_version': manifest['format_version'],
            'exported_at': manifest.get('exported_at'), 'warnings': list(dict.fromkeys(warnings))}
