"""File-import endpoints for integrations that accept archive uploads.

Bookkeeping lives in the `vent_imports` table; the raw archive + extracted
files live on disk under DATA_ROOT/vent_imports/{import_id}/. Parsing runs
in a FastAPI BackgroundTask and updates the row as it progresses.

Also exposes clock-calibration endpoints used by the ventilator integration:
the vent's RTC drifts vs. real time, so we capture a signed offset on
`PatientIntegration.settings` and re-apply it to existing samples via UPDATE.
"""
from __future__ import annotations

import logging
import os
import shutil
import tarfile
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
from uuid import uuid4

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Body,
    Depends,
    File,
    HTTPException,
    UploadFile,
)
from sqlalchemy import text
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.orm.attributes import flag_modified

from db import SessionLocal
from dependencies import get_db, require_permission
from routes.auth import get_current_account_id, require_full_auth
from schemas.integration import PatientIntegration
from schemas.vent_import import VentImport
from integrations import get_integration

logger = logging.getLogger("integrations.imports")

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


# ----- on-disk layout helpers (archive + extracted files only) -----

DATA_ROOT = os.getenv("INTEGRATIONS_DATA_DIR", "/app/data")
VENT_DIR = os.path.join(DATA_ROOT, "vent_imports")


def _import_dir(import_id: str) -> str:
    return os.path.join(VENT_DIR, import_id)


def _extracted_dir(import_id: str) -> str:
    return os.path.join(_import_dir(import_id), "extracted")


# ----- background worker -----

def _update_status(db: Session, vi: VentImport, *, status: str,
                   error: Optional[str] = None,
                   summary_patch: Optional[Dict[str, Any]] = None) -> None:
    """Apply a status (+ optional fields) and commit. Helper for the worker."""
    vi.status = status
    if error is not None:
        vi.error = error
    if summary_patch:
        current = dict(vi.parser_summary or {})
        current.update(summary_patch)
        vi.parser_summary = current
        # JSON column mutation isn't auto-detected.
        flag_modified(vi, "parser_summary")
    db.add(vi)
    db.commit()


def _run_import(import_id: str) -> None:
    """Extract + parse. Runs in a FastAPI BackgroundTask thread. Owns a
    fresh DB session so it doesn't share state with the request handler."""
    db = SessionLocal()
    try:
        vi = db.query(VentImport).filter(VentImport.id == import_id).first()
        if not vi:
            logger.error("Import %s vanished before parse", import_id)
            return

        archive_path = vi.storage_path
        if not archive_path or not os.path.exists(archive_path):
            _update_status(db, vi, status='failed',
                           error=f"Archive missing on disk: {archive_path}")
            return

        # 1. Extract
        _update_status(db, vi, status='extracting')
        extracted = _extracted_dir(import_id)
        if os.path.isdir(extracted):
            shutil.rmtree(extracted)
        os.makedirs(extracted, exist_ok=True)

        if not tarfile.is_tarfile(archive_path):
            raise ValueError("Uploaded file is not a valid tar archive")

        with tarfile.open(archive_path, "r:*") as tf:
            safe_members = []
            for m in tf.getmembers():
                name = m.name
                if name.startswith("/") or ".." in name.split("/"):
                    raise ValueError(f"Refusing unsafe archive member: {name}")
                safe_members.append(m)
            tf.extractall(extracted, members=safe_members)

        # 2. Dispatch to the integration's parser.
        _update_status(db, vi, status='parsing')

        # Load the patient_integration so the parser can read settings + write
        # back calibration anchors.
        pi = db.query(PatientIntegration).filter(
            PatientIntegration.id == vi.integration_id
        ).first()
        if not pi:
            raise ValueError("PatientIntegration vanished mid-parse")

        integration_class = get_integration(vi.vendor)
        if not integration_class:
            raise ValueError(f"Unknown integration: {vi.vendor}")
        instance = integration_class(pi)

        summary = instance.import_file(
            import_id=import_id,
            archive_path=archive_path,
            extracted_dir=extracted,
            db=db,
            patient_integration=pi,
            vent_import=vi,
        )

        vi.parser_summary = summary or {}
        flag_modified(vi, "parser_summary")
        vi.status = 'completed'
        vi.error = None
        vi.parsed_at = datetime.now(timezone.utc)
        db.add(vi)
        db.commit()
        logger.info("Import %s completed", import_id)

    except Exception as e:
        logger.exception("Import %s failed", import_id)
        try:
            vi = db.query(VentImport).filter(VentImport.id == import_id).first()
            if vi:
                _update_status(db, vi, status='failed', error=str(e))
        except Exception:
            logger.exception("Also failed to mark import %s as failed", import_id)
    finally:
        db.close()


