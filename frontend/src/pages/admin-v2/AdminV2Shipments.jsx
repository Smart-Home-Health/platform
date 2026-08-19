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
// Deliveries — every shipment for the selected patient.
//
// Grouped by whether the shipment is still moving: the ones you can act on
// first, the ones that already landed underneath. The three counts at the top
// name the states worth interrupting for, and each opens the list filtered to
// what it counted rather than being a number with no way in.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import { PlusIcon, PackageIcon, SearchIcon } from '../../components/Icons';
import ShipmentCard from '../../components/shipment/ShipmentCard';
import ShipmentDetailsModal from '../../components/shipment/ShipmentDetailsModal';
import ChipGroup from '../../components/vc/ChipGroup';
import { shipmentService } from '../../services/shipments';
import { businessService } from '../../services/businesses';
import {
  STATUS_FILTERS, statusLabel, isOpen, needsAttention,
} from '../../lib/shipmentStatus';
import './AdminV2.css';
import './components/shipments-page.css';

const shortDate = (value) => (value
  ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase()
  : null);

/** Tracking numbers are long and the card is narrow; keep both ends. */
const shortTracking = (value) => {
  if (!value) return null;
  return value.length > 12 ? `${value.slice(0, 4)}…${value.slice(-3)}` : value;
};

