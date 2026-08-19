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
Equipment management CRUD operations
"""
import logging
from datetime import datetime, timedelta
from utils.datetime_utils import utc_now, utc_today
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload
from schemas.equipment import Equipment
from schemas.equipment_change_log import EquipmentChangeLog
from schemas.equipment_provider_alias import EquipmentProviderAlias
from schemas.equipment_count_log import EquipmentCountLog
from crud.patients import get_or_create_default_patient

logger = logging.getLogger('crud')


# --- Account scoping ---
#
# The list queries have taken an account_id since accounts landed, but every
# by-id operation looked equipment up on its primary key alone, so a supply
# could be read, changed, received, counted, renamed or deleted from another
# account by naming its id.
#
# Equipment genuinely has shared rows -- a supply with no account belongs to
# everyone in a single-tenant install -- so the filter is "mine or shared",
# matching get_equipment_list, rather than the strict equality the shipment
# tables use.

def _scope_equipment(query, account_id):
    if account_id is None:
        return query
    return query.filter(or_(Equipment.account_id == account_id,
                            Equipment.account_id.is_(None)))


def _owned_equipment(db: Session, equipment_id, account_id=None):
    """The supply, or None if it does not exist or belongs to another account."""
    return _scope_equipment(
        db.query(Equipment).filter(Equipment.id == equipment_id), account_id,
    ).first()


# --- Equipment CRUD ---
def add_equipment_simple(db: Session, name, quantity=1, scheduled_replacement=True, last_changed=None, useful_days=None, patient_id=None,
                         account_id=None, item_number=None, description=None, category='equipment', tracking_level='item',
                         default_manufacturer=None, unit_of_measure=None, unit_size=None, unit_description=None,
                         reorder_point=None, par_level=None, storage_location=None):
    """
    Simple add equipment function matching the original signature for routes compatibility.
    account_id scopes the equipment to an account (post-revision).
    """
    try:
        equipment = Equipment(
            name=name,
            patient_id=patient_id,  # Can be None for shared equipment
            account_id=account_id,
            quantity=quantity,
            scheduled_replacement=scheduled_replacement,
            last_changed=last_changed if scheduled_replacement else None,
            useful_days=useful_days if scheduled_replacement else None,
            # New supply tracking fields
            item_number=item_number,
            description=description,
            category=category,
            tracking_level=tracking_level,
            default_manufacturer=default_manufacturer,
            unit_of_measure=unit_of_measure,
            unit_size=unit_size,
            unit_description=unit_description,
            reorder_point=reorder_point,
            par_level=par_level,
            storage_location=storage_location,
            created_at=utc_now(),
            updated_at=utc_now()
        )
        db.add(equipment)
        db.commit()
        db.refresh(equipment)
        patient_info = f" for patient {patient_id}" if patient_id else " (shared)"
        logger.info(f"Equipment added: {name}{patient_info}")
        return equipment.id
    except Exception as e:
        logger.error(f"Error adding equipment: {e}")
        db.rollback()
        return None


def get_equipment(db: Session, equipment_id, account_id=None):
    """
    Get a specific equipment item by ID
    """
    try:
        equipment = _owned_equipment(db, equipment_id, account_id)
        if equipment:
            return {
                'id': equipment.id,
                'name': equipment.name,
                'patient_id': equipment.patient_id,
                'quantity': equipment.quantity,
                'scheduled_replacement': equipment.scheduled_replacement,
                'last_changed': equipment.last_changed.isoformat() if equipment.last_changed else None,
                'useful_days': equipment.useful_days,
                # New supply tracking fields
                'item_number': equipment.item_number,
                'description': equipment.description,
                'category': equipment.category,
                'tracking_level': equipment.tracking_level,
                'default_manufacturer': equipment.default_manufacturer,
                'unit_of_measure': equipment.unit_of_measure,
                'unit_size': equipment.unit_size,
                'unit_description': equipment.unit_description,
                'reorder_point': equipment.reorder_point,
                'par_level': equipment.par_level,
                'storage_location': equipment.storage_location,
                'aliases': [
                    {'id': a.id, 'supplier_id': a.supplier_id, 'item_number': a.item_number, 'raw_description': a.raw_description}
                    for a in equipment.provider_aliases
                ],
                'created_at': equipment.created_at.isoformat() if equipment.created_at else None,
                'updated_at': equipment.updated_at.isoformat() if equipment.updated_at else None
            }
        return None
    except Exception as e:
        logger.error(f"Error fetching equipment {equipment_id}: {e}")
        return None


def update_equipment(db: Session, equipment_id, account_id=None, name=None, quantity=None, scheduled_replacement=None, last_changed=None, useful_days=None, patient_id=None,
                      item_number=None, description=None, category=None, tracking_level=None,
                      default_manufacturer=None, unit_of_measure=None, unit_size=None, unit_description=None,
                      reorder_point=None, par_level=None, storage_location=None):
    """
    Update an equipment item
    """
    try:
        equipment = _owned_equipment(db, equipment_id, account_id)
        if not equipment:
            return False
        
        if name is not None:
            equipment.name = name
        if quantity is not None:
            equipment.quantity = quantity
        if scheduled_replacement is not None:
            equipment.scheduled_replacement = scheduled_replacement
        if last_changed is not None:
            equipment.last_changed = last_changed
        if useful_days is not None:
            equipment.useful_days = useful_days
        if patient_id is not None:
            equipment.patient_id = patient_id
        # New supply tracking fields
        if item_number is not None:
            equipment.item_number = item_number
        if description is not None:
            equipment.description = description
        if category is not None:
            equipment.category = category
        if tracking_level is not None:
            equipment.tracking_level = tracking_level
        if default_manufacturer is not None:
            equipment.default_manufacturer = default_manufacturer
        if unit_of_measure is not None:
            equipment.unit_of_measure = unit_of_measure
        if unit_size is not None:
            equipment.unit_size = unit_size
        if unit_description is not None:
            equipment.unit_description = unit_description
        if reorder_point is not None:
            equipment.reorder_point = reorder_point
        if par_level is not None:
            equipment.par_level = par_level
        if storage_location is not None:
            equipment.storage_location = storage_location

        equipment.updated_at = utc_now()
        db.commit()
        logger.info(f"Equipment updated: {equipment.name}")
        return True
    except Exception as e:
        logger.error(f"Error updating equipment {equipment_id}: {e}")
        db.rollback()
        return False


def list_equipment(db: Session, patient_id=None, shared_only=False, skip=0, limit=100):
    """
    List equipment with optional patient filtering
    
    Args:
        patient_id: Filter to specific patient equipment
        shared_only: If True, return only shared equipment (patient_id is None)
        skip: Number of records to skip
        limit: Maximum number of records to return
    """
    try:
        query = db.query(Equipment)
        
        if shared_only:
            query = query.filter(Equipment.patient_id.is_(None))
        elif patient_id is not None:
            query = query.filter(Equipment.patient_id == patient_id)
        
        equipment_list = query.offset(skip).limit(limit).all()
        
        return [
            {
                'id': eq.id,
                'name': eq.name,
                'patient_id': eq.patient_id,
                'quantity': eq.quantity,
                'scheduled_replacement': eq.scheduled_replacement,
                'last_changed': eq.last_changed.isoformat() if eq.last_changed else None,
                'useful_days': eq.useful_days,
                # New supply tracking fields
                'item_number': eq.item_number,
                'description': eq.description,
                'category': eq.category,
                'tracking_level': eq.tracking_level,
                'default_manufacturer': eq.default_manufacturer,
                'unit_of_measure': eq.unit_of_measure,
                'unit_size': eq.unit_size,
                'unit_description': eq.unit_description,
                'reorder_point': eq.reorder_point,
                'par_level': eq.par_level,
                'storage_location': eq.storage_location,
                'created_at': eq.created_at.isoformat() if eq.created_at else None,
                'updated_at': eq.updated_at.isoformat() if eq.updated_at else None
            }
            for eq in equipment_list
        ]
    except Exception as e:
        logger.error(f"Error listing equipment: {e}")
        return []


def delete_equipment(db: Session, equipment_id, account_id=None):
    """
    Delete an equipment item
    """
    try:
        equipment = _owned_equipment(db, equipment_id, account_id)
        if not equipment:
            return False
        
        db.delete(equipment)
        db.commit()
        logger.info(f"Equipment deleted: {equipment.name}")
        return True
    except Exception as e:
        logger.error(f"Error deleting equipment {equipment_id}: {e}")
        db.rollback()
        return False


def search_equipment(db: Session, query):
    """
    Search equipment by name
    """
    try:
        equipment_list = db.query(Equipment).filter(
            Equipment.name.ilike(f'%{query}%')
        ).all()
        
        return [
            {
                'id': eq.id,
                'name': eq.name,
                'quantity': eq.quantity,
                'scheduled_replacement': eq.scheduled_replacement,
                'last_changed': eq.last_changed.isoformat() if eq.last_changed else None,
                'useful_days': eq.useful_days
            }
            for eq in equipment_list
        ]
    except Exception as e:
        logger.error(f"Error searching equipment: {e}")
        return []


# --- Equipment Change Management ---
def get_equipment_list(db: Session, patient_id: int = None, account_id: int = None):
    """
    Get equipment list with calculated due dates for scheduled replacements.
    Optionally filter by patient_id and/or account_id (post-revision: scope to account).
    """
    try:
        query = db.query(Equipment).options(selectinload(Equipment.provider_aliases))
        if patient_id is not None:
            query = query.filter(Equipment.patient_id == patient_id)
        if account_id is not None:
            query = query.filter(or_(Equipment.account_id == account_id, Equipment.account_id.is_(None)))
        equipment = query.all()
        result = []
        
        for item in equipment:
            item_dict = {
                'id': item.id,
                'name': item.name,
                'quantity': item.quantity,
                'scheduled_replacement': item.scheduled_replacement,
                'last_changed': item.last_changed.isoformat() if item.last_changed else None,
                'useful_days': item.useful_days,
                'due_date': None,
                # New supply tracking fields
                'item_number': item.item_number,
                'description': item.description,
                'category': item.category,
                'tracking_level': item.tracking_level,
                'default_manufacturer': item.default_manufacturer,
                'unit_of_measure': item.unit_of_measure,
                'unit_size': item.unit_size,
                'unit_description': item.unit_description,
                'reorder_point': item.reorder_point,
                'par_level': item.par_level,
                'storage_location': item.storage_location,
                # Provider aliases: alternate item numbers this supply is known
                # by (per DME provider) — scan matching checks these too.
                'aliases': [
                    {'id': a.id, 'supplier_id': a.supplier_id, 'item_number': a.item_number, 'raw_description': a.raw_description}
                    for a in item.provider_aliases
                ]
            }
            
            # Only calculate due date if scheduled replacement is enabled
            if (item.scheduled_replacement and item.last_changed and item.useful_days):
                if isinstance(item.last_changed, str):
                    last = datetime.fromisoformat(item.last_changed)
                else:
                    last = item.last_changed
                due = last + timedelta(days=item.useful_days)
                item_dict['due_date'] = due.isoformat()
            
            result.append(item_dict)
        
        # Sort by due_date (scheduled items first, then by due date)
        def sort_key(x):
            if not x['scheduled_replacement']:
                return (1, x['name'])  # Non-scheduled items go to end, sorted by name
            elif x['due_date']:
                return (0, x['due_date'])  # Scheduled items sorted by due date
            else:
                return (0, '9999-12-31')  # Scheduled items without due date go to end of scheduled
        
        result.sort(key=sort_key)
        return result
    except Exception as e:
        logger.error(f"Error fetching equipment list: {e}")
        return []


def log_equipment_change(db: Session, equipment_id, changed_at, patient_id=None, notes=None, changed_by=None, account_id=None):
    """
    Log an equipment change and update the last_changed date
    """
    try:
        if not _owned_equipment(db, equipment_id, account_id):
            return False

        # Create change log entry
        change_log = EquipmentChangeLog(
            equipment_id=equipment_id,
            patient_id=patient_id,
            changed_at=changed_at,
            notes=notes,
            changed_by=changed_by,
            created_at=utc_now()
        )
        db.add(change_log)

        # Update last_changed in equipment
        equipment = _owned_equipment(db, equipment_id, account_id)
        if equipment:
            equipment.last_changed = changed_at
            equipment.updated_at = utc_now()
            # A scheduled change physically consumes one unit. Skip untracked
            # items (tracking_level == 'none'). Floor at 0 — the route-level
            # guard is responsible for refusing a change when stock is already
            # exhausted, mirroring the medication out-of-stock flow.
            if (equipment.tracking_level or 'item') != 'none':
                equipment.quantity = max(0, (equipment.quantity or 0) - 1)

        db.commit()
        logger.info(f"Equipment change logged for ID {equipment_id}")
        # Tell live dashboards to refetch the (patient-scoped) equipment badge.
        try:
            from event_publisher import publish_due_counts_changed
            change_patient_id = patient_id if patient_id is not None else (equipment.patient_id if equipment else None)
            publish_due_counts_changed("equipment", change_patient_id)
        except Exception as e:
            logger.error(f"Failed to publish equipment due-count change: {e}")
        return True
    except Exception as e:
        logger.error(f"Error logging equipment change: {e}")
        db.rollback()
        return False


def get_equipment_change_history(db: Session, equipment_id, account_id=None):
    """
    Get change history for equipment
    """
    try:
        if not _owned_equipment(db, equipment_id, account_id):
            return []

        changes = db.query(EquipmentChangeLog).filter(
            EquipmentChangeLog.equipment_id == equipment_id
        ).order_by(EquipmentChangeLog.changed_at.desc()).all()
        
        return [
            {
                'id': change.id,
                'equipment_id': change.equipment_id,
                'changed_at': change.changed_at.isoformat() if change.changed_at else None
            }
            for change in changes
        ]
    except Exception as e:
        logger.error(f"Error fetching equipment change history: {e}")
        return []


def receive_equipment(db: Session, equipment_id: int, amount: int = 1, account_id=None):
    """
    Increase equipment quantity (receive new stock)
    """
    try:
        equipment = _owned_equipment(db, equipment_id, account_id)
        if not equipment:
            return False
        
        equipment.quantity += amount
        db.commit()
        
        logger.info(f"Equipment {equipment.name} received {amount} units. New quantity: {equipment.quantity}")

        # Real-time badge: keep the equipment due-count fresh on restock.
        try:
            from event_publisher import publish_due_counts_changed
            publish_due_counts_changed("equipment", equipment.patient_id)
        except Exception as e:
            logger.error(f"Failed to publish equipment due-count change: {e}")

        return True
    except Exception as e:
        logger.error(f"Error receiving equipment: {e}")
        db.rollback()
        return False


def open_equipment(db: Session, equipment_id: int, amount: int = 1, account_id=None):
    """
    Decrease equipment quantity (open/use equipment) and log the action
    """
    try:
        equipment = _owned_equipment(db, equipment_id, account_id)
        if not equipment:
            return False
        
        # Check if enough quantity is available
        if equipment.quantity < amount:
            logger.warning(f"Not enough quantity available for equipment {equipment.name}. Available: {equipment.quantity}, Requested: {amount}")
            return False
            
        # Deduct quantity
        equipment.quantity -= amount
        
        # Update last_changed date if the equipment supports scheduled replacement
        if equipment.scheduled_replacement:
            equipment.last_changed = utc_now()
        
        # Log the action in equipment change history
        if equipment.scheduled_replacement:
            change_log = EquipmentChangeLog(
                equipment_id=equipment_id,
                changed_at=utc_now()
            )
            db.add(change_log)
        
        db.commit()
        logger.info(f"Equipment {equipment.name} used {amount} units. New quantity: {equipment.quantity}")

        # Real-time badge: open() bumps last_changed for scheduled-replacement
        # items, which moves the equipment due-count — notify dashboards.
        try:
            from event_publisher import publish_due_counts_changed
            publish_due_counts_changed("equipment", equipment.patient_id)
        except Exception as e:
            logger.error(f"Failed to publish equipment due-count change: {e}")

        return True
    except Exception as e:
        logger.error(f"Error opening equipment: {e}")
        db.rollback()
        return False


def get_equipment_due_count(db: Session, account_id: int = None, patient_id: int = None):
    """Return the count of equipment items where due_date is today or past.

    Optionally scope by account_id and/or patient_id. When patient_id is given,
    the count covers that patient's own items plus shared items (patient_id NULL)
    and excludes other patients' equipment — so a per-patient dashboard badge
    doesn't pick up another patient's due items.
    """
    try:
        from sqlalchemy import or_
        query = db.query(Equipment).filter(Equipment.scheduled_replacement == True)
        if account_id is not None:
            query = query.filter(or_(Equipment.account_id == account_id, Equipment.account_id.is_(None)))
        if patient_id is not None:
            query = query.filter(or_(Equipment.patient_id == patient_id, Equipment.patient_id.is_(None)))
        equipment = query.all()
        due_count = 0
        today = utc_today()
        
        for item in equipment:
            if item.last_changed and item.useful_days:
                if isinstance(item.last_changed, str):
                    last = datetime.fromisoformat(item.last_changed)
                else:
                    last = item.last_changed
                due_date = (last.date() if hasattr(last, 'date') else last) + timedelta(days=item.useful_days)
                if due_date <= today:
                    due_count += 1
        return due_count
    except Exception as e:
        logger.error(f"Error calculating equipment due count: {e}")
        return 0


def get_equipment_due_now_late_counts(db: Session, account_id: int = None, patient_id: int = None):
    """Return {'due_now', 'late'} equipment badge counts for the per-patient MQTT
    badge sensors.

    Equipment due dates are date-precise (not hour-precise), so the ±1h badge
    spec maps to whole days: ``due_now`` = due today, ``late`` = due before today.
    Scoping matches get_equipment_due_count (own items + shared NULL items)."""
    try:
        from sqlalchemy import or_
        query = db.query(Equipment).filter(Equipment.scheduled_replacement == True)
        if account_id is not None:
            query = query.filter(or_(Equipment.account_id == account_id, Equipment.account_id.is_(None)))
        if patient_id is not None:
            query = query.filter(or_(Equipment.patient_id == patient_id, Equipment.patient_id.is_(None)))
        equipment = query.all()
        due_now = 0
        late = 0
        today = utc_today()

        for item in equipment:
            if item.last_changed and item.useful_days:
                if isinstance(item.last_changed, str):
                    last = datetime.fromisoformat(item.last_changed)
                else:
                    last = item.last_changed
                due_date = (last.date() if hasattr(last, 'date') else last) + timedelta(days=item.useful_days)
                if due_date < today:
                    late += 1
                elif due_date == today:
                    due_now += 1
        return {'due_now': due_now, 'late': late}
    except Exception as e:
        logger.error(f"Error calculating equipment due_now/late counts: {e}")
        return {'due_now': 0, 'late': 0}


# --- Initial inventory setup: catalog import, stocktakes, provider aliases ---

def _alias_exists(db: Session, equipment_id, supplier_id, item_number):
    """True when the (equipment, supplier, number) alias triple already exists.

    Checked in code rather than relying on uq_equipment_alias alone because
    Postgres treats NULL supplier_id values as distinct in the constraint.
    """
    query = db.query(EquipmentProviderAlias).filter(
        EquipmentProviderAlias.equipment_id == equipment_id,
        EquipmentProviderAlias.item_number == item_number,
    )
    if supplier_id is None:
        query = query.filter(EquipmentProviderAlias.supplier_id.is_(None))
    else:
        query = query.filter(EquipmentProviderAlias.supplier_id == supplier_id)
    return db.query(query.exists()).scalar()


def catalog_import(db: Session, items, account_id=None, patient_id=None, supplier_id=None, created_by=None):
    """Bulk catalog creation for the Initial Inventory Setup wizard.

    Each item either creates a new supply ('create') or attaches a provider
    alias to an existing one ('match'). A 'create' whose item number is
    already known — as an Equipment.item_number or an alias — is silently
    treated as a match (dedup=True), so replaying a wizard save after an iOS
    reload never duplicates supplies.

    One transaction, one commit. Returns {'created': [...], 'matched': [...],
    'errors': [...]} with equipment_ids so the wizard can drive the count step.
    """
    created, matched, errors = [], [], []
    try:
        # Account-scoped item-number -> Equipment lookup (primary numbers + aliases)
        eq_query = db.query(Equipment)
        alias_query = db.query(EquipmentProviderAlias).join(
            Equipment, EquipmentProviderAlias.equipment_id == Equipment.id
        )
        if account_id is not None:
            scope = or_(Equipment.account_id == account_id, Equipment.account_id.is_(None))
            eq_query = eq_query.filter(scope)
            alias_query = alias_query.filter(scope)
        number_to_eq = {}
        for eq in eq_query.all():
            if eq.item_number and str(eq.item_number).strip():
                number_to_eq.setdefault(str(eq.item_number).strip(), eq)
        for alias in alias_query.all():
            key = str(alias.item_number).strip()
            if key:
                number_to_eq.setdefault(key, alias.equipment)

        def ensure_alias(equipment, item_number, raw_description, alias_supplier_id=supplier_id):
            if not item_number:
                return
            if _alias_exists(db, equipment.id, alias_supplier_id, item_number):
                return
            db.add(EquipmentProviderAlias(
                account_id=account_id if account_id is not None else equipment.account_id,
                equipment_id=equipment.id,
                supplier_id=alias_supplier_id,
                item_number=item_number,
                raw_description=raw_description,
                created_at=utc_now(),
            ))

        for index, item in enumerate(items):
            number = (item.item_number or '').strip() or None
            # UPC/EAN scanned off the physical box: provider-independent, so
            # its alias never carries the batch's supplier_id.
            barcode = (getattr(item, 'product_barcode', None) or '').strip() or None
            target = None
            dedup = False

            if item.action == 'match':
                if not item.equipment_id:
                    errors.append({'index': index, 'reason': 'match requires equipment_id'})
                    continue
                target = db.query(Equipment).filter(Equipment.id == item.equipment_id).first()
                if not target:
                    errors.append({'index': index, 'reason': f'equipment {item.equipment_id} not found'})
                    continue
            elif number and number in number_to_eq:
                # Already in the catalog under this number — treat as a match
                target = number_to_eq[number]
                dedup = True
            elif barcode and barcode in number_to_eq:
                # Known by its physical-box barcode from an earlier scan
                target = number_to_eq[barcode]
                dedup = True

            if target is not None:
                ensure_alias(target, number, item.raw_description)
                ensure_alias(target, barcode, 'Product barcode', alias_supplier_id=None)
                # Backfill: a supply linked by name may predate knowing its
                # number/location — future scans then auto-link by number.
                if number and not (target.item_number or '').strip():
                    target.item_number = number
                if item.storage_location and not (target.storage_location or '').strip():
                    target.storage_location = item.storage_location
                target.updated_at = utc_now()
                matched.append({'index': index, 'equipment_id': target.id, 'item_number': number, 'dedup': dedup})
                continue

            # Create a new catalog entry
            if not (item.name or '').strip():
                errors.append({'index': index, 'reason': 'create requires a name'})
                continue
            equipment = Equipment(
                name=item.name.strip(),
                patient_id=patient_id,
                account_id=account_id,
                quantity=item.quantity or 0,
                # Supplies are counted, not date-rotated — no replacement schedule.
                scheduled_replacement=False,
                item_number=number,
                description=item.raw_description,
                category=item.category or 'supply',
                tracking_level='item',
                unit_of_measure=item.unit_of_measure,
                unit_size=item.unit_size,
                unit_description=item.unit_description,
                storage_location=item.storage_location,
                reorder_point=item.reorder_point,
                par_level=item.par_level,
                created_at=utc_now(),
                updated_at=utc_now(),
            )
            db.add(equipment)
            db.flush()  # assign id for the alias row + response
            ensure_alias(equipment, number, item.raw_description)
            ensure_alias(equipment, barcode, 'Product barcode', alias_supplier_id=None)
            if number:
                number_to_eq[number] = equipment  # dedupe within the batch too
            if barcode:
                number_to_eq[barcode] = equipment
            created.append({'index': index, 'equipment_id': equipment.id, 'item_number': number})

        db.commit()
        logger.info(f"Catalog import: {len(created)} created, {len(matched)} matched, {len(errors)} errors")
        try:
            from event_publisher import publish_due_counts_changed
            publish_due_counts_changed("equipment", patient_id)
        except Exception as e:
            logger.error(f"Failed to publish equipment due-count change: {e}")
        return {'created': created, 'matched': matched, 'errors': errors}
    except Exception as e:
        logger.error(f"Error importing catalog items: {e}")
        db.rollback()
        return {'created': [], 'matched': [], 'errors': [{'index': None, 'reason': 'import failed'}]}


def set_equipment_count(db: Session, equipment_id: int, quantity: int, note=None, counted_by=None, account_id=None):
    """Physical stocktake: set the absolute on-hand quantity with an audit row.

    Unlike log_equipment_change this never touches last_changed — counting a
    shelf is not replacing an item.
    """
    try:
        equipment = _owned_equipment(db, equipment_id, account_id)
        if not equipment:
            return None
        before = equipment.quantity or 0
        equipment.quantity = quantity
        equipment.updated_at = utc_now()
        db.add(EquipmentCountLog(
            equipment_id=equipment_id,
            quantity_before=before,
            quantity_after=quantity,
            note=note,
            counted_by=counted_by,
            counted_at=utc_now(),
        ))
        db.commit()
        logger.info(f"Equipment {equipment.name} counted: {before} -> {quantity}")
        try:
            from event_publisher import publish_due_counts_changed
            publish_due_counts_changed("equipment", equipment.patient_id)
        except Exception as e:
            logger.error(f"Failed to publish equipment due-count change: {e}")
        return {'success': True, 'quantity_before': before, 'quantity_after': quantity}
    except Exception as e:
        logger.error(f"Error counting equipment {equipment_id}: {e}")
        db.rollback()
        return None


def get_equipment_count_history(db: Session, equipment_id: int, limit: int = 50, account_id=None):
    """Stocktake history for one supply, newest first."""
    try:
        if not _owned_equipment(db, equipment_id, account_id):
            return []

        counts = db.query(EquipmentCountLog).filter(
            EquipmentCountLog.equipment_id == equipment_id
        ).order_by(EquipmentCountLog.counted_at.desc()).limit(limit).all()
        return [
            {
                'id': c.id,
                'equipment_id': c.equipment_id,
                'quantity_before': c.quantity_before,
                'quantity_after': c.quantity_after,
                'note': c.note,
                'counted_by': c.counted_by,
                'counted_at': c.counted_at.isoformat() if c.counted_at else None,
            }
            for c in counts
        ]
    except Exception as e:
        logger.error(f"Error fetching count history for equipment {equipment_id}: {e}")
        return []


def add_equipment_alias(db: Session, equipment_id: int, item_number: str, supplier_id=None, raw_description=None, account_id=None):
    """Attach a provider item number to a supply. Returns the alias id, or None."""
    try:
        equipment = _owned_equipment(db, equipment_id, account_id)
        if not equipment:
            return None
        item_number = (item_number or '').strip()
        if not item_number or _alias_exists(db, equipment_id, supplier_id, item_number):
            return None
        alias = EquipmentProviderAlias(
            account_id=account_id if account_id is not None else equipment.account_id,
            equipment_id=equipment_id,
            supplier_id=supplier_id,
            item_number=item_number,
            raw_description=raw_description,
            created_at=utc_now(),
        )
        db.add(alias)
        db.commit()
        db.refresh(alias)
        return alias.id
    except Exception as e:
        logger.error(f"Error adding alias to equipment {equipment_id}: {e}")
        db.rollback()
        return None


def delete_equipment_alias(db: Session, equipment_id: int, alias_id: int, account_id=None):
    """Remove a provider alias from a supply."""
    try:
        if not _owned_equipment(db, equipment_id, account_id):
            return False

        alias = db.query(EquipmentProviderAlias).filter(
            EquipmentProviderAlias.id == alias_id,
            EquipmentProviderAlias.equipment_id == equipment_id,
        ).first()
        if not alias:
            return False
        db.delete(alias)
        db.commit()
        return True
    except Exception as e:
        logger.error(f"Error deleting alias {alias_id}: {e}")
        db.rollback()
        return False


def get_equipment_due_soon(db: Session, days_ahead=7):
    """
    Get equipment items that are due for replacement within the specified number of days
    """
    try:
        equipment = db.query(Equipment).filter(Equipment.scheduled_replacement == True).all()
        due_soon = []
        target_date = utc_today() + timedelta(days=days_ahead)
        
        for item in equipment:
            if item.last_changed and item.useful_days:
                if isinstance(item.last_changed, str):
                    last = datetime.fromisoformat(item.last_changed)
                else:
                    last = item.last_changed
                due_date = (last.date() if hasattr(last, 'date') else last) + timedelta(days=item.useful_days)
                if due_date <= target_date:
                    due_soon.append({
                        'id': item.id,
                        'name': item.name,
                        'quantity': item.quantity,
                        'due_date': due_date.isoformat(),
                        'days_until_due': (due_date - utc_today()).days
                    })
        
        return sorted(due_soon, key=lambda x: x['days_until_due'])
    except Exception as e:
        logger.error(f"Error getting equipment due soon: {e}")
        return []


# --- Placeholder functions for category management (not implemented in current model) ---
def get_equipment_categories(db: Session):
    """Placeholder - equipment categories not implemented in current model"""
    return []

def add_equipment_category(db: Session, name, description=None):
    """Placeholder - equipment categories not implemented in current model"""
    return None

def update_equipment_category(db: Session, category_id, name=None, description=None):
    """Placeholder - equipment categories not implemented in current model"""
    return False

def delete_equipment_category(db: Session, category_id):
    """Placeholder - equipment categories not implemented in current model"""
    return False

def add_equipment(db: Session, name, category_id=None, brand=None, model=None, serial_number=None, 
                 purchase_date=None, warranty_expiry=None, maintenance_schedule=None, 
                 location=None, quantity=1, notes=None, active=True):
    """Placeholder - comprehensive equipment add not implemented in current model"""
    # Fall back to simple add
    return add_equipment_simple(db, name, quantity)
