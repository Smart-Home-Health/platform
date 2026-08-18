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
"""CRUD for the reusable nutrition item library and presets.

Applying a preset writes one nutrition_intake row per component rather than a
single combined record: a tube feed and its water flush are genuinely separate
intakes and have to stay that way for fluid totals to mean anything. They share
an event_group_id so the UI can still present -- and undo -- them as one action.
"""
from sqlalchemy import or_, func
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import logging
import uuid

from schemas.nutrition_item import NutritionItem
from schemas.nutrition_preset import NutritionPreset, NutritionPresetComponent
from schemas.nutrition_intake import NutritionIntake
from schemas.patient import Patient
from utils.datetime_utils import utc_now

logger = logging.getLogger(__name__)


def _account_id_for_patient(db: Session, patient_id: Optional[int]) -> Optional[int]:
    if not patient_id:
        return None
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    return patient.account_id if patient else None


# =====================
# ITEMS
# =====================

def _visible_items_query(db: Session, account_id: Optional[int], patient_id: Optional[int]):
    """Items for this patient plus the account-wide ones (patient_id NULL)."""
    q = db.query(NutritionItem).filter(NutritionItem.is_active.is_(True))
    if account_id is not None:
        q = q.filter(NutritionItem.account_id == account_id)
    if patient_id is not None:
        q = q.filter(or_(NutritionItem.patient_id == patient_id,
                         NutritionItem.patient_id.is_(None)))
    else:
        q = q.filter(NutritionItem.patient_id.is_(None))
    return q


def list_nutrition_items(db: Session, patient_id: Optional[int] = None,
                         search: Optional[str] = None,
                         item_type: Optional[str] = None,
                         limit: int = 50) -> List[NutritionItem]:
    account_id = _account_id_for_patient(db, patient_id)
    q = _visible_items_query(db, account_id, patient_id)
    if item_type:
        q = q.filter(NutritionItem.item_type == item_type)
    if search:
        q = q.filter(NutritionItem.name.ilike(f"%{search.strip()}%"))
    return q.order_by(NutritionItem.name.asc()).limit(limit).all()


def get_nutrition_item(db: Session, item_id: int) -> Optional[NutritionItem]:
    return db.query(NutritionItem).filter(NutritionItem.id == item_id).first()


def create_nutrition_item(db: Session, data: dict) -> NutritionItem:
    payload = dict(data)
    payload.setdefault('account_id', _account_id_for_patient(db, payload.get('patient_id')))
    try:
        item = NutritionItem(**payload, created_at=utc_now(), updated_at=utc_now())
        db.add(item)
        db.commit()
        db.refresh(item)
        logger.info(f"Created nutrition item {item.id} ({item.name})")
        return item
    except Exception:
        db.rollback()
        raise


def update_nutrition_item(db: Session, item_id: int, data: dict) -> Optional[NutritionItem]:
    item = get_nutrition_item(db, item_id)
    if not item:
        return None
    try:
        for field, value in data.items():
            if value is not None and hasattr(item, field) and field not in ('id', 'created_at'):
                setattr(item, field, value)
        item.updated_at = utc_now()
        db.commit()
        db.refresh(item)
        return item
    except Exception:
        db.rollback()
        raise


def delete_nutrition_item(db: Session, item_id: int) -> bool:
    """Deactivate rather than delete -- logged intakes reference the item."""
    item = get_nutrition_item(db, item_id)
    if not item:
        return False
    item.is_active = False
    item.updated_at = utc_now()
    db.commit()
    return True


# =====================
# PRESETS
# =====================

def list_nutrition_presets(db: Session, patient_id: Optional[int] = None) -> List[NutritionPreset]:
    account_id = _account_id_for_patient(db, patient_id)
    q = db.query(NutritionPreset).filter(NutritionPreset.is_active.is_(True))
    if account_id is not None:
        q = q.filter(NutritionPreset.account_id == account_id)
    if patient_id is not None:
        q = q.filter(or_(NutritionPreset.patient_id == patient_id,
                         NutritionPreset.patient_id.is_(None)))
    else:
        q = q.filter(NutritionPreset.patient_id.is_(None))
    return q.order_by(NutritionPreset.name.asc()).all()


def get_nutrition_preset(db: Session, preset_id: int) -> Optional[NutritionPreset]:
    return db.query(NutritionPreset).filter(NutritionPreset.id == preset_id).first()


def create_nutrition_preset(db: Session, data: dict) -> NutritionPreset:
    payload = dict(data)
    components = payload.pop('components', []) or []
    payload.setdefault('account_id', _account_id_for_patient(db, payload.get('patient_id')))
    try:
        preset = NutritionPreset(**payload, created_at=utc_now(), updated_at=utc_now())
        db.add(preset)
        db.flush()
        for order, comp in enumerate(components):
            comp_data = dict(comp)
            comp_data.setdefault('sort_order', order)
            db.add(NutritionPresetComponent(preset_id=preset.id, **comp_data))
        db.commit()
        db.refresh(preset)
        logger.info(f"Created nutrition preset {preset.id} ({preset.name}) "
                    f"with {len(components)} component(s)")
        return preset
    except Exception:
        db.rollback()
        raise