# ----- HTTP endpoints -----

def _load_patient_integration(
    db: Session, patient_id: int, integration_id: int, account_id: int
) -> PatientIntegration:
    pi = db.query(PatientIntegration).options(
        joinedload(PatientIntegration.integration)
    ).filter(
        PatientIntegration.id == integration_id,
        PatientIntegration.patient_id == patient_id,
        PatientIntegration.account_id == account_id,
        PatientIntegration.is_enabled == True,
    ).first()
    if not pi:
        raise HTTPException(status_code=404, detail="Active patient integration not found")
    return pi


def _ensure_supports_import(pi: PatientIntegration) -> str:
    slug = pi.integration.slug
    cls = get_integration(slug)
    if not cls:
        raise HTTPException(status_code=404, detail="Integration class not registered")
    if not getattr(cls, "supports_import", False):
        raise HTTPException(
            status_code=400,
            detail=f"Integration '{slug}' does not support file imports",
        )
    return slug


def _import_to_dict(vi: VentImport) -> Dict[str, Any]:
    """Strip on-disk paths from API responses."""
    return {
        "id": vi.id,
        "patient_id": vi.patient_id,
        "integration_id": vi.integration_id,
        "vendor": vi.vendor,
        "model": vi.model,
        "device_serial": vi.device_serial,
        "file_name": vi.file_name,
        "file_size_bytes": vi.file_size_bytes,
        "status": vi.status,
        "error": vi.error,
        "uploaded_at": vi.uploaded_at.isoformat() if vi.uploaded_at else None,
        "uploaded_by": vi.uploaded_by,
        "parsed_at": vi.parsed_at.isoformat() if vi.parsed_at else None,
        "summary": vi.parser_summary or {},
    }


@router.post(
    "/patient/{patient_id}/{integration_id}/import",
    dependencies=[Depends(require_permission("integrations.upload"))],
)
async def upload_integration_archive(
    patient_id: int,
    integration_id: int,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_full_auth),
    account_id: int = Depends(get_current_account_id),
):
    pi = _load_patient_integration(db, patient_id, integration_id, account_id)
    slug = _ensure_supports_import(pi)

    import_id = uuid4().hex
    import_dir = _import_dir(import_id)
    os.makedirs(import_dir, exist_ok=True)

    orig_name = file.filename or "upload.tar.gz"
    lower = orig_name.lower()
    if lower.endswith((".tar.gz", ".tgz", ".tar")):
        stored_name = "upload" + lower[lower.find("."):]
    else:
        stored_name = "upload.tar.gz"
    storage_path = os.path.join(import_dir, stored_name)

    size = 0
    with open(storage_path, "wb") as out:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            out.write(chunk)
            size += len(chunk)

    user_id = getattr(current_user, "id", None) if current_user else None

    vi = VentImport(
        id=import_id,
        patient_id=patient_id,
        integration_id=integration_id,
        vendor=slug,
        model=(pi.settings or {}).get("model"),
        file_name=orig_name,
        file_size_bytes=size,
        storage_path=storage_path,
        status='queued',
        uploaded_at=datetime.now(timezone.utc),
        uploaded_by=user_id,
    )
    db.add(vi)
    db.commit()
    db.refresh(vi)

    background_tasks.add_task(_run_import, import_id)
    return _import_to_dict(vi)


