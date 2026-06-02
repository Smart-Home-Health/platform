"""
Epic (and other FHIR R4) EHR integration via the patient-access API.

Epic exposes the standard SMART-on-FHIR patient-access APIs (free, mandated by the
21st Century Cures Act). A single app registration at https://fhir.epic.com works
across every Epic organization that has patient access enabled — but each org runs
its own FHIR server with its own base/authorize/token URLs. The chosen org is kept
in ``PatientIntegration.settings`` and threaded through the OAuth flow, then pinned
into ``credentials`` once connected.

Primary ingest goals: **blood work** (DiagnosticReport + lab Observations) and
**imaging narratives** (DiagnosticReport.conclusion / presentedForm PDFs for MRI etc.).

Auth uses env-var app credentials: ``EPIC_CLIENT_ID`` and (for a confidential
client) ``EPIC_CLIENT_SECRET``. Build/test against Epic's public sandbox first.

The FHIR-parsing helpers below are pure functions (no I/O) so they can be unit
tested against sample resources without a live server.
"""
import base64
import logging
import os
from datetime import datetime, date, timedelta
from typing import Any, Dict, List, Optional

import httpx

import terminology
from .base import (
    BaseIntegration,
    VitalReading,
    DeviceInfo,
    SyncResult,
    VitalType,
    VitalUnit,
    AuthenticationError,
    SyncError,
)
from .registry import register

logger = logging.getLogger("integrations.epic")

# Bundled endpoints the user can pick by id (settings.endpoint_id). The sandbox is
# always available; real orgs can be added here or supplied via manual_* settings.
# Epic's full public directory (open.epic.com/MyApps/Endpoints) can be wired in later.
EPIC_ENDPOINTS: Dict[str, Dict[str, str]] = {
    "sandbox": {
        "name": "Epic Sandbox (test patients)",
        "fhir_base_url": "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4",
        "authorize_url": "https://fhir.epic.com/interconnect-fhir-oauth/oauth2/authorize",
        "token_url": "https://fhir.epic.com/interconnect-fhir-oauth/oauth2/token",
    },
}

# Default SMART scopes for patient-access read of the resources we ingest.
DEFAULT_SCOPES = (
    "openid fhirUser offline_access "
    "patient/Observation.read patient/DiagnosticReport.read "
    "patient/DocumentReference.read patient/Binary.read "
    "patient/Condition.read patient/AllergyIntolerance.read "
    "patient/ImagingStudy.read"
)

FHIR_JSON = "application/fhir+json"
_MAX_PAGES = 10  # safety cap when following Bundle `next` links
_PAGE_COUNT = 50


# ---------------------------------------------------------------------------
# Pure FHIR parsing helpers (no I/O — unit-testable)
# ---------------------------------------------------------------------------

def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    """Parse a FHIR dateTime/instant into a datetime (None if absent/invalid)."""
    if not value:
        return None
    text = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        # date-only or partial value
        try:
            return datetime.fromisoformat(text[:10])
        except ValueError:
            return None


def _parse_date(value: Optional[str]) -> Optional[date]:
    dt = _parse_dt(value)
    return dt.date() if dt else None