def update_nutrition_preset(db: Session, preset_id: int, data: dict) -> Optional[NutritionPreset]:
    preset = get_nutrition_preset(db, preset_id)
    if not preset:
        return None
    payload = dict(data)
    components = payload.pop('components', None)
    try:
        for field, value in payload.items():
            if value is not None and hasattr(preset, field) and field not in ('id', 'created_at'):
                setattr(preset, field, value)
        if components is not None:
            # Replace the whole list; cascade removes the old rows.
            preset.components.clear()
            db.flush()
            for order, comp in enumerate(components):
                comp_data = dict(comp)
                comp_data.setdefault('sort_order', order)
                db.add(NutritionPresetComponent(preset_id=preset.id, **comp_data))
        preset.updated_at = utc_now()
        db.commit()
        db.refresh(preset)
        return preset
    except Exception:
        db.rollback()
        raise


def delete_nutrition_preset(db: Session, preset_id: int) -> bool:
    preset = get_nutrition_preset(db, preset_id)
    if not preset:
        return False
    preset.is_active = False
    preset.updated_at = utc_now()
    db.commit()
    return True


def _scaled(per_unit: Optional[float], amount: float) -> Optional[float]:
    """Nutrition for `amount` of an item, from its per-unit figure."""
    if per_unit is None:
        return None
    return round(float(per_unit) * float(amount), 4)


def apply_nutrition_preset(db: Session, preset_id: int, patient_id: int,
                           consumed_at: Optional[datetime] = None,
                           meal_type: Optional[str] = None,
                           notes: Optional[str] = None,
                           care_task_log_id: Optional[int] = None,
                           recorded_by: Optional[int] = None) -> List[NutritionIntake]:
    """Expand a preset into one intake row per component.

    Every row shares one event_group_id, so the group reads back as a single
    logged action while the underlying records stay separate.
    """
    preset = get_nutrition_preset(db, preset_id)
    if not preset:
        return []

    when = consumed_at or utc_now()
    group_id = str(uuid.uuid4())
    account_id = _account_id_for_patient(db, patient_id)
    created: List[NutritionIntake] = []

    try:
        for comp in sorted(preset.components, key=lambda c: c.sort_order):
            item = comp.item
            if item is None:
                continue
            intake = NutritionIntake(
                account_id=account_id,
                patient_id=patient_id,
                care_task_log_id=care_task_log_id,
                event_group_id=group_id,
                item_id=item.id,
                item_name=item.name,
                item_type=item.item_type,
                amount=comp.amount,
                amount_unit=comp.amount_unit,
                calories=_scaled(item.calories_per_unit, comp.amount),
                protein_grams=_scaled(item.protein_per_unit, comp.amount),
                carbs_grams=_scaled(item.carbs_per_unit, comp.amount),
                fat_grams=_scaled(item.fat_per_unit, comp.amount),
                fiber_grams=_scaled(item.fiber_per_unit, comp.amount),
                sodium_mg=_scaled(item.sodium_per_unit, comp.amount),
                feed_route=comp.feed_route,
                rate_ml_per_hr=comp.rate_ml_per_hr,
                duration_minutes=comp.duration_minutes,
                consumed_at=when,
                meal_type=meal_type or preset.meal_type,
                notes=notes,
                recorded_by=recorded_by,
                created_at=utc_now(),
                updated_at=utc_now(),
            )
            db.add(intake)
            created.append(intake)
        db.commit()
        for intake in created:
            db.refresh(intake)
        logger.info(f"Applied preset {preset_id} for patient {patient_id}: "
                    f"{len(created)} intake row(s), group {group_id}")
        return created
    except Exception:
        db.rollback()
        raise


# =====================
# RECENT
# =====================

def get_recent_intake_items(db: Session, patient_id: int, limit: int = 6) -> List[dict]:
    """Distinct recent (item, amount, unit) combinations, most recent first.

    Backs the one-tap prefill chips. Derived from what was actually logged, so
    it stays useful before anyone has saved a reusable item.
    """
    rows = (
        db.query(
            NutritionIntake.item_name,
            NutritionIntake.item_type,
            NutritionIntake.amount,
            NutritionIntake.amount_unit,
            func.max(NutritionIntake.consumed_at).label('last_at'),
        )
        .filter(NutritionIntake.patient_id == patient_id)
        .group_by(
            NutritionIntake.item_name,
            NutritionIntake.item_type,
            NutritionIntake.amount,
            NutritionIntake.amount_unit,
        )
        .order_by(func.max(NutritionIntake.consumed_at).desc())
        .limit(limit)
        .all()
    )
    return [
        {
            'item_name': r.item_name,
            'item_type': r.item_type,
            'amount': r.amount,
            'amount_unit': r.amount_unit,
            'last_at': r.last_at.isoformat() if r.last_at else None,
        }
        for r in rows
    ]
