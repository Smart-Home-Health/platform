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
DME Shipment API routes for supplies and equipment deliveries
"""
import logging
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Body, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from db import get_db
from dependencies import get_current_user, require_permission
from models.users import User
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
    is_template: bool = False


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
    is_template: Optional[bool] = None


class ShipmentItemCreate(BaseModel):
    equipment_id: Optional[int] = None
    item_number: Optional[str] = None
    item_description: Optional[str] = None
    manufacturer_name: Optional[str] = None
    qty_ordered: int = 0
    qty_shipped: int = 0
    qty_backordered: int = 0
    flagged_missing: bool = False
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
    flagged_missing: Optional[bool] = None
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


class CreateDelivery(BaseModel):
    expected_delivery: Optional[str] = None


class ReconcileItemEntry(BaseModel):
    shipment_item_id: int
    qty_received: int = 0
    qty_shipped: Optional[int] = None
    qty_backordered: Optional[int] = None
    condition: str = 'good'  # good, damaged, wrong_item, short, extra
    discrepancy_notes: Optional[str] = None
    lot_number: Optional[str] = None
    expiration_date: Optional[str] = None


class ReconcileRequest(BaseModel):
    mode: str = 'same_as_usual'  # same_as_usual | itemized
    items: Optional[List[ReconcileItemEntry]] = None
    confirmed_delivery_date: Optional[str] = None


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

@router.post("", dependencies=[Depends(require_permission("shipments.create"))])
async def create_shipment(
    data: ShipmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
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
            created_by=current_user.id,
            is_template=data.is_template
        )
        
        if shipment:
            return {"success": True, "id": shipment.id}
        return {"success": False, "error": "Failed to create shipment"}
    except Exception as e:
        logger.error(f"Error creating shipment: {e}")
        return {"success": False, "error": str(e)}


@router.get("", dependencies=[Depends(require_permission("shipments.read"))])
async def list_shipments(
    patient_id: Optional[int] = None,
    supplier_id: Optional[int] = None,
    status: Optional[str] = None,
    is_backorder: Optional[bool] = None,
    is_template: Optional[bool] = None,
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
            is_template=is_template,
            skip=skip,
            limit=limit
        )
        return {"shipments": shipments}
    except Exception as e:
        logger.error(f"Error listing shipments: {e}")
        return {"shipments": [], "error": str(e)}


@router.get("/backorders", dependencies=[Depends(require_permission("shipments.read"))])
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


@router.get("/alerts", dependencies=[Depends(require_permission("shipments.read"))])
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


@router.get("/inventory", dependencies=[Depends(require_permission("shipments.read"))])
async def get_inventory(
    patient_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Supplies-on-hand summary: per-equipment quantity vs par/reorder levels"""
    try:
        items = crud.get_inventory_summary(db, patient_id=patient_id)
        return {
            "inventory": items,
            "counts": {
                "reorder": sum(1 for i in items if i['status'] == 'reorder'),
                "low": sum(1 for i in items if i['status'] == 'low'),
                "ok": sum(1 for i in items if i['status'] == 'ok'),
            }
        }
    except Exception as e:
        logger.error(f"Error fetching inventory summary: {e}")
        return {"inventory": [], "counts": {}, "error": str(e)}


@router.get("/{shipment_id}", dependencies=[Depends(require_permission("shipments.read"))])
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


@router.put("/{shipment_id}", dependencies=[Depends(require_permission("shipments.update"))])
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


@router.patch("/{shipment_id}", dependencies=[Depends(require_permission("shipments.update"))])
async def patch_shipment(
    shipment_id: int,
    data: ShipmentUpdate,
    db: Session = Depends(get_db)
):
    """Partially update a shipment (e.g., change status)"""
    try:
        update_data = data.model_dump(exclude_unset=True)
        
        # Parse datetime fields if present
        for field in ['ship_date', 'expected_delivery', 'actual_delivery']:
            if field in update_data and update_data[field]:
                update_data[field] = parse_datetime(update_data[field])
        
        success = crud.update_shipment(db, shipment_id, **update_data)
        if success:
            return {"success": True}
        else:
            raise HTTPException(status_code=404, detail="Shipment not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error patching shipment {shipment_id}: {e}")
        return {"success": False, "error": str(e)}


@router.delete("/{shipment_id}", dependencies=[Depends(require_permission("shipments.delete"))])
async def delete_shipment(
    shipment_id: int,
    db: Session = Depends(get_db)
):
    """
    Delete a shipment. Guarded: once anything has been received (receipts
    exist) or the shipment is finalized, deletion is blocked — those updated
    Equipment.quantity, and deleting them would leave inventory inflated.
    (Deleting finalized deliveries needs an inventory-recalc pass first.)
    """
    shipment = db.query(crud.DMEShipment).filter(crud.DMEShipment.id == shipment_id).first()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    if shipment.finalized_at:
        raise HTTPException(
            status_code=409,
            detail="Confirmed deliveries can't be deleted yet — their supplies are already counted in inventory."
        )
    if any(item.receipts for item in shipment.items):
        raise HTTPException(
            status_code=409,
            detail="This delivery has already received items into inventory, so it can't be deleted."
        )

    try:
        success = crud.delete_shipment(db, shipment_id)
        return {"success": success}
    except Exception as e:
        logger.error(f"Error deleting shipment {shipment_id}: {e}")
        return {"success": False, "error": str(e)}


