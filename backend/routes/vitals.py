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
Vitals and sensor data routes
"""
import logging
from typing import List, Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field as PydanticField, model_validator
from sqlalchemy.orm import Session
from sqlalchemy import func, cast, Date, text
from datetime import datetime, timedelta
from db import get_db
from dependencies import (require_read_access, require_permission,
                          get_current_user, get_current_account_id)
from crud.vitals import (get_vitals_by_type, get_distinct_vital_types, get_vitals_by_type_paginated,
                  save_blood_pressure, save_temperature, save_vital)
from models.custom_vital_definition import CustomVitalDefinition
from crud.nutrition import create_nutrition_intake
from crud.patients import get_current_patient

logger = logging.getLogger("app")

def publish_event(event_type: str, data: dict):
    """Helper function to publish events to the event bus"""
    try:
        from main import get_modules
        modules = get_modules()
        event_bus = modules.get("event_bus")
        if event_bus:
            import asyncio
            # Create a simple event dict
            event = {"type": event_type, "data": data}
            asyncio.create_task(event_bus.publish(event, topic=event_type))
    except Exception as e:
        logger.error(f"Failed to publish event {event_type}: {e}")

router = APIRouter(prefix="/api/vitals", tags=["vitals"])


@router.get("/patient/{patient_id}/summary")
async def get_vitals_summary(
    patient_id: int,
    days: int = Query(30, ge=1, le=90, description="Number of days to aggregate"),
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access)
):
    """
    Get aggregated vitals summary for charts (daily min/avg/max).
    Returns data optimized for 30-day trend charts.
    """
    from schemas.vital import Vital
    
    try:
        # Calculate date range
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        
        # Generate list of all dates in range for null filling
        date_range = []
        current = start_date.date()
        while current <= end_date.date():
            date_range.append(current.isoformat())
            current += timedelta(days=1)
        
        # Query aggregated vitals grouped by date and type
        results = db.query(
            cast(Vital.timestamp, Date).label('date'),
            Vital.vital_type,
            Vital.vital_group,
            func.min(Vital.value).label('min_val'),
            func.avg(Vital.value).label('avg_val'),
            func.max(Vital.value).label('max_val'),
            func.count(Vital.id).label('count')
        ).filter(
            Vital.patient_id == patient_id,
            Vital.timestamp >= start_date,
            Vital.timestamp <= end_date
        ).group_by(
            cast(Vital.timestamp, Date),
            Vital.vital_type,
            Vital.vital_group
        ).order_by(
            cast(Vital.timestamp, Date)
        ).all()
        
        # Organize results by vital type
        vitals_map = {
            'spo2': {},
            'heart_rate': {},
            'respiratory_rate': {},
            'temperature': {},
            'blood_pressure': {}  # Will aggregate MAP
        }
        
        # Process results
        for row in results:
            date_str = row.date.isoformat()
            vital_type = row.vital_type
            vital_group = row.vital_group
            
            # Handle blood pressure specially - we want MAP average
            if vital_type == 'blood_pressure' and vital_group == 'map':
                vitals_map['blood_pressure'][date_str] = {
                    'date': date_str,
                    'min': round(float(row.min_val), 1) if row.min_val else None,
                    'avg': round(float(row.avg_val), 1) if row.avg_val else None,
                    'max': round(float(row.max_val), 1) if row.max_val else None,
                    'count': row.count
                }
            elif vital_type == 'temperature' and vital_group in ['body', 'core', None]:
                # Use body/core temp, not skin temp
                if date_str not in vitals_map['temperature']:
                    vitals_map['temperature'][date_str] = {
                        'date': date_str,
                        'min': round(float(row.min_val), 1) if row.min_val else None,
                        'avg': round(float(row.avg_val), 1) if row.avg_val else None,
                        'max': round(float(row.max_val), 1) if row.max_val else None,
                        'count': row.count
                    }
            elif vital_type in vitals_map and vital_type not in ['blood_pressure', 'temperature']:
                vitals_map[vital_type][date_str] = {
                    'date': date_str,
                    'min': round(float(row.min_val), 1) if row.min_val else None,
                    'avg': round(float(row.avg_val), 1) if row.avg_val else None,
                    'max': round(float(row.max_val), 1) if row.max_val else None,
                    'count': row.count
                }
        
        # Convert to arrays with null filling for missing dates
        result = {}
        for vital_type, data_map in vitals_map.items():
            result[vital_type] = []
            for date_str in date_range:
                if date_str in data_map:
                    result[vital_type].append(data_map[date_str])
                else:
                    result[vital_type].append({
                        'date': date_str,
                        'min': None,
                        'avg': None,
                        'max': None,
                        'count': 0
                    })
        
        return result
        
    except Exception as e:
        logger.error(f"Error getting vitals summary for patient {patient_id}: {e}")
        return JSONResponse(status_code=500, content={"detail": str(e)})


# SQL for hourly pulse-ox aggregation with stuck-sensor filter.
# Stuck-run detection: consecutive samples where (spo2, bpm) are identical
# and the gap to the previous sample is < 10s are grouped into a "run".
# Runs whose duration exceeds 1 minute are treated as a frozen/unattached
# sensor and excluded from the aggregate.
_PULSE_OX_HOURLY_SQL = text("""
    WITH samples AS (
        SELECT
            timestamp, spo2, bpm,
            LAG(spo2) OVER w AS prev_spo2,
            LAG(bpm) OVER w AS prev_bpm,
            LAG(timestamp) OVER w AS prev_ts
        FROM pulse_ox_data
        WHERE patient_id = :patient_id
          AND timestamp >= :start_ts
          AND timestamp < :end_ts
          AND spo2 IS NOT NULL AND spo2 > 0
          AND bpm IS NOT NULL AND bpm > 0
        WINDOW w AS (ORDER BY timestamp)
    ),
    marked AS (
        SELECT *,
            CASE
                WHEN spo2 = prev_spo2 AND bpm = prev_bpm
                     AND timestamp - prev_ts < INTERVAL '10 seconds'
                THEN 0 ELSE 1
            END AS new_run
        FROM samples
    ),
    runs AS (
        SELECT *, SUM(new_run) OVER (ORDER BY timestamp) AS run_id FROM marked
    ),
    with_dur AS (
        SELECT *,
            MAX(timestamp) OVER (PARTITION BY run_id)
              - MIN(timestamp) OVER (PARTITION BY run_id) AS run_dur
        FROM runs
    )
    SELECT
        date_trunc('hour', timestamp) AS bucket,
        MIN(spo2) AS min_spo2,
        AVG(spo2) AS avg_spo2,
        MAX(spo2) AS max_spo2,
        MIN(bpm)  AS min_bpm,
        AVG(bpm)  AS avg_bpm,
        MAX(bpm)  AS max_bpm,
        COUNT(*)  AS n
    FROM with_dur
    WHERE run_dur <= INTERVAL '60 seconds'
    GROUP BY bucket
    ORDER BY bucket
