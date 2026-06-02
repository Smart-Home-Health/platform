"""
Persistence for the richer clinical resources an EHR/FHIR integration returns in
``SyncResult`` (reports, lab results, documents, imaging studies, allergies).

The sync route persists ``SyncResult.readings`` into ``vitals`` itself; this module
handles everything else, with de-duplication by ``external_id`` and cross-reference
resolution (lab/document/imaging -> diagnostic report). Document blobs are written
to the ./data volume via ``document_store`` rather than into Postgres.

Expected dict shapes are produced by ``integrations/epic.py`` (see its parse_*
helpers).
"""
import logging
from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from schemas.clinical_results import (
    DiagnosticReport, LabResult, ClinicalDocument, ImagingStudy,
)
from schemas.allergy import AllergyIntolerance
from schemas.diagnosis import Diagnosis
from schemas.medication import Medication
from document_store import save_document

logger = logging.getLogger("integrations.persistence")


def _exists(db: Session, model, patient_id: int, external_id: Optional[str]) -> bool:
    if not external_id:
        return False
    return db.query(model.id).filter(
        model.patient_id == patient_id,
        model.external_id == external_id,
    ).first() is not None


def persist_sync_extras(db: Session, account_id: int, patient_id: int,
                        source: str, result) -> Dict[str, int]:
    """Persist the non-vital clinical resources from a SyncResult.

    Returns a dict of per-type insert counts. Does NOT commit — the caller owns
    the transaction (the sync route commits alongside the vitals it stored).
    """
    now = datetime.utcnow()
    counts = {"reports": 0, "lab_results": 0, "documents": 0,
              "imaging_studies": 0, "conditions": 0, "medications": 0, "allergies": 0}

    # 1) Diagnostic reports first, so dependents can resolve their FK.
    report_id_by_ext: Dict[str, int] = {}
    for r in getattr(result, "reports", []) or []:
        ext = r.get("external_id")
        existing = db.query(DiagnosticReport).filter(
            DiagnosticReport.patient_id == patient_id,
            DiagnosticReport.external_id == ext,
        ).first() if ext else None
        if existing:
            report_id_by_ext[ext] = existing.id
            continue
        row = DiagnosticReport(
            account_id=account_id, patient_id=patient_id,
            code=r.get("code"), code_system=r.get("code_system"), display=r.get("display"),
            category=r.get("category"), status=r.get("status"),
            effective_datetime=r.get("effective_datetime"), issued=r.get("issued"),
            performer=r.get("performer"), conclusion=r.get("conclusion"),
            source=source, external_id=ext, raw_data=r.get("raw_data"),
            created_at=now, updated_at=now,
        )
        db.add(row)
        db.flush()  # assign row.id for FK linking
        if ext:
            report_id_by_ext[ext] = row.id
        counts["reports"] += 1

    def _resolve_report_id(ext: Optional[str]) -> Optional[int]:
        if not ext:
            return None
        if ext in report_id_by_ext:
            return report_id_by_ext[ext]
        existing = db.query(DiagnosticReport.id).filter(
            DiagnosticReport.patient_id == patient_id,
            DiagnosticReport.external_id == ext,
        ).first()
        return existing.id if existing else None

    # 2) Lab results
    for lab in getattr(result, "lab_results", []) or []:
        if _exists(db, LabResult, patient_id, lab.get("external_id")):
            continue
        db.add(LabResult(
            account_id=account_id, patient_id=patient_id,
            diagnostic_report_id=_resolve_report_id(lab.get("report_external_id")),
            code=lab.get("code"), code_system=lab.get("code_system"), display=lab.get("display"),
            value=lab.get("value"), value_string=lab.get("value_string"),
            unit=lab.get("unit"), ucum_unit=lab.get("ucum_unit"),
            reference_range=lab.get("reference_range"),
            reference_low=lab.get("reference_low"), reference_high=lab.get("reference_high"),
            abnormal_flag=lab.get("abnormal_flag"), interpretation=lab.get("interpretation"),
            effective_datetime=lab.get("effective_datetime"),
            source=source, external_id=lab.get("external_id"), raw_data=lab.get("raw_data"),
            created_at=now,
        ))
        counts["lab_results"] += 1

    # 3) Documents — write blob to the volume, store metadata + path
    for d in getattr(result, "documents", []) or []:
        if _exists(db, ClinicalDocument, patient_id, d.get("external_id")):
            continue
        content = d.get("content")
        file_path = None
        size_bytes = None
        if content:
            file_path, size_bytes = save_document(account_id, patient_id, content, d.get("content_type"))
        db.add(ClinicalDocument(
            account_id=account_id, patient_id=patient_id,
            diagnostic_report_id=_resolve_report_id(d.get("report_external_id")),
            document_type=d.get("document_type"), title=d.get("title"),
            content_type=d.get("content_type"),
            storage="file", file_path=file_path, size_bytes=size_bytes,
            fhir_resource_type=d.get("fhir_resource_type"),
            source=source, external_id=d.get("external_id"),
            created_at=now,
        ))
        counts["documents"] += 1

    # 4) Imaging studies
    for s in getattr(result, "imaging_studies", []) or []:
        if _exists(db, ImagingStudy, patient_id, s.get("external_id")):
            continue
        db.add(ImagingStudy(
            account_id=account_id, patient_id=patient_id,
            diagnostic_report_id=_resolve_report_id(s.get("report_external_id")),
            modality=s.get("modality"), body_site=s.get("body_site"),
            description=s.get("description"), started=s.get("started"),
            series_count=s.get("series_count"), instance_count=s.get("instance_count"),
            study_uid=s.get("study_uid"),
            source=source, external_id=s.get("external_id"), raw_data=s.get("raw_data"),
            created_at=now,
        ))
        counts["imaging_studies"] += 1

    # 5) Conditions -> Diagnosis
    for c in getattr(result, "conditions", []) or []:
        if _exists(db, Diagnosis, patient_id, c.get("external_id")):
            continue
        db.add(Diagnosis(
            account_id=account_id, patient_id=patient_id,
            name=c.get("name") or "Unknown condition",
            icd10_code=c.get("icd10_code"), icd10_description=c.get("icd10_description"),
            snomed_code=c.get("snomed_code"),
            status=c.get("status") or "active",
            onset_date=c.get("onset_date"), diagnosis_date=c.get("diagnosis_date"),
            source=source, external_id=c.get("external_id"),
            created_at=now, updated_at=now,
        ))
        counts["conditions"] += 1

    # 6) Medications -> Medication
    for m in getattr(result, "medications", []) or []:
        if _exists(db, Medication, patient_id, m.get("external_id")):
            continue
        db.add(Medication(
            account_id=account_id, patient_id=patient_id,
            name=m.get("name") or "Unknown medication",
            rxnorm_code=m.get("rxnorm_code"), ndc_code=m.get("ndc_code"),
            quantity=m.get("quantity") or 0, quantity_unit=m.get("quantity_unit") or "unknown",
            instructions=m.get("instructions"), as_needed=bool(m.get("as_needed")),
            start_date=m.get("start_date"), end_date=m.get("end_date"),
            active=m.get("active", True),
            source=source, external_id=m.get("external_id"),
            created_at=now, updated_at=now,
        ))
        counts["medications"] += 1

    # 7) Allergies (the allergies table has external_id, so dedup is safe)
    for a in getattr(result, "allergies", []) or []:
        if _exists(db, AllergyIntolerance, patient_id, a.get("external_id")):
            continue
        db.add(AllergyIntolerance(
            account_id=account_id, patient_id=patient_id,
            substance=a.get("substance") or "Unknown allergen",
            code=a.get("code"), code_system=a.get("code_system"),
            category=a.get("category"), criticality=a.get("criticality"),
            clinical_status=a.get("clinical_status") or "active",
            verification_status=a.get("verification_status") or "confirmed",
            reaction=a.get("reaction"), severity=a.get("severity"),
            onset_date=a.get("onset_date"),
            source=source, external_id=a.get("external_id"),
            created_at=now, updated_at=now,
        ))
        counts["allergies"] += 1

    return counts