@router.post("/{shipment_id}/copy", dependencies=[Depends(require_permission("shipments.create"))])
async def copy_shipment(
    shipment_id: int,
    db: Session = Depends(get_db)
):
    """Copy a shipment with all items as a new draft"""
    try:
        # Get the original shipment
        original = crud.get_shipment(db, shipment_id)
        if not original:
            raise HTTPException(status_code=404, detail="Shipment not found")
        
        # Create new shipment with same basic info but as draft
        new_shipment = crud.create_shipment(
            db,
            patient_id=original['patient_id'],
            supplier_id=original.get('supplier_id'),
            po_number=None,  # Clear PO number for new shipment
            order_number=None,  # Clear order number
            ship_date=None,
            expected_delivery=None,
            tracking_number=None,
            ship_method=original.get('ship_method'),
            warehouse_loc=original.get('warehouse_loc'),
            notes=f"Copied from shipment #{shipment_id}"
        )
        
        if not new_shipment:
            return {"success": False, "error": "Failed to create new shipment"}
        
        # Copy all items from original shipment
        for item in original.get('items', []):
            crud.add_shipment_item(
                db,
                shipment_id=new_shipment.id,
                equipment_id=item.get('equipment_id'),
                item_number=item.get('item_number'),
                item_description=item.get('item_description'),
                manufacturer_name=item.get('manufacturer_name'),
                qty_ordered=item.get('qty_ordered', 0),
                qty_shipped=0,  # Reset shipped to 0
                qty_backordered=0,  # Reset B/O to 0
                unit_of_measure=item.get('unit_of_measure'),
                unit_description=item.get('unit_description'),
                unit_price=item.get('unit_price'),
                lot_number=None,  # Clear lot number
                notes=item.get('notes')
            )
        
        logger.info(f"Copied shipment {shipment_id} to new shipment {new_shipment.id}")
        return {"success": True, "id": new_shipment.id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error copying shipment {shipment_id}: {e}")
        return {"success": False, "error": str(e)}
        logger.error(f"Error deleting shipment {shipment_id}: {e}")
        return {"success": False, "error": str(e)}


# --- Shipment Items Endpoints ---

@router.post("/{shipment_id}/items", dependencies=[Depends(require_permission("shipments.update"))])
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


@router.post("/{shipment_id}/items/bulk", dependencies=[Depends(require_permission("shipments.update"))])
async def add_shipment_items_bulk(
    shipment_id: int,
    items: List[ShipmentItemCreate],
    db: Session = Depends(get_db)
):
    """
    Add many items in one call — used by the invoice/packing-slip scanner to
    populate a shipment (or standing order) without typing each line.
    """
    shipment = db.query(crud.DMEShipment).filter(crud.DMEShipment.id == shipment_id).first()
    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    created = []
    errors = []
    for entry in items:
        item = crud.add_shipment_item(db, shipment_id=shipment_id, **entry.model_dump())
        if item:
            created.append(item.id)
        else:
            errors.append(entry.item_number or entry.item_description or '?')

    return {
        "success": len(errors) == 0,
        "ids": created,
        "count": len(created),
        **({"errors": errors} if errors else {}),
    }


@router.put("/{shipment_id}/items/{item_id}", dependencies=[Depends(require_permission("shipments.update"))])
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


@router.delete("/{shipment_id}/items/{item_id}", dependencies=[Depends(require_permission("shipments.delete"))])
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

@router.post("/{shipment_id}/receive", dependencies=[Depends(require_permission("shipments.receive"))])
async def receive_items(
    shipment_id: int,
    items: List[ReceiveItem],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
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
                received_by=current_user.id,
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


@router.get("/{shipment_id}/items/{item_id}/receipts", dependencies=[Depends(require_permission("shipments.read"))])
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

@router.post("/{shipment_id}/finalize", dependencies=[Depends(require_permission("shipments.finalize"))])
async def finalize_shipment(
    shipment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Finalize a shipment:
    - Calculate discrepancies and create alerts
    - Auto-create backorder shipment for B/O items
    - Update status to complete or partial
    """
    try:
        result = crud.finalize_shipment(db, shipment_id, finalized_by=current_user.id)
        return result
    except Exception as e:
        logger.error(f"Error finalizing shipment {shipment_id}: {e}")
        return {"success": False, "error": str(e)}


# --- Alert Endpoints ---

@router.get("/{shipment_id}/alerts", dependencies=[Depends(require_permission("shipments.read"))])
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


@router.post("/alerts/{alert_id}/resolve", dependencies=[Depends(require_permission("shipments.update"))])
async def resolve_alert(
    alert_id: int,
    data: ResolveAlert,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Mark an alert as resolved"""
    try:
        success = crud.resolve_alert(
            db,
            alert_id,
            resolved_by=current_user.id,
            resolution_notes=data.resolution_notes
        )
        return {"success": success}
    except Exception as e:
        logger.error(f"Error resolving alert {alert_id}: {e}")
        return {"success": False, "error": str(e)}


@router.post("/alerts/create-followup", dependencies=[Depends(require_permission("shipments.create"))])
async def create_followup_order(
    data: CreateFollowupOrder,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a follow-up order from one or more unresolved alerts"""
    try:
        result = crud.create_followup_order(
            db,
            alert_ids=data.alert_ids,
            created_by=current_user.id
        )
        return result
    except Exception as e:
        logger.error(f"Error creating follow-up order: {e}")
        return {"success": False, "error": str(e)}


# --- Standing Orders (templates) ---

@router.post("/{template_id}/create-delivery", dependencies=[Depends(require_permission("shipments.create"))])
async def create_delivery(
    template_id: int,
    data: CreateDelivery = Body(default=CreateDelivery()),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a delivery from a standing-order template ("the usual order")"""
    try:
        result = crud.create_delivery_from_template(
            db,
            template_id=template_id,
            expected_delivery=parse_datetime(data.expected_delivery),
            created_by=current_user.id
        )
        return result
    except Exception as e:
        logger.error(f"Error creating delivery from template {template_id}: {e}")
        return {"success": False, "error": str(e)}


# --- Reconcile (one-call delivery confirm) ---

@router.post("/{shipment_id}/reconcile", dependencies=[Depends(require_permission("shipments.receive"))])
async def reconcile_shipment(
    shipment_id: int,
    data: ReconcileRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Confirm a delivery in one call: record receipts ('same_as_usual' receives
    every line in full; 'itemized' applies per-line quantities/conditions from
    the packing slip) and finalize — creating discrepancy alerts and the child
    backorder shipment as needed.
    """
    try:
        items = None
        if data.items is not None:
            items = []
            for entry in data.items:
                d = entry.model_dump()
                d['expiration_date'] = parse_datetime(d.get('expiration_date'))
                items.append(d)

        result = crud.reconcile_shipment(
            db,
            shipment_id=shipment_id,
            mode=data.mode,
            items=items,
            confirmed_delivery_date=parse_datetime(data.confirmed_delivery_date),
            user_id=current_user.id
        )
        return result
    except Exception as e:
        logger.error(f"Error reconciling shipment {shipment_id}: {e}")
        return {"success": False, "error": str(e)}


# --- Packing-slip documents ---

# Keep uploads sane for photos/PDFs of packing slips.
MAX_DOCUMENT_BYTES = 20 * 1024 * 1024
ALLOWED_DOCUMENT_TYPES = {"image/jpeg", "image/png", "application/pdf"}


@router.post("/{shipment_id}/documents", dependencies=[Depends(require_permission("shipments.update"))])
async def upload_shipment_document(
    shipment_id: int,
    file: UploadFile = File(...),
    page_number: Optional[int] = Form(None),
    title: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Attach a packing-slip image/PDF to a shipment (repeat for multi-page slips)"""
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type not in ALLOWED_DOCUMENT_TYPES:
        raise HTTPException(status_code=415, detail="Only JPEG, PNG, or PDF packing slips are supported")

    content = await file.read()
    if len(content) > MAX_DOCUMENT_BYTES:
        raise HTTPException(status_code=413, detail="File too large (20 MB max)")

    doc = crud.add_shipment_document(
        db,
        shipment_id=shipment_id,
        content=content,
        content_type=content_type,
        title=title or file.filename,
        page_number=page_number,
        uploaded_by=current_user.id
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Shipment not found")
    return {"success": True, "document": doc}


@router.get("/{shipment_id}/documents", dependencies=[Depends(require_permission("shipments.read"))])
async def list_shipment_documents(
    shipment_id: int,
    db: Session = Depends(get_db)
):
    """List packing-slip documents attached to a shipment"""
    return {"documents": crud.list_shipment_documents(db, shipment_id)}


@router.get("/{shipment_id}/documents/{document_id}/raw", dependencies=[Depends(require_permission("shipments.read"))])
async def get_shipment_document_raw(
    shipment_id: int,
    document_id: int,
    db: Session = Depends(get_db)
):
    """Serve the stored packing-slip blob for inline viewing"""
    doc = crud.get_shipment_document(db, shipment_id, document_id)
    if not doc or not doc.file_path:
        raise HTTPException(status_code=404, detail="Document not found")
    return FileResponse(doc.file_path, media_type=doc.content_type or "application/octet-stream")


@router.delete("/{shipment_id}/documents/{document_id}", dependencies=[Depends(require_permission("shipments.delete"))])
async def delete_shipment_document(
    shipment_id: int,
    document_id: int,
    db: Session = Depends(get_db)
):
    """Delete a packing-slip document (blob + metadata)"""
    success = crud.delete_shipment_document(db, shipment_id, document_id)
    if not success:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"success": True}
