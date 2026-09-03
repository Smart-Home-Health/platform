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
// One shipment, as the three things you do to it in order: build the list,
// say it was placed, receive what turned up.
//
// The page was a single flat scroll of twelve conditional sections with a
// whole second workflow hidden behind an "Advanced options" disclosure. That
// one is gone. It hand-rolled receive + status PATCH + finalize alongside the
// reconcile call that does all three server-side, and its receipts never
// landed: both of its handlers POSTed a single object to /receive, which
// takes a list, so every receipt 422'd while the code went on to PATCH the
// shipment to 'complete'. A delivery run through it read as fully received
// with no receipt rows and no inventory movement.
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import {
  BackArrowIcon, PackageIcon, FileTextIcon, PlusIcon, EditIcon,
  MoreVerticalIcon, BarcodeIcon, CheckCircleIcon, AlertIcon,
} from '../../components/Icons';
import ShipmentItemCard from '../../components/shipment/ShipmentItemCard';
import ShipmentDetailsModal from '../../components/shipment/ShipmentDetailsModal';
import ShipmentItemSheet from '../../components/shipment/ShipmentItemSheet';
import ReceiveReview from '../../components/shipment/ReceiveReview';
import { shipmentService } from '../../services/shipments';
import { businessService } from '../../services/businesses';
import { equipmentService } from '../../services/equipment';
import { sessionGet, sessionSet, sessionClear } from '../../lib/sessionState';
import PackingSlipCapture from './components/PackingSlipCapture';
import CsvItemImport from './components/CsvItemImport';
import ScannerChoiceDialog from './components/ScannerChoiceDialog';
import ExternalScanDialog from './components/ExternalScanDialog';
import { parseSlipBarcode } from '../../lib/slipScanner';
import {
  DETAIL_STEPS, detailStep, statusInfo, stepStates, isFinalized,
} from '../../lib/shipmentStatus';
import './AdminV2.css';
import './components/shipments-page.css';

const longDate = (value) => (value ? new Date(value).toLocaleDateString(undefined, {
  month: 'short', day: 'numeric', year: 'numeric',
}) : null);

