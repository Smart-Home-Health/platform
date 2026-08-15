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
Inbound Home Assistant integration routes: connection config, entity picker,
and entity->target mappings. No bare "" route so this router can share the
/api/integrations prefix space without colliding with /api/integrations/{slug}.
"""
import logging
from dataclasses import asdict
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db import get_db
from dependencies import get_current_account_id, require_full_auth, require_read_access
from environment import metrics as env_metrics
from homeassistant import listener, service
from homeassistant.client import HAClient, HAClientError, supervisor_available
from integrations.base import VitalType
from models.home_assistant import HAConfigUpdate, HAMappingCreate, HAMappingUpdate
from schemas.ha_entity_mapping import HAEntityMapping
from schemas.patient import Patient

logger = logging.getLogger("homeassistant")

router = APIRouter(prefix="/api/integrations/home_assistant", tags=["home-assistant"])

# Storage-convention vital types offered by the mapping UI. BP and temperature
# use the grouped convention (vital_type + vital_group) that the vitals UI and
# MQTT combined-state expect (same as Withings ingest).
VITAL_TYPE_OPTIONS = [
    {"value": "spo2", "label": "SpO2", "groups": []},
    {"value": "heart_rate", "label": "Heart rate", "groups": []},
    {"value": "blood_pressure", "label": "Blood pressure", "groups": ["systolic", "diastolic", "map"]},
    {"value": "temperature", "label": "Temperature", "groups": ["body", "skin"]},
    {"value": "respiratory_rate", "label": "Respiratory rate", "groups": []},
    {"value": "blood_glucose", "label": "Blood glucose", "groups": []},
    {"value": "weight", "label": "Weight", "groups": []},
    {"value": "bmi", "label": "BMI", "groups": []},
    {"value": "body_fat", "label": "Body fat", "groups": []},
    {"value": "muscle_mass", "label": "Muscle mass", "groups": []},
    {"value": "bone_mass", "label": "Bone mass", "groups": []},
    {"value": "water_percentage", "label": "Water percentage", "groups": []},
    {"value": "steps", "label": "Steps", "groups": []},
    {"value": "perfusion_index", "label": "Perfusion index", "groups": []},
]

_STANDARD_VITAL_TYPES = (
    {opt["value"] for opt in VITAL_TYPE_OPTIONS} | {vt.value for vt in VitalType}
)


def _config_response(db: Session) -> dict:
    config = service.get_config(db)
    return {
        "enabled": bool(config.get("enabled")),
        "mode": config.get("mode") or "auto",
        "base_url": config.get("base_url") or "",
        "token_set": bool(config.get("token")),
        "supervisor_available": supervisor_available(),
        "connection_available": service.connection_available(config),
    }


@router.get("/config")
async def get_config(
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access),
):
    return _config_response(db)


@router.put("/config")
async def update_config(
    body: HAConfigUpdate,
    db: Session = Depends(get_db),
    _: bool = Depends(require_full_auth),
):
    existing = service.get_config(db)
    config = {
        "enabled": body.enabled,
        "mode": body.mode,
        "base_url": (body.base_url or "").strip(),
        # None keeps the saved token so the UI's masked value can round-trip.
        "token": (body.token.strip() if body.token is not None
                  else existing.get("token") or ""),
    }
    if config["enabled"] and not service.connection_available(config):
        raise HTTPException(
            status_code=400,
            detail="Set a base URL and access token (or run as the HA add-on) before enabling",
        )
    service.save_config(db, config)
    listener.request_reload()
    return _config_response(db)


@router.post("/test")
async def test_connection(
    body: Optional[HAConfigUpdate] = None,
    db: Session = Depends(get_db),
    _: bool = Depends(require_full_auth),
):
    """Reachability/auth check with the submitted (or saved) config."""
    saved = service.get_config(db)
    if body is not None:
        config = {
            "mode": body.mode,
            "base_url": (body.base_url or "").strip(),
            "token": (body.token.strip() if body.token is not None
                      else saved.get("token") or ""),
        }
    else:
        config = saved
    try:
        info = await HAClient.from_config(config).test_connection()
    except HAClientError as e:
        return {"ok": False, "error": str(e)}
    return {"ok": True, **info}


@router.get("/status")
async def get_status(
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access),
):
    return {
        **service.get_state(db),
        **listener.runtime_status(),
        "mapping_count": db.query(HAEntityMapping).count(),
    }


@router.get("/entities")
async def list_entities(
    exclude_shh: bool = True,
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access),
):
    """HA entities for the mapping picker, annotated with mapped state."""
    config = service.get_config(db)
    try:
        entities = await HAClient.from_config(config).list_entities()
    except HAClientError as e:
        raise HTTPException(status_code=502, detail=str(e))
    mapped = {
        row.entity_id for row in db.query(HAEntityMapping.entity_id).all()
    }
    result = []
    for entity in entities:
        if exclude_shh and entity.is_shh:
            continue
        result.append({**asdict(entity), "mapped": entity.entity_id in mapped})
    result.sort(key=lambda e: (e["domain"], e["friendly_name"] or e["entity_id"]))
    return result


@router.get("/vital-types")
async def list_vital_types(
    patient_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access),
):
    """Vital-type options for the mapping editor (+ the patient's custom vitals)."""
    options = [dict(opt) for opt in VITAL_TYPE_OPTIONS]
    if patient_id is not None:
        from models.custom_vital_definition import CustomVitalDefinition
        customs = db.query(CustomVitalDefinition).filter(
            CustomVitalDefinition.patient_id == patient_id
        ).all()
        seen = {opt["value"] for opt in options}
        for definition in customs:
            if definition.name not in seen:
                options.append({
                    "value": definition.name,
                    "label": definition.display_label or definition.name,
                    "groups": [],
                    "custom": True,
                })
    return options


# ---------------------------------------------------------------------------
# Mappings
# ---------------------------------------------------------------------------

def _mapping_to_dict(m: HAEntityMapping) -> dict:
    return {
        "id": m.id,
        "entity_id": m.entity_id,
        "friendly_name": m.friendly_name,
        "device_class": m.device_class,
        "source_unit": m.source_unit,
        "target_kind": m.target_kind,
        "patient_id": m.patient_id,
        "vital_type": m.vital_type,
        "vital_group": m.vital_group,
        "metric": m.metric,
        "scope": m.scope,
        "location": m.location,
        "enabled": m.enabled,
        "min_interval_seconds": m.min_interval_seconds,
        "last_seen_at": m.last_seen_at.isoformat() if m.last_seen_at else None,
        "last_value": m.last_value,
        "last_error": m.last_error,
    }


def _validate_target(db: Session, account_id: int, data: dict) -> None:
    """Reject mappings whose target can't be recorded. Raises HTTPException."""
    kind = data.get("target_kind")
    if kind == "vital":
        patient_id = data.get("patient_id")
        vital_type = data.get("vital_type")
        if not patient_id or not vital_type:
            raise HTTPException(status_code=400,
                                detail="Vital mappings need patient_id and vital_type")
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if patient is None or (patient.account_id is not None
                               and patient.account_id != account_id):
            raise HTTPException(status_code=404, detail="Patient not found")
        if vital_type not in _STANDARD_VITAL_TYPES:
            from models.custom_vital_definition import CustomVitalDefinition
            custom = db.query(CustomVitalDefinition).filter(
                CustomVitalDefinition.patient_id == patient_id,
                CustomVitalDefinition.name == vital_type,
            ).first()
            if custom is None:
                raise HTTPException(status_code=400,
                                    detail=f"Unknown vital type: {vital_type}")
    elif kind == "environment":
        metric = data.get("metric")
        scope = data.get("scope")
        if not metric or not scope:
            raise HTTPException(status_code=400,
                                detail="Environment mappings need metric and scope")
        if metric not in env_metrics.METRICS or env_metrics.is_derived(metric):
            raise HTTPException(status_code=400, detail=f"Unknown metric: {metric}")
        if scope not in env_metrics.SCOPES:
            raise HTTPException(status_code=400, detail=f"Unknown scope: {scope}")
        if not service.convertible_unit(data.get("source_unit"), metric):
            raise HTTPException(
                status_code=400,
                detail=(f"Unit {data.get('source_unit')!r} can't be converted to "
                        f"{env_metrics.canonical_unit(metric)!r} for {metric}"),
            )
    else:
        raise HTTPException(status_code=400, detail=f"Unknown target_kind: {kind}")


@router.get("/mappings")
async def list_mappings(
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access),
):
    rows = db.query(HAEntityMapping).order_by(HAEntityMapping.entity_id).all()
    return [_mapping_to_dict(m) for m in rows]


