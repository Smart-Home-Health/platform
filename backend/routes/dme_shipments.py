"""
DME Shipment API routes for supplies and equipment deliveries
"""
import logging
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from pydantic import BaseModel

from dependencies import get_db
from crud import dme_shipments as crud

logger = logging.getLogger('app')
router = APIRouter(prefix="/api/shipments", tags=["shipments"])


# --- Pydantic Models ---

class ShipmentCreate(BaseModel):
    patient_id: int
    supplier_id: Optional[int] = None
    po_number: Optional[str] = None
    order_number: Optional[str] = None
    ship_date: Optional[str] = None
    expected_delivery: Optional[str] = None
    tracking_number: Optional[str] = None
    ship_method: Optional[str] = None
    warehouse_loc: Optional[str] = None
    notes: Optional[str] = None


class ShipmentUpdate(BaseModel):
    supplier_id: Optional[int] = None
    po_number: Optional[str] = None
    order_number: Optional[str] = None
    ship_date: Optional[str] = None
    expected_delivery: Optional[str] = None
    actual_delivery: Optional[str] = None
    status: Optional[str] = None
    tracking_number: Optional[str] = None
    ship_method: Optional[str] = None
    warehouse_loc: Optional[str] = None
    notes: Optional[str] = None


class ShipmentItemCreate(BaseModel):
    equipment_id: Optional[int] = None
    item_number: Optional[str] = None
    item_description: Optional[str] = None
    manufacturer_name: Optional[str] = None
    qty_ordered: int = 0
    qty_shipped: int = 0
    qty_backordered: int = 0
    unit_of_measure: Optional[str] = None
    unit_description: Optional[str] = None
    unit_price: Optional[float] = None
    lot_number: Optional[str] = None
    notes: Optional[str] = None


class ShipmentItemUpdate(BaseModel):
    equipment_id: Optional[int] = None
    item_number: Optional[str] = None
    item_description: Optional[str] = None
    manufacturer_name: Optional[str] = None
    qty_ordered: Optional[int] = None
    qty_shipped: Optional[int] = None
    qty_backordered: Optional[int] = None
    unit_of_measure: Optional[str] = None
    unit_description: Optional[str] = None
    unit_price: Optional[float] = None
    lot_number: Optional[str] = None
    notes: Optional[str] = None


class ReceiveItem(BaseModel):
    shipment_item_id: int
    qty_received: int
    condition: str = 'good'  # good, damaged, wrong_item, short, extra
    discrepancy_notes: Optional[str] = None
    lot_number: Optional[str] = None
    expiration_date: Optional[str] = None


class ResolveAlert(BaseModel):
    resolution_notes: Optional[str] = None


class CreateFollowupOrder(BaseModel):
    alert_ids: List[int]


# --- Helper Functions ---

def parse_datetime(dt_str: Optional[str]) -> Optional[datetime]:
    """Parse datetime string to datetime object"""
    if not dt_str:
        return None
    try:
        return datetime.fromisoformat(dt_str.replace('Z', '+00:00'))
    except ValueError:
        try:
            return datetime.strptime(dt_str, '%Y-%m-%d')
        except ValueError:
            return None


# --- Shipment Endpoints ---

