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
// Supplies — everything in the house, and everything you do to it.
//
// This was a read-only view of quantities, while adding, editing and deleting
// lived on a separate catalogue page with no tab pointing at it. The two are
// one page now: Supplies is the list and the management surface.
//
// It reads /api/equipment rather than /api/shipments/inventory. That summary
// omits nine fields the edit form needs, and answers the stock question with
// its own rule -- so the two pages could disagree about whether a supply was
// low. Stock state comes from the same stockState() the Overview uses.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import {
  EquipmentIcon, PlusIcon, SearchIcon, BarcodeIcon, MoreVerticalIcon,
  ClockIcon, PackageIcon,
} from '../../components/Icons';
import ChipGroup from '../../components/vc/ChipGroup';
import SupplySheet from '../../components/equipment/SupplySheet';
import SupplyCountModal from './components/SupplyCountModal';
import EquipmentRestockGate from '../../components/EquipmentRestockGate';
import { equipmentService } from '../../services/equipment';
import { stockState, dueState, isBelowMinimum } from '../../lib/equipmentOverview';
import './AdminV2.css';
import './components/shipments-page.css';
import './components/equipment-overview.css';
import './components/supplies-page.css';

const STOCK_LABEL = {
  out: { label: 'None on hand', tone: 'alert' },
  reorder: { label: 'Reorder', tone: 'due' },
  low: { label: 'Low', tone: 'due' },
  ok: { label: 'Stocked', tone: 'complete' },
  none: { label: 'Not tracked', tone: 'idle' },
};

const DUE_LABEL = {
  overdue: { label: 'Overdue', tone: 'alert' },
  due: { label: 'Due today', tone: 'due' },
  soon: { label: 'Due soon', tone: 'idle' },
};

// Worst first, so the list opens on what needs doing.
const STOCK_RANK = { out: 0, reorder: 1, low: 2, ok: 3, none: 4 };