@router.get(
    "/patient/{patient_id}/{integration_id}/imports",
    dependencies=[Depends(require_permission("integrations.upload"))],
)
async def list_integration_imports(
    patient_id: int,
    integration_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_full_auth),
    account_id: int = Depends(get_current_account_id),
):
    _load_patient_integration(db, patient_id, integration_id, account_id)
    rows = (
        db.query(VentImport)
        .filter(
            VentImport.patient_id == patient_id,
            VentImport.integration_id == integration_id,
        )
        .order_by(VentImport.uploaded_at.desc())
        .all()
    )
    return [_import_to_dict(r) for r in rows]


@router.get(
    "/imports/{import_id}",
    dependencies=[Depends(require_permission("integrations.upload"))],
)
async def get_integration_import(
    import_id: str,
    current_user=Depends(require_full_auth),
    account_id: int = Depends(get_current_account_id),
    db: Session = Depends(get_db),
):
    vi = db.query(VentImport).filter(VentImport.id == import_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Import not found")
    pi = db.query(PatientIntegration).filter(
        PatientIntegration.id == vi.integration_id,
        PatientIntegration.account_id == account_id,
    ).first()
    if not pi:
        raise HTTPException(status_code=404, detail="Import not found")
    return _import_to_dict(vi)


@router.delete(
    "/imports/{import_id}",
    dependencies=[Depends(require_permission("integrations.upload"))],
)
async def delete_integration_import(
    import_id: str,
    current_user=Depends(require_full_auth),
    account_id: int = Depends(get_current_account_id),
    db: Session = Depends(get_db),
):
    vi = db.query(VentImport).filter(VentImport.id == import_id).first()
    if not vi:
        raise HTTPException(status_code=404, detail="Import not found")
    pi = db.query(PatientIntegration).filter(
        PatientIntegration.id == vi.integration_id,
        PatientIntegration.account_id == account_id,
    ).first()
    if not pi:
        raise HTTPException(status_code=404, detail="Import not found")

    # Cascade in the DB removes vent_samples and vent_device_info.
    db.delete(vi)
    db.commit()

    path = _import_dir(import_id)
    if os.path.isdir(path):
        shutil.rmtree(path)
    return {"status": "deleted"}


# ----- Clock calibration -----

def _apply_offset_to_existing_samples(
    db: Session, integration_id: int, offset_seconds: float
) -> int:
    """Set vent_samples.recorded_at = recorded_at_raw + offset for every import
    on this patient_integration. Returns the row count affected.

    Uses raw SQL for speed — there can be hundreds of thousands of rows.
    """
    result = db.execute(text("""
        UPDATE vent_samples
        SET recorded_at = recorded_at_raw + (:offset_sec * interval '1 second')
        WHERE import_id IN (
            SELECT id FROM vent_imports WHERE integration_id = :iid
        )
    """), {"offset_sec": offset_seconds, "iid": integration_id})
    db.commit()
    return result.rowcount or 0


def _save_settings(db: Session, pi: PatientIntegration, updates: Dict[str, Any]) -> None:
    """Merge `updates` into pi.settings JSON. Drops keys whose new value is
    explicitly None so we can clear pending_at after anchoring."""
    settings = dict(pi.settings or {})
    for k, v in updates.items():
        if v is None:
            settings.pop(k, None)
        else:
            settings[k] = v
    pi.settings = settings
    flag_modified(pi, "settings")
    pi.updated_at = datetime.now(timezone.utc)
    db.add(pi)
    db.commit()


@router.post(
    "/patient/{patient_id}/{integration_id}/clock/calibrate-start",
    dependencies=[Depends(require_permission("integrations.upload"))],
)
async def calibrate_clock_start(
    patient_id: int,
    integration_id: int,
    body: Dict[str, Any] = Body(default={}),
    db: Session = Depends(get_db),
    current_user=Depends(require_full_auth),
    account_id: int = Depends(get_current_account_id),
):
    """Path A: user just pressed the manual-mark on the vent and tapped here
    'at the same time'. Stamp real-time now (or accept caller-supplied
    `pressed_at` for slight clock-drift compensation) and wait for the next
    upload to anchor."""
    pi = _load_patient_integration(db, patient_id, integration_id, account_id)
    pressed_raw = body.get("pressed_at")
    pressed_at = (
        datetime.fromisoformat(pressed_raw.replace("Z", "+00:00"))
        if isinstance(pressed_raw, str) else datetime.now(timezone.utc)
    )
    _save_settings(db, pi, {
        "clock_calibration_pending_at": pressed_at.isoformat(),
    })
    return {"status": "pending", "settings": pi.settings}


@router.post(
    "/patient/{patient_id}/{integration_id}/clock/calibrate-manual",
    dependencies=[Depends(require_permission("integrations.upload"))],
)
async def calibrate_clock_manual(
    patient_id: int,
    integration_id: int,
    body: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
    current_user=Depends(require_full_auth),
    account_id: int = Depends(get_current_account_id),
):
    """Path B: user manually types in 'what time the vent currently shows' and
    'real time right now'. Offset is computed immediately and any existing
    vent_samples on this integration are re-shifted."""
    pi = _load_patient_integration(db, patient_id, integration_id, account_id)

    vent_raw = body.get("vent_time")
    real_raw = body.get("real_time")
    if not vent_raw or not real_raw:
        raise HTTPException(status_code=400,
                            detail="Both vent_time and real_time required")
    try:
        vent_dt = datetime.fromisoformat(vent_raw.replace("Z", "+00:00"))
        real_dt = datetime.fromisoformat(real_raw.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Could not parse ISO datetimes")

    offset_seconds = (real_dt - vent_dt).total_seconds()
    _save_settings(db, pi, {
        "clock_offset_seconds": offset_seconds,
        "clock_calibrated_at": real_dt.isoformat(),
        "clock_calibration_anchor": vent_dt.isoformat(),
        "clock_calibration_pending_at": None,
    })
    updated = _apply_offset_to_existing_samples(db, integration_id, offset_seconds)
    return {
        "status": "calibrated",
        "offset_seconds": offset_seconds,
        "samples_updated": updated,
        "settings": pi.settings,
    }


# ----- Vent data views (read-only aggregations) -----

# Grouping heuristic for VOCSN parameters whose Groupings entry is missing.
# Matches the 5 clinical buckets the device's own metadata uses. Returns None
# for clearly non-clinical strings so they keep showing up under "Other".
_GROUP_KEYWORDS = [
    ("Cough",       ("cough", "pcf")),
    ("Nebulizer",   ("neb",)),
    ("Suction",     ("suction", "vacuum")),
    ("Oxygen",      ("fio2", "oxygen", " o2 ", "concentrator", "spo2")),
    ("System",      ("system", "battery", "pm due", "usage", "vpsa", "pump",
                     "firmware", "serial", "ambient", "circuit", "uptime")),
    ("Ventilation", ("airway", "pres", "peep", "tidal", "volume", "flow",
                     "minute", "respiratory", "pip", "pap", "ratio", "i:e",
                     "leak", "manometer", "inspir", "expir", "trigger",
                     "ventilat", "breath", "rate")),
]


def _infer_grouping(display_label: Optional[str], tag_name: Optional[str]) -> Optional[str]:
    blob = ((display_label or "") + " " + (tag_name or "")).lower()
    if not blob.strip():
        return None
    for name, keywords in _GROUP_KEYWORDS:
        for kw in keywords:
            if kw in blob:
                return name
    return None


def _vent_integration_id(db: Session, patient_id: int, account_id: int) -> Optional[int]:
    """Return the active ventilator PatientIntegration.id for this patient,
    or None if the patient has no vent integration."""
    from schemas.integration import Integration as IntegrationModel
    pi = db.query(PatientIntegration).join(IntegrationModel).filter(
        PatientIntegration.patient_id == patient_id,
        PatientIntegration.account_id == account_id,
        PatientIntegration.is_enabled == True,
        IntegrationModel.slug == "ventilator",
    ).first()
    return pi.id if pi else None


@router.get(
    "/patient/{patient_id}/vent/breath-rate-hourly",
    dependencies=[Depends(require_permission("monitoring.read"))],
)
async def vent_breath_rate_hourly(
    patient_id: int,
    days: int = 30,
    db: Session = Depends(get_db),
    current_user=Depends(require_full_auth),
    account_id: int = Depends(get_current_account_id),
):
    """Hourly min/avg/max of vent-measured breath rate (VOCSN parameter 9408,
    _50 median suffix) over the last `days`. Shape matches the pulse-ox
    hourly endpoint so the profile chart can drop it in. Returns
    `{has_data: false, points: []}` when the patient has no vent integration
    or no breath-rate samples — caller falls back to manual resp-rate."""
    days = max(1, min(int(days), 90))
    if not _vent_integration_id(db, patient_id, account_id):
        return {"has_data": False, "points": []}

    end_ts = datetime.now(timezone.utc)
    start_ts = end_ts - timedelta(days=days)

    # `value > 0` drops zero-readings, which the vent emits while the patient
    # is disconnected / off-circuit. Including them drags the hourly mean
    # toward zero and produces the spikes-to-floor you see on the chart;
    # excluding them means hours fully off-vent simply don't render a point.
    rows = db.execute(text("""
        SELECT
            date_trunc('hour', recorded_at) AS bucket,
            MIN(value_numeric) AS lo,
            AVG(value_numeric) AS mean,
            MAX(value_numeric) AS hi,
            COUNT(*) AS n
        FROM vent_samples
        WHERE patient_id = :pid
          AND parameter_key = '9408'
          AND parameter_suffix = '50'
          AND recorded_at >= :start AND recorded_at < :end
          AND value_numeric IS NOT NULL
          AND value_numeric > 0 AND value_numeric <= 100
        GROUP BY bucket
        ORDER BY bucket
    """), {"pid": patient_id, "start": start_ts, "end": end_ts}).all()

    points = [
        {
            "date": r.bucket.isoformat(),
            "min": float(r.lo) if r.lo is not None else None,
            "avg": float(r.mean) if r.mean is not None else None,
            "max": float(r.hi) if r.hi is not None else None,
            "n": int(r.n),
        }
        for r in rows
    ]
    return {"has_data": len(points) > 0, "points": points}


@router.get(
    "/patient/{patient_id}/vent/days",
    dependencies=[Depends(require_permission("monitoring.read"))],
)
async def vent_days(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_full_auth),
    account_id: int = Depends(get_current_account_id),
):
    """List dates that have parsed vent samples (most recent first) so the
    view can render a day picker. `date` is in UTC."""
    if not _vent_integration_id(db, patient_id, account_id):
        return {"has_integration": False, "days": []}

    rows = db.execute(text("""
        SELECT (recorded_at AT TIME ZONE 'UTC')::date AS day, COUNT(*) AS n
        FROM vent_samples
        WHERE patient_id = :pid
        GROUP BY (recorded_at AT TIME ZONE 'UTC')::date
        ORDER BY day DESC
    """), {"pid": patient_id}).all()
    return {
        "has_integration": True,
        "days": [
            {"date": r.day.isoformat(), "sample_count": int(r.n)}
            for r in rows
        ],
    }


@router.get(
    "/patient/{patient_id}/vent/day/{date}",
    dependencies=[Depends(require_permission("monitoring.read"))],
)
async def vent_day(
    patient_id: int,
    date: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_full_auth),
    account_id: int = Depends(get_current_account_id),
):
    """Aggregate one day's parsed samples grouped by parameter. Each row
    carries enough to render a labelled card (display label, units, grouping
    from the dictionary). Suffix='N' (single sample) is summarised separately
    from percentile suffixes."""
    if not _vent_integration_id(db, patient_id, account_id):
        raise HTTPException(status_code=404, detail="No ventilator integration for patient")

    try:
        day = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")
    start = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc)
    end = start + timedelta(days=1)

    # Outlier guard: VOCSN encodes "no reading" with uint16-ish sentinels
    # (43577, 21042, 16190, 5326 — likely bit-pattern encodings of NaN/error
    # rather than a single magic number). Clip to ±5000 — bigger than any
    # real ventilator parameter we've seen (FiO2 max 100, tidal vol max
    # ~2000 mL, pressures max ~80 cmH2O) but well below the noise band.
    # If a legitimate counter ever exceeds 5000 we'll revisit; for now this
    # keeps the displayed min/avg/max honest.
    rows = db.execute(text("""
        SELECT
            s.parameter_key,
            s.parameter_suffix,
            COUNT(*) AS n,
            MIN(s.value_numeric) AS lo,
            MAX(s.value_numeric) AS hi,
            AVG(s.value_numeric) AS mean,
            d.display_label,
            d.display_units,
            d.display_type,
            d.grouping,
            d.scale_factor,
            d.precision,
            d.tag_name
        FROM vent_samples s
        LEFT JOIN vent_parameter_dictionary d
          ON d.vendor = 'vocsn' AND d.parameter_key = s.parameter_key
        WHERE s.patient_id = :pid
          AND s.recorded_at >= :start AND s.recorded_at < :end
          AND s.value_numeric IS NOT NULL
          AND s.value_numeric BETWEEN -5000 AND 5000
        GROUP BY s.parameter_key, s.parameter_suffix,
                 d.display_label, d.display_units, d.display_type, d.grouping,
                 d.scale_factor, d.precision, d.tag_name
        ORDER BY d.grouping NULLS LAST, d.display_label NULLS LAST, s.parameter_suffix
    """), {"pid": patient_id, "start": start, "end": end}).all()

    # Collapse rows so each (parameter_key) gets one entry with per-suffix stats.
    by_key: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        entry = by_key.get(r.parameter_key)
        if entry is None:
            # Prefer the vendor's own grouping. When missing (true for ~405 of
            # 528 VOCSN params), infer from label/tag keywords so the UI shows
            # something more useful than a single "Other" bucket.
            grouping = r.grouping or _infer_grouping(r.display_label, r.tag_name) or "Other"
            entry = {
                "parameter_key": r.parameter_key,
                "display_label": r.display_label or r.parameter_key,
                "display_units": r.display_units,
                "display_type": r.display_type,
                "grouping": grouping,
                "scale_factor": float(r.scale_factor) if r.scale_factor is not None else None,
                "precision": r.precision,
                "stats_by_suffix": {},
                "total_samples": 0,
            }
            by_key[r.parameter_key] = entry
        entry["stats_by_suffix"][r.parameter_suffix or ""] = {
            "n": int(r.n),
            "lo": float(r.lo) if r.lo is not None else None,
            "hi": float(r.hi) if r.hi is not None else None,
            "mean": float(r.mean) if r.mean is not None else None,
        }
        entry["total_samples"] += int(r.n)

    # Group by clinical grouping.
    grouped: Dict[str, list] = {}
    for entry in by_key.values():
        grouped.setdefault(entry["grouping"], []).append(entry)

    # Day-level summary (counts, time range).
    summary_row = db.execute(text("""
        SELECT COUNT(*) AS total,
               MIN(recorded_at) AS first_at,
               MAX(recorded_at) AS last_at
        FROM vent_samples
        WHERE patient_id = :pid AND recorded_at >= :start AND recorded_at < :end
    """), {"pid": patient_id, "start": start, "end": end}).first()

    return {
        "date": day.isoformat(),
        "summary": {
            "total_samples": int(summary_row.total or 0),
            "first_at": summary_row.first_at.isoformat() if summary_row.first_at else None,
            "last_at": summary_row.last_at.isoformat() if summary_row.last_at else None,
            "parameter_count": len(by_key),
        },
        "groups": [
            {"name": g, "parameters": params}
            for g, params in sorted(
                grouped.items(),
                # Clinical priority first; anything unrecognized sorts after.
                key=lambda kv: (
                    {"Ventilation": 0, "Oxygen": 1, "Cough": 2, "Suction": 3,
                     "Nebulizer": 4, "System": 5, "Config": 6, "Other": 99}.get(kv[0], 50),
                    kv[0],
                ),
            )
        ],
    }