@router.post("")
async def create_shipment(
    data: ShipmentCreate,
    user_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Create a new DME shipment"""
    try:
        shipment = crud.create_shipment(
            db,
            patient_id=data.patient_id,
            supplier_id=data.supplier_id,
            po_number=data.po_number,
            order_number=data.order_number,
            ship_date=parse_datetime(data.ship_date),
            expected_delivery=parse_datetime(data.expected_delivery),
            tracking_number=data.tracking_number,
            ship_method=data.ship_method,
            warehouse_loc=data.warehouse_loc,
            notes=data.notes,
            created_by=user_id
        )
        
        if shipment:
            return {"success": True, "id": shipment.id}
        return {"success": False, "error": "Failed to create shipment"}
    except Exception as e:
        logger.error(f"Error creating shipment: {e}")
        return {"success": False, "error": str(e)}


@router.get("")
async def list_shipments(
    patient_id: Optional[int] = None,
    supplier_id: Optional[int] = None,
    status: Optional[str] = None,
    is_backorder: Optional[bool] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """List shipments with optional filters"""
    try:
        shipments = crud.list_shipments(
            db,
            patient_id=patient_id,
            supplier_id=supplier_id,
            status=status,
            is_backorder=is_backorder,
            skip=skip,
            limit=limit
        )
        return {"shipments": shipments}
    except Exception as e:
        logger.error(f"Error listing shipments: {e}")
        return {"shipments": [], "error": str(e)}


@router.get("/backorders")
async def get_pending_backorders(
    patient_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Get all pending backorder shipments"""
    try:
        backorders = crud.get_pending_backorders(db, patient_id=patient_id)
        return {"backorders": backorders}
    except Exception as e:
        logger.error(f"Error fetching backorders: {e}")
        return {"backorders": [], "error": str(e)}


@router.get("/alerts")
async def get_alerts(
    patient_id: Optional[int] = None,
    alert_type: Optional[str] = None,
    resolved: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get shipment alerts with optional filters"""
    try:
        alerts = crud.get_alerts(
            db, 
            patient_id=patient_id,
            alert_type=alert_type,
            resolved=resolved == 'true' if resolved else None
        )
        return {"alerts": alerts, "count": len(alerts)}
    except Exception as e:
        logger.error(f"Error fetching alerts: {e}")
        return {"alerts": [], "count": 0, "error": str(e)}


@router.get("/{shipment_id}")
async def get_shipment(
    shipment_id: int,
    db: Session = Depends(get_db)
):
    """Get a specific shipment with all items and receipts"""
    try:
        shipment = crud.get_shipment(db, shipment_id)
        if not shipment:
            raise HTTPException(status_code=404, detail="Shipment not found")
        return shipment
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching shipment {shipment_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{shipment_id}")
async def update_shipment(
    shipment_id: int,
    data: ShipmentUpdate,
    db: Session = Depends(get_db)
):
    """Update a shipment"""
    try:
        update_data = data.model_dump(exclude_unset=True)
        
        # Parse datetime fields
        for field in ['ship_date', 'expected_delivery', 'actual_delivery']:
            if field in update_data and update_data[field]:
                update_data[field] = parse_datetime(update_data[field])
        
        success = crud.update_shipment(db, shipment_id, **update_data)
        return {"success": success}
    except Exception as e:
        logger.error(f"Error updating shipment {shipment_id}: {e}")
        return {"success": False, "error": str(e)}


@router.delete("/{shipment_id}")
async def delete_shipment(
    shipment_id: int,
    db: Session = Depends(get_db)
):
    """Delete a shipment"""
    try:
        success = crud.delete_shipment(db, shipment_id)
        return {"success": success}
    except Exception as e:
        logger.error(f"Error deleting shipment {shipment_id}: {e}")
        return {"success": False, "error": str(e)}


# --- Shipment Items Endpoints ---

@router.post("/{shipment_id}/items")
async def add_shipment_item(
    shipment_id: int,
    data: ShipmentItemCreate,
    db: Session = Depends(get_db)
):
    """Add an item to a shipment"""
    try:
        item = crud.add_shipment_item(
            db,
            shipment_id=shipment_id,
            **data.model_dump()
        )
        
        if item:
            return {"success": True, "id": item.id}
        return {"success": False, "error": "Failed to add item"}
    except Exception as e:
        logger.error(f"Error adding item to shipment {shipment_id}: {e}")
        return {"success": False, "error": str(e)}


@router.put("/{shipment_id}/items/{item_id}")
async def update_shipment_item(
    shipment_id: int,
    item_id: int,
    data: ShipmentItemUpdate,
    db: Session = Depends(get_db)
):
    """Update a shipment item"""
    try:
        update_data = data.model_dump(exclude_unset=True)
        success = crud.update_shipment_item(db, item_id, **update_data)
        return {"success": success}
    except Exception as e:
        logger.error(f"Error updating item {item_id}: {e}")
        return {"success": False, "error": str(e)}


@router.delete("/{shipment_id}/items/{item_id}")
async def delete_shipment_item(
    shipment_id: int,
    item_id: int,
    db: Session = Depends(get_db)
):
    """Delete a shipment item"""
    try:
        success = crud.delete_shipment_item(db, item_id)
        return {"success": success}
    except Exception as e:
        logger.error(f"Error deleting item {item_id}: {e}")
        return {"success": False, "error": str(e)}


# --- Receiving Endpoints ---

@router.post("/{shipment_id}/receive")
async def receive_items(
    shipment_id: int,
    items: List[ReceiveItem],
    user_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Record receipt of one or more items.
    Can be called multiple times for partial receiving across sessions.
    """
    try:
        results = []
        for item_data in items:
            receipt = crud.receive_item(
                db,
                shipment_item_id=item_data.shipment_item_id,
                qty_received=item_data.qty_received,
                received_by=user_id,
                condition=item_data.condition,
                discrepancy_notes=item_data.discrepancy_notes,
                lot_number=item_data.lot_number,
                expiration_date=parse_datetime(item_data.expiration_date)
            )
            
            if receipt:
                results.append({"shipment_item_id": item_data.shipment_item_id, "receipt_id": receipt.id, "success": True})
            else:
                results.append({"shipment_item_id": item_data.shipment_item_id, "success": False})
        
        return {
            "success": all(r['success'] for r in results),
            "results": results
        }
    except Exception as e:
        logger.error(f"Error receiving items for shipment {shipment_id}: {e}")
        return {"success": False, "error": str(e)}


@router.get("/{shipment_id}/items/{item_id}/receipts")
async def get_item_receipts(
    shipment_id: int,
    item_id: int,
    db: Session = Depends(get_db)
):
    """Get all receipts for a specific item"""
    try:
        receipts = crud.get_item_receipts(db, item_id)
        totals = crud.get_total_received(db, item_id)
        return {
            "receipts": receipts,
            "totals": totals
        }
    except Exception as e:
        logger.error(f"Error fetching receipts for item {item_id}: {e}")
        return {"receipts": [], "totals": {}, "error": str(e)}


# --- Finalization Endpoint ---

@router.post("/{shipment_id}/finalize")
async def finalize_shipment(
    shipment_id: int,
    user_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Finalize a shipment:
    - Calculate discrepancies and create alerts
    - Auto-create backorder shipment for B/O items
    - Update status to complete or partial
    """
    try:
        result = crud.finalize_shipment(db, shipment_id, finalized_by=user_id)
        return result
    except Exception as e:
        logger.error(f"Error finalizing shipment {shipment_id}: {e}")
        return {"success": False, "error": str(e)}


# --- Alert Endpoints ---

@router.get("/{shipment_id}/alerts")
async def get_shipment_alerts(
    shipment_id: int,
    db: Session = Depends(get_db)
):
    """Get all alerts for a shipment"""
    try:
        alerts = crud.get_shipment_alerts(db, shipment_id)
        return {"alerts": alerts}
    except Exception as e:
        logger.error(f"Error fetching alerts for shipment {shipment_id}: {e}")
        return {"alerts": [], "error": str(e)}


@router.post("/alerts/{alert_id}/resolve")
async def resolve_alert(
    alert_id: int,
    data: ResolveAlert,
    user_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Mark an alert as resolved"""
    try:
        success = crud.resolve_alert(
            db,
            alert_id,
            resolved_by=user_id,
            resolution_notes=data.resolution_notes
        )
        return {"success": success}
    except Exception as e:
        logger.error(f"Error resolving alert {alert_id}: {e}")
        return {"success": False, "error": str(e)}


@router.post("/alerts/create-followup")
async def create_followup_order(
    data: CreateFollowupOrder,
    user_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Create a follow-up order from one or more unresolved alerts"""
    try:
        result = crud.create_followup_order(
            db,
            alert_ids=data.alert_ids,
            created_by=user_id
        )
        return result
    except Exception as e:
        logger.error(f"Error creating follow-up order: {e}")
        return {"success": False, "error": str(e)}