""")


@router.get("/patient/{patient_id}/pulse-ox-summary")
async def get_pulse_ox_summary(
    patient_id: int,
    days: int = Query(30, ge=1, le=90, description="Number of days to aggregate"),
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access),
):
    """
    Hourly min/avg/max of SpO2 and BPM from raw pulse_ox_data for the trend
    charts on the patient profile. Excludes samples that look like a stuck
    or detached sensor (identical spo2+bpm for over 1 minute).
    """
    try:
        end_ts = datetime.now()
        start_ts = end_ts - timedelta(days=days)

        rows = db.execute(
            _PULSE_OX_HOURLY_SQL,
            {"patient_id": patient_id, "start_ts": start_ts, "end_ts": end_ts},
        ).all()

        spo2_points = []
        hr_points = []
        for row in rows:
            bucket_iso = row.bucket.isoformat()
            spo2_points.append({
                "date": bucket_iso,
                "min": int(row.min_spo2) if row.min_spo2 is not None else None,
                "avg": round(float(row.avg_spo2), 1) if row.avg_spo2 is not None else None,
                "max": int(row.max_spo2) if row.max_spo2 is not None else None,
                "count": int(row.n),
            })
            hr_points.append({
                "date": bucket_iso,
                "min": int(row.min_bpm) if row.min_bpm is not None else None,
                "avg": round(float(row.avg_bpm), 1) if row.avg_bpm is not None else None,
                "max": int(row.max_bpm) if row.max_bpm is not None else None,
                "count": int(row.n),
            })

        return {"spo2": spo2_points, "heart_rate": hr_points}

    except Exception as e:
        logger.error(f"Error getting pulse-ox summary for patient {patient_id}: {e}")
        return JSONResponse(status_code=500, content={"detail": str(e)})


@router.post("/manual")
async def add_manual_vitals(vital_data: dict, db: Session = Depends(get_db)):
    try:
        datetime_val = vital_data.get("datetime") or vital_data.get("timestamp")
        notes = vital_data.get("notes")
        patient_id = vital_data.get("patient_id")  # Get patient_id from request
        vitals_saved = []  # Track what vitals were actually saved
        
        # Check if this is a single vital entry format
        if "vital_type" in vital_data and "value" in vital_data:
            vital_type = vital_data.get("vital_type")
            value = vital_data.get("value")
            
            # Handle specific vital types with special logic
            if vital_type == "temperature":
                # For unified storage, save to vitals table
                temp_ids = save_temperature(db, body_temp=value, timestamp=datetime_val, notes=notes, patient_id=patient_id)
                if temp_ids:
                    vitals_saved.append({
                        'type': 'temperature',
                        'data': {'temperature': value}
                    })
            elif vital_type == "blood_pressure":
                # For BP, expect value to be an object with systolic/diastolic
                if isinstance(value, dict):
                    systolic = value.get("systolic")
                    diastolic = value.get("diastolic")
                    map_bp = value.get("map")
                    if systolic and diastolic:
                        # Save to unified vitals table
                        bp_ids = save_blood_pressure(db, systolic, diastolic, map_bp, datetime_val, notes, patient_id=patient_id)
                        if bp_ids:
                            vitals_saved.append({
                                'type': 'blood_pressure',
                                'data': {'systolic': systolic, 'diastolic': diastolic, 'map': map_bp}
                            })
            else:
                # Generic vital type
                vital_id = save_vital(db, vital_type, value, datetime_val, notes, patient_id=patient_id)
                if vital_id:
                    vitals_saved.append({
                        'type': vital_type,
                        'data': {vital_type: value}
                    })
        else:
            # Handle the complex object format (original logic)
            # Handle blood pressure
            bp = vital_data.get("bp", {})
            if bp and (bp.get("systolic_bp") or bp.get("diastolic_bp")):
                systolic = bp.get("systolic_bp")
                diastolic = bp.get("diastolic_bp")
                map_bp = bp.get("map_bp")
                if systolic and diastolic:
                    # Save to unified vitals table
                    bp_ids = save_blood_pressure(db, systolic, diastolic, map_bp, datetime_val, notes, patient_id=patient_id)
                    if bp_ids:
                        vitals_saved.append({
                            'type': 'blood_pressure',
                            'data': {'systolic_bp': systolic, 'diastolic_bp': diastolic, 'map_bp': map_bp, 'notes': notes}
                        })
                    
            # Handle temperature
            temp = vital_data.get("temp", {})
            if temp and temp.get("body_temp"):
                body_temp = temp.get("body_temp")
                skin_temp = temp.get("skin_temp")  # Include skin temp if provided
                # Save to unified vitals table
                temp_ids = save_temperature(db, body_temp=body_temp, skin_temp=skin_temp, timestamp=datetime_val, notes=notes, patient_id=patient_id)
                if temp_ids:
                    vitals_saved.append({
                        'type': 'temperature',
                        'data': {'body_temp': body_temp, 'skin_temp': skin_temp, 'notes': notes}
                    })
                
            # Handle bathroom
            bathroom_type = vital_data.get("bathroom_type")
            bathroom_size = vital_data.get("bathroom_size")
            bathroom_size_map = ["smear", "s", "m", "l", "xl"]
            if bathroom_type and bathroom_size:
                size_numeric = bathroom_size_map.index(bathroom_size) if bathroom_size in bathroom_size_map else 0
                vital_id = save_vital(db, "bathroom", size_numeric, datetime_val, notes, vital_group=bathroom_type, patient_id=patient_id)
                if vital_id:
                    vitals_saved.append({
                        'type': 'bathroom',
                        'data': {'bathroom_type': bathroom_type, 'bathroom_size': bathroom_size, 'value': size_numeric, 'notes': notes}
                    })
            
            # Handle nutrition data (from frontend format)
            nutrition = vital_data.get("nutrition", {})
            if nutrition:
                calories = nutrition.get("calories")
                water = nutrition.get("water")
                
                # Save calories to nutrition_intake table
                if calories is not None and calories != "":
                    try:
                        intake_data = {
                            "item_name": "Manual Entry - Calories",
                            "item_type": "manual",
                            "amount": calories,
                            "amount_unit": "calories",
                            "calories": calories,
                            "consumed_at": datetime_val,
                            "notes": notes
                        }
                        nutrition_record = create_nutrition_intake(db, intake_data)
                        vitals_saved.append({
                            'type': 'calories', 
                            'data': {'value': calories, 'notes': notes, 'nutrition_id': nutrition_record.id}
                        })
                        logger.info(f"Saved calories to nutrition_intake: {nutrition_record.id}")
                    except Exception as e:
                        logger.error(f"Error saving calories to nutrition_intake: {str(e)}")
                
                # Save water to nutrition_intake table
                if water is not None and water != "":
                    try:
                        intake_data = {
                            "item_name": "Manual Entry - Water",
                            "item_type": "fluid",
                            "amount": water,
                            "amount_unit": "ml",
                            "calories": 0,  # Water has 0 calories
                            "consumed_at": datetime_val,
                            "notes": notes
                        }
                        nutrition_record = create_nutrition_intake(db, intake_data)
                        vitals_saved.append({
                            'type': 'water',
                            'data': {'value': water, 'notes': notes, 'nutrition_id': nutrition_record.id}
                        })
                        logger.info(f"Saved water to nutrition_intake: {nutrition_record.id}")
                    except Exception as e:
                        logger.error(f"Error saving water to nutrition_intake: {str(e)}")
            
            # Handle weight
            weight = vital_data.get("weight")
            if weight is not None and weight != "":
                weight_id = save_vital(db, "weight", weight, datetime_val, notes)
                if weight_id:
                    vitals_saved.append({
                        'type': 'weight',
                        'data': {'value': weight, 'notes': notes}
                    })
                
            # Dynamically handle any remaining vitals (excluding already processed ones)
            processed_keys = ["datetime", "timestamp", "bp", "temp", "nutrition", "weight", "notes", "bathroom_type", "bathroom_size", "vital_type", "value", "patient_id"]
            for key, value in vital_data.items():
                if key not in processed_keys and value is not None and value != "":
                    vital_id = save_vital(db, key, value, datetime_val, notes, patient_id=patient_id)
                    if vital_id:
                        vitals_saved.append({
                            'type': key,
                            'data': {'value': value, 'notes': notes}
                        })
            
        # Publish vitals events to trigger WebSocket broadcast and MQTT publishing
        event_patient_id = patient_id
        if event_patient_id is None:
            current = get_current_patient(db)
            if current:
                event_patient_id = current.id
        for vital in vitals_saved:
            print(f"[vitals] Publishing {vital['type']} to event system")
            evt = {
                "vital_type": vital['type'],
                "vital_data": vital['data'],
                "from_manual": True,
            }
            if event_patient_id is not None:
                evt["patient_id"] = event_patient_id
            publish_event("vital_saved", evt)
        
        return {"status": "success", "message": "Vitals saved successfully"}
    except Exception as e:
        print(f"Error saving manual vitals: {str(e)}")
        return {"status": "error", "message": str(e)}


# --- Capture flow (mobile vitals capture surface) ---

class CaptureReading(BaseModel):
    vital_key: str = PydanticField(min_length=1, max_length=50)
    value: Optional[float] = None
    systolic: Optional[float] = None
    diastolic: Optional[float] = None
    unit: Optional[str] = None
    measured_at: Optional[datetime] = None
    source: Literal['manual'] = 'manual'
    confirmed_against_warning: bool = False
    note: Optional[str] = None

    @model_validator(mode='after')
    def _one_shape(self):
        if self.vital_key == 'blood_pressure':
            if self.systolic is None or self.diastolic is None:
                raise ValueError('blood_pressure readings need systolic and diastolic')
        elif self.value is None:
            raise ValueError('value is required')
        return self


class CaptureRequest(BaseModel):
    patient_id: int
    encounter_uid: str = PydanticField(min_length=8, max_length=36)
    readings: List[CaptureReading] = PydanticField(min_length=1)


class VitalRangeItem(BaseModel):
    vital_key: str = PydanticField(min_length=1, max_length=50)
    field_key: str = PydanticField(default='', max_length=20)
    expected_min: Optional[float] = None
    expected_max: Optional[float] = None
    implausible_min: Optional[float] = None
    implausible_max: Optional[float] = None
    required: bool = False
    note: Optional[str] = None

    @model_validator(mode='after')
    def _sane_bounds(self):
        for lo, hi, label in ((self.expected_min, self.expected_max, 'expected'),
                              (self.implausible_min, self.implausible_max, 'implausible')):
            if lo is not None and hi is not None and lo >= hi:
                raise ValueError(f'{label}_min must be below {label}_max')
        return self


class VitalRangesUpdate(BaseModel):
    patient_id: int
    ranges: List[VitalRangeItem]


def _get_scoped_patient(db: Session, patient_id: int, account_id):
    from schemas.patient import Patient
    q = db.query(Patient).filter(Patient.id == patient_id)
    if account_id is not None:
        q = q.filter((Patient.account_id == account_id) | (Patient.account_id.is_(None)))
    return q.first()


def _ranges_response(db: Session, patient_id: int):
    from vital_validation import resolve_ranges
    resolved = resolve_ranges(db, patient_id)
    return {"patient_id": patient_id,
            "ranges": sorted(resolved.values(),
                             key=lambda r: (r['vital_key'], r['field_key']))}


@router.get("/ranges")
async def get_vital_ranges(
    patient_id: int = Query(...),
    db: Session = Depends(get_db),
    account_id=Depends(get_current_account_id),
):
    """Resolved expected/implausible bounds + required flags for a patient.

    Deliberately NOT gated on require_read_access: recording vitals is an
    allowed action in monitoring mode (read-restricted sessions), and these
    bounds are what make the capture flow's out-of-range warning fire — a
    safety feature that must work wherever recording works.
    """
    if not _get_scoped_patient(db, patient_id, account_id):
        raise HTTPException(status_code=404, detail="Patient not found")
    return _ranges_response(db, patient_id)


@router.put("/ranges", dependencies=[Depends(require_permission("patients.update"))])
async def put_vital_ranges(
    body: VitalRangesUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    account_id=Depends(get_current_account_id),
):
    from crud.vitals import upsert_patient_vital_ranges
    if not _get_scoped_patient(db, body.patient_id, account_id):
        raise HTTPException(status_code=404, detail="Patient not found")
    upsert_patient_vital_ranges(db, body.patient_id,
                                [r.model_dump() for r in body.ranges],
                                set_by=getattr(current_user, 'id', None))
    return _ranges_response(db, body.patient_id)


@router.post("/capture", dependencies=[Depends(require_permission("vitals.record"))])
async def capture_vitals(
    body: CaptureRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
    account_id=Depends(get_current_account_id),
):
    """Save one capture encounter (a batch of readings entered together).

    Server-side re-validation of both bands — the client pre-confirms
    concerning values, but stale client ranges must not slip through:
    - any implausible value (incl. diastolic >= systolic) -> 422, nothing saved
    - any concerning value without confirmed_against_warning -> 409, nothing saved
    Rows are stamped with unit/LOINC/UCUM, account, recorded_by, encounter_uid
    and the expected range in effect. external_id = encounter:vital:field makes
    client retries idempotent.
    """
    from vital_validation import BUILTIN_VITALS, classify, resolve_ranges
    from terminology import loinc_for
    from crud.vitals import save_capture_reading
    from schemas.vital import Vital

    patient = _get_scoped_patient(db, body.patient_id, account_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    custom_defs = {cd.name: cd for cd in db.query(CustomVitalDefinition).filter(
        CustomVitalDefinition.patient_id == body.patient_id).all()}
    for r in body.readings:
        if r.vital_key not in BUILTIN_VITALS and r.vital_key not in custom_defs:
            raise HTTPException(status_code=422, detail={
                "code": "unknown_vital",
                "errors": [{"vital_key": r.vital_key,
                            "message": f"Unknown vital '{r.vital_key}' for this patient."}]})

    resolved = resolve_ranges(db, body.patient_id)

    def _fields_for(reading):
        if reading.vital_key == 'blood_pressure':
            return [('systolic', reading.systolic), ('diastolic', reading.diastolic)]
        return [('', reading.value)]

    errors, warnings = [], []
    for r in body.readings:
        if r.vital_key == 'blood_pressure' and r.diastolic >= r.systolic:
            errors.append({"vital_key": r.vital_key, "field_key": "",
                           "value": r.diastolic,
                           "message": "Diastolic must be lower than systolic. "
                                      "Check which number is which."})
            continue
        for field_key, value in _fields_for(r):
            entry = resolved.get((r.vital_key, field_key))
            band = classify(value, entry)
            if band == 'implausible':
                errors.append({"vital_key": r.vital_key, "field_key": field_key,
                               "value": value,
                               "implausible_min": entry.get('implausible_min'),
                               "implausible_max": entry.get('implausible_max'),
                               "message": f"{value} is outside the plausible range for "
                                          f"{r.vital_key.replace('_', ' ')}."})
            elif band == 'concerning' and not r.confirmed_against_warning:
                warnings.append({"vital_key": r.vital_key, "field_key": field_key,
                                 "value": value,
                                 "expected_min": entry.get('expected_min'),
                                 "expected_max": entry.get('expected_max'),
                                 "message": f"{value} is outside the expected range "
                                            f"({entry.get('expected_min')}–{entry.get('expected_max')})."})
    if errors:
        raise HTTPException(status_code=422, detail={"code": "implausible", "errors": errors})
    if warnings:
        raise HTTPException(status_code=409,
                            detail={"code": "confirmation_required", "warnings": warnings})

    existing_ids = {eid for (eid,) in db.query(Vital.external_id).filter(
        Vital.encounter_uid == body.encounter_uid,
        Vital.external_id.isnot(None)).all()}

    from datetime import timezone as _tz
    saved_rows, events, skipped = [], [], 0
    for r in body.readings:
        # One timestamp per reading: BP components (and grouped views elsewhere
        # in the codebase) rely on a shared timestamp as the grouping key.
        measured = r.measured_at or datetime.now(_tz.utc)
        meta = BUILTIN_VITALS.get(r.vital_key)
        if meta:
            unit, ucum = meta['unit'], meta['ucum']
        else:
            unit, ucum = custom_defs[r.vital_key].unit, None
        # was_concerning: a confirmed flag is only persisted for values that
        # actually tripped the expected band
        def _stamp(field_key, value, vital_group):
            ext_id = f"{body.encounter_uid}:{r.vital_key}:{field_key}"
            if ext_id in existing_ids:
                return None
            entry = resolved.get((r.vital_key, field_key)) or {}
            band = classify(value, entry)
            if meta:
                lk = meta['loinc_key']
                loinc = loinc_for(lk.get(vital_group or field_key) if isinstance(lk, dict) else lk,
                                  'manual')
            else:
                loinc = None
            return save_capture_reading(
                db, patient_id=body.patient_id, vital_type=r.vital_key, value=value,
                timestamp=measured, vital_group=vital_group, unit=unit,
                code=loinc, ucum_unit=ucum, account_id=account_id,
                recorded_by=getattr(current_user, 'id', None),
                encounter_uid=body.encounter_uid, external_id=ext_id,
                confirmed_against_warning=True if band == 'concerning' else None,
                reference_low=entry.get('expected_min'),
                reference_high=entry.get('expected_max'),
                notes=r.note)

        if r.vital_key == 'blood_pressure':
            map_value = round(r.diastolic + (r.systolic - r.diastolic) / 3)
            rows = [_stamp('systolic', r.systolic, 'systolic'),
                    _stamp('diastolic', r.diastolic, 'diastolic'),
                    _stamp('map', map_value, 'map')]
            rows = [row for row in rows if row is not None]
            if rows:
                events.append(('blood_pressure',
                               {'systolic': r.systolic, 'diastolic': r.diastolic,
                                'map': map_value}))
            else:
                skipped += 1
            saved_rows.extend(rows)
        elif r.vital_key == 'temperature':
            row = _stamp('', r.value, 'body')
            if row is not None:
                saved_rows.append(row)
                events.append(('temperature', {'temperature': r.value}))
            else:
                skipped += 1
        else:
            row = _stamp('', r.value, None)
            if row is not None:
                saved_rows.append(row)
                events.append((r.vital_key, {r.vital_key: r.value}))
            else:
                skipped += 1

    db.commit()

    for vital_type, vital_data in events:
        publish_event("vital_saved", {
            "vital_type": vital_type,
            "vital_data": vital_data,
            "from_manual": True,
            "patient_id": body.patient_id,
        })

    return {"status": "success", "encounter_uid": body.encounter_uid,
            "saved": [{"vital_type": v.vital_type, "vital_group": v.vital_group,
                       "id": v.id, "timestamp": v.timestamp.isoformat()}
                      for v in saved_rows],
            "skipped_duplicates": skipped}


@router.get("/types")
def get_vital_types(db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    """Get a distinct list of vital_type values from the vitals table"""
    return get_distinct_vital_types(db)


@router.get("/patient/{patient_id}")
def get_patient_vitals(
    patient_id: int,
    vital_type: str = None,
    start_date: str = None,
    end_date: str = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access)
):
    """Get all vitals for a specific patient with optional filtering"""
    from schemas.vital import Vital
    from datetime import datetime
    
    query = db.query(Vital).filter(Vital.patient_id == patient_id)
    
    if vital_type:
        query = query.filter(Vital.vital_type == vital_type)
    
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date)
            query = query.filter(Vital.timestamp >= start_dt)
        except:
            pass
    
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date)
            query = query.filter(Vital.timestamp <= end_dt)
        except:
            pass
    
    results = query.order_by(Vital.timestamp.desc()).limit(limit).all()
    
    # Group multi-value vitals (BP, temperature) by timestamp
    from collections import defaultdict
    grouped = defaultdict(lambda: {'values': {}})
    single_vitals = []
    
    for v in results:
        if v.vital_type in ['blood_pressure', 'temperature'] and v.vital_group:
            key = (v.timestamp, v.vital_type)
            grouped[key]['timestamp'] = v.timestamp
            grouped[key]['vital_type'] = v.vital_type
            grouped[key]['notes'] = v.notes
            grouped[key]['patient_id'] = v.patient_id
            grouped[key]['values'][v.vital_group] = v.value
        else:
            single_vitals.append({
                'id': v.id,
                'timestamp': v.timestamp,
                'vital_type': v.vital_type,
                'value': v.value,
                'notes': v.notes,
                'patient_id': v.patient_id,
                'source': 'manual'
            })
    
    # Convert grouped vitals to list format
    for key, data in grouped.items():
        if data['vital_type'] == 'blood_pressure':
            single_vitals.append({
                'timestamp': data['timestamp'],
                'vital_type': 'blood_pressure',
                'systolic': data['values'].get('systolic'),
                'diastolic': data['values'].get('diastolic'),
                'map': data['values'].get('map'),
                'notes': data['notes'],
                'patient_id': data['patient_id'],
                'source': 'manual'
            })
        elif data['vital_type'] == 'temperature':
            single_vitals.append({
                'timestamp': data['timestamp'],
                'vital_type': 'temperature',
                'value': data['values'].get('body') or data['values'].get('core'),
                'notes': data['notes'],
                'patient_id': data['patient_id'],
                'source': 'manual'
            })
    
    # Sort by timestamp descending
    single_vitals.sort(key=lambda x: x['timestamp'] if x['timestamp'] else '', reverse=True)
    
    return single_vitals


@router.get("/nutrition")
def get_nutrition_history(limit: int = 100, db: Session = Depends(get_db)):
    """Get combined nutrition history (calories and water)"""
    return {
        "calories": get_vitals_by_type(db, "calories", limit),
        "water": get_vitals_by_type(db, "water", limit)
    }


@router.get("/history")
def get_vital_history_paginated(vital_type: str, page: int = 1, page_size: int = 20, db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    """Get paginated history for a specific vital type"""
    return get_vitals_by_type_paginated(db, vital_type, page, page_size)


@router.get("/custom-definitions")
def get_custom_vital_definitions(
    patient_id: int = Query(..., description="Patient ID"),
    db: Session = Depends(get_db),
    _: bool = Depends(require_read_access)
):
    defs = db.query(CustomVitalDefinition).filter(
        CustomVitalDefinition.patient_id == patient_id
    ).order_by(CustomVitalDefinition.created_at).all()
    return [d.to_dict() for d in defs]


@router.post("/custom-definitions")
def create_custom_vital_definition(
    body: dict,
    db: Session = Depends(get_db),
):
    patient_id = body.get("patient_id")
    name = body.get("name", "").strip()
    unit = body.get("unit", "").strip() or None
    display_label = body.get("display_label", "").strip() or None

    if not patient_id or not name:
        return JSONResponse(status_code=400, content={"detail": "patient_id and name are required"})

    key = name.lower().replace(" ", "_")
    existing = db.query(CustomVitalDefinition).filter(
        CustomVitalDefinition.patient_id == patient_id,
        CustomVitalDefinition.name == key
    ).first()
    if existing:
        return JSONResponse(status_code=409, content={"detail": f"Custom vital '{name}' already exists for this patient"})

    from datetime import datetime
    definition = CustomVitalDefinition(
        patient_id=patient_id,
        name=key,
        unit=unit,
        display_label=display_label or name,
        created_at=datetime.utcnow()
    )
    db.add(definition)
    db.commit()
    db.refresh(definition)
    return definition.to_dict()


@router.delete("/custom-definitions/{definition_id}")
def delete_custom_vital_definition(
    definition_id: int,
    db: Session = Depends(get_db),
):
    definition = db.query(CustomVitalDefinition).filter(
        CustomVitalDefinition.id == definition_id
    ).first()
    if not definition:
        return JSONResponse(status_code=404, content={"detail": "Definition not found"})
    db.delete(definition)
    db.commit()
    return {"status": "deleted", "id": definition_id}


@router.get("/{vital_type}")
def get_vital_history(vital_type: str, limit: int = 100, db: Session = Depends(get_db), _: bool = Depends(require_read_access)):
    return get_vitals_by_type(db, vital_type, limit)