def _codings(concept: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not concept:
        return []
    return concept.get("coding", []) or []


def _loinc_code(concept: Optional[Dict[str, Any]]) -> Optional[str]:
    for coding in _codings(concept):
        if "loinc" in (coding.get("system") or "").lower():
            return coding.get("code")
    # fall back to the first coding's code
    codings = _codings(concept)
    return codings[0].get("code") if codings else None


def _concept_display(concept: Optional[Dict[str, Any]]) -> Optional[str]:
    if not concept:
        return None
    if concept.get("text"):
        return concept["text"]
    for coding in _codings(concept):
        if coding.get("display"):
            return coding["display"]
    return None


def _obs_effective(obs: Dict[str, Any]) -> Optional[datetime]:
    if obs.get("effectiveDateTime"):
        return _parse_dt(obs["effectiveDateTime"])
    period = obs.get("effectivePeriod") or {}
    return _parse_dt(period.get("start")) if period else None


def _quantity(node: Optional[Dict[str, Any]]):
    """Return (value, unit, ucum_code) from a FHIR Quantity, or (None, None, None)."""
    if not node:
        return None, None, None
    return node.get("value"), node.get("unit"), node.get("code")


def parse_vital_observation(obs: Dict[str, Any], source: str = "epic") -> List[VitalReading]:
    """Map a vital-signs FHIR Observation to VitalReading(s).

    Handles both scalar observations (valueQuantity) and panels with components
    (e.g. blood pressure → systolic/diastolic). Only LOINC codes known to
    ``terminology`` are emitted; everything else is ignored here.
    """
    obs_id = obs.get("id", "")
    ts = _obs_effective(obs) or datetime.utcnow()
    readings: List[VitalReading] = []

    components = obs.get("component")
    if components:
        for comp in components:
            loinc = _loinc_code(comp.get("code"))
            vt = terminology.vital_type_for_loinc(loinc) if loinc else None
            if not vt:
                continue
            value, unit, _ucum = _quantity(comp.get("valueQuantity"))
            if value is None:
                continue
            readings.append(VitalReading(
                vital_type=vt.value,
                value=float(value),
                unit=unit or "",
                timestamp=ts,
                vital_group=_VITAL_GROUP_BY_TYPE.get(vt),
                external_id=f"epic_{obs_id}_{loinc}",
                raw_data={"loinc": loinc},
            ))
        return readings

    loinc = _loinc_code(obs.get("code"))
    vt = terminology.vital_type_for_loinc(loinc) if loinc else None
    if not vt:
        return readings
    value, unit, _ucum = _quantity(obs.get("valueQuantity"))
    if value is None:
        return readings
    readings.append(VitalReading(
        vital_type=vt.value,
        value=float(value),
        unit=unit or "",
        timestamp=ts,
        external_id=f"epic_{obs_id}_{loinc}",
        raw_data={"loinc": loinc},
    ))
    return readings


# vital_group hints for component-based vitals
_VITAL_GROUP_BY_TYPE = {
    VitalType.BLOOD_PRESSURE_SYSTOLIC: "systolic",
    VitalType.BLOOD_PRESSURE_DIASTOLIC: "diastolic",
    VitalType.BLOOD_PRESSURE_MAP: "map",
}


def parse_lab_observation(obs: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Map a laboratory FHIR Observation to a lab_results dict (any LOINC, numeric
    or not). Returns None only if it has neither a value nor a code."""
    obs_id = obs.get("id", "")
    code = _loinc_code(obs.get("code"))
    display = _concept_display(obs.get("code"))

    value = value_string = unit = ucum = None
    if obs.get("valueQuantity"):
        value, unit, ucum = _quantity(obs["valueQuantity"])
    elif obs.get("valueString"):
        value_string = obs["valueString"]
    elif obs.get("valueCodeableConcept"):
        value_string = _concept_display(obs["valueCodeableConcept"])

    if value is None and value_string is None and not code:
        return None

    ref_low = ref_high = ref_text = None
    ranges = obs.get("referenceRange") or []
    if ranges:
        rng = ranges[0]
        ref_low = (rng.get("low") or {}).get("value")
        ref_high = (rng.get("high") or {}).get("value")
        ref_text = rng.get("text")
        if not ref_text and (ref_low is not None or ref_high is not None):
            ref_text = f"{ref_low if ref_low is not None else ''}-{ref_high if ref_high is not None else ''}"

    abnormal = None
    interp_text = None
    interps = obs.get("interpretation") or []
    if interps:
        abnormal = _loinc_code(interps[0]) or (_codings(interps[0])[0].get("code") if _codings(interps[0]) else None)
        interp_text = _concept_display(interps[0])

    return {
        "external_id": f"epic_{obs_id}",
        "code": code,
        "code_system": "http://loinc.org",
        "display": display,
        "value": float(value) if value is not None else None,
        "value_string": value_string,
        "unit": unit,
        "ucum_unit": ucum,
        "reference_range": ref_text,
        "reference_low": float(ref_low) if ref_low is not None else None,
        "reference_high": float(ref_high) if ref_high is not None else None,
        "abnormal_flag": abnormal,
        "interpretation": interp_text,
        "effective_datetime": _obs_effective(obs),
        "raw_data": {"id": obs_id},
    }


_CATEGORY_MAP = {
    "LAB": "laboratory", "laboratory": "laboratory",
    "RAD": "imaging", "imaging": "imaging", "LP": "pathology", "pathology": "pathology",
}


def _report_category(rep: Dict[str, Any]) -> Optional[str]:
    for cat in rep.get("category", []) or []:
        for coding in _codings(cat):
            mapped = _CATEGORY_MAP.get(coding.get("code")) or _CATEGORY_MAP.get((coding.get("code") or "").upper())
            if mapped:
                return mapped
    return None


def parse_diagnostic_report(rep: Dict[str, Any]) -> Dict[str, Any]:
    """Map a FHIR DiagnosticReport to a reports dict. The imaging narrative lives
    in ``conclusion``. Linked Observation ids and presentedForm attachments are
    returned under private keys for the caller to wire up."""
    rep_id = rep.get("id", "")
    result_ids = []
    for ref in rep.get("result", []) or []:
        reference = ref.get("reference", "")
        if "/" in reference:
            result_ids.append(reference.split("/")[-1])

    return {
        "external_id": f"epic_{rep_id}",
        "code": _loinc_code(rep.get("code")),
        "code_system": "http://loinc.org",
        "display": _concept_display(rep.get("code")),
        "category": _report_category(rep),
        "status": rep.get("status"),
        "effective_datetime": _parse_dt(rep.get("effectiveDateTime"))
        or _parse_dt((rep.get("effectivePeriod") or {}).get("start")),
        "issued": _parse_dt(rep.get("issued")),
        "performer": _concept_display((rep.get("performer") or [{}])[0]) if rep.get("performer") else None,
        "conclusion": rep.get("conclusion"),
        "raw_data": {"id": rep_id},
        # private wiring keys (consumed in sync_data, not persisted directly):
        "_result_ids": result_ids,
        "_presented_forms": rep.get("presentedForm", []) or [],
    }


def parse_document_reference(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Map a FHIR DocumentReference to a documents dict (metadata + attachment
    pointer). The attachment bytes are resolved during sync_data."""
    doc_id = doc.get("id", "")
    content = (doc.get("content") or [{}])[0]
    attachment = content.get("attachment", {}) or {}
    type_text = _concept_display(doc.get("type"))
    return {
        "external_id": f"epic_{doc_id}",
        "document_type": "clinical-note",
        "title": type_text or doc.get("description"),
        "content_type": attachment.get("contentType"),
        "fhir_resource_type": "DocumentReference",
        "_attachment": attachment,  # private: {contentType, data|url}
    }


def parse_imaging_study(study: Dict[str, Any]) -> Dict[str, Any]:
    study_id = study.get("id", "")
    modality = None
    mods = study.get("modality") or []
    if mods:
        modality = mods[0].get("code")
    body_site = None
    series = study.get("series") or []
    if series and series[0].get("bodySite"):
        body_site = series[0]["bodySite"].get("display") or series[0]["bodySite"].get("code")
    return {
        "external_id": f"epic_{study_id}",
        "modality": modality,
        "body_site": body_site,
        "description": study.get("description"),
        "started": _parse_dt(study.get("started")),
        "series_count": study.get("numberOfSeries"),
        "instance_count": study.get("numberOfInstances"),
        "study_uid": study.get("uid") or (study.get("identifier") or [{}])[0].get("value"),
        "raw_data": {"id": study_id},
    }


_CLINICAL_STATUS_MAP = {"active": "active", "inactive": "inactive", "resolved": "resolved"}


def parse_condition(cond: Dict[str, Any]) -> Dict[str, Any]:
    cond_id = cond.get("id", "")
    icd10 = snomed = None
    for coding in _codings(cond.get("code")):
        system = (coding.get("system") or "").lower()
        if "icd-10" in system or "icd10" in system:
            icd10 = coding.get("code")
        elif "snomed" in system:
            snomed = coding.get("code")
    clinical = None
    for coding in _codings(cond.get("clinicalStatus")):
        clinical = _CLINICAL_STATUS_MAP.get(coding.get("code"), coding.get("code"))
    return {
        "external_id": f"epic_{cond_id}",
        "name": _concept_display(cond.get("code")) or "Unknown condition",
        "icd10_code": icd10,
        "icd10_description": None,
        "snomed_code": snomed,
        "status": clinical or "active",
        "onset_date": _parse_date(cond.get("onsetDateTime")),
        "diagnosis_date": _parse_date(cond.get("recordedDate")),
        "raw_data": {"id": cond_id},
    }


def _med_codes(concept: Optional[Dict[str, Any]]):
    """Extract (rxnorm, ndc) from a medication CodeableConcept."""
    rxnorm = ndc = None
    for coding in _codings(concept):
        system = (coding.get("system") or "").lower()
        if "rxnorm" in system:
            rxnorm = coding.get("code")
        elif "ndc" in system or "/ndc" in system:
            ndc = coding.get("code")
    return rxnorm, ndc


# FHIR medication statuses that mean the medication is no longer being taken.
_MED_INACTIVE_STATUS = {"completed", "stopped", "cancelled", "entered-in-error", "not-taken"}


def parse_medication(resource: Dict[str, Any]) -> Dict[str, Any]:
    """Map a FHIR MedicationRequest or MedicationStatement to a medications dict.

    Note: the native Medication model requires ``quantity`` / ``quantity_unit`` —
    FHIR rarely supplies a clean count, so we default to 0 / 'unknown' and rely on
    ``instructions`` for the human-readable dosing.
    """
    res_id = resource.get("id", "")
    concept = resource.get("medicationCodeableConcept")
    name = _concept_display(concept) or "Unknown medication"
    rxnorm, ndc = _med_codes(concept)

    # dosage text differs between the two resource types
    instructions = None
    as_needed = False
    dosages = resource.get("dosageInstruction") or resource.get("dosage") or []
    if dosages:
        instructions = dosages[0].get("text")
        as_needed = bool(dosages[0].get("asNeededBoolean", False))

    qty = (resource.get("dispenseRequest") or {}).get("quantity") or {}

    start_date = _parse_dt(resource.get("authoredOn")) \
        or _parse_dt((resource.get("effectivePeriod") or {}).get("start")) \
        or _parse_dt(resource.get("effectiveDateTime"))
    end_date = _parse_dt((resource.get("effectivePeriod") or {}).get("end"))

    status = resource.get("status")
    return {
        "external_id": f"epic_{res_id}",
        "name": name,
        "rxnorm_code": rxnorm,
        "ndc_code": ndc,
        "quantity": qty.get("value", 0) or 0,
        "quantity_unit": qty.get("unit") or "unknown",
        "instructions": instructions,
        "as_needed": as_needed,
        "start_date": start_date,
        "end_date": end_date,
        "active": status not in _MED_INACTIVE_STATUS if status else True,
    }


_CRITICALITY_MAP = {"low": "low", "high": "high", "unable-to-assess": "unable-to-assess"}


def parse_allergy(a: Dict[str, Any]) -> Dict[str, Any]:
    a_id = a.get("id", "")
    categories = a.get("category") or []
    clinical = None
    for coding in _codings(a.get("clinicalStatus")):
        clinical = coding.get("code")
    verification = None
    for coding in _codings(a.get("verificationStatus")):
        verification = coding.get("code")
    reaction_text = None
    severity = None
    reactions = a.get("reaction") or []
    if reactions:
        manifestations = reactions[0].get("manifestation") or []
        reaction_text = ", ".join(filter(None, (_concept_display(m) for m in manifestations))) or None
        severity = reactions[0].get("severity")
    code = None
    code_system = None
    codings = _codings(a.get("code"))
    if codings:
        code = codings[0].get("code")
        code_system = codings[0].get("system")
    return {
        "external_id": f"epic_{a_id}",
        "substance": _concept_display(a.get("code")) or "Unknown allergen",
        "code": code,
        "code_system": code_system,
        "category": categories[0] if categories else None,
        "criticality": _CRITICALITY_MAP.get(a.get("criticality")),
        "clinical_status": clinical or "active",
        "verification_status": verification or "confirmed",
        "reaction": reaction_text,
        "severity": severity,
        "onset_date": _parse_date(a.get("onsetDateTime")),
    }


# ---------------------------------------------------------------------------
# Integration
# ---------------------------------------------------------------------------

@register
class EpicIntegration(BaseIntegration):
    slug = "epic"
    name = "Epic (MyChart)"
    description = "Import records from your hospital's Epic system via FHIR patient access — labs, imaging reports, conditions, allergies, vitals."
    auth_type = "oauth2"
    supported_vitals = [
        VitalType.HEART_RATE.value,
        VitalType.SPO2.value,
        VitalType.BLOOD_PRESSURE_SYSTOLIC.value,
        VitalType.BLOOD_PRESSURE_DIASTOLIC.value,
        VitalType.TEMPERATURE.value,
        VitalType.WEIGHT.value,
        VitalType.BMI.value,
        VitalType.RESPIRATORY_RATE.value,
        VitalType.BLOOD_GLUCOSE.value,
    ]

    @classmethod
    def get_config_schema(cls) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "endpoint_id": {
                    "type": "string",
                    "title": "Health system",
                    "enum": list(EPIC_ENDPOINTS.keys()),
                    "default": "sandbox",
                    "description": "Pick your hospital's Epic endpoint (or use manual URLs below).",
                },
                "manual_fhir_base_url": {"type": "string", "title": "FHIR base URL (manual)"},
                "manual_authorize_url": {"type": "string", "title": "Authorize URL (manual)"},
                "manual_token_url": {"type": "string", "title": "Token URL (manual)"},
            },
            "required": [],
            "description": "Choose your health system, then click Connect to sign in with MyChart.",
        }

    # -- endpoint resolution ------------------------------------------------
    @staticmethod
    def _resolve_endpoint(settings: Optional[Dict[str, Any]]) -> Dict[str, str]:
        settings = settings or {}
        if settings.get("manual_fhir_base_url"):
            return {
                "fhir_base_url": settings["manual_fhir_base_url"].rstrip("/"),
                "authorize_url": settings.get("manual_authorize_url", ""),
                "token_url": settings.get("manual_token_url", ""),
            }
        endpoint = EPIC_ENDPOINTS.get(settings.get("endpoint_id", "sandbox"), EPIC_ENDPOINTS["sandbox"])
        return {
            "fhir_base_url": endpoint["fhir_base_url"].rstrip("/"),
            "authorize_url": endpoint["authorize_url"],
            "token_url": endpoint["token_url"],
        }

    @classmethod
    def get_oauth_url(cls, state: str, redirect_uri: str,
                      settings: Optional[Dict[str, Any]] = None) -> Optional[str]:
        client_id = os.getenv("EPIC_CLIENT_ID")
        if not client_id:
            logger.warning("EPIC_CLIENT_ID not configured")
            return None
        endpoint = cls._resolve_endpoint(settings)
        if not endpoint["authorize_url"] or not endpoint["fhir_base_url"]:
            return None
        scope = (settings or {}).get("scope") or os.getenv("EPIC_SCOPES", DEFAULT_SCOPES)
        params = {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "scope": scope,
            "state": state,
            "aud": endpoint["fhir_base_url"],  # required by Epic
        }
        from urllib.parse import urlencode
        return f"{endpoint['authorize_url']}?{urlencode(params)}"

    async def authenticate(self, auth_data: Dict[str, Any]) -> Dict[str, Any]:
        code = auth_data.get("code")
        redirect_uri = auth_data.get("redirect_uri")
        if not code:
            raise AuthenticationError("No authorization code provided")

        client_id = os.getenv("EPIC_CLIENT_ID")
        client_secret = os.getenv("EPIC_CLIENT_SECRET")
        if not client_id:
            raise AuthenticationError("EPIC_CLIENT_ID not configured")

        endpoint = self._resolve_endpoint(self.settings)
        data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": client_id,
        }
        if client_secret:
            data["client_secret"] = client_secret

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(endpoint["token_url"], data=data)
        if resp.status_code != 200:
            raise AuthenticationError(f"Epic token request failed: {resp.status_code} {resp.text}")
        body = resp.json()
        expires_in = body.get("expires_in", 3600)
        return {
            "access_token": body.get("access_token"),
            "refresh_token": body.get("refresh_token"),
            "epic_patient_id": body.get("patient"),
            "fhir_base_url": endpoint["fhir_base_url"],
            "token_url": endpoint["token_url"],
            "scope": body.get("scope"),
            "expires_at": (datetime.utcnow() + timedelta(seconds=expires_in)).isoformat(),
        }

    async def refresh_credentials(self) -> Dict[str, Any]:
        if not self.credentials or not self.credentials.get("refresh_token"):
            raise AuthenticationError("No refresh token available")
        client_id = os.getenv("EPIC_CLIENT_ID")
        client_secret = os.getenv("EPIC_CLIENT_SECRET")
        token_url = self.credentials.get("token_url") or self._resolve_endpoint(self.settings)["token_url"]

        data = {
            "grant_type": "refresh_token",
            "refresh_token": self.credentials["refresh_token"],
            "client_id": client_id,
        }
        if client_secret:
            data["client_secret"] = client_secret

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(token_url, data=data)
        if resp.status_code != 200:
            raise AuthenticationError(f"Epic token refresh failed: {resp.status_code} {resp.text}")
        body = resp.json()
        expires_in = body.get("expires_in", 3600)
        creds = dict(self.credentials)
        creds.update({
            "access_token": body.get("access_token"),
            # Epic may or may not rotate the refresh token
            "refresh_token": body.get("refresh_token", self.credentials["refresh_token"]),
            "scope": body.get("scope", self.credentials.get("scope")),
            "expires_at": (datetime.utcnow() + timedelta(seconds=expires_in)).isoformat(),
        })
        return creds

    async def _get_headers(self) -> Dict[str, str]:
        if not self.credentials:
            raise AuthenticationError("Not authenticated")
        expires_at = self.credentials.get("expires_at")
        if expires_at:
            try:
                if datetime.utcnow() >= datetime.fromisoformat(expires_at) - timedelta(minutes=5):
                    self.credentials = await self.refresh_credentials()
            except ValueError:
                pass
        return {
            "Authorization": f"Bearer {self.credentials['access_token']}",
            "Accept": FHIR_JSON,
        }

    def _base_url(self) -> str:
        base = (self.credentials or {}).get("fhir_base_url")
        if not base:
            base = self._resolve_endpoint(self.settings)["fhir_base_url"]
        return base.rstrip("/")

    def _patient_id(self) -> str:
        pid = (self.credentials or {}).get("epic_patient_id")
        if not pid:
            raise SyncError("No Epic patient id in credentials")
        return pid

    async def _search(self, client: httpx.AsyncClient, headers: Dict[str, str],
                      resource: str, params: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Run a FHIR search and return all resource entries, following `next`
        links up to a safety cap."""
        url = f"{self._base_url()}/{resource}"
        entries: List[Dict[str, Any]] = []
        for _ in range(_MAX_PAGES):
            resp = await client.get(url, headers=headers, params=params)
            if resp.status_code != 200:
                raise SyncError(f"FHIR {resource} search failed: {resp.status_code} {resp.text[:200]}")
            bundle = resp.json()
            for entry in bundle.get("entry", []) or []:
                if entry.get("resource"):
                    entries.append(entry["resource"])
            next_url = None
            for link in bundle.get("link", []) or []:
                if link.get("relation") == "next":
                    next_url = link.get("url")
            if not next_url:
                break
            url, params = next_url, None  # next link already carries query params
        return entries

    async def _safe_search(self, client: httpx.AsyncClient, headers: Dict[str, str],
                           resource: str, params: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Like _search but tolerant: a resource type an org doesn't support (or
        denies) is logged and skipped rather than failing the whole sync."""
        try:
            return await self._search(client, headers, resource, params)
        except Exception as e:
            logger.warning("Epic %s search skipped: %s", resource, e)
            return []

    async def _fetch_attachment(self, client: httpx.AsyncClient, headers: Dict[str, str],
                                attachment: Dict[str, Any]) -> Optional[bytes]:
        """Resolve a FHIR attachment to raw bytes (inline base64 or a Binary URL)."""
        if not attachment:
            return None
        if attachment.get("data"):
            try:
                return base64.b64decode(attachment["data"])
            except Exception:
                return None
        url = attachment.get("url")
        if not url:
            return None
        if not url.startswith("http"):
            url = f"{self._base_url()}/{url.lstrip('/')}"
        resp = await client.get(url, headers={**headers, "Accept": "*/*"})
        if resp.status_code != 200:
            logger.warning("Failed to fetch attachment %s: %s", url, resp.status_code)
            return None
        return resp.content

    async def fetch_devices(self) -> List[DeviceInfo]:
        """Epic has no devices; represent the connected EHR as a single 'device'
        and use the Patient read to validate the token."""
        headers = await self._get_headers()
        pid = self._patient_id()
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(f"{self._base_url()}/Patient/{pid}", headers=headers)
            name = None
            if resp.status_code == 200:
                names = resp.json().get("name") or []
                if names:
                    name = names[0].get("text") or " ".join(
                        names[0].get("given", []) + [names[0].get("family", "")]
                    ).strip()
        return [DeviceInfo(
            device_id=pid,
            device_type="ehr",
            device_name=name or "Epic record",
            device_model="Epic FHIR",
        )]

    async def sync_data(self, since: Optional[datetime] = None,
                        device_ids: Optional[List[str]] = None) -> SyncResult:
        headers = await self._get_headers()
        pid = self._patient_id()
        readings: List[VitalReading] = []
        reports: List[Dict[str, Any]] = []
        lab_results: List[Dict[str, Any]] = []
        documents: List[Dict[str, Any]] = []
        imaging_studies: List[Dict[str, Any]] = []
        conditions: List[Dict[str, Any]] = []
        medications: List[Dict[str, Any]] = []
        allergies: List[Dict[str, Any]] = []

        date_filter = {}
        if since:
            date_filter = {"date": f"ge{since.date().isoformat()}"}

        try:
            async with httpx.AsyncClient(timeout=60) as client:
                # Vitals
                for obs in await self._safe_search(client, headers, "Observation",
                                                   {"patient": pid, "category": "vital-signs",
                                                    "_count": _PAGE_COUNT, **date_filter}):
                    readings.extend(parse_vital_observation(obs))

                # Diagnostic reports (labs + imaging) — build obs->report link map
                obs_to_report: Dict[str, str] = {}
                for rep in await self._safe_search(client, headers, "DiagnosticReport",
                                                   {"patient": pid, "_count": _PAGE_COUNT, **date_filter}):
                    rep_dict = parse_diagnostic_report(rep)
                    for obs_id in rep_dict.pop("_result_ids", []):
                        obs_to_report[obs_id] = rep_dict["external_id"]
                    # presentedForm attachments -> documents linked to this report
                    for form in rep_dict.pop("_presented_forms", []):
                        content = await self._fetch_attachment(client, headers, form)
                        documents.append({
                            "external_id": f"{rep_dict['external_id']}_form{len(documents)}",
                            "report_external_id": rep_dict["external_id"],
                            "document_type": "imaging-report" if rep_dict.get("category") == "imaging" else "lab-report",
                            "title": rep_dict.get("display"),
                            "content_type": form.get("contentType"),
                            "fhir_resource_type": "DiagnosticReport",
                            "content": content,
                        })
                    reports.append(rep_dict)

                # Lab observations -> lab_results, linked to reports where possible
                for obs in await self._safe_search(client, headers, "Observation",
                                                   {"patient": pid, "category": "laboratory",
                                                    "_count": _PAGE_COUNT, **date_filter}):
                    lab = parse_lab_observation(obs)
                    if lab:
                        lab["report_external_id"] = obs_to_report.get(obs.get("id", ""))
                        lab_results.append(lab)

                # Standalone clinical documents
                for doc in await self._safe_search(client, headers, "DocumentReference",
                                                   {"patient": pid, "_count": _PAGE_COUNT}):
                    doc_dict = parse_document_reference(doc)
                    attachment = doc_dict.pop("_attachment", {})
                    doc_dict["content"] = await self._fetch_attachment(client, headers, attachment)
                    documents.append(doc_dict)

                # Imaging study metadata
                for study in await self._safe_search(client, headers, "ImagingStudy",
                                                     {"patient": pid, "_count": _PAGE_COUNT}):
                    imaging_studies.append(parse_imaging_study(study))

                # Conditions, medications, allergies (full list; not date-filtered)
                for cond in await self._safe_search(client, headers, "Condition",
                                                    {"patient": pid, "_count": _PAGE_COUNT}):
                    conditions.append(parse_condition(cond))
                for res_type in ("MedicationRequest", "MedicationStatement"):
                    for med in await self._safe_search(client, headers, res_type,
                                                       {"patient": pid, "_count": _PAGE_COUNT}):
                        medications.append(parse_medication(med))
                for a in await self._safe_search(client, headers, "AllergyIntolerance",
                                                 {"patient": pid, "_count": _PAGE_COUNT}):
                    allergies.append(parse_allergy(a))

            return SyncResult(
                success=True,
                readings_count=len(readings),
                readings=readings,
                reports=reports,
                lab_results=lab_results,
                documents=documents,
                imaging_studies=imaging_studies,
                conditions=conditions,
                medications=medications,
                allergies=allergies,
                sync_timestamp=datetime.utcnow(),
            )
        except Exception as e:
            logger.exception("Epic sync failed")
            return SyncResult(success=False, error_message=str(e), sync_timestamp=datetime.utcnow())