const AdminV2ShipmentDetail = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    patients, selectedPatient: contextPatient, selectPatient: setContextPatient,
  } = useAdminPatient();
  const selectedPatient = contextPatient;

  const [shipment, setShipment] = useState(null);
  const [equipment, setEquipment] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [step, setStep] = useState(null);   // null until the shipment loads
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [itemSheet, setItemSheet] = useState({ open: false, editing: null });
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Delivery-confirm flow (the common path: box arrived -> confirm)
  const [confirming, setConfirming] = useState(false);
  const [confirmResult, setConfirmResult] = useState(null);
  const [reviewItems, setReviewItems] = useState(null);
  // Scanned lines that didn't match an item by number: suggestions the user
  // maps (add as new / attach to an item / skip). Monthly orders arrive as
  // 5-6 separate slips, so unmatched lines are normal, not noise.
  const [scanExtras, setScanExtras] = useState(null);

  // Invoice import: scan an invoice to ADD line items instead of typing them
  const [showCapture, setShowCapture] = useState(false);
  const [captureMode, setCaptureMode] = useState('confirm'); // 'confirm' | 'import'
  const [newItemDrafts, setNewItemDrafts] = useState(null);
  const [savingBulk, setSavingBulk] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [importChooserOpen, setImportChooserOpen] = useState(false);
  const [showExternalImport, setShowExternalImport] = useState(false);
  const [creatingDelivery, setCreatingDelivery] = useState(false);

  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.is_system_admin) return true;
    return user.permissions?.includes(permission) || false;
  };

  // The endpoints require shipments.*; the old page asked for equipment.*.
  const canUpdate = hasPermission('shipments.update');
  const canDelete = hasPermission('shipments.delete');
  const canReceive = hasPermission('shipments.receive');
  const canCreate = hasPermission('shipments.create');

  // --- Import-session persistence -------------------------------------------
  // Mobile browsers discard background tabs (hopping to Photos mid-import),
  // reloading the SPA and wiping React state. Checkpoint the in-progress
  // import to sessionStorage and restore it once the shipment loads.
  const sessionRestoredRef = useRef(false);
  const importSessionKeys = useCallback(
    () => [`drafts:${id}`, `review:${id}`, `extras:${id}`, `capture:${id}`, `scan:${id}`],
    [id],
  );

  useEffect(() => {
    const patientId = searchParams.get('patient');
    if (patientId && patients.length > 0) {
      const patient = patients.find((p) => p.id === parseInt(patientId, 10));
      if (patient && patient.id !== contextPatient?.id) setContextPatient(patient);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-way URL→context sync; adding contextPatient would re-run on selection change and revert it to the stale URL param
  }, [searchParams, patients]);

  useEffect(() => {
    if (contextPatient && searchParams.get('patient') !== String(contextPatient.id)) {
      setSearchParams({ patient: contextPatient.id }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-way context→URL sync; runs only when the selection changes
  }, [contextPatient]);

  const fetchShipment = useCallback(async () => {
    setLoading(true);
    try {
      setShipment(await shipmentService.getShipment(id));
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchShipment(); }, [fetchShipment]);

  useEffect(() => {
    let cancelled = false;
    businessService.listDmeSuppliers()
      .then((list) => { if (!cancelled) setSuppliers(list); })
      .catch(() => { /* the supplier's name is a nicety, not the page */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedPatient) return undefined;
    let cancelled = false;
    equipmentService.list(selectedPatient.id)
      .then((data) => {
        if (!cancelled) setEquipment(data.equipment || data || []);
      })
      .catch(() => { /* linking a line to a supply is optional */ });
    return () => { cancelled = true; };
  }, [selectedPatient]);

  // The wizard opens where the shipment actually is, then follows the user.
  useEffect(() => {
    if (shipment && step === null) setStep(detailStep(shipment));
  }, [shipment, step]);

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
  }, [shipment, id, importSessionKeys]);

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

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menuOpen]);

  // --- Shipment-level actions ---

  const saveDetails = async (payload) => {
    setBusy(true);
    try {
      await shipmentService.patchShipment(id, payload);
      setDetailsOpen(false);
      await fetchShipment();
    } finally {
      setBusy(false);
    }
  };

  const markOrdered = async () => {
    setBusy(true);
    try {
      await shipmentService.patchShipment(id, { status: 'ordered' });
      await fetchShipment();
      setStep('shipping');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteShipment = async () => {
    const what = shipment.is_template ? 'this usual order' : 'this delivery';
    if (!window.confirm(`Delete ${what}? This cannot be undone.`)) return;
    try {
      const result = await shipmentService.deleteShipment(id);
      if (result.success) {
        navigate(`/care/equipment/shipments?patient=${selectedPatient?.id}`);
      } else {
        setError(result.error || 'Failed to delete');
      }
    } catch (err) {
      setError(err.message);
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
        setError(result.error || 'Failed to create delivery');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingDelivery(false);
    }
  };

  // --- Items ---

  const saveItem = async (payload) => {
    if (itemSheet.editing) await shipmentService.updateItem(id, itemSheet.editing.id, payload);
    else await shipmentService.addItem(id, payload);
    setItemSheet({ open: false, editing: null });
    await fetchShipment();
  };

  const changeItemQty = async (item, qty) => {
    // Optimistic: the stepper should not wait on a round trip per tap.
    setShipment((s) => ({
      ...s,
      items: s.items.map((i) => (i.id === item.id ? { ...i, qty_ordered: qty } : i)),
    }));
    try {
      await shipmentService.updateItem(id, item.id, { qty_ordered: qty });
    } catch (err) {
      setError(err.message);
      fetchShipment();
    }
  };

  const removeItem = async (item) => {
    const label = item.item_description || item.equipment_name || item.item_number || 'this item';
    if (!window.confirm(`Remove ${label} from this list?`)) return;
    try {
      await shipmentService.deleteItem(id, item.id);
      fetchShipment();
    } catch (err) {
      setError(err.message);
    }
  };

  // --- Receiving. One reconcile call: the server records the receipts,
  // raises the alerts, spawns the backorder and sets the final status. ---

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
    setReviewItems((shipment.items || []).map((item) => {
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
    }));
    // Lines the number match didn't claim become mapping suggestions:
    // best name match preselected, otherwise "add as new item".
    setScanExtras((resolvedLines || [])
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
      })));
    setConfirmResult(null);
    setStep('receive');
  };

  const handleScanComplete = async ({ barcodes, ocrItems }) => {
    setShowCapture(false);
    if (captureMode === 'import') {
      const { buildNewItems } = await import('../../lib/slipScanner');
      setNewItemDrafts(buildNewItems(barcodes, ocrItems, shipment.items || [], equipment));
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
      if (!result.success && !result.count) throw new Error(result.error || 'Failed to add items');

      // Make the reconciliation stick: when a line was linked to one of our
      // supplies that doesn't know its supplier item number yet, save the
      // number onto the equipment — next month's scan auto-links by number,
      // even if the distributor swaps brands and the printed name changes.
      for (const d of newItemDrafts) {
        if (!d.equipment_id || !d.item_number) continue;
        const eq = equipment.find((e) => e.id === d.equipment_id);
        if (eq && !eq.item_number) {
          try {
            await equipmentService.update(eq.id, { item_number: d.item_number });
          } catch { /* non-fatal: linking still worked for this delivery */ }
        }
      }
      setNewItemDrafts(null);
      sessionClear(...importSessionKeys());
      fetchShipment();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingBulk(false);
    }
  };

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

  const handleDeleteDocument = async (doc) => {
    if (!window.confirm(`Remove ${doc.title || 'this slip photo'}?`)) return;
    try {
      await shipmentService.deleteDocument(id, doc.id);
      fetchShipment();
    } catch (err) {
      setError(err.message);
    }
  };

  // --- Render ---

  if (loading && !shipment) {
    return <AdminV2Layout><div className="admin-v2-loading">Loading shipment…</div></AdminV2Layout>;
  }
  if (!shipment) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-page sh-page">
          <div className="sh-error" role="alert">{error || 'Shipment not found'}</div>
        </div>
      </AdminV2Layout>
    );
  }

  const info = statusInfo(shipment.status);
  const finalized = isFinalized(shipment);
  const items = shipment.items || [];
  const rail = stepStates(shipment);
  const supplierName = shipment.supplier_name
    || suppliers.find((s) => s.id === shipment.supplier_id)?.name;
  const heading = shipment.is_template
    ? 'Usual order'
    : `Shipment ${shipment.order_number || shipment.po_number || `#${shipment.id}`}`;
  const totalUnits = items.reduce((sum, i) => sum + (i.qty_ordered || 0), 0);
  const editableList = !finalized && shipment.status === 'draft' && canUpdate;

  const menu = [
    ...(canUpdate ? [{ label: 'Edit details', onClick: () => setDetailsOpen(true) }] : []),
    ...(canCreate ? [{
      label: 'Copy to new draft',
      onClick: async () => {
        try {
          const r = await shipmentService.copyShipment(id);
          if (r.success) {
            navigate(`/care/equipment/shipments/${r.id}?patient=${selectedPatient?.id}`);
          } else setError(r.error || 'Failed to copy');
        } catch (err) { setError(err.message); }
      },
    }] : []),
    ...(canDelete && !finalized
      ? [{ label: 'Delete', onClick: handleDeleteShipment, danger: true }] : []),
  ];

  return (
    <AdminV2Layout>
      <div className="admin-v2-page sh-page">
        {error && <div className="sh-error" role="alert">{error}</div>}

        <header className="sd-head">
          <button type="button" className="sd-back" aria-label="Back to deliveries"
                  onClick={() => navigate(`/care/equipment/shipments?patient=${selectedPatient?.id}`)}>
            <BackArrowIcon size={18} />
          </button>
          <h1 className="sd-title">{heading}</h1>
          <span className={`sc-status tone-${info.tone}`}>{info.label}</span>
          {menu.length > 0 && (
            <div className="sc-menu-wrap" ref={menuRef}>
              <button type="button" className="sc-kebab" aria-label="Shipment actions"
                      aria-haspopup="menu" aria-expanded={menuOpen}
                      onClick={() => setMenuOpen((v) => !v)}>
                <MoreVerticalIcon size={18} />
              </button>
              {menuOpen && (
                <div className="sc-menu" role="menu">
                  {menu.map((entry) => (
                    <button key={entry.label} type="button" role="menuitem"
                            className={`sc-menu-item ${entry.danger ? 'danger' : ''}`}
                            onClick={() => { setMenuOpen(false); entry.onClick(); }}>
                      {entry.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </header>

        {/* A standing order never receives anything itself; it spawns deliveries. */}
        {shipment.is_template ? (
          <section className="sd-usual">
            <p>
              This is the usual order — a template. It is not a delivery, and never
              receives supplies itself.
            </p>
            {canCreate && (
              <button type="button" className="sh-btn primary" disabled={creatingDelivery}
                      onClick={handleCreateDelivery}>
                <PackageIcon size={16} />
                {creatingDelivery ? 'One moment…' : 'A delivery arrived'}
              </button>
            )}
          </section>
        ) : (
          <nav className="sd-steps" aria-label="Shipment progress">
            {DETAIL_STEPS.map((s, i) => {
              // The three tabs collapse the four rail states: build, in
              // flight, arrived.
              const reached = i === 0
                || (i === 1 && rail[1].state !== 'todo')
                || (i === 2 && rail[3].state !== 'todo');
              return (
                <button key={s.key} type="button"
                        className={`sd-step ${step === s.key ? 'is-active' : ''} ${reached ? 'is-reached' : ''}`}
                        aria-current={step === s.key ? 'step' : undefined}
                        onClick={() => setStep(s.key)}>
                  <span className="sd-step-num">{i + 1}</span>
                  <span className="sd-step-name">{s.label}</span>
                </button>
              );
            })}
          </nav>
        )}

        <div className="sd-meta">
          <p className="sd-meta-line">
            {supplierName || 'No supplier'}
            {' · '}
            {shipment.is_backorder ? 'Backorder' : 'Regular shipment'}
          </p>
          {canUpdate && (
            <button type="button" className="sh-btn ghost" onClick={() => setDetailsOpen(true)}>
              <EditIcon size={15} /> Edit details
            </button>
          )}
        </div>

        {/* Absent values are stated rather than left blank, so "no PO" reads as
            a fact rather than as something that failed to load. */}
        <p className="sd-refs">
          {shipment.po_number ? `PO ${shipment.po_number}` : 'PO not added'}
          {' · '}
          {shipment.order_number ? `Order ${shipment.order_number}` : 'Order # not added'}
          {shipment.expected_delivery && ` · Expected ${longDate(shipment.expected_delivery)}`}
          {shipment.tracking_number && ` · Tracking ${shipment.tracking_number}`}
        </p>

        {/* --- Step 1: the list --- */}
        {(step === 'build' || shipment.is_template) && (
          <section className="sd-section">
            <div className="sd-section-head">
              <h2 className="sd-section-title">
                Items <span className="sd-pill">{items.length}</span>
              </h2>
            </div>

            {canUpdate && !finalized && (
              <div className="sd-actions">
                <button type="button" className="sh-btn primary"
                        onClick={() => setImportChooserOpen(true)}>
                  <FileTextIcon size={16} /> Scan invoice
                </button>
                <button type="button" className="sh-btn"
                        onClick={() => setItemSheet({ open: true, editing: null })}>
                  <PlusIcon size={16} /> Add item
                </button>
                <button type="button" className="sh-btn" onClick={() => setShowCsvImport(true)}>
                  <PackageIcon size={16} /> Import CSV
                </button>
              </div>
            )}

            {newItemDrafts && newItemDrafts.length > 0 && (
              <div className="sd-drafts">
                <p className="sd-hint">Review scanned quantities before saving.</p>
                {newItemDrafts.map((d, index) => (
                  <div key={`${d.item_number || 'line'}-${index}`} className="sd-draft-row">
                    <input className="em-input" value={d.item_description || ''}
                           aria-label={`Description for line ${index + 1}`}
                           onChange={(e) => setNewItemDrafts((prev) => prev.map((x, i) => (
                             i === index ? { ...x, item_description: e.target.value } : x)))} />
                    <input className="em-input sd-draft-sku" value={d.item_number || ''}
                           aria-label={`Item number for line ${index + 1}`}
                           onChange={(e) => setNewItemDrafts((prev) => prev.map((x, i) => (
                             i === index ? { ...x, item_number: e.target.value } : x)))} />
                    <input className="em-input sd-draft-qty" type="number" min="0"
                           value={d.qty_ordered ?? 0}
                           aria-label={`Quantity for line ${index + 1}`}
                           onChange={(e) => setNewItemDrafts((prev) => prev.map((x, i) => (
                             i === index ? { ...x, qty_ordered: e.target.value } : x)))} />
                    <button type="button" className="sh-btn ghost"
                            onClick={() => setNewItemDrafts((prev) => prev.filter((_, i) => i !== index))}>
                      Remove
                    </button>
                  </div>
                ))}
                <div className="sd-drafts-foot">
                  <button type="button" className="sh-btn ghost" onClick={() => setNewItemDrafts(null)}>
                    Discard
                  </button>
                  <button type="button" className="sh-btn primary" disabled={savingBulk}
                          onClick={handleSaveNewItems}>
                    {savingBulk ? 'Saving…' : `Save ${newItemDrafts.length} items`}
                  </button>
                </div>
              </div>
            )}

            {items.length === 0 ? (
              <div className="sh-empty">
                <PackageIcon size={26} />
                <p>Nothing on this list yet.</p>
              </div>
            ) : (
              <div className="sd-items">
                {items.map((item, i) => (
                  <ShipmentItemCard
                    key={item.id}
                    index={i + 1}
                    item={item}
                    editableQty={editableList}
                    onQtyChange={(qty) => changeItemQty(item, qty)}
                    onOpen={canUpdate && !finalized
                      ? () => setItemSheet({ open: true, editing: item }) : undefined}
                    menu={canUpdate && !finalized ? [
                      { label: 'Edit item', onClick: () => setItemSheet({ open: true, editing: item }) },
                      { label: 'Remove', onClick: () => removeItem(item), danger: true },
                    ] : []}
                  />
                ))}
              </div>
            )}

            {items.length > 0 && !shipment.is_template && (
              <div className="sd-foot">
                <span className="sd-foot-count">
                  <PackageIcon size={15} />
                  {items.length} items · {totalUnits} units
                </span>
                {shipment.status === 'draft' && canUpdate && (
                  <button type="button" className="sh-btn primary" disabled={busy}
                          onClick={markOrdered}>
                    {busy ? 'Saving…' : 'Continue to shipping'}
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        {/* --- Step 2: in flight --- */}
        {step === 'shipping' && !shipment.is_template && (
          <section className="sd-section">
            <h2 className="sd-section-title">Shipping</h2>
            <dl className="sd-facts">
              <div><dt>Ship date</dt><dd>{longDate(shipment.ship_date) || 'Not set'}</dd></div>
              <div><dt>Expected</dt><dd>{longDate(shipment.expected_delivery) || 'Not set'}</dd></div>
              <div><dt>Tracking</dt><dd>{shipment.tracking_number || 'Not set'}</dd></div>
              <div><dt>Method</dt><dd>{shipment.ship_method || 'Not set'}</dd></div>
            </dl>
            <p className="sh-note">{items.length} items · {totalUnits} units on this order.</p>
            {canReceive && (
              <button type="button" className="sh-btn primary" onClick={() => setStep('receive')}>
                <PackageIcon size={16} /> The delivery arrived
              </button>
            )}
          </section>
        )}

        {/* --- Step 3: receive --- */}
        {step === 'receive' && !shipment.is_template && (
          <section className="sd-section">
            <h2 className="sd-section-title">Receive</h2>

            {finalized ? (
              <div className="sd-done">
                <CheckCircleIcon size={20} />
                <div>
                  <p className="sd-done-title">{info.blurb}</p>
                  <p className="sd-done-note">
                    Finalized {longDate(shipment.finalized_at)}.
                    {(shipment.unresolved_alert_count || 0) > 0
                      && ` ${shipment.unresolved_alert_count} unresolved alert(s).`}
                  </p>
                </div>
              </div>
            ) : reviewItems ? (
              <ReceiveReview
                items={reviewItems}
                extras={scanExtras}
                shipmentItems={items}
                saving={confirming}
                onChangeItem={(itemId, field, value) => setReviewItems((prev) => prev.map((r) => (
                  r.shipment_item_id === itemId ? { ...r, [field]: value } : r)))}
                onChangeExtra={(key, patch) => setScanExtras((prev) => prev.map((e) => (
                  e.key === key ? { ...e, ...patch } : e)))}
                onRemoveExtra={(key) => setScanExtras((prev) => prev.filter((e) => e.key !== key))}
                onCancel={() => { setReviewItems(null); setScanExtras(null); }}
                onSave={handleSaveReview}
              />
            ) : (
              <div className="sd-confirm">
                <p className="sd-hint">
                  If the box matched the order, confirm it in one tap. Otherwise scan
                  the packing slip, or adjust the counts by hand.
                </p>
                <div className="sd-actions">
                  {canReceive && (
                    <button type="button" className="sh-btn primary" disabled={confirming}
                            onClick={handleConfirmAsUsual}>
                      <CheckCircleIcon size={16} />
                      {confirming ? 'Confirming…' : 'Everything came as usual'}
                    </button>
                  )}
                  <button type="button" className="sh-btn"
                          onClick={() => { setCaptureMode('confirm'); setShowCapture(true); }}>
                    <BarcodeIcon size={16} /> Scan the packing slip
                  </button>
                  {canReceive && (
                    <button type="button" className="sh-btn" onClick={() => openReview(null)}>
                      Adjust by hand
                    </button>
                  )}
                </div>
              </div>
            )}

            {confirmResult && !confirmResult.success && (
              <div className="sh-error" role="alert">{confirmResult.error}</div>
            )}
            {confirmResult?.success && (
              <div className="sd-done">
                <CheckCircleIcon size={20} />
                <div>
                  <p className="sd-done-title">Delivery recorded</p>
                  <p className="sd-done-note">
                    {confirmResult.backorder_shipment_id
                      ? `Backorder #${confirmResult.backorder_shipment_id} created. ` : ''}
                    {confirmResult.alerts_created > 0
                      ? `${confirmResult.alerts_created} alert(s) raised.` : ''}
                  </p>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Packing slips, wherever we are in the flow. */}
        {(shipment.documents || []).length > 0 && (
          <section className="sd-section">
            <h2 className="sd-section-title">Packing slips</h2>
            <div className="sd-slips">
              {shipment.documents.map((doc) => (
                <figure key={doc.id} className="sd-slip">
                  <a href={shipmentService.documentRawUrl(id, doc.id)}
                     target="_blank" rel="noreferrer">
                    <img src={shipmentService.documentRawUrl(id, doc.id)}
                         alt={doc.title || `Packing slip page ${doc.page_number || ''}`} />
                  </a>
                  {canDelete && (
                    <button type="button" className="sd-slip-remove"
                            aria-label={`Remove ${doc.title || 'slip'}`}
                            onClick={() => handleDeleteDocument(doc)}>×</button>
                  )}
                </figure>
              ))}
            </div>
          </section>
        )}

        {(shipment.alerts || []).length > 0 && (
          <section className="sd-section">
            <h2 className="sd-section-title">Alerts</h2>
            <ul className="sd-alerts">
              {shipment.alerts.map((a) => (
                <li key={a.id} className={a.resolved ? 'is-resolved' : ''}>
                  <AlertIcon size={15} />
                  <span className="sd-alert-type">{a.alert_type.replace('_', ' ')}</span>
                  <span className="sd-alert-note">{a.notes}</span>
                  {a.resolved && <span className="sd-alert-tag">Resolved</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* --- Modals --- */}
        <ShipmentDetailsModal
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          shipment={shipment}
          suppliers={suppliers}
          saving={busy}
          onSave={saveDetails}
        />

        <ShipmentItemSheet
          open={itemSheet.open}
          onOpenChange={(o) => setItemSheet({ open: o, editing: o ? itemSheet.editing : null })}
          item={itemSheet.editing}
          equipment={equipment}
          onSave={saveItem}
        />

        <CsvItemImport
          open={showCsvImport}
          onClose={() => setShowCsvImport(false)}
          shipmentId={shipment.id}
          onDone={() => { setShowCsvImport(false); fetchShipment(); }}
        />

        <PackingSlipCapture
          open={showCapture}
          onClose={() => setShowCapture(false)}
          shipmentId={shipment.id}
          expectedItems={items}
          onComplete={handleScanComplete}
          mode={captureMode}
        />

        <ScannerChoiceDialog
          open={importChooserOpen}
          onClose={() => setImportChooserOpen(false)}
          title="How will you scan the invoice?"
          onChoose={(choice) => {
            setImportChooserOpen(false);
            if (choice === 'camera') {
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
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2ShipmentDetail;