@router.post("/mappings", status_code=201)
async def create_mapping(
    body: HAMappingCreate,
    db: Session = Depends(get_db),
    _: bool = Depends(require_full_auth),
    account_id: int = Depends(get_current_account_id),
):
    data = body.model_dump()
    _validate_target(db, account_id, data)
    if db.query(HAEntityMapping).filter(
            HAEntityMapping.entity_id == body.entity_id).first():
        raise HTTPException(status_code=409,
                            detail=f"{body.entity_id} is already mapped")
    now = datetime.utcnow()
    mapping = HAEntityMapping(account_id=account_id, created_at=now, updated_at=now,
                              **data)
    db.add(mapping)
    db.commit()
    db.refresh(mapping)
    listener.request_reload()
    return _mapping_to_dict(mapping)


@router.put("/mappings/{mapping_id}")
async def update_mapping(
    mapping_id: int,
    body: HAMappingUpdate,
    db: Session = Depends(get_db),
    _: bool = Depends(require_full_auth),
    account_id: int = Depends(get_current_account_id),
):
    mapping = db.query(HAEntityMapping).filter(HAEntityMapping.id == mapping_id).first()
    if mapping is None:
        raise HTTPException(status_code=404, detail="Mapping not found")
    updates = body.model_dump(exclude_unset=True)
    merged = {**_mapping_to_dict(mapping), **updates}
    _validate_target(db, account_id, merged)
    for key, value in updates.items():
        setattr(mapping, key, value)
    mapping.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(mapping)
    listener.request_reload()
    return _mapping_to_dict(mapping)


@router.delete("/mappings/{mapping_id}")
async def delete_mapping(
    mapping_id: int,
    db: Session = Depends(get_db),
    _: bool = Depends(require_full_auth),
):
    mapping = db.query(HAEntityMapping).filter(HAEntityMapping.id == mapping_id).first()
    if mapping is None:
        raise HTTPException(status_code=404, detail="Mapping not found")
    db.delete(mapping)
    db.commit()
    listener.request_reload()
    return {"status": "deleted"}
