"""
DME Shipment CRUD operations for supplies and equipment deliveries
"""
import logging
from datetime import datetime
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import and_
from schemas.dme_shipment import DMEShipment, DMEShipmentItem, DMEReceiptItem, DMEShipmentAlert
from schemas.equipment import Equipment

logger = logging.getLogger('crud')


# --- Shipment CRUD ---

def create_shipment(
    db: Session,
    patient_id: int,
    supplier_id: Optional[int] = None,
    po_number: Optional[str] = None,
    order_number: Optional[str] = None,
    ship_date: Optional[datetime] = None,
    expected_delivery: Optional[datetime] = None,
    tracking_number: Optional[str] = None,
    ship_method: Optional[str] = None,
    warehouse_loc: Optional[str] = None,
    is_backorder: bool = False,
    parent_shipment_id: Optional[int] = None,
    notes: Optional[str] = None,
    created_by: Optional[int] = None
) -> Optional[DMEShipment]:
    """Create a new DME shipment"""
    try:
        shipment = DMEShipment(
            patient_id=patient_id,
            supplier_id=supplier_id,
            po_number=po_number,
            order_number=order_number,
            ship_date=ship_date,
            expected_delivery=expected_delivery,
            tracking_number=tracking_number,
            ship_method=ship_method,
            warehouse_loc=warehouse_loc,
            is_backorder=is_backorder,
            parent_shipment_id=parent_shipment_id,
            notes=notes,
            created_by=created_by,
            status='draft',
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.add(shipment)
        db.commit()
        db.refresh(shipment)
        logger.info(f"Created shipment {shipment.id} for patient {patient_id}")
        return shipment
    except Exception as e:
        logger.error(f"Error creating shipment: {e}")
        db.rollback()
        return None


def get_shipment(db: Session, shipment_id: int) -> Optional[dict]:
    """Get a shipment with all related data"""
    try:
        shipment = db.query(DMEShipment).filter(DMEShipment.id == shipment_id).first()
        if not shipment:
            return None
        
        return _shipment_to_dict(shipment, include_items=True, include_alerts=True)
    except Exception as e:
        logger.error(f"Error fetching shipment {shipment_id}: {e}")
        return None


def list_shipments(
    db: Session,
    patient_id: Optional[int] = None,
    supplier_id: Optional[int] = None,
    status: Optional[str] = None,
    is_backorder: Optional[bool] = None,
    skip: int = 0,
    limit: int = 50
) -> List[dict]:
    """List shipments with optional filters"""
    try:
        query = db.query(DMEShipment)
        
        if patient_id is not None:
            query = query.filter(DMEShipment.patient_id == patient_id)
        if supplier_id is not None:
            query = query.filter(DMEShipment.supplier_id == supplier_id)
        if status is not None:
            query = query.filter(DMEShipment.status == status)
        if is_backorder is not None:
            query = query.filter(DMEShipment.is_backorder == is_backorder)
        
        query = query.order_by(DMEShipment.created_at.desc())
        shipments = query.offset(skip).limit(limit).all()
        
        return [_shipment_to_dict(s, include_items=False, include_alerts=False) for s in shipments]
    except Exception as e:
        logger.error(f"Error listing shipments: {e}")
        return []


def update_shipment(
    db: Session,
    shipment_id: int,
    **kwargs
) -> bool:
    """Update shipment fields"""
    try:
        shipment = db.query(DMEShipment).filter(DMEShipment.id == shipment_id).first()
        if not shipment:
            return False
        
        allowed_fields = [
            'supplier_id', 'po_number', 'order_number', 'ship_date', 'expected_delivery',
            'actual_delivery', 'status', 'tracking_number', 'ship_method', 'warehouse_loc',
            'notes'
        ]
        
        for field in allowed_fields:
            if field in kwargs and kwargs[field] is not None:
                setattr(shipment, field, kwargs[field])
        
        shipment.updated_at = datetime.utcnow()
        db.commit()
        logger.info(f"Updated shipment {shipment_id}")
        return True
    except Exception as e:
        logger.error(f"Error updating shipment {shipment_id}: {e}")
        db.rollback()
        return False


def delete_shipment(db: Session, shipment_id: int) -> bool:
    """Delete a shipment and all related items"""
    try:
        shipment = db.query(DMEShipment).filter(DMEShipment.id == shipment_id).first()
        if not shipment:
            return False
        
        db.delete(shipment)
        db.commit()
        logger.info(f"Deleted shipment {shipment_id}")
        return True
    except Exception as e:
        logger.error(f"Error deleting shipment {shipment_id}: {e}")
        db.rollback()
        return False


# --- Shipment Items CRUD ---

def add_shipment_item(
    db: Session,
    shipment_id: int,
    equipment_id: Optional[int] = None,
    item_number: Optional[str] = None,
    item_description: Optional[str] = None,
    manufacturer_name: Optional[str] = None,
    qty_ordered: int = 0,
    qty_shipped: int = 0,
    qty_backordered: int = 0,
    unit_of_measure: Optional[str] = None,
    unit_description: Optional[str] = None,
    unit_price: Optional[float] = None,
    lot_number: Optional[str] = None,
    notes: Optional[str] = None
) -> Optional[DMEShipmentItem]:
    """Add an item to a shipment"""
    try:
        item = DMEShipmentItem(
            shipment_id=shipment_id,
            equipment_id=equipment_id,
            item_number=item_number,
            item_description=item_description,
            manufacturer_name=manufacturer_name,
            qty_ordered=qty_ordered,
            qty_shipped=qty_shipped,
            qty_backordered=qty_backordered,
            unit_of_measure=unit_of_measure,
            unit_description=unit_description,
            unit_price=unit_price,
            lot_number=lot_number,
            notes=notes,
            created_at=datetime.utcnow()
        )
        db.add(item)
        
        # Update shipment status if items are being shipped
        if qty_shipped > 0:
            shipment = db.query(DMEShipment).filter(DMEShipment.id == shipment_id).first()
            if shipment and shipment.status == 'ordered':
                shipment.status = 'shipped'
                shipment.updated_at = datetime.utcnow()
        
        db.commit()
        db.refresh(item)
        logger.info(f"Added item {item.id} to shipment {shipment_id}")
        return item
    except Exception as e:
        logger.error(f"Error adding shipment item: {e}")
        db.rollback()
        return None


def update_shipment_item(db: Session, item_id: int, **kwargs) -> bool:
    """Update a shipment item"""
    try:
        item = db.query(DMEShipmentItem).filter(DMEShipmentItem.id == item_id).first()
        if not item:
            return False
        
        allowed_fields = [
            'equipment_id', 'item_number', 'item_description', 'manufacturer_name',
            'qty_ordered', 'qty_shipped', 'qty_backordered', 'unit_of_measure',
            'unit_description', 'unit_price', 'lot_number', 'notes'
        ]
        
        for field in allowed_fields:
            if field in kwargs:
                setattr(item, field, kwargs[field])
        
        db.commit()
        logger.info(f"Updated shipment item {item_id}")
        return True
    except Exception as e:
        logger.error(f"Error updating shipment item {item_id}: {e}")
        db.rollback()
        return False


def delete_shipment_item(db: Session, item_id: int) -> bool:
    """Delete a shipment item"""
    try:
        item = db.query(DMEShipmentItem).filter(DMEShipmentItem.id == item_id).first()
        if not item:
            return False
        
        db.delete(item)
        db.commit()
        logger.info(f"Deleted shipment item {item_id}")
        return True
    except Exception as e:
        logger.error(f"Error deleting shipment item {item_id}: {e}")
        db.rollback()
        return False


# --- Receiving Operations ---

def receive_item(
    db: Session,
    shipment_item_id: int,
    qty_received: int,
    received_by: Optional[int] = None,
    condition: str = 'good',
    discrepancy_notes: Optional[str] = None,
    lot_number: Optional[str] = None,
    expiration_date: Optional[datetime] = None
) -> Optional[DMEReceiptItem]:
    """
    Record receipt of an item. Updates equipment quantity immediately.
    Can be called multiple times for partial receiving across sessions.
    """
    try:
        # Get the shipment item
        shipment_item = db.query(DMEShipmentItem).filter(
            DMEShipmentItem.id == shipment_item_id
        ).first()
        if not shipment_item:
            logger.error(f"Shipment item {shipment_item_id} not found")
            return None
        
        # Create receipt record
        receipt = DMEReceiptItem(
            shipment_item_id=shipment_item_id,
            qty_received=qty_received,
            received_at=datetime.utcnow(),
            received_by=received_by,
            condition=condition,
            discrepancy_notes=discrepancy_notes,
            lot_number=lot_number,
            expiration_date=expiration_date,
            created_at=datetime.utcnow()
        )
        db.add(receipt)
        
        # Update equipment quantity immediately (only for good condition items)
        if condition == 'good' and shipment_item.equipment_id:
            equipment = db.query(Equipment).filter(
                Equipment.id == shipment_item.equipment_id
            ).first()
            if equipment:
                # Convert to base units if unit_size is set
                qty_to_add = qty_received
                if equipment.unit_size and shipment_item.unit_of_measure != 'EA':
                    qty_to_add = qty_received * equipment.unit_size
                
                equipment.quantity = (equipment.quantity or 0) + qty_to_add
                equipment.updated_at = datetime.utcnow()
                logger.info(f"Updated equipment {equipment.id} quantity by +{qty_to_add}")
        
        # Update shipment status to 'receiving' if first receipt
        shipment = db.query(DMEShipment).filter(
            DMEShipment.id == shipment_item.shipment_id
        ).first()
        if shipment and shipment.status in ['ordered', 'shipped']:
            shipment.status = 'receiving'
            shipment.actual_delivery = datetime.utcnow()
            shipment.updated_at = datetime.utcnow()
        
        db.commit()
        db.refresh(receipt)
        logger.info(f"Recorded receipt {receipt.id} for shipment item {shipment_item_id}")
        return receipt
    except Exception as e:
        logger.error(f"Error receiving item: {e}")
        db.rollback()
        return None


def get_item_receipts(db: Session, shipment_item_id: int) -> List[dict]:
    """Get all receipts for a shipment item"""
    try:
        receipts = db.query(DMEReceiptItem).filter(
            DMEReceiptItem.shipment_item_id == shipment_item_id
        ).order_by(DMEReceiptItem.received_at).all()
        
        return [_receipt_to_dict(r) for r in receipts]
    except Exception as e:
        logger.error(f"Error fetching receipts for item {shipment_item_id}: {e}")
        return []


def get_total_received(db: Session, shipment_item_id: int) -> dict:
    """Get total quantities received for a shipment item by condition"""
    try:
        receipts = db.query(DMEReceiptItem).filter(
            DMEReceiptItem.shipment_item_id == shipment_item_id
        ).all()
        
        totals = {'good': 0, 'damaged': 0, 'wrong_item': 0, 'short': 0, 'extra': 0}
        for r in receipts:
            if r.condition in totals:
                totals[r.condition] += r.qty_received
        
        totals['total'] = sum(totals.values())
        return totals
    except Exception as e:
        logger.error(f"Error calculating totals for item {shipment_item_id}: {e}")
        return {'good': 0, 'damaged': 0, 'wrong_item': 0, 'short': 0, 'extra': 0, 'total': 0}


# --- Finalization ---

def finalize_shipment(
    db: Session,
    shipment_id: int,
    finalized_by: Optional[int] = None
) -> dict:
    """
    Finalize a shipment:
    - Calculate discrepancies and create alerts for short/wrong items
    - Auto-create backorder shipment for B/O items
    - Update shipment status to 'complete' or 'partial'
    """
    try:
        shipment = db.query(DMEShipment).filter(DMEShipment.id == shipment_id).first()
        if not shipment:
            return {'success': False, 'error': 'Shipment not found'}
        
        if shipment.finalized_at:
            return {'success': False, 'error': 'Shipment already finalized'}
        
        alerts_created = []
        backorder_items = []
        has_discrepancies = False
        
        # Check each item
        for item in shipment.items:
            received_totals = get_total_received(db, item.id)
            total_good = received_totals['good']
            
            # Check for short shipment
            if total_good < item.qty_shipped:
                shortage = item.qty_shipped - total_good
                alert = _create_alert(
                    db, shipment_id, item.id, 'short',
                    item.qty_shipped, total_good,
                    f"Received {total_good} but expected {item.qty_shipped}"
                )
                if alert:
                    alerts_created.append(alert.id)
                has_discrepancies = True
            
            # Check for damaged items
            if received_totals['damaged'] > 0:
                alert = _create_alert(
                    db, shipment_id, item.id, 'damaged',
                    0, received_totals['damaged'],
                    f"{received_totals['damaged']} items received damaged"
                )
                if alert:
                    alerts_created.append(alert.id)
                has_discrepancies = True
            
            # Check for wrong items
            if received_totals['wrong_item'] > 0:
                alert = _create_alert(
                    db, shipment_id, item.id, 'wrong_item',
                    0, received_totals['wrong_item'],
                    f"{received_totals['wrong_item']} wrong items received"
                )
                if alert:
                    alerts_created.append(alert.id)
                has_discrepancies = True
            
            # Track backorder items for auto-creating pending shipment
            if item.qty_backordered > 0:
                backorder_items.append({
                    'equipment_id': item.equipment_id,
                    'item_number': item.item_number,
                    'item_description': item.item_description,
                    'manufacturer_name': item.manufacturer_name,
                    'qty_ordered': item.qty_backordered,
                    'qty_shipped': 0,
                    'qty_backordered': 0,
                    'unit_of_measure': item.unit_of_measure,
                    'unit_description': item.unit_description
                })
        
        # Create backorder shipment if needed
        backorder_shipment_id = None
        if backorder_items:
            backorder_shipment = create_shipment(
                db,
                patient_id=shipment.patient_id,
                supplier_id=shipment.supplier_id,
                po_number=shipment.po_number,
                order_number=f"{shipment.order_number}-BO" if shipment.order_number else None,
                is_backorder=True,
                parent_shipment_id=shipment_id,
                notes=f"Backorder items from shipment #{shipment_id}",
                created_by=finalized_by
            )
            
            if backorder_shipment:
                backorder_shipment_id = backorder_shipment.id
                for bo_item in backorder_items:
                    add_shipment_item(db, backorder_shipment_id, **bo_item)
                
                # Create alert for backorder
                alert = _create_alert(
                    db, shipment_id, None, 'backorder',
                    len(backorder_items), 0,
                    f"{len(backorder_items)} items on backorder"
                )
                if alert:
                    alerts_created.append(alert.id)
        
        # Update shipment status
        shipment.status = 'partial' if has_discrepancies else 'complete'
        shipment.finalized_at = datetime.utcnow()
        shipment.finalized_by = finalized_by
        shipment.updated_at = datetime.utcnow()
        
        db.commit()
        
        return {
            'success': True,
            'status': shipment.status,
            'alerts_created': len(alerts_created),
            'backorder_shipment_id': backorder_shipment_id
        }
    except Exception as e:
        logger.error(f"Error finalizing shipment {shipment_id}: {e}")
        db.rollback()
        return {'success': False, 'error': str(e)}


# --- Alerts ---

def _create_alert(
    db: Session,
    shipment_id: int,
    shipment_item_id: Optional[int],
    alert_type: str,
    expected_qty: int,
    actual_qty: int,
    notes: Optional[str] = None
) -> Optional[DMEShipmentAlert]:
    """Internal helper to create an alert"""
    try:
        alert = DMEShipmentAlert(
            shipment_id=shipment_id,
            shipment_item_id=shipment_item_id,
            alert_type=alert_type,
            expected_qty=expected_qty,
            actual_qty=actual_qty,
            notes=notes,
            resolved=False,
            created_at=datetime.utcnow()
        )
        db.add(alert)
        db.flush()  # Get ID without committing
        return alert
    except Exception as e:
        logger.error(f"Error creating alert: {e}")
        return None


def get_shipment_alerts(db: Session, shipment_id: int) -> List[dict]:
    """Get all alerts for a shipment"""
    try:
        alerts = db.query(DMEShipmentAlert).filter(
            DMEShipmentAlert.shipment_id == shipment_id
        ).order_by(DMEShipmentAlert.created_at).all()
        
        return [_alert_to_dict(a) for a in alerts]
    except Exception as e:
        logger.error(f"Error fetching alerts for shipment {shipment_id}: {e}")
        return []


def get_unresolved_alerts(db: Session, patient_id: Optional[int] = None) -> List[dict]:
    """Get all unresolved alerts, optionally filtered by patient"""
    try:
        query = db.query(DMEShipmentAlert).filter(DMEShipmentAlert.resolved == False)
        
        if patient_id is not None:
            query = query.join(DMEShipment).filter(DMEShipment.patient_id == patient_id)
        
        alerts = query.order_by(DMEShipmentAlert.created_at.desc()).all()
        return [_alert_to_dict(a) for a in alerts]
    except Exception as e:
        logger.error(f"Error fetching unresolved alerts: {e}")
        return []


def get_alerts(
    db: Session,
    patient_id: Optional[int] = None,
    alert_type: Optional[str] = None,
    resolved: Optional[bool] = None
) -> List[dict]:
    """Get alerts with filters"""
    try:
        query = db.query(DMEShipmentAlert)
        
        if resolved is not None:
            query = query.filter(DMEShipmentAlert.resolved == resolved)
        
        if alert_type:
            query = query.filter(DMEShipmentAlert.alert_type == alert_type)
        
        if patient_id is not None:
            query = query.join(DMEShipment).filter(DMEShipment.patient_id == patient_id)
        
        alerts = query.order_by(DMEShipmentAlert.created_at.desc()).all()
        return [_alert_to_dict(a) for a in alerts]
    except Exception as e:
        logger.error(f"Error fetching alerts: {e}")
        return []


def resolve_alert(
    db: Session,
    alert_id: int,
    resolved_by: Optional[int] = None,
    resolution_notes: Optional[str] = None
) -> bool:
    """Mark an alert as resolved"""
    try:
        alert = db.query(DMEShipmentAlert).filter(DMEShipmentAlert.id == alert_id).first()
        if not alert:
            return False
        
        alert.resolved = True
        alert.resolved_at = datetime.utcnow()
        alert.resolved_by = resolved_by
        alert.resolution_notes = resolution_notes
        
        db.commit()
        logger.info(f"Resolved alert {alert_id}")
        return True
    except Exception as e:
        logger.error(f"Error resolving alert {alert_id}: {e}")
        db.rollback()
        return False


def create_followup_order(
    db: Session,
    alert_ids: List[int],
    created_by: Optional[int] = None
) -> Optional[dict]:
    """
    Create a follow-up order from one or more alerts.
    Groups alerts by original shipment's supplier/patient.
    """
    try:
        alerts = db.query(DMEShipmentAlert).filter(
            DMEShipmentAlert.id.in_(alert_ids),
            DMEShipmentAlert.resolved == False
        ).all()
        
        if not alerts:
            return {'success': False, 'error': 'No valid unresolved alerts found'}
        
        # Get original shipment info
        first_alert = alerts[0]
        original_shipment = db.query(DMEShipment).filter(
            DMEShipment.id == first_alert.shipment_id
        ).first()
        
        if not original_shipment:
            return {'success': False, 'error': 'Original shipment not found'}
        
        # Create follow-up shipment
        followup = create_shipment(
            db,
            patient_id=original_shipment.patient_id,
            supplier_id=original_shipment.supplier_id,
            notes=f"Follow-up order for alerts from shipment #{original_shipment.id}",
            created_by=created_by
        )
        
        if not followup:
            return {'success': False, 'error': 'Failed to create follow-up shipment'}
        
        items_added = 0
        
        # Add items based on alerts
        for alert in alerts:
            if alert.shipment_item_id:
                original_item = db.query(DMEShipmentItem).filter(
                    DMEShipmentItem.id == alert.shipment_item_id
                ).first()
                
                if original_item:
                    # Calculate qty needed based on alert type
                    qty_needed = 0
                    if alert.alert_type == 'short':
                        qty_needed = alert.expected_qty - alert.actual_qty
                    elif alert.alert_type in ['damaged', 'wrong_item']:
                        qty_needed = alert.actual_qty  # Reorder what was damaged/wrong
                    
                    if qty_needed > 0:
                        add_shipment_item(
                            db,
                            shipment_id=followup.id,
                            equipment_id=original_item.equipment_id,
                            item_number=original_item.item_number,
                            item_description=original_item.item_description,
                            manufacturer_name=original_item.manufacturer_name,
                            qty_ordered=qty_needed,
                            unit_of_measure=original_item.unit_of_measure,
                            unit_description=original_item.unit_description
                        )
                        items_added += 1
            
            # Link alert to follow-up and mark resolved
            alert.followup_shipment_id = followup.id
            alert.resolved = True
            alert.resolved_at = datetime.utcnow()
            alert.resolved_by = created_by
            alert.resolution_notes = f"Created follow-up order #{followup.id}"
        
        db.commit()
        
        return {
            'success': True,
            'followup_shipment_id': followup.id,
            'items_added': items_added,
            'alerts_resolved': len(alerts)
        }
    except Exception as e:
        logger.error(f"Error creating follow-up order: {e}")
        db.rollback()
        return {'success': False, 'error': str(e)}


def get_pending_backorders(db: Session, patient_id: Optional[int] = None) -> List[dict]:
    """Get all pending backorder shipments"""
    try:
        query = db.query(DMEShipment).filter(
            DMEShipment.is_backorder == True,
            DMEShipment.status.in_(['ordered', 'shipped'])
        )
        
        if patient_id is not None:
            query = query.filter(DMEShipment.patient_id == patient_id)
        
        shipments = query.order_by(DMEShipment.created_at.desc()).all()
        return [_shipment_to_dict(s, include_items=True) for s in shipments]
    except Exception as e:
        logger.error(f"Error fetching pending backorders: {e}")
        return []


# --- Helper Functions ---

def _shipment_to_dict(shipment: DMEShipment, include_items: bool = False, include_alerts: bool = False) -> dict:
    """Convert shipment to dictionary"""
    result = {
        'id': shipment.id,
        'patient_id': shipment.patient_id,
        'supplier_id': shipment.supplier_id,
        'supplier_name': shipment.supplier.name if shipment.supplier else None,
        'po_number': shipment.po_number,
        'order_number': shipment.order_number,
        'ship_date': shipment.ship_date.isoformat() if shipment.ship_date else None,
        'expected_delivery': shipment.expected_delivery.isoformat() if shipment.expected_delivery else None,
        'actual_delivery': shipment.actual_delivery.isoformat() if shipment.actual_delivery else None,
        'status': shipment.status,
        'tracking_number': shipment.tracking_number,
        'ship_method': shipment.ship_method,
        'warehouse_loc': shipment.warehouse_loc,
        'is_backorder': shipment.is_backorder,
        'parent_shipment_id': shipment.parent_shipment_id,
        'notes': shipment.notes,
        'created_by': shipment.created_by,
        'created_at': shipment.created_at.isoformat() if shipment.created_at else None,
        'updated_at': shipment.updated_at.isoformat() if shipment.updated_at else None,
        'finalized_at': shipment.finalized_at.isoformat() if shipment.finalized_at else None,
        'finalized_by': shipment.finalized_by
    }
    
    if include_items:
        result['items'] = [_item_to_dict(item) for item in shipment.items]
        result['item_count'] = len(shipment.items)
    
    if include_alerts:
        result['alerts'] = [_alert_to_dict(alert) for alert in shipment.alerts]
        result['unresolved_alert_count'] = sum(1 for a in shipment.alerts if not a.resolved)
    
    return result


def _item_to_dict(item: DMEShipmentItem) -> dict:
    """Convert shipment item to dictionary"""
    # Calculate total received
    total_received = sum(r.qty_received for r in item.receipts if r.condition == 'good')
    
    return {
        'id': item.id,
        'shipment_id': item.shipment_id,
        'equipment_id': item.equipment_id,
        'equipment_name': item.equipment.name if item.equipment else None,
        'item_number': item.item_number,
        'item_description': item.item_description,
        'manufacturer_name': item.manufacturer_name,
        'qty_ordered': item.qty_ordered,
        'qty_shipped': item.qty_shipped,
        'qty_backordered': item.qty_backordered,
        'qty_received': total_received,
        'unit_of_measure': item.unit_of_measure,
        'unit_description': item.unit_description,
        'unit_price': float(item.unit_price) if item.unit_price else None,
        'lot_number': item.lot_number,
        'notes': item.notes,
        'created_at': item.created_at.isoformat() if item.created_at else None,
        'receipts': [_receipt_to_dict(r) for r in item.receipts]
    }


def _receipt_to_dict(receipt: DMEReceiptItem) -> dict:
    """Convert receipt to dictionary"""
    return {
        'id': receipt.id,
        'shipment_item_id': receipt.shipment_item_id,
        'qty_received': receipt.qty_received,
        'received_at': receipt.received_at.isoformat() if receipt.received_at else None,
        'received_by': receipt.received_by,
        'condition': receipt.condition,
        'discrepancy_notes': receipt.discrepancy_notes,
        'lot_number': receipt.lot_number,
        'expiration_date': receipt.expiration_date.isoformat() if receipt.expiration_date else None,
        'created_at': receipt.created_at.isoformat() if receipt.created_at else None
    }


def _alert_to_dict(alert: DMEShipmentAlert) -> dict:
    """Convert alert to dictionary"""
    result = {
        'id': alert.id,
        'shipment_id': alert.shipment_id,
        'shipment_item_id': alert.shipment_item_id,
        'alert_type': alert.alert_type,
        'expected_qty': alert.expected_qty,
        'actual_qty': alert.actual_qty,
        'notes': alert.notes,
        'resolved': alert.resolved,
        'resolved_at': alert.resolved_at.isoformat() if alert.resolved_at else None,
        'resolved_by': alert.resolved_by,
        'resolution_notes': alert.resolution_notes,
        'followup_shipment_id': alert.followup_shipment_id,
        'created_at': alert.created_at.isoformat() if alert.created_at else None
    }
    
    # Add shipment context
    if alert.shipment:
        result['po_number'] = alert.shipment.po_number
        result['order_number'] = alert.shipment.order_number
    
    # Add item context
    if alert.shipment_item:
        result['item_number'] = alert.shipment_item.item_number
        result['manufacturer_name'] = alert.shipment_item.manufacturer_name
        if alert.shipment_item.equipment:
            result['equipment_name'] = alert.shipment_item.equipment.name
    
    return result