@router.get(
    "/patient/{patient_id}/vent/day/{date}/parameter/{key}",
    dependencies=[Depends(require_permission("monitoring.read"))],
)
async def vent_day_parameter_series(
    patient_id: int,
    date: str,
    key: str,
    db: Session = Depends(get_db),
    current_user=Depends(require_full_auth),
    account_id: int = Depends(get_current_account_id),
):
    """Pivoted time-series for one parameter on one day: each row is a
    timestamp with p5/p50/p95 collapsed back into a single record so the
    chart can plot median + 5–95% band."""
    if not _vent_integration_id(db, patient_id, account_id):
        raise HTTPException(status_code=404, detail="No ventilator integration")
    try:
        day = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")
    start = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc)
    end = start + timedelta(days=1)

    rows = db.execute(text("""
        SELECT
            recorded_at,
            MAX(CASE WHEN parameter_suffix='50' THEN value_numeric END) AS p50,
            MAX(CASE WHEN parameter_suffix='5'  THEN value_numeric END) AS p5,
            MAX(CASE WHEN parameter_suffix='95' THEN value_numeric END) AS p95,
            MAX(CASE WHEN parameter_suffix='N'  THEN value_numeric END) AS n_val
        FROM vent_samples
        WHERE patient_id = :pid AND parameter_key = :key
          AND recorded_at >= :start AND recorded_at < :end
          AND value_numeric IS NOT NULL
          AND value_numeric BETWEEN -5000 AND 5000
        GROUP BY recorded_at
        ORDER BY recorded_at
    """), {"pid": patient_id, "key": key, "start": start, "end": end}).all()

    meta = db.execute(text("""
        SELECT display_label, display_units, display_type, grouping, precision
        FROM vent_parameter_dictionary
        WHERE vendor = 'vocsn' AND parameter_key = :key
    """), {"key": key}).first()

    return {
        "parameter_key": key,
        "date": day.isoformat(),
        "display_label": (meta.display_label if meta else key),
        "display_units": (meta.display_units if meta else None),
        "grouping": (meta.grouping if meta else None),
        "precision": (meta.precision if meta else None),
        "points": [
            {
                "ts": r.recorded_at.isoformat(),
                "p50": float(r.p50) if r.p50 is not None else None,
                "p5":  float(r.p5)  if r.p5  is not None else None,
                "p95": float(r.p95) if r.p95 is not None else None,
                "n":   float(r.n_val) if r.n_val is not None else None,
            }
            for r in rows
        ],
    }


@router.delete(
    "/patient/{patient_id}/{integration_id}/clock",
    dependencies=[Depends(require_permission("integrations.upload"))],
)
async def calibrate_clock_clear(
    patient_id: int,
    integration_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_full_auth),
    account_id: int = Depends(get_current_account_id),
):
    """Wipe calibration (offset → 0). Existing samples are reset to raw time."""
    pi = _load_patient_integration(db, patient_id, integration_id, account_id)
    _save_settings(db, pi, {
        "clock_offset_seconds": None,
        "clock_calibrated_at": None,
        "clock_calibration_anchor": None,
        "clock_calibration_pending_at": None,
    })
    updated = _apply_offset_to_existing_samples(db, integration_id, 0.0)
    return {"status": "cleared", "samples_updated": updated, "settings": pi.settings}
