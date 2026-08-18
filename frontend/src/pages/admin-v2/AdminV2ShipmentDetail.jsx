/*
 * Smart Home Health
 * Copyright (C) 2026 John Carty
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import {
  PlusIcon,
  EquipmentIcon,
  CheckIcon,
  AlertIcon,
  ChevronLeftIcon,
  CameraIcon,
  PackageIcon,
  FileTextIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  XIcon,
  EditIcon,
  TrashIcon,
  BarcodeIcon
} from '../../components/Icons';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { Field, FormRow } from '@/components/ui/field';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { shipmentService } from '../../services/shipments';
import { sessionGet, sessionSet, sessionClear } from '../../lib/sessionState';
import PackingSlipCapture from './components/PackingSlipCapture';
import CsvItemImport from './components/CsvItemImport';
import ScannerChoiceDialog from './components/ScannerChoiceDialog';
import ExternalScanDialog from './components/ExternalScanDialog';
import { parseSlipBarcode } from '../../lib/slipScanner';
import './AdminV2.css';

const CONDITION_OPTIONS = [
  { value: 'good', label: 'Good' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'wrong_item', label: 'Wrong Item' },
  { value: 'short', label: 'Short (Missing)' },
  { value: 'extra', label: 'Extra (Unexpected)' },
];

// Mini labeled field for compact side-by-side quantity inputs (module scope
// so re-renders don't remount inputs and steal focus mid-typing).
const QtyField = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
    <span
      className="admin-v2-text-muted"
      style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}
    >
      {label}
    </span>
    {children}
  </div>
);

const AdminV2ShipmentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const {
    patients,
    selectedPatient: contextPatient,
    selectPatient: setContextPatient
  } = useAdminPatient();
  
  const selectedPatient = contextPatient;

  // Shipment data
  const [shipment, setShipment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Equipment list for adding items
  const [equipment, setEquipment] = useState([]);
  
  // Add/Edit Item Modal (editingItemId null = adding)
  const EMPTY_ITEM_FORM = {
    equipment_id: '',
    item_number: '',
    item_description: '',
    manufacturer_name: '',
    qty_ordered: 1,
    qty_shipped: 0,
    qty_backordered: 0,
    flagged_missing: false,
    unit_of_measure: '',
    unit_description: ''
  };
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [itemFormData, setItemFormData] = useState(EMPTY_ITEM_FORM);
  const [itemFormError, setItemFormError] = useState(null);
  const [savingItem, setSavingItem] = useState(false);
  
  // Receiving state - one entry per item
  const [receiveData, setReceiveData] = useState({});
  const [savingReceive, setSavingReceive] = useState(false);
  
  // Receiving mode - edit all items at once
  const [receivingMode, setReceivingMode] = useState(false);
  const [itemEdits, setItemEdits] = useState({});
  const [savingItems, setSavingItems] = useState(false);
  
  // Draft editing state
  const [draftEdits, setDraftEdits] = useState({});
  
  // Finalize state
  const [finalizing, setFinalizing] = useState(false);

  // Delivery-confirm flow (the common path: box arrived -> confirm)
  const [confirming, setConfirming] = useState(false);
  const [confirmResult, setConfirmResult] = useState(null);
  const [showCapture, setShowCapture] = useState(false);
  const [reviewItems, setReviewItems] = useState(null); // editable grid after a scan / "adjust"
  // Scanned lines that didn't match an item by number: suggestions the user
  // maps (add as new / attach to an item / skip). Monthly orders arrive as
  // 5-6 separate slips, so unmatched lines are normal, not noise.
  const [scanExtras, setScanExtras] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [creatingDelivery, setCreatingDelivery] = useState(false);

  // Invoice import: scan an invoice to ADD line items instead of typing them
  const [captureMode, setCaptureMode] = useState('confirm'); // 'confirm' | 'import'
  const [newItemDrafts, setNewItemDrafts] = useState(null);  // editable rows pending bulk save
  const [savingBulk, setSavingBulk] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [importChooserOpen, setImportChooserOpen] = useState(false); // camera-vs-external before an import scan
  const [showExternalImport, setShowExternalImport] = useState(false); // wedge-scan invoice line barcodes

  // --- Import-session persistence -------------------------------------------
  // Mobile browsers discard background tabs (hopping to Photos mid-import),
  // reloading the SPA and wiping React state. Checkpoint the in-progress
  // import to sessionStorage and restore it once the shipment loads.
  const sessionRestoredRef = useRef(false);
  const importSessionKeys = () => [`drafts:${id}`, `review:${id}`, `extras:${id}`, `capture:${id}`, `scan:${id}`];

  useEffect(() => {
    if (!shipment || sessionRestoredRef.current) return;
    sessionRestoredRef.current = true;
    if (shipment.finalized_at) {
      sessionClear(...importSessionKeys());
      return;
    }
    const drafts = sessionGet(`drafts:${id}`);
    if (drafts) setNewItemDrafts(drafts);
    const review = sessionGet(`review:${id}`);
    if (review) setReviewItems(review);
    const extras = sessionGet(`extras:${id}`);
    if (extras) setScanExtras(extras);
    const capture = sessionGet(`capture:${id}`);
    if (capture?.open) {
      setCaptureMode(capture.mode || 'confirm');
      setShowCapture(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipment]);

  useEffect(() => {
    if (sessionRestoredRef.current) sessionSet(`drafts:${id}`, newItemDrafts);
  }, [id, newItemDrafts]);
  useEffect(() => {
    if (sessionRestoredRef.current) sessionSet(`review:${id}`, reviewItems);
  }, [id, reviewItems]);
  useEffect(() => {
    if (sessionRestoredRef.current) sessionSet(`extras:${id}`, scanExtras);
  }, [id, scanExtras]);
  useEffect(() => {
    if (sessionRestoredRef.current) {
      sessionSet(`capture:${id}`, showCapture ? { open: true, mode: captureMode } : null);
    }
  }, [id, showCapture, captureMode]);

  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.is_system_admin) return true;
    return user.permissions?.includes(permission) || false;
  };

  // Set patient context from URL
  useEffect(() => {
    const patientId = searchParams.get('patient');
    if (patientId && patients.length > 0) {
      const patient = patients.find(p => p.id === parseInt(patientId));
      if (patient && patient.id !== contextPatient?.id) {
        setContextPatient(patient);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-way URL→context sync; adding contextPatient would re-run on selection change and revert it to the stale URL param
  }, [searchParams, patients]);

  // Fetch shipment details
  useEffect(() => {
    if (id) {
      fetchShipment();
      fetchEquipment();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch helpers are recreated each render; effect is keyed on shipment id change only
  }, [id]);

  const fetchShipment = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${config.apiUrl}/api/shipments/${id}`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setShipment(data);
        
        // Initialize receive data for items not yet fully received
        const initialReceiveData = {};
        (data.items || []).forEach(item => {
          const totalReceived = (item.receipts || []).reduce((sum, r) => sum + r.qty_received, 0);
          const remaining = item.qty_shipped - totalReceived;
          if (remaining > 0) {
            initialReceiveData[item.id] = {
              qty_received: remaining,
              condition: 'good',
              lot_number: '',
              expiration_date: '',
              discrepancy_notes: ''
            };
          }
        });
        setReceiveData(initialReceiveData);
      } else {
        setError('Shipment not found');
      }
    } catch (err) {
      setError('Error loading shipment');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchEquipment = async () => {
    if (!selectedPatient) return;
    try {
      const response = await fetch(`${config.apiUrl}/api/equipment?patient_id=${selectedPatient.id}`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setEquipment(data.equipment || data || []);
      }
    } catch (err) {
      console.error('Error fetching equipment:', err);
    }
  };

  // Update equipment when patient context is set
  useEffect(() => {
    if (selectedPatient) {
      fetchEquipment();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch helper is recreated each render; effect is keyed on patient change only
  }, [selectedPatient]);

  const handleAddItem = async (e) => {
    e.preventDefault();
    setSavingItem(true);
    setItemFormError(null);

    try {
      const payload = {
        ...itemFormData,
        equipment_id: itemFormData.equipment_id ? parseInt(itemFormData.equipment_id) : null,
        qty_ordered: parseInt(itemFormData.qty_ordered) || 0,
        qty_shipped: parseInt(itemFormData.qty_shipped) || 0,
        qty_backordered: parseInt(itemFormData.qty_backordered) || 0,
        flagged_missing: !!itemFormData.flagged_missing
      };

      if (editingItemId) {
        await shipmentService.updateItem(id, editingItemId, payload);
      } else {
        const response = await fetch(`${config.apiUrl}/api/shipments/${id}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || 'Failed to add item');
        }
      }

      closeItemModal();
      fetchShipment();
    } catch (err) {
      setItemFormError(err.message || 'Error connecting to server');
    } finally {
      setSavingItem(false);
    }
  };

  const closeItemModal = () => {
    setShowAddItemModal(false);
    setEditingItemId(null);
    setItemFormData(EMPTY_ITEM_FORM);
    setItemFormError(null);
  };

  const openEditItem = (item) => {
    setEditingItemId(item.id);
    setItemFormData({
      equipment_id: item.equipment_id ? String(item.equipment_id) : '',
      item_number: item.item_number || '',
      item_description: item.item_description || '',
      manufacturer_name: item.manufacturer_name || '',
      qty_ordered: item.qty_ordered ?? 0,
      qty_shipped: item.qty_shipped ?? 0,
      qty_backordered: item.qty_backordered ?? 0,
      flagged_missing: !!item.flagged_missing,
      unit_of_measure: item.unit_of_measure || '',
      unit_description: item.unit_description || ''
    });
    setItemFormError(null);
    setShowAddItemModal(true);
  };

  const handleDeleteItem = async (item) => {
    const label = item.item_description || item.equipment_name || item.item_number || 'this item';
    if (!window.confirm(`Remove ${label} from this list?`)) return;
    try {
      await shipmentService.deleteItem(id, item.id);
      fetchShipment();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleReceiveItem = async (itemId) => {
    const data = receiveData[itemId];
    if (!data) return;
    
    setSavingReceive(true);
    
    try {
      const payload = {
        shipment_item_id: itemId,
        qty_received: parseInt(data.qty_received) || 0,
        condition: data.condition,
        lot_number: data.lot_number || null,
        expiration_date: data.expiration_date || null,
        discrepancy_notes: data.discrepancy_notes || null
      };
      
      const response = await fetch(`${config.apiUrl}/api/shipments/${id}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      
      if (response.ok) {
        fetchShipment();
      } else {
        const errData = await response.json();
        alert(errData.error || 'Failed to record receipt');
      }
    } catch (err) {
      console.error('Error receiving item:', err);
      alert('Error connecting to server');
    } finally {
      setSavingReceive(false);
    }
  };

  const handleMarkAsOrdered = async () => {
    if (!window.confirm('Mark this shipment as Ordered? You can still edit items after marking as ordered.')) {
      return;
    }
    
    try {
      const response = await fetch(`${config.apiUrl}/api/shipments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'ordered' })
      });
      
      if (response.ok) {
        fetchShipment();
      } else {
        const errData = await response.json();
        alert(errData.error || 'Failed to update shipment status');
      }
    } catch (err) {
      console.error('Error updating shipment:', err);
      alert('Error connecting to server');
    }
  };

  const updateDraftField = (field, value) => {
    setDraftEdits(prev => ({ ...prev, [field]: value }));
  };

  const saveDraftField = async (field) => {
    const value = draftEdits[field];
    if (value === undefined) return;

    try {
      const response = await fetch(`${config.apiUrl}/api/shipments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ [field]: value || null })
      });
      
      if (response.ok) {
        fetchShipment();
        // Clear the edit for this field
        setDraftEdits(prev => {
          const { [field]: _, ...rest } = prev;
          return rest;
        });
      } else {
        const errData = await response.json();
        alert(errData.error || 'Failed to save');
      }
    } catch (err) {
      console.error('Error saving field:', err);
      alert('Error connecting to server');
    }
  };

  const handleBeginReceiving = async () => {
    // Pre-fill item edits assuming order is OK
    const edits = {};
    (shipment.items || []).forEach(item => {
      edits[item.id] = {
        qty_shipped: item.qty_ordered,
        qty_backordered: 0,
        qty_received: item.qty_ordered
      };
    });
    setItemEdits(edits);
    setReceivingMode(true);
    
    // Update status to receiving
    try {
      await fetch(`${config.apiUrl}/api/shipments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'receiving' })
      });
      fetchShipment();
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  const updateItemEdit = (itemId, field, value) => {
    setItemEdits(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: field === 'flagged_missing' ? !!value : (parseInt(value) || 0)
      }
    }));
  };

  const handleSaveReceiving = async () => {
    setSavingItems(true);
    
    try {
      // Update each item's quantities
      for (const [itemId, edits] of Object.entries(itemEdits)) {
        await fetch(`${config.apiUrl}/api/shipments/${id}/items/${itemId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            qty_shipped: edits.qty_shipped,
            qty_backordered: edits.qty_backordered,
            ...(edits.flagged_missing !== undefined ? { flagged_missing: edits.flagged_missing } : {})
          })
        });
        
        // Record receipt for received quantity
        if (edits.qty_received > 0) {
          await fetch(`${config.apiUrl}/api/shipments/${id}/receive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              shipment_item_id: parseInt(itemId),
              qty_received: edits.qty_received,
              condition: 'good'
            })
          });
        }
      }
      
      // Update status to complete
      await fetch(`${config.apiUrl}/api/shipments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'complete' })
      });
      
      setReceivingMode(false);
      setItemEdits({});
      fetchShipment();
    } catch (err) {
      console.error('Error saving receiving data:', err);
      alert('Error saving changes');
    } finally {
      setSavingItems(false);
    }
  };

  const handleFinalizeShipment = async () => {
    if (!window.confirm('Finalize this shipment? This will create backorder shipments and alerts for any discrepancies.')) {
      return;
    }
    
    setFinalizing(true);
    
    try {
      const response = await fetch(`${config.apiUrl}/api/shipments/${id}/finalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      
      if (response.ok) {
        const result = await response.json();
        fetchShipment();
        
        // Show summary of what was created
        let msg = 'Shipment finalized!';
        if (result.backorder_shipment_id) {
          msg += `\nBackorder shipment #${result.backorder_shipment_id} created.`;
        }
        if (result.alerts_created > 0) {
          msg += `\n${result.alerts_created} alert(s) created for discrepancies.`;
        }
        alert(msg);
      } else {
        const errData = await response.json();
        alert(errData.error || 'Failed to finalize shipment');
      }
    } catch (err) {
      console.error('Error finalizing shipment:', err);
      alert('Error connecting to server');
    } finally {
      setFinalizing(false);
    }
  };

  // --- Delivery-confirm flow -------------------------------------------------
  // "Everything came as usual" — one call, zero per-line entry.
  const handleConfirmAsUsual = async () => {
    setConfirming(true);
    setError(null);
    try {
      const result = await shipmentService.reconcileShipment(id, { mode: 'same_as_usual' });
      if (result.success) {
        setConfirmResult(result);
        setReviewItems(null);
        sessionClear(...importSessionKeys());
        fetchShipment();
      } else {
        setConfirmResult({ success: false, error: result.error });
      }
    } catch (err) {
      setConfirmResult({ success: false, error: err.message });
    } finally {
      setConfirming(false);
    }
  };

  // Open the editable review grid, optionally seeded by resolved scan lines.
  // Lines matched by item number sum into that item's "arrived" count (the
  // same supply often splits across several boxes/slips).
  const openReview = (resolvedLines = null) => {
    const arrivedById = new Map();
    const sourceById = new Map();
    for (const line of resolvedLines || []) {
      if (line.matchType === 'number') {
        arrivedById.set(line.shipment_item_id,
          (arrivedById.get(line.shipment_item_id) || 0) + (line.qty || 0));
        sourceById.set(line.shipment_item_id, line.source);
      }
    }
    setReviewItems(
      (shipment.items || []).map((item) => {
        const scanned = arrivedById.has(item.id);
        const arrived = scanned
          ? arrivedById.get(item.id)
          : (item.qty_shipped ?? item.qty_ordered ?? 0);
        return {
          shipment_item_id: item.id,
          label: item.item_description || item.equipment_name || item.item_number || `Item ${item.id}`,
          item_number: item.item_number,
          qty_ordered: item.qty_ordered,
          qty_received: arrived,
          qty_backordered: Math.max(0, (item.qty_ordered || 0) - arrived),
          condition: 'good',
          matched: scanned ? (sourceById.get(item.id) === 'barcode' ? 'barcode' : 'ocr') : null,
        };
      })
    );
    // Lines the number match didn't claim become mapping suggestions:
    // best name match preselected, otherwise "add as new item".
    setScanExtras(
      (resolvedLines || [])
        .filter((line) => line.matchType !== 'number')
        .map((line, i) => ({
          key: `${line.itemNumber}-${i}`,
          line,
          item_number: line.itemNumber || '',
          item_description: line.description || '',
          qty_ordered: line.qtyOrdered ?? line.qty ?? 1,
          qty_shipped: line.qtyShipped ?? line.qty ?? 1,
          qty_backordered: line.qtyToFollow ?? 0,
          action: line.matchType === 'name' ? String(line.shipment_item_id) : 'new',
        }))
    );
    setConfirmResult(null);
  };

  const handleScanComplete = async ({ barcodes, ocrItems }) => {
    setShowCapture(false);
    if (captureMode === 'import') {
      const { buildNewItems } = await import('../../lib/slipScanner');
      const drafts = buildNewItems(barcodes, ocrItems, shipment.items || [], equipment);
      setNewItemDrafts(drafts);
    } else {
      const { buildScanLines, resolveScanLines } = await import('../../lib/slipScanner');
      const lines = buildScanLines(barcodes, ocrItems);
      openReview(resolveScanLines(lines, shipment.items || []));
    }
    fetchShipment(); // pick up the attached slip pages
  };

  // External-scanner import: raw line barcodes only (no photos, no OCR).
  // Unlike the camera dialog — which accumulates pages internally — each
  // wedge session hands over a fresh list, so merge into any drafts already
  // on screen instead of replacing them.
  const handleExternalImport = async (barcodes) => {
    setShowExternalImport(false);
    const { buildNewItems } = await import('../../lib/slipScanner');
    const drafts = buildNewItems(barcodes, [], shipment.items || [], equipment);
    setNewItemDrafts((prev) => {
      if (!prev) return drafts;
      const known = new Set(prev.map((d) => (d.item_number || '').trim()).filter(Boolean));
      return [...prev, ...drafts.filter((d) => !known.has((d.item_number || '').trim()))];
    });
  };

  const updateScanExtra = (key, patch) => {
    setScanExtras((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  };

  // OCR occasionally invents rows (mangled line fragments) — let them die fast.
  const removeScanExtra = (key) => {
    setScanExtras((prev) => prev.filter((e) => e.key !== key));
  };

  const updateNewItemDraft = (index, field, value) => {
    setNewItemDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, [field]: value } : d)));
  };

  const removeNewItemDraft = (index) => {
    setNewItemDrafts((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveNewItems = async () => {
    setSavingBulk(true);
    try {
      const items = newItemDrafts.map((d) => ({
        item_number: d.item_number || null,
        item_description: d.item_description || null,
        qty_ordered: parseInt(d.qty_ordered, 10) || 0,
        qty_shipped: parseInt(d.qty_shipped ?? d.qty_ordered, 10) || 0,
        qty_backordered: parseInt(d.qty_backordered, 10) || 0,
        unit_of_measure: d.unit_of_measure || null,
        equipment_id: d.equipment_id || null,
      }));
      const result = await shipmentService.bulkAddItems(id, items);
      if (result.success || result.count > 0) {
        // Make the reconciliation stick: when a line was linked to one of our
        // supplies that doesn't know its supplier item number yet, save the
        // number onto the equipment — next month's scan auto-links by number,
        // even if the distributor swaps brands and the printed name changes.
        for (const d of newItemDrafts) {
          if (!d.equipment_id || !d.item_number) continue;
          const eq = equipment.find((e) => e.id === d.equipment_id);
          if (eq && !eq.item_number) {
            try {
              await fetch(`${config.apiUrl}/api/equipment/${eq.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ item_number: d.item_number }),
              });
            } catch { /* non-fatal: linking still worked for this delivery */ }
          }
        }
        setNewItemDrafts(null);
        sessionClear(...importSessionKeys());
        fetchShipment();
        fetchEquipment();
      } else {
        alert(result.error || 'Failed to add items');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingBulk(false);
    }
  };

  const updateReviewItem = (itemId, field, value) => {
    setReviewItems((prev) => prev.map((r) => (
      r.shipment_item_id === itemId ? { ...r, [field]: value } : r
    )));
  };

  // Save the review grid: arrived + "coming later" per line, one reconcile call.
  // qty_shipped is derived as ordered - coming-later, so anything arrived short
  // of that is flagged as missing by the existing finalize logic.
  const handleSaveReview = async () => {
    setConfirming(true);
    try {
      const items = reviewItems.map((r) => ({
        shipment_item_id: r.shipment_item_id,
        qty_received: parseInt(r.qty_received, 10) || 0,
        qty_backordered: parseInt(r.qty_backordered, 10) || 0,
        qty_shipped: Math.max(0, (r.qty_ordered || 0) - (parseInt(r.qty_backordered, 10) || 0)),
        condition: r.condition || 'good',
      }));

      // Fold in the user's mapping decisions for unmatched scan lines.
      // (?? e.qty covers sessions checkpointed before the three-field shape.)
      const extras = scanExtras || [];
      const extraShipped = (e) => parseInt(e.qty_shipped ?? e.qty, 10) || 0;
      const newLines = extras.filter((e) => e.action === 'new');
      for (const e of extras) {
        if (e.action === 'skip' || e.action === 'new') continue;
        const target = items.find((it) => it.shipment_item_id === parseInt(e.action, 10));
        if (target) target.qty_received += extraShipped(e); // what arrived in this box
      }
      if (newLines.length > 0) {
        const res = await shipmentService.bulkAddItems(id, newLines.map((e) => ({
          item_number: (e.item_number ?? e.line.itemNumber) || null,
          item_description: (e.item_description ?? e.line.description) || null,
          qty_ordered: parseInt(e.qty_ordered ?? e.qty, 10) || 0,
          qty_shipped: extraShipped(e),
          qty_backordered: parseInt(e.qty_backordered, 10) || 0,
          unit_of_measure: e.line.uom || null,
        })));
        (res.ids || []).forEach((newId, i) => {
          const e = newLines[i];
          items.push({
            shipment_item_id: newId,
            qty_received: extraShipped(e),
            qty_backordered: parseInt(e.qty_backordered, 10) || 0,
            qty_shipped: extraShipped(e),
            condition: 'good',
          });
        });
      }

      const result = await shipmentService.reconcileShipment(id, { mode: 'itemized', items });
      if (result.success) {
        setConfirmResult(result);
        setReviewItems(null);
        setScanExtras(null);
        sessionClear(...importSessionKeys());
        fetchShipment();
      } else {
        setConfirmResult({ success: false, error: result.error });
      }
    } catch (err) {
      setConfirmResult({ success: false, error: err.message });
    } finally {
      setConfirming(false);
    }
  };

  // Remove a packing-slip photo (e.g. duplicate or abandoned scan attempts).
  const handleDeleteDocument = async (doc) => {
    if (!window.confirm(`Remove ${doc.title || 'this slip photo'}?`)) return;
    try {
      const result = await shipmentService.deleteDocument(id, doc.id);
      if (result.success) {
        fetchShipment();
      } else {
        alert(result.error || 'Failed to remove the photo');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // Delete an unstarted shipment. The backend refuses once receipts exist or
  // the delivery is finalized (inventory already counted those supplies).
  const handleDeleteShipment = async () => {
    const what = shipment.is_template ? 'this usual order' : 'this delivery';
    if (!window.confirm(`Delete ${what}? This can't be undone.`)) return;
    try {
      const result = await shipmentService.deleteShipment(id);
      if (result.success) {
        navigate(`/care/equipment/shipments?patient=${selectedPatient?.id}`);
      } else {
        alert(result.error || 'Failed to delete');
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // Template ("usual order") -> spawn this month's delivery.
  const handleCreateDelivery = async () => {
    setCreatingDelivery(true);
    try {
      const result = await shipmentService.createDeliveryFromTemplate(id);
      if (result.success) {
        navigate(`/care/equipment/shipments/${result.id}?patient=${selectedPatient?.id}`);
      } else {
        alert(result.error || 'Failed to create delivery');
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setCreatingDelivery(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString();
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'draft': return 'admin-v2-badge-warning';
      case 'ordered': return 'admin-v2-badge-secondary';
      case 'shipped': return 'admin-v2-badge-info';
      case 'receiving': return 'admin-v2-badge-warning';
      case 'complete': return 'admin-v2-badge-success';
      case 'partial': return 'admin-v2-badge-danger';
      case 'verified': return 'admin-v2-badge-success';
      default: return 'admin-v2-badge-secondary';
    }
  };

  const getConditionBadgeClass = (condition) => {
    switch (condition) {
      case 'good': return 'admin-v2-badge-success';
      case 'damaged': return 'admin-v2-badge-danger';
      case 'wrong_item': return 'admin-v2-badge-danger';
      case 'short': return 'admin-v2-badge-warning';
      case 'extra': return 'admin-v2-badge-info';
      default: return 'admin-v2-badge-secondary';
    }
  };

  const updateReceiveData = (itemId, field, value) => {
    setReceiveData(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value
      }
    }));
  };

  // Calculate item stats
  const getItemStats = (item) => {
    const totalReceived = (item.receipts || []).reduce((sum, r) => sum + r.qty_received, 0);
    const remaining = item.qty_shipped - totalReceived;
    return { totalReceived, remaining };
  };

  if (loading) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-loading">Loading shipment...</div>
      </AdminV2Layout>
    );
  }

  if (error || !shipment) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-page tw flex flex-col items-start gap-4">
          <Alert variant="destructive">{error || 'Shipment not found'}</Alert>
          <Button
            variant="secondary"
            onClick={() => navigate(`/care/equipment/shipments?patient=${selectedPatient?.id}`)}
          >
            <ChevronLeftIcon size={16} /> Back to Shipments
          </Button>
        </div>
      </AdminV2Layout>
    );
  }

  const isDraft = shipment.status === 'draft';
  const isOrdered = shipment.status === 'ordered';
  const canMarkOrdered = isDraft && shipment.items?.length > 0;
  const canBeginReceiving = isOrdered && shipment.items?.length > 0;
  const canReceive = ['shipped', 'receiving'].includes(shipment.status) && showAdvanced;
  const canFinalize = ['receiving'].includes(shipment.status) && shipment.items?.length > 0;
  const isFinalized = ['complete', 'partial', 'verified'].includes(shipment.status);
  const isTemplate = !!shipment.is_template;
  // The common path: a real (non-template) delivery that hasn't been confirmed yet.
  const canConfirm = !isTemplate && !isFinalized && shipment.items?.length > 0
    && hasPermission('equipment.update');
  // Rows stay editable until the delivery is confirmed (and always on templates).
  const canEditItems = hasPermission('equipment.update') && !isFinalized && !receivingMode;

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {/* Back Button & Header */}
        <div className="admin-v2-page-header tw flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate(`/care/equipment/shipments?patient=${selectedPatient?.id}`)}
          >
            <ChevronLeftIcon size={16} /> Back
          </Button>
          {hasPermission('equipment.delete') && !isFinalized
            && !shipment.items?.some((i) => i.receipts?.length > 0) && (
            <Button variant="ghost" onClick={handleDeleteShipment} title="Delete this shipment">
              <TrashIcon size={16} /> Delete
            </Button>
          )}
        </div>

        {/* Shipment Header */}
        <div className="admin-v2-detail-header">
          <div className="admin-v2-detail-title">
            <h1>
              {shipment.order_number || shipment.po_number || `Shipment #${shipment.id}`}
              {shipment.is_backorder && (
                <span className="admin-v2-badge admin-v2-badge-warning" style={{ marginLeft: '12px' }}>
                  Backorder
                </span>
              )}
            </h1>
            <span className={`admin-v2-badge ${getStatusBadgeClass(shipment.status)}`}>
              {shipment.status}
            </span>
          </div>
          <div className="admin-v2-detail-meta">
            <span><strong>Supplier:</strong> {shipment.supplier_name || '-'}</span>
            {isDraft ? (
              <>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <strong>PO:</strong>
                  <input
                    type="text"
                    value={draftEdits.po_number ?? shipment.po_number ?? ''}
                    onChange={e => updateDraftField('po_number', e.target.value)}
                    onBlur={() => saveDraftField('po_number')}
                    placeholder="Enter PO #"
                    style={{ width: '120px', padding: '4px 8px', background: 'var(--admin-input-bg)', border: '1px solid var(--admin-border)', borderRadius: '4px', color: 'inherit' }}
                  />
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <strong>Order #:</strong>
                  <input
                    type="text"
                    value={draftEdits.order_number ?? shipment.order_number ?? ''}
                    onChange={e => updateDraftField('order_number', e.target.value)}
                    onBlur={() => saveDraftField('order_number')}
                    placeholder="Enter Order #"
                    style={{ width: '120px', padding: '4px 8px', background: 'var(--admin-input-bg)', border: '1px solid var(--admin-border)', borderRadius: '4px', color: 'inherit' }}
                  />
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <strong>Ship Date:</strong>
                  <input
                    type="date"
                    value={draftEdits.ship_date ?? (shipment.ship_date ? shipment.ship_date.split('T')[0] : '')}
                    onChange={e => updateDraftField('ship_date', e.target.value)}
                    onBlur={() => saveDraftField('ship_date')}
                    style={{ padding: '4px 8px', background: 'var(--admin-input-bg)', border: '1px solid var(--admin-border)', borderRadius: '4px', color: 'inherit' }}
                  />
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <strong>Expected:</strong>
                  <input
                    type="date"
                    value={draftEdits.expected_delivery ?? (shipment.expected_delivery ? shipment.expected_delivery.split('T')[0] : '')}
                    onChange={e => updateDraftField('expected_delivery', e.target.value)}
                    onBlur={() => saveDraftField('expected_delivery')}
                    style={{ padding: '4px 8px', background: 'var(--admin-input-bg)', border: '1px solid var(--admin-border)', borderRadius: '4px', color: 'inherit' }}
                  />
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <strong>Tracking:</strong>
                  <input
                    type="text"
                    value={draftEdits.tracking_number ?? shipment.tracking_number ?? ''}
                    onChange={e => updateDraftField('tracking_number', e.target.value)}
                    onBlur={() => saveDraftField('tracking_number')}
                    placeholder="Enter tracking #"
                    style={{ width: '150px', padding: '4px 8px', background: 'var(--admin-input-bg)', border: '1px solid var(--admin-border)', borderRadius: '4px', color: 'inherit' }}
                  />
                </span>
              </>
            ) : (
              <>
                <span><strong>PO:</strong> {shipment.po_number || '-'}</span>
                <span><strong>Ship Date:</strong> {formatDate(shipment.ship_date)}</span>
                <span><strong>Expected:</strong> {formatDate(shipment.expected_delivery)}</span>
                {shipment.tracking_number && (
                  <span><strong>Tracking:</strong> {shipment.tracking_number}</span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Alerts Section */}
        {shipment.alerts && shipment.alerts.length > 0 && (
          <div className="admin-v2-alerts-section">
            <h3><AlertIcon size={16} /> Alerts</h3>
            <div className="admin-v2-alerts-list">
              {shipment.alerts.map(alert => (
                <div key={alert.id} className={`admin-v2-alert-item ${alert.resolved ? 'resolved' : ''}`}>
                  <span className="admin-v2-badge admin-v2-badge-danger">{alert.alert_type}</span>
                  <span>{alert.equipment_name || alert.item_number || 'Item'}</span>
                  <span>Expected: {alert.expected_qty}, Actual: {alert.actual_qty}</span>
                  {alert.resolved && <span className="admin-v2-badge admin-v2-badge-success">Resolved</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Standing order ("usual order") banner */}
        {isTemplate && (
          <div className="admin-v2-info-banner">
            <div className="admin-v2-info-content">
              <strong>This is the usual order</strong>
              <p>These are the supplies that normally arrive. When a box shows up, start here.</p>
            </div>
            {hasPermission('equipment.create') && (
              <div className="tw">
                <Button size="lg" onClick={handleCreateDelivery} disabled={creatingDelivery}>
                  <PackageIcon size={16} /> {creatingDelivery ? 'One moment…' : 'A delivery arrived — start here'}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Delivery-confirm panel — the common path */}
        {canConfirm && !reviewItems && (
          <div className="admin-v2-info-banner">
            <div className="admin-v2-info-content">
              <strong>Did a delivery arrive?</strong>
              <p>
                If everything on the slip matches what came in the box, one tap is all it takes.
                Scanning the slip checks items off for you.
              </p>
            </div>
            <div className="tw flex flex-wrap gap-2">
              <Button size="lg" onClick={handleConfirmAsUsual} disabled={confirming}>
                <CheckIcon size={16} /> {confirming ? 'Saving…' : 'Everything came as usual — Confirm'}
              </Button>
              <Button size="lg" variant="secondary" onClick={() => { setCaptureMode('confirm'); setShowCapture(true); }} disabled={confirming}>
                <CameraIcon size={16} /> Scan the packing slip
              </Button>
              <Button variant="ghost" onClick={() => openReview()} disabled={confirming}>
                Adjust by hand
              </Button>
            </div>
          </div>
        )}

        {/* Post-confirm summary, in plain language */}
        {confirmResult && (
          <div className="admin-v2-info-banner tw">
            {confirmResult.success ? (
              <div className="admin-v2-info-content">
                {confirmResult.status === 'complete' ? (
                  <>
                    <strong><CheckIcon size={14} /> All set!</strong>
                    <p>The delivery is confirmed and your supplies on hand are up to date.</p>
                  </>
                ) : (
                  <>
                    <strong>Saved — a few things need attention</strong>
                    <p>
                      {(confirmResult.alerts || []).filter(a => !a.resolved && a.alert_type === 'short').length > 0 &&
                        'Some items came up missing — we flagged them so you can follow up. '}
                      {confirmResult.backorder_shipment_id &&
                        "Items marked as coming later are being tracked as their own delivery — you'll confirm them when they show up."}
                    </p>
                  </>
                )}
              </div>
            ) : (
              <Alert variant="destructive">{confirmResult.error}</Alert>
            )}
          </div>
        )}

        {/* Review grid: check the numbers before confirming */}
        {reviewItems && (
          <div className="admin-v2-section tw">
            <div className="admin-v2-section-header">
              <h2>Check the numbers</h2>
            </div>
            <p className="admin-v2-text-muted">
              For each item: how many arrived, and how many the slip says are coming later
              (the “To Follow” column). Fix anything that looks off — nothing is saved until you confirm.
            </p>
            {/* NEW lines first — a backorder box often carries items that
                aren't on this delivery's list yet, and they shouldn't hide
                below a page of already-known cards. */}
            {scanExtras?.length > 0 && (
              <>
                <h3>New on this slip ({scanExtras.length})</h3>
                <p className="admin-v2-text-muted">
                  These came off the scan but aren't on the list below (backorder box,
                  substitution, or new supply). Tell us what to do with each one.
                </p>
                <div className="flex flex-col gap-2">
                  {scanExtras.map((e) => (
                    <div key={e.key} className="rounded-lg border border-border bg-card p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div style={{ flex: 1 }}>
                          <textarea
                            rows={2}
                            value={e.item_description ?? e.line.description ?? ''}
                            placeholder="What is it? (fix OCR mistakes here)"
                            onChange={(ev) => updateScanExtra(e.key, { item_description: ev.target.value })}
                            style={{ width: '100%', padding: '8px', resize: 'vertical' }}
                          />
                          <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 6 }}>
                            <input
                              type="text"
                              value={e.item_number ?? e.line.itemNumber ?? ''}
                              placeholder="Item #"
                              onChange={(ev) => updateScanExtra(e.key, { item_number: ev.target.value })}
                              style={{ width: '120px', padding: '8px' }}
                              aria-label="Item number"
                            />
                            {e.line.uom && <span className="admin-v2-text-muted">{e.line.uom}</span>}
                            {e.line.source === 'barcode' && (
                              <span className="admin-v2-badge admin-v2-badge-success">
                                <CheckIcon size={12} /> scanned
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          className="admin-v2-btn admin-v2-btn-sm admin-v2-btn-secondary"
                          onClick={() => removeScanExtra(e.key)}
                          title="Remove this row (OCR mistake)"
                          aria-label="Remove this row"
                        >
                          <XIcon size={14} />
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', marginTop: 8 }}>
                        <QtyField label="Ordered">
                          <input
                            type="number" min="0" inputMode="numeric"
                            value={e.qty_ordered ?? e.qty ?? 1}
                            onChange={(ev) => updateScanExtra(e.key, { qty_ordered: ev.target.value })}
                            style={{ width: '64px', textAlign: 'center', padding: '8px' }}
                          />
                        </QtyField>
                        <QtyField label="Shipped">
                          <input
                            type="number" min="0" inputMode="numeric"
                            value={e.qty_shipped ?? e.qty ?? 1}
                            onChange={(ev) => updateScanExtra(e.key, { qty_shipped: ev.target.value })}
                            style={{ width: '64px', textAlign: 'center', padding: '8px' }}
                          />
                        </QtyField>
                        <QtyField label="B/O">
                          <input
                            type="number" min="0" inputMode="numeric"
                            value={e.qty_backordered ?? 0}
                            onChange={(ev) => updateScanExtra(e.key, { qty_backordered: ev.target.value })}
                            style={{ width: '64px', textAlign: 'center', padding: '8px' }}
                          />
                        </QtyField>
                      </div>
                      <select
                        value={e.action}
                        onChange={(ev) => updateScanExtra(e.key, { action: ev.target.value })}
                        style={{ width: '100%', marginTop: 8, padding: '8px' }}
                      >
                        <option value="new">Add as a new item on this delivery</option>
                        {(shipment.items || []).map((item) => (
                          <option key={item.id} value={String(item.id)}>
                            Count toward: {item.item_description || item.equipment_name || item.item_number || `Item ${item.id}`}
                          </option>
                        ))}
                        <option value="skip">Don't add this one</option>
                      </select>
                    </div>
                  ))}
                </div>
                <h3 style={{ marginTop: 16 }}>Already on this delivery</h3>
              </>
            )}
            <div className="admin-v2-table-container admin-v2-table-cards-wrap">
              <table className="admin-v2-table admin-v2-table-cards">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Quantities</th>
                    <th>Problem?</th>
                  </tr>
                </thead>
                <tbody>
                  {reviewItems.map((r) => (
                    <tr key={r.shipment_item_id}>
                      <td className="admin-v2-cell-name">
                        <div>
                          <strong>{r.label}</strong>
                          {r.matched && (
                            <span className="admin-v2-badge admin-v2-badge-success" style={{ marginLeft: 8 }}>
                              <CheckIcon size={12} /> {r.matched === 'barcode' ? 'scanned' : 'read from slip'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td data-label="Quantities" className="admin-v2-cell-stack">
                        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end' }}>
                          <QtyField label="Expected">
                            <div style={{ padding: '8px 4px', fontWeight: 600 }}>{r.qty_ordered}</div>
                          </QtyField>
                          <QtyField label="Arrived">
                            <input
                              type="number" min="0" inputMode="numeric"
                              value={r.qty_received}
                              onChange={(e) => updateReviewItem(r.shipment_item_id, 'qty_received', e.target.value)}
                              style={{ width: '64px', textAlign: 'center', padding: '8px' }}
                            />
                          </QtyField>
                          <QtyField label="Coming later">
                            <input
                              type="number" min="0" inputMode="numeric"
                              value={r.qty_backordered}
                              onChange={(e) => updateReviewItem(r.shipment_item_id, 'qty_backordered', e.target.value)}
                              style={{ width: '64px', textAlign: 'center', padding: '8px' }}
                            />
                          </QtyField>
                        </div>
                      </td>
                      <td data-label="Problem?">
                        <select
                          value={r.condition}
                          onChange={(e) => updateReviewItem(r.shipment_item_id, 'condition', e.target.value)}
                          style={{ padding: '8px' }}
                        >
                          <option value="good">No problem</option>
                          <option value="damaged">Damaged</option>
                          <option value="wrong_item">Wrong item</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="tw flex gap-2" style={{ marginTop: 12 }}>
              <Button size="lg" onClick={handleSaveReview} disabled={confirming}>
                <CheckIcon size={16} /> {confirming ? 'Saving…' : 'Confirm delivery'}
              </Button>
              <Button variant="secondary" onClick={() => { setCaptureMode('confirm'); setShowCapture(true); }} disabled={confirming}>
                <CameraIcon size={16} /> Scan more pages
              </Button>
              <Button
                variant="ghost"
                onClick={() => { setReviewItems(null); setScanExtras(null); sessionClear(...importSessionKeys()); }}
                disabled={confirming}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* New items from a scanned invoice: review before adding */}
        {newItemDrafts && (
          <div className="admin-v2-section tw">
            <div className="admin-v2-section-header">
              <h2>Items from the invoice</h2>
            </div>
            {newItemDrafts.length === 0 ? (
              <p className="admin-v2-text-muted">
                No new items found on that scan — every barcode we read is already on this list.
                Try scanning again with more light, or add items by hand.
              </p>
            ) : (
              <>
                <p className="admin-v2-text-muted">
                  Here's what we read off the invoice. Fix anything that looks wrong,
                  remove what you don't want, then add them all at once.
                </p>
                <div className="admin-v2-table-container admin-v2-table-cards-wrap">
                  <table className="admin-v2-table admin-v2-table-cards">
                    <thead>
                      <tr>
                        <th>Item #</th>
                        <th>Their name</th>
                        <th>Our supply</th>
                        <th>Quantities</th>
                        <th style={{ textAlign: 'center' }}>Unit</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {newItemDrafts.map((d, i) => (
                        <tr key={`${d.item_number}-${i}`}>
                          <td className="admin-v2-cell-name">
                            <div>
                              <input
                                type="text"
                                value={d.item_number || ''}
                                onChange={(e) => updateNewItemDraft(i, 'item_number', e.target.value)}
                                style={{ width: '110px', padding: '8px' }}
                              />
                              {d.source === 'barcode' && (
                                <span className="admin-v2-badge admin-v2-badge-success" style={{ marginLeft: 6 }}>
                                  <CheckIcon size={12} /> scanned
                                </span>
                              )}
                            </div>
                          </td>
                          <td data-label="Their name" className="admin-v2-cell-stack">
                            <textarea
                              rows={2}
                              value={d.item_description || ''}
                              placeholder="How the distributor lists it"
                              onChange={(e) => updateNewItemDraft(i, 'item_description', e.target.value)}
                              style={{ width: '100%', minWidth: '140px', padding: '8px', resize: 'vertical' }}
                            />
                          </td>
                          <td data-label="Our supply" className="admin-v2-cell-stack">
                            <select
                              value={d.equipment_id ? String(d.equipment_id) : ''}
                              onChange={(e) => updateNewItemDraft(i, 'equipment_id', e.target.value ? parseInt(e.target.value, 10) : null)}
                              style={{ width: '100%', padding: '8px' }}
                            >
                              <option value="">Not one of our tracked supplies</option>
                              {equipment.map((eq) => (
                                <option key={eq.id} value={String(eq.id)}>{eq.name}</option>
                              ))}
                            </select>
                            {d.equipment_match === 'name' && d.equipment_id && (
                              <span className="admin-v2-badge admin-v2-badge-info" style={{ marginTop: 4 }}>
                                our best guess — check it
                              </span>
                            )}
                          </td>
                          <td data-label="Quantities" className="admin-v2-cell-stack">
                            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end' }}>
                              <QtyField label="Ordered">
                                <input
                                  type="number" min="0" inputMode="numeric"
                                  value={d.qty_ordered}
                                  onChange={(e) => updateNewItemDraft(i, 'qty_ordered', e.target.value)}
                                  style={{ width: '64px', textAlign: 'center', padding: '8px' }}
                                />
                              </QtyField>
                              <QtyField label="Shipped">
                                <input
                                  type="number" min="0" inputMode="numeric"
                                  value={d.qty_shipped ?? d.qty_ordered}
                                  onChange={(e) => updateNewItemDraft(i, 'qty_shipped', e.target.value)}
                                  style={{ width: '64px', textAlign: 'center', padding: '8px' }}
                                />
                              </QtyField>
                              <QtyField label="B/O">
                                <input
                                  type="number" min="0" inputMode="numeric"
                                  value={d.qty_backordered ?? 0}
                                  onChange={(e) => updateNewItemDraft(i, 'qty_backordered', e.target.value)}
                                  style={{ width: '64px', textAlign: 'center', padding: '8px' }}
                                />
                              </QtyField>
                            </div>
                          </td>
                          <td data-label="Unit" style={{ textAlign: 'center' }}>
                            <input
                              type="text"
                              value={d.unit_of_measure || ''}
                              placeholder="EA"
                              onChange={(e) => updateNewItemDraft(i, 'unit_of_measure', e.target.value)}
                              style={{ width: '60px', textAlign: 'center', padding: '8px' }}
                            />
                          </td>
                          <td className="admin-v2-cell-actions">
                            <div className="admin-v2-action-buttons">
                              <button
                                className="admin-v2-btn admin-v2-btn-sm admin-v2-btn-secondary"
                                onClick={() => removeNewItemDraft(i)}
                                title="Don't add this one"
                              >
                                <XIcon size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <div className="tw flex flex-wrap gap-2" style={{ marginTop: 12 }}>
              {newItemDrafts.length > 0 && (
                <Button size="lg" onClick={handleSaveNewItems} disabled={savingBulk}>
                  <PlusIcon size={16} /> {savingBulk ? 'Adding…' : `Add ${newItemDrafts.length} item${newItemDrafts.length === 1 ? '' : 's'}`}
                </Button>
              )}
              <Button variant="secondary" onClick={() => setImportChooserOpen(true)} disabled={savingBulk}>
                <BarcodeIcon size={16} /> Scan more pages
              </Button>
              <Button
                variant="ghost"
                onClick={() => { setNewItemDrafts(null); sessionClear(...importSessionKeys()); }}
                disabled={savingBulk}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Attached packing-slip pages */}
        {shipment.documents?.length > 0 && (
          <div className="admin-v2-section tw">
            <div className="admin-v2-section-header">
              <h2>Packing slip</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              {shipment.documents.map((doc) => (
                <div key={doc.id} className="relative">
                  <a
                    href={shipmentService.documentRawUrl(shipment.id, doc.id)}
                    target="_blank" rel="noreferrer"
                    className="block overflow-hidden rounded-lg border border-border"
                    title={doc.title || `Page ${doc.page_number || ''}`}
                  >
                    {(doc.content_type || '').startsWith('image/') ? (
                      <img
                        src={shipmentService.documentRawUrl(shipment.id, doc.id)}
                        alt={doc.title || 'Packing slip page'}
                        style={{ width: 110, height: 140, objectFit: 'cover' }}
                        loading="lazy"
                      />
                    ) : (
                      <span className="flex h-[140px] w-[110px] flex-col items-center justify-center gap-1 text-center text-sm">
                        <FileTextIcon size={20} /> {doc.title || 'Document'}
                      </span>
                    )}
                  </a>
                  {hasPermission('equipment.delete') && !isFinalized && (
                    <button
                      onClick={(e) => { e.preventDefault(); handleDeleteDocument(doc); }}
                      title="Remove this photo"
                      aria-label="Remove this photo"
                      className="absolute flex items-center justify-center rounded-full border border-border bg-card"
                      style={{ top: -8, right: -8, width: 32, height: 32 }}
                    >
                      <XIcon size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Advanced (legacy) workflow, tucked away for the rare cases */}
        {!isTemplate && !isFinalized && (
          <div className="tw">
            <Button variant="ghost" size="sm" onClick={() => setShowAdvanced(!showAdvanced)}>
              {showAdvanced
                ? <><ChevronDownIcon size={14} /> Hide advanced options</>
                : <><ChevronRightIcon size={14} /> Advanced options</>}
            </Button>
          </div>
        )}

        {/* Draft Status Notice */}
        {showAdvanced && isDraft && (
          <div className="admin-v2-info-banner">
            <div className="admin-v2-info-content">
              <strong>Draft Shipment</strong>
              <p>Add items to this shipment, then mark it as Ordered when ready.</p>
            </div>
            {hasPermission('equipment.update') && canMarkOrdered && (
              <div className="tw">
                <Button onClick={handleMarkAsOrdered}>
                  <CheckIcon size={16} /> Mark as Ordered
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Ordered Status Notice - Begin Receiving */}
        {showAdvanced && isOrdered && (
          <div className="admin-v2-info-banner">
            <div className="admin-v2-info-content">
              <strong>Order Placed</strong>
              <p>When the shipment arrives, begin receiving to record quantities.</p>
            </div>
            {hasPermission('equipment.update') && canBeginReceiving && (
              <div className="tw">
                <Button onClick={handleBeginReceiving}>
                  <CheckIcon size={16} /> Begin Receiving
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Receiving Mode Banner */}
        {receivingMode && (
          <div className="admin-v2-info-banner" style={{ background: 'var(--admin-info-bg, #e3f2fd)', borderColor: 'var(--admin-info-border, #90caf9)' }}>
            <div className="admin-v2-info-content">
              <strong>Receiving in Progress</strong>
              <p>Update shipped, backordered, and received quantities below. Click Save to record changes.</p>
            </div>
            <div className="tw flex gap-2">
              <Button variant="secondary" onClick={() => setReceivingMode(false)} disabled={savingItems}>
                Cancel
              </Button>
              <Button onClick={handleSaveReceiving} disabled={savingItems}>
                {savingItems ? 'Saving...' : 'Save & Finalize'}
              </Button>
            </div>
          </div>
        )}

        {/* Items Section */}
        <div className="admin-v2-section">
          <div className="admin-v2-section-header">
            <h2>Items</h2>
            {hasPermission('equipment.update') && !isFinalized && (
              <div className="tw flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setImportChooserOpen(true)}>
                  <BarcodeIcon size={16} /> Scan invoice to add items
                </Button>
                <Button variant="secondary" onClick={() => setShowCsvImport(true)}>
                  <FileTextIcon size={16} /> Import CSV
                </Button>
                <Button onClick={() => setShowAddItemModal(true)}>
                  <PlusIcon size={16} /> Add Item
                </Button>
              </div>
            )}
          </div>

          {shipment.items && shipment.items.length > 0 ? (
            <div className="admin-v2-table-container admin-v2-table-cards-wrap">
              <table className="admin-v2-table admin-v2-table-cards">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Manufacturer</th>
                    <th style={{ textAlign: 'center' }}>Ordered</th>
                    <th style={{ textAlign: 'center' }}>Shipped</th>
                    <th style={{ textAlign: 'center' }}>B/O</th>
                    <th style={{ textAlign: 'center' }}>Received</th>
                    {canReceive && !receivingMode && <th>Receive</th>}
                    {canEditItems && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {shipment.items.map(item => {
                    const { totalReceived, remaining } = getItemStats(item);
                    const receiveEntry = receiveData[item.id];
                    const itemEdit = itemEdits[item.id] || {};
                    
                    return (
                      <tr
                        key={item.id}
                        className={canEditItems ? 'admin-v2-clickable-row' : undefined}
                        onClick={canEditItems ? () => openEditItem(item) : undefined}
                      >
                        <td className="admin-v2-cell-name">
                          <div>
                            {/* Our name leads; the distributor's wording sits under it */}
                            <strong>{item.equipment_name || item.item_description || item.item_number || '-'}</strong>
                            {item.equipment_name && item.item_description && (
                              <div className="admin-v2-text-muted">{item.item_description}</div>
                            )}
                            {item.item_number && (item.item_description || item.equipment_name) && (
                              <div className="admin-v2-text-muted">#{item.item_number}</div>
                            )}
                            {item.unit_description && <div className="admin-v2-text-small">{item.unit_description}</div>}
                          </div>
                        </td>
                        <td data-label="Manufacturer">{item.manufacturer_name || '-'}</td>
                        <td data-label="Ordered" style={{ textAlign: 'center' }}>{item.qty_ordered}</td>
                        <td data-label="Shipped" style={{ textAlign: 'center' }}>
                          {receivingMode ? (
                            <input
                              type="number"
                              min="0"
                              value={itemEdit.qty_shipped ?? item.qty_shipped ?? 0}
                              onChange={e => updateItemEdit(item.id, 'qty_shipped', parseInt(e.target.value) || 0)}
                              style={{ width: '60px', textAlign: 'center' }}
                            />
                          ) : (
                            item.qty_shipped
                          )}
                        </td>
                        <td data-label="Coming later" style={{ textAlign: 'center' }}>
                          {receivingMode ? (
                            <input
                              type="number"
                              min="0"
                              value={itemEdit.qty_backordered ?? item.qty_backordered ?? 0}
                              onChange={e => updateItemEdit(item.id, 'qty_backordered', parseInt(e.target.value) || 0)}
                              style={{ width: '60px', textAlign: 'center' }}
                            />
                          ) : (
                            item.qty_backordered > 0 ? (
                              <span className="admin-v2-badge admin-v2-badge-warning">{item.qty_backordered}</span>
                            ) : '-'
                          )}
                        </td>
                        <td data-label="Received" style={{ textAlign: 'center' }}>
                          {receivingMode ? (
                            <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
                              <input
                                type="number"
                                min="0"
                                value={itemEdit.qty_received ?? totalReceived ?? 0}
                                onChange={e => updateItemEdit(item.id, 'qty_received', parseInt(e.target.value) || 0)}
                                style={{ width: '60px', textAlign: 'center' }}
                              />
                              {/* Invoice says shipped, box says otherwise — flag it to chase the supplier */}
                              <label style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', fontSize: '0.75rem', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={itemEdit.flagged_missing ?? !!item.flagged_missing}
                                  onChange={e => updateItemEdit(item.id, 'flagged_missing', e.target.checked)}
                                />
                                never arrived
                              </label>
                            </div>
                          ) : (
                            <>
                              {totalReceived > 0 ? (
                                <span className={totalReceived >= item.qty_shipped ? 'admin-v2-text-success' : ''}>
                                  {totalReceived} / {item.qty_shipped}
                                </span>
                              ) : (item.flagged_missing ? null : '-')}
                              {item.flagged_missing && (
                                <div>
                                  <span className="admin-v2-badge admin-v2-badge-danger">
                                    <AlertIcon size={12} /> never arrived
                                  </span>
                                </div>
                              )}
                            </>
                          )}
                        </td>
                        {canReceive && !receivingMode && (
                          <td data-label="Receive">
                            {remaining > 0 && receiveEntry ? (
                              <div className="admin-v2-receive-form">
                                <div className="admin-v2-receive-row">
                                  <input
                                    type="number"
                                    min="0"
                                    max={remaining}
                                    value={receiveEntry.qty_received}
                                    onChange={e => updateReceiveData(item.id, 'qty_received', e.target.value)}
                                    style={{ width: '60px' }}
                                  />
                                  <select
                                    value={receiveEntry.condition}
                                    onChange={e => updateReceiveData(item.id, 'condition', e.target.value)}
                                    style={{ width: '100px' }}
                                  >
                                    {CONDITION_OPTIONS.map(opt => (
                                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                  </select>
                                  <button
                                    className="admin-v2-btn admin-v2-btn-sm admin-v2-btn-success"
                                    onClick={() => handleReceiveItem(item.id)}
                                    disabled={savingReceive}
                                  >
                                    <CheckIcon size={14} />
                                  </button>
                                </div>
                                {receiveEntry.condition !== 'good' && (
                                  <input
                                    type="text"
                                    placeholder="Discrepancy notes..."
                                    value={receiveEntry.discrepancy_notes}
                                    onChange={e => updateReceiveData(item.id, 'discrepancy_notes', e.target.value)}
                                    style={{ marginTop: '4px', width: '100%' }}
                                  />
                                )}
                              </div>
                            ) : totalReceived >= item.qty_shipped ? (
                              <span className="admin-v2-badge admin-v2-badge-success">
                                <CheckIcon size={12} /> Complete
                              </span>
                            ) : null}
                          </td>
                        )}
                        {canEditItems && (
                          <td className="admin-v2-cell-actions" onClick={(e) => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}>
                            <div className="admin-v2-action-buttons">
                              <button
                                className="admin-v2-btn admin-v2-btn-sm admin-v2-btn-secondary"
                                onClick={() => openEditItem(item)}
                                title="Edit this item"
                              >
                                <EditIcon size={14} />
                              </button>
                              <button
                                className="admin-v2-btn admin-v2-btn-sm admin-v2-btn-secondary"
                                onClick={() => handleDeleteItem(item)}
                                title="Remove this item"
                              >
                                <TrashIcon size={14} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="admin-v2-empty-state">
              <EquipmentIcon size={32} />
              <p>No items on this list yet. The fast way: scan the invoice and we'll read them off for you.</p>
              {hasPermission('equipment.update') && !isFinalized && (
                <div className="tw flex flex-wrap justify-center gap-2">
                  <Button onClick={() => setImportChooserOpen(true)}>
                    <BarcodeIcon size={16} /> Scan invoice to add items
                  </Button>
                  <Button variant="secondary" onClick={() => setShowAddItemModal(true)}>
                    <PlusIcon size={16} /> Add by hand
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Receipt History */}
        {shipment.items?.some(item => item.receipts?.length > 0) && (
          <div className="admin-v2-section">
            <h2>Receipt History</h2>
            <div className="admin-v2-table-container admin-v2-table-cards-wrap">
              <table className="admin-v2-table admin-v2-table-cards">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Condition</th>
                    <th>Lot #</th>
                    <th>Expiration</th>
                    <th>Received At</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {shipment.items.flatMap(item =>
                    (item.receipts || []).map(receipt => (
                      <tr key={receipt.id}>
                        <td className="admin-v2-cell-name">
                          <strong>{item.item_description || item.equipment_name || item.item_number || 'Item'}</strong>
                        </td>
                        <td data-label="Qty">{receipt.qty_received}</td>
                        <td data-label="Condition">
                          <span className={`admin-v2-badge ${getConditionBadgeClass(receipt.condition)}`}>
                            {receipt.condition}
                          </span>
                        </td>
                        <td data-label="Lot #">{receipt.lot_number || '-'}</td>
                        <td data-label="Expiration">{formatDate(receipt.expiration_date)}</td>
                        <td data-label="Received At">{formatDate(receipt.received_at)}</td>
                        <td data-label="Notes">{receipt.discrepancy_notes || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Finalize Button (advanced path; the confirm panel handles the common case) */}
        {showAdvanced && canFinalize && hasPermission('equipment.update') && (
          <div className="admin-v2-finalize-section tw">
            <Button size="lg" onClick={handleFinalizeShipment} disabled={finalizing}>
              {finalizing ? 'Finalizing...' : 'Finalize Shipment'}
            </Button>
            <p className="admin-v2-text-muted">
              Finalizing will create backorder shipments for B/O items and generate alerts for any discrepancies.
            </p>
          </div>
        )}

        {/* Finalized Info */}
        {isFinalized && shipment.finalized_at && (
          <div className="admin-v2-finalized-info">
            <CheckIcon size={16} />
            <span>Finalized on {formatDate(shipment.finalized_at)}</span>
          </div>
        )}

        {/* CSV item import */}
        <CsvItemImport
          open={showCsvImport}
          onClose={() => setShowCsvImport(false)}
          shipmentId={shipment.id}
          onDone={() => { setShowCsvImport(false); fetchShipment(); }}
        />

        {/* Packing-slip / invoice capture */}
        <PackingSlipCapture
          open={showCapture}
          onClose={() => setShowCapture(false)}
          shipmentId={shipment.id}
          expectedItems={shipment.items || []}
          onComplete={handleScanComplete}
          mode={captureMode}
        />
        <ScannerChoiceDialog
          open={importChooserOpen}
          onClose={() => setImportChooserOpen(false)}
          title="How will you scan the invoice?"
          onChoose={(mode) => {
            setImportChooserOpen(false);
            if (mode === 'camera') {
              setCaptureMode('import');
              setShowCapture(true);
            } else {
              setShowExternalImport(true);
            }
          }}
        />
        <ExternalScanDialog
          multi
          askExpected
          open={showExternalImport}
          onClose={() => setShowExternalImport(false)}
          title="Scan the invoice barcodes"
          hint="Point your scanner at each line's little barcode — one scan per item on the invoice."
          warnFor={(code) => (parseSlipBarcode(code) ? null : "doesn't look like an item barcode")}
          onComplete={handleExternalImport}
        />

        {/* Add Item Dialog */}
        <Dialog open={showAddItemModal} onOpenChange={(o) => { if (!o) closeItemModal(); }}>
          <DialogContent className="sm:max-w-[640px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>{editingItemId ? 'Edit Item' : 'Add Shipment Item'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddItem} className="flex flex-col gap-4">
              {itemFormError && <Alert variant="destructive">{itemFormError}</Alert>}

              <Field label="Link to Equipment (optional)">
                <Select
                  value={itemFormData.equipment_id || '__none__'}
                  onValueChange={(v) => {
                    const eqId = v === '__none__' ? '' : v;
                    if (eqId) {
                      const eq = equipment.find(eq => eq.id === parseInt(eqId));
                      if (eq) {
                        setItemFormData(prev => ({
                          ...prev,
                          equipment_id: eqId,
                          item_number: eq.item_number || '',
                          manufacturer_name: eq.default_manufacturer || '',
                          unit_of_measure: eq.unit_of_measure || '',
                          unit_description: eq.unit_description || ''
                        }));
                        return;
                      }
                    }
                    setItemFormData(prev => ({ ...prev, equipment_id: eqId }));
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="-- No Link --" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">-- No Link --</SelectItem>
                    {equipment.map(eq => (
                      <SelectItem key={eq.id} value={String(eq.id)}>
                        {eq.name} {eq.item_number ? `(${eq.item_number})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <FormRow>
                <Field label="Item Number" required htmlFor="item-number">
                  <Input
                    id="item-number"
                    value={itemFormData.item_number}
                    onChange={e => setItemFormData({...itemFormData, item_number: e.target.value})}
                    required
                    placeholder="e.g., 6025"
                  />
                </Field>
                <Field label="Manufacturer" htmlFor="item-mfr">
                  <Input
                    id="item-mfr"
                    value={itemFormData.manufacturer_name}
                    onChange={e => setItemFormData({...itemFormData, manufacturer_name: e.target.value})}
                    placeholder="e.g., Hollister"
                  />
                </Field>
              </FormRow>

              <Field label="Description (how the distributor lists it)" htmlFor="item-desc">
                <Textarea
                  id="item-desc"
                  rows={2}
                  value={itemFormData.item_description}
                  onChange={e => setItemFormData({...itemFormData, item_description: e.target.value})}
                  placeholder="e.g. CIRCUIT, BRTHNG HTD SNGL LIMB — your own name comes from the linked supply above"
                />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Qty Ordered" htmlFor="item-qty-ordered">
                  <Input
                    id="item-qty-ordered"
                    type="number"
                    min="0"
                    value={itemFormData.qty_ordered}
                    onChange={e => setItemFormData({...itemFormData, qty_ordered: e.target.value})}
                  />
                </Field>
                <Field label="Qty Shipped" htmlFor="item-qty-shipped">
                  <Input
                    id="item-qty-shipped"
                    type="number"
                    min="0"
                    value={itemFormData.qty_shipped}
                    onChange={e => setItemFormData({...itemFormData, qty_shipped: e.target.value})}
                  />
                </Field>
                <Field label="Qty B/O" htmlFor="item-qty-bo">
                  <Input
                    id="item-qty-bo"
                    type="number"
                    min="0"
                    value={itemFormData.qty_backordered}
                    onChange={e => setItemFormData({...itemFormData, qty_backordered: e.target.value})}
                  />
                </Field>
              </div>

              <label className="flex items-center gap-2 text-sm" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!itemFormData.flagged_missing}
                  onChange={e => setItemFormData({...itemFormData, flagged_missing: e.target.checked})}
                />
                Flag as missing — the invoice says it shipped, but it never arrived
              </label>

              <FormRow>
                <Field label="Unit of Measure" htmlFor="item-uom">
                  <Input
                    id="item-uom"
                    value={itemFormData.unit_of_measure}
                    onChange={e => setItemFormData({...itemFormData, unit_of_measure: e.target.value})}
                    placeholder="e.g., Box"
                  />
                </Field>
                <Field label="Unit Description" htmlFor="item-unit-desc">
                  <Input
                    id="item-unit-desc"
                    value={itemFormData.unit_description}
                    onChange={e => setItemFormData({...itemFormData, unit_description: e.target.value})}
                    placeholder="e.g., Box of 10"
                  />
                </Field>
              </FormRow>

              <DialogFooter>
                <Button type="button" variant="secondary" onClick={closeItemModal}>Cancel</Button>
                <Button type="submit" disabled={savingItem}>
                  {savingItem ? 'Saving…' : (editingItemId ? 'Save Changes' : 'Add Item')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2ShipmentDetail;