const AdminV2Inventory = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    patients, selectedPatient: contextPatient,
    selectPatient: setContextPatient, loadingPatients,
  } = useAdminPatient();
  const selectedPatient = contextPatient;

  const [supplies, setSupplies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sheet, setSheet] = useState({ open: false, editing: null });
  const [counting, setCounting] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [restock, setRestock] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.is_system_admin) return true;
    return user.permissions?.includes(permission) || false;
  };

  // The old page showed Change, Receive and Use to everyone while the
  // endpoints behind them require a permission, so a read-only caregiver got
  // a 403 from a button that looked available.
  const canCreate = hasPermission('equipment.create');
  const canUpdate = hasPermission('equipment.update');
  const canDelete = hasPermission('equipment.delete');
  const canChange = hasPermission('equipment.change');

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

  const fetchSupplies = useCallback(async () => {
    if (!selectedPatient) return;
    setLoading(true);
    setError(null);
    try {
      const data = await equipmentService.list(selectedPatient.id);
      setSupplies(Array.isArray(data) ? data : (data.equipment || []));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedPatient]);

  useEffect(() => { fetchSupplies(); }, [fetchSupplies]);

  useEffect(() => {
    if (menuFor === null) return undefined;
    const close = () => setMenuFor(null);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menuFor]);

  // Categories come from the data. The old form offered a 'medication' option
  // that no filter handled, so those supplies were counted under nothing.
  const categories = useMemo(() => (
    [...new Set(supplies.map((s) => s.category).filter(Boolean))].sort()
  ), [supplies]);

  const counts = useMemo(() => {
    const tally = { out: 0, reorder: 0, low: 0, ok: 0, none: 0 };
    supplies.forEach((s) => { tally[stockState(s)] += 1; });
    return tally;
  }, [supplies]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return supplies
      .filter((s) => (!category || s.category === category))
      .filter((s) => (!needle || [s.name, s.item_number, s.description, s.storage_location]
        .some((v) => String(v || '').toLowerCase().includes(needle))))
      .sort((a, b) => (STOCK_RANK[stockState(a)] - STOCK_RANK[stockState(b)])
        || String(a.name || '').localeCompare(String(b.name || '')));
  }, [supplies, search, category]);

  const goto = (path) => navigate(`${path}?patient=${selectedPatient.id}`);

  const saveSupply = async (payload) => {
    if (sheet.editing) await equipmentService.update(sheet.editing.id, payload);
    else await equipmentService.create({ ...payload, patient_id: selectedPatient.id });
    setSheet({ open: false, editing: null });
    await fetchSupplies();
  };

  const removeSupply = async (supply) => {
    if (!window.confirm(`Remove ${supply.name}? This cannot be undone.`)) return;
    try {
      await equipmentService.remove(supply.id);
      fetchSupplies();
    } catch (err) {
      setError(err.message);
    }
  };

  const logChange = async (supply) => {
    setBusyId(supply.id);
    setError(null);
    try {
      await equipmentService.logChange(supply.id, new Date().toISOString());
      await fetchSupplies();
    } catch (err) {
      // The API answers 409 with the supply, its count and its unit when a
      // tracked change would take stock below zero. Carry that into the
      // restock gate so the fix is one step, not a dead end.
      if (err.payload?.error === 'insufficient_quantity') setRestock(err.payload);
      else setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const moveStock = async (supply, direction) => {
    const what = direction === 'receive' ? 'received' : 'used';
    const raw = window.prompt(`How many ${supply.name} were ${what}?`, '1');
    if (raw === null) return;
    const amount = parseInt(raw, 10);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a whole number greater than zero.');
      return;
    }
    if (direction === 'open' && amount > (supply.quantity ?? 0)) {
      setError(`Only ${supply.quantity ?? 0} of ${supply.name} on hand.`);
      return;
    }
    try {
      if (direction === 'receive') await equipmentService.receive(supply.id, amount);
      else await equipmentService.open(supply.id, amount);
      fetchSupplies();
    } catch (err) {
      setError(err.message);
    }
  };

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

  const menuFor_ = (supply) => {
    const entries = [];
    if (canUpdate) {
      entries.push({ label: 'Edit', onClick: () => setSheet({ open: true, editing: supply }) });
      entries.push({ label: 'Record what arrived', onClick: () => moveStock(supply, 'receive') });
      entries.push({ label: 'Record what was used', onClick: () => moveStock(supply, 'open') });
    }
    if (canDelete) {
      entries.push({ label: 'Remove', onClick: () => removeSupply(supply), danger: true });
    }
    return entries;
  };

  return (
    <AdminV2Layout>
      <div className="admin-v2-page sh-page sup-page">
        {error && <div className="sh-error" role="alert">{error}</div>}

        <div className="eo-head">
          <div>
            <h1 className="sh-title">Supplies</h1>
            <p className="eo-sub">Everything tracked in the house, and what is running out.</p>
          </div>
          <div className="eo-head-actions">
            <button type="button" className="sh-btn"
                    onClick={() => goto('/care/equipment/inventory/setup')}>
              <BarcodeIcon size={16} /> Scan a packing slip
            </button>
            {canCreate && (
              <button type="button" className="sh-btn primary"
                      onClick={() => setSheet({ open: true, editing: null })}>
                <PlusIcon size={16} /> Add supply
              </button>
            )}
          </div>
        </div>

        <div className="eo-stats sup-stats">
          <div className="eo-stat as-static">
            <PackageIcon size={22} />
            <span className="eo-stat-value tone-alert">{counts.out + counts.reorder}</span>
            <span className="eo-stat-label">Time to reorder</span>
          </div>
          <div className="eo-stat as-static">
            <ClockIcon size={22} />
            <span className="eo-stat-value tone-due">{counts.low}</span>
            <span className="eo-stat-label">Running low</span>
          </div>
          <div className="eo-stat as-static">
            <EquipmentIcon size={22} />
            <span className="eo-stat-value tone-accent">{counts.ok}</span>
            <span className="eo-stat-label">Stocked</span>
          </div>
          <div className="eo-stat as-static">
            <EquipmentIcon size={22} />
            <span className="eo-stat-value">{supplies.length}</span>
            <span className="eo-stat-label">Tracked</span>
          </div>
        </div>

        <div className="sh-search">
          <SearchIcon size={16} />
          <input type="text" value={search} aria-label="Search supplies"
                 placeholder="Search name, item number or location"
                 onChange={(e) => setSearch(e.target.value)} />
        </div>

        {categories.length > 1 && (
          <ChipGroup
            options={[{ value: '', label: 'All' },
              ...categories.map((c) => ({ value: c, label: c }))]}
            value={category}
            onChange={setCategory}
            label="Category"
            scroll
          />
        )}

        {loading && supplies.length === 0 ? (
          <div className="admin-v2-loading">Loading supplies…</div>
        ) : supplies.length === 0 ? (
          <div className="sh-empty">
            <EquipmentIcon size={28} />
            <p>Nothing tracked yet.</p>
            <p className="sd-hint">
              Scan a packing slip to build the list from a delivery, or add supplies one
              at a time.
            </p>
            <div className="sd-actions">
              <button type="button" className="sh-btn"
                      onClick={() => goto('/care/equipment/inventory/setup')}>
                <BarcodeIcon size={16} /> Scan a packing slip
              </button>
              {canCreate && (
                <button type="button" className="sh-btn primary"
                        onClick={() => setSheet({ open: true, editing: null })}>
                  <PlusIcon size={16} /> Add supply
                </button>
              )}
            </div>
          </div>
        ) : visible.length === 0 ? (
          <div className="sh-empty">
            <SearchIcon size={26} />
            <p>Nothing matches that.</p>
          </div>
        ) : (
          <ul className="sup-list">
            {visible.map((supply) => {
              const stock = stockState(supply);
              const due = dueState(supply);
              const menu = menuFor_(supply);
              return (
                <li key={supply.id} className={`sup-row ${isBelowMinimum(supply) ? 'is-short' : ''}`}>
                  <div className="sup-main">
                    <span className="sup-name">{supply.name}</span>
                    <span className="sup-sub">
                      {supply.item_number ? `#${supply.item_number}` : null}
                      {supply.item_number && supply.storage_location ? ' · ' : ''}
                      {supply.storage_location || null}
                      {!supply.item_number && !supply.storage_location && supply.category
                        ? supply.category : null}
                    </span>
                  </div>

                  <div className="sup-flags">
                    <span className={`eo-flag tone-${STOCK_LABEL[stock].tone}`}>
                      {STOCK_LABEL[stock].label}
                    </span>
                    {DUE_LABEL[due] && (
                      <span className={`eo-flag tone-${DUE_LABEL[due].tone}`}>
                        {DUE_LABEL[due].label}
                      </span>
                    )}
                  </div>

                  <div className="sup-qty">
                    <span className="sup-qty-value">{supply.quantity ?? '—'}</span>
                    <span className="sup-qty-label">
                      {/* Say what "keep 12" means rather than printing a bare
                          number under a number. */}
                      {supply.par_level != null ? `of ${supply.par_level}` : 'on hand'}
                    </span>
                  </div>

                  <div className="sup-actions">
                    {canUpdate && (
                      <button type="button" className="sh-btn ghost"
                              onClick={() => setCounting(supply)}>
                        Count
                      </button>
                    )}
                    {canChange && supply.scheduled_replacement && (
                      <button type="button" className="sh-btn" disabled={busyId === supply.id}
                              onClick={() => logChange(supply)}>
                        {busyId === supply.id ? 'Saving…' : 'Log change'}
                      </button>
                    )}
                    {menu.length > 0 && (
                      <div className="sc-menu-wrap">
                        <button type="button" className="sc-kebab"
                                aria-label={`Actions for ${supply.name}`}
                                aria-haspopup="menu" aria-expanded={menuFor === supply.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMenuFor(menuFor === supply.id ? null : supply.id);
                                }}>
                          <MoreVerticalIcon size={18} />
                        </button>
                        {menuFor === supply.id && (
                          <div className="sc-menu" role="menu">
                            {menu.map((entry) => (
                              <button key={entry.label} type="button" role="menuitem"
                                      className={`sc-menu-item ${entry.danger ? 'danger' : ''}`}
                                      onClick={() => { setMenuFor(null); entry.onClick(); }}>
                                {entry.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <SupplySheet
          open={sheet.open}
          onOpenChange={(o) => setSheet({ open: o, editing: o ? sheet.editing : null })}
          supply={sheet.editing}
          onSave={saveSupply}
        />

        {counting && (
          <SupplyCountModal
            open
            item={counting}
            onClose={() => setCounting(null)}
            onSaved={() => { setCounting(null); fetchSupplies(); }}
          />
        )}

        <EquipmentRestockGate
          info={restock}
          onClose={() => setRestock(null)}
          onUpdated={() => { setRestock(null); fetchSupplies(); }}
        />
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Inventory;