const AdminV2Shipments = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    patients, selectedPatient: contextPatient,
    selectPatient: setContextPatient, loadingPatients,
  } = useAdminPatient();

  const selectedPatient = contextPatient;

  const [shipments, setShipments] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [creatingDelivery, setCreatingDelivery] = useState(false);
  const [busy, setBusy] = useState(false);

  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.is_system_admin) return true;
    return user.permissions?.includes(permission) || false;
  };

  // The endpoints behind these all require shipments.*; the old page gated
  // them on equipment.*, so a role with one and not the other saw buttons
  // that 403'd, or none where they would have worked.
  const canCreate = hasPermission('shipments.create');
  const canUpdate = hasPermission('shipments.update');
  const canDelete = hasPermission('shipments.delete');

  useEffect(() => {
    const patientId = searchParams.get('patient');
    if (patientId && patients.length > 0) {
      const patient = patients.find((p) => p.id === parseInt(patientId, 10));
      if (patient && patient.id !== contextPatient?.id) setContextPatient(patient);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-way URL→context sync; adding contextPatient would re-run on selection change and revert it to the stale URL param
  }, [searchParams, patients, loadingPatients]);

  useEffect(() => {
    if (contextPatient && searchParams.get('patient') !== String(contextPatient.id)) {
      setSearchParams({ patient: contextPatient.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-way context→URL sync; runs only when the selection changes
  }, [contextPatient]);

  const fetchAll = useCallback(async () => {
    if (!selectedPatient) return;
    setLoading(true);
    setError(null);
    try {
      const [list, templateList, supplierList] = await Promise.all([
        shipmentService.listShipments({
          patient_id: selectedPatient.id,
          is_template: false,
          status: statusFilter || undefined,
        }),
        shipmentService.listTemplates(selectedPatient.id),
        businessService.listDmeSuppliers(),
      ]);
      setShipments(list.shipments || []);
      setTemplates(templateList.shipments || []);
      setSuppliers(supplierList);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedPatient, statusFilter]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const supplierName = useCallback((shipment) => (
    shipment.supplier_name
      || suppliers.find((s) => s.id === shipment.supplier_id)?.name
      || null
  ), [suppliers]);

  const openShipment = (id) => navigate(
    `/care/equipment/shipments/${id}?patient=${selectedPatient.id}`,
  );

  // --- Counts. Derived from the loaded list, so they describe what is here. ---
  const counts = useMemo(() => ({
    open: shipments.filter(isOpen).length,
    draft: shipments.filter((s) => s.status === 'draft').length,
    attention: shipments.filter(needsAttention).length,
  }), [shipments]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return shipments;
    return shipments.filter((s) => [
      s.order_number, s.po_number, s.tracking_number, supplierName(s), `#${s.id}`,
    ].some((field) => String(field || '').toLowerCase().includes(needle)));
  }, [shipments, search, supplierName]);

  const inProgress = visible.filter(isOpen);
  const recent = visible.filter((s) => !isOpen(s));

  // --- Actions ---

  const handleDeliveryArrived = async (templateId) => {
    setCreatingDelivery(true);
    setError(null);
    try {
      const result = await shipmentService.createDeliveryFromTemplate(templateId);
      if (result.success) openShipment(result.id);
      else setError(result.error || 'Failed to create delivery');
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingDelivery(false);
    }
  };

  const handleCreate = async (payload) => {
    setBusy(true);
    try {
      const result = await shipmentService.createShipment({
        ...payload, patient_id: selectedPatient.id,
      });
      if (!result.success) throw new Error(result.error || 'Failed to create shipment');
      setCreateOpen(false);
      openShipment(result.id);
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async (shipment) => {
    try {
      const result = await shipmentService.copyShipment(shipment.id);
      if (result.success) openShipment(result.id);
      else setError(result.error || 'Failed to copy shipment');
    } catch (err) {
      setError(err.message);
    }
  };

  // Turn a past delivery into the standing order: clone it (clearing receipts,
  // order numbers and received quantities), then flag the clone as template.
  const handleSaveAsUsual = async (shipment) => {
    try {
      const copy = await shipmentService.copyShipment(shipment.id);
      if (!copy.success) throw new Error(copy.error || 'Failed to copy shipment');
      await shipmentService.patchShipment(copy.id, { is_template: true });
      fetchAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (shipment) => {
    const label = shipment.order_number || shipment.po_number || `#${shipment.id}`;
    if (!window.confirm(`Delete draft ${label}? This cannot be undone.`)) return;
    try {
      const result = await shipmentService.deleteShipment(shipment.id);
      if (result.success) fetchAll();
      else setError(result.error || 'Failed to delete shipment');
    } catch (err) {
      setError(err.message);
    }
  };

  // --- Card shaping. What is worth showing depends on where it is. ---

  const detailsFor = (shipment) => {
    if (shipment.status === 'draft') {
      return [
        { label: 'Updated', value: shortDate(shipment.updated_at) },
        { label: 'Items', value: shipment.item_count ?? 0 },
        { label: 'Type', value: shipment.is_backorder ? 'BACKORDER' : 'REGULAR' },
      ];
    }
    if (isOpen(shipment)) {
      return [
        { label: 'Expected', value: shortDate(shipment.expected_delivery) },
        { label: 'Tracking', value: shortTracking(shipment.tracking_number) },
        { label: 'Items', value: shipment.item_count ?? 0 },
      ];
    }
    return [
      { label: 'Received', value: shortDate(shipment.actual_delivery || shipment.finalized_at) },
      { label: 'Items', value: shipment.item_count ?? 0 },
      { label: 'Type', value: shipment.is_backorder ? 'BACKORDER' : 'REGULAR' },
    ];
  };

  const actionFor = (shipment) => {
    if (shipment.status === 'draft') {
      return { label: 'Continue draft', onClick: () => openShipment(shipment.id) };
    }
    if (isOpen(shipment)) {
      return { label: 'Open delivery', onClick: () => openShipment(shipment.id) };
    }
    return { label: 'View receipt', onClick: () => openShipment(shipment.id) };
  };

  const menuFor = (shipment) => {
    const menu = [];
    if (canCreate) menu.push({ label: 'Copy to new draft', onClick: () => handleCopy(shipment) });
    if (canUpdate && !isOpen(shipment)) {
      menu.push({ label: 'Save as usual order', onClick: () => handleSaveAsUsual(shipment) });
    }
    if (canDelete && shipment.status === 'draft') {
      menu.push({ label: 'Delete draft', onClick: () => handleDelete(shipment), danger: true });
    }
    return menu;
  };

  const renderCard = (shipment) => (
    <ShipmentCard
      key={shipment.id}
      shipment={shipment}
      supplierName={supplierName(shipment)}
      details={detailsFor(shipment)}
      action={actionFor(shipment)}
      menu={menuFor(shipment)}
      showRail={isOpen(shipment) && shipment.status !== 'draft'}
      onOpen={() => openShipment(shipment.id)}
    />
  );

  if (loadingPatients) {
    return <AdminV2Layout><div className="admin-v2-loading">Loading patients…</div></AdminV2Layout>;
  }

  if (!selectedPatient) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-loading">Select a patient from the sidebar</div>
      </AdminV2Layout>
    );
  }

  return (
    <AdminV2Layout>
      <div className="admin-v2-page sh-page">
        {error && <div className="sh-error" role="alert">{error}</div>}

        {/* The zero-effort path: the recurring box turned up, start here. */}
        {templates.length > 0 && canCreate && (
          <section className="sh-usual">
            <h2 className="sh-usual-title">Usual order{templates.length > 1 ? 's' : ''}</h2>
            <p className="sh-usual-note">
              Supplies that arrive on a schedule. When the box shows up, start here.
            </p>
            <div className="sh-usual-actions">
              {templates.map((t) => (
                <button key={t.id} type="button" className="sh-btn primary"
                        disabled={creatingDelivery}
                        onClick={() => handleDeliveryArrived(t.id)}>
                  <PackageIcon size={16} />
                  {creatingDelivery ? 'One moment…' : (
                    templates.length > 1
                      ? `Arrived — ${supplierName(t) || t.order_number || `#${t.id}`}`
                      : 'A delivery arrived'
                  )}
                </button>
              ))}
              {templates.map((t) => (
                <button key={`view-${t.id}`} type="button" className="sh-btn ghost"
                        onClick={() => openShipment(t.id)}>
                  View usual order
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="sh-head">
          <h1 className="sh-title">Shipments</h1>
          <div className="sh-head-actions">
            <button type="button" className={`sh-btn ghost ${showSearch ? 'active' : ''}`}
                    aria-label="Search shipments" aria-expanded={showSearch}
                    onClick={() => { setShowSearch((v) => !v); if (showSearch) setSearch(''); }}>
              <SearchIcon size={16} /> Search
            </button>
            {canCreate && (
              <button type="button" className="sh-btn primary" onClick={() => setCreateOpen(true)}>
                <PlusIcon size={16} /> New
              </button>
            )}
          </div>
        </div>

        {/* Each count filters to what it counted — a number you can act on. */}
        <div className="sh-stats">
          <button type="button" className="sh-stat" onClick={() => setStatusFilter('')}>
            <span className="sh-stat-label">Open</span>
            <span className="sh-stat-value tone-accent">{counts.open}</span>
          </button>
          <button type="button" className="sh-stat" onClick={() => setStatusFilter('draft')}>
            <span className="sh-stat-label">Drafts</span>
            <span className="sh-stat-value tone-due">{counts.draft}</span>
          </button>
          <button type="button" className="sh-stat"
                  onClick={() => navigate(`/care/equipment/alerts?patient=${selectedPatient.id}`)}>
            <span className="sh-stat-label">Needs attention</span>
            <span className={`sh-stat-value ${counts.attention ? 'tone-alert' : 'tone-idle'}`}>
              {counts.attention}
            </span>
          </button>
        </div>

        {showSearch && (
          <div className="sh-search">
            <SearchIcon size={16} />
            <input type="text" value={search} autoFocus
                   aria-label="Search shipments"
                   placeholder="Order, PO, tracking or supplier"
                   onChange={(e) => setSearch(e.target.value)} />
          </div>
        )}

        <ChipGroup
          options={[
            { value: '', label: 'All' },
            ...STATUS_FILTERS.map((s) => ({ value: s, label: statusLabel(s) })),
          ]}
          value={statusFilter}
          onChange={setStatusFilter}
          label="Status"
          scroll
        />

        {loading ? (
          <div className="admin-v2-loading">Loading shipments…</div>
        ) : visible.length === 0 ? (
          <div className="sh-empty">
            <PackageIcon size={28} />
            <p>{search || statusFilter ? 'Nothing matches that.' : 'No shipments yet.'}</p>
          </div>
        ) : (
          <>
            {inProgress.length > 0 && (
              <section className="sh-group">
                <h2 className="sh-group-title">In progress ({inProgress.length})</h2>
                <div className="sh-list">{inProgress.map(renderCard)}</div>
              </section>
            )}
            {recent.length > 0 && (
              <section className="sh-group">
                <h2 className="sh-group-title">Recent ({recent.length})</h2>
                <div className="sh-list">{recent.map(renderCard)}</div>
              </section>
            )}
          </>
        )}

        <ShipmentDetailsModal
          open={createOpen}
          onOpenChange={setCreateOpen}
          suppliers={suppliers}
          saving={busy}
          onSave={handleCreate}
        />
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Shipments;
