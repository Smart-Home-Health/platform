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
// Equipment overview: what is due, what is short, what is on its way.
//
// Every number here opens the thing it counted rather than being a figure
// with no way in, and each panel says where its rule came from — the due
// dates are the server's own, and readiness counts supplies at par rather
// than summing quantities across units that do not add up.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import PatientGate from './components/PatientGate';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import {
  EquipmentIcon, ClockIcon, AlertIcon, PackageIcon, EditIcon,
  BarcodeIcon, ChevronRightIcon, CalendarIcon, CheckCircleIcon, PlusIcon,
} from '../../components/Icons';
import { equipmentService } from '../../services/equipment';
import { shipmentService } from '../../services/shipments';
import { statusInfo, stepStates, isOpen } from '../../lib/shipmentStatus';
import {
  overviewCounts, attentionItems, readinessByCategory, belowMinimumCount,
  upcomingChanges, dueState,
} from '../../lib/equipmentOverview';
import './AdminV2.css';
import './components/shipments-page.css';
import './components/equipment-overview.css';

const dayLabel = (date) => date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const stamp = (value) => (value
  ? new Date(value).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
  : '—');

// What to call each reason an item is on the attention list.
const REASON = {
  overdue: { label: 'Overdue', tone: 'alert' },
  due: { label: 'Due today', tone: 'due' },
  soon: { label: 'Due soon', tone: 'idle' },
  out: { label: 'None on hand', tone: 'alert' },
  reorder: { label: 'Reorder', tone: 'due' },
  low: { label: 'Low', tone: 'due' },
};

const AdminV2EquipmentOverview = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    patients, selectedPatient: contextPatient,
    selectPatient: setContextPatient, loadingPatients,
  } = useAdminPatient();
  const selectedPatient = contextPatient;

  const [equipment, setEquipment] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [showAllAttention, setShowAllAttention] = useState(false);

  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.is_system_admin) return true;
    return user.permissions?.includes(permission) || false;
  };

  const canChange = hasPermission('equipment.change');
  const canManage = hasPermission('equipment.update');
  const canReceive = hasPermission('shipments.receive');

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
      const [eq, ships, history] = await Promise.all([
        equipmentService.list(selectedPatient.id),
        shipmentService.listShipments({ patient_id: selectedPatient.id, is_template: false }),
        equipmentService.changeHistory({ patientId: selectedPatient.id, limit: 8 }),
      ]);
      setEquipment(Array.isArray(eq) ? eq : (eq.equipment || []));
      setShipments((ships.shipments || []).filter(isOpen));
      setActivity(history.history || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedPatient]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const counts = useMemo(
    () => overviewCounts(equipment, shipments),
    [equipment, shipments],
  );
  const attention = useMemo(() => attentionItems(equipment), [equipment]);
  const readiness = useMemo(() => readinessByCategory(equipment), [equipment]);
  const belowMin = useMemo(() => belowMinimumCount(equipment), [equipment]);
  const upcoming = useMemo(() => upcomingChanges(equipment), [equipment]);

  // The soonest arrival is the one worth a panel; the rest are on Deliveries.
  const incoming = useMemo(() => [...shipments].sort((a, b) => (
    new Date(a.expected_delivery || '2999-01-01') - new Date(b.expected_delivery || '2999-01-01')
  ))[0], [shipments]);

  const goto = (path) => navigate(`${path}?patient=${selectedPatient.id}`);

  const logChange = async (item) => {
    setBusyId(item.id);
    setError(null);
    try {
      await equipmentService.logChange(item.id, new Date().toISOString());
      await fetchAll();
    } catch (err) {
      // The API refuses a change that would take tracked stock below zero and
      // says so; surfacing its wording keeps the reason specific.
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  if (loadingPatients) {
    return <AdminV2Layout><div className="admin-v2-loading">Loading patients…</div></AdminV2Layout>;
  }
  if (!selectedPatient) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-page">
          <PatientGate message="Choose a patient to view their equipment." />
        </div>
      </AdminV2Layout>
    );
  }

  const shownAttention = showAllAttention ? attention : attention.slice(0, 5);

  return (
    <AdminV2Layout>
      <div className="admin-v2-page sh-page eo-page">
        {error && <div className="sh-error" role="alert">{error}</div>}

        <div className="eo-head">
          <div>
            <h1 className="sh-title">Equipment overview</h1>
            <p className="eo-sub">Home equipment, supply readiness, and upcoming care.</p>
          </div>
          <div className="eo-head-actions">
            {canReceive && (
              <button type="button" className="sh-btn"
                      onClick={() => goto(incoming
                        ? `/care/equipment/shipments/${incoming.id}`
                        : '/care/equipment/shipments')}>
                <BarcodeIcon size={16} /> Scan / receive
              </button>
            )}
            {canManage && (
              <button type="button" className="sh-btn" onClick={() => goto('/care/equipment/inventory')}>
                <EquipmentIcon size={16} /> Manage
              </button>
            )}
          </div>
        </div>

        {/* Each tile opens what it counted. */}
        <div className="eo-stats">
          <button type="button" className="eo-stat" onClick={() => goto('/care/equipment/inventory')}>
            <EquipmentIcon size={22} />
            <span className="eo-stat-value">{counts.tracked}</span>
            <span className="eo-stat-label">Tracked</span>
          </button>
          <button type="button" className="eo-stat" onClick={() => setShowAllAttention(true)}>
            <ClockIcon size={22} />
            <span className="eo-stat-value tone-due">{counts.dueNow}</span>
            <span className="eo-stat-label">Due now</span>
          </button>
          <button type="button" className="eo-stat" onClick={() => goto('/care/equipment/inventory')}>
            <AlertIcon size={22} />
            <span className={`eo-stat-value ${counts.lowStock ? 'tone-alert' : ''}`}>
              {counts.lowStock}
            </span>
            <span className="eo-stat-label">Low stock</span>
          </button>
          <button type="button" className="eo-stat" onClick={() => goto('/care/equipment/shipments')}>
            <PackageIcon size={22} />
            <span className="eo-stat-value tone-accent">{counts.incoming}</span>
            <span className="eo-stat-label">Incoming</span>
          </button>
        </div>

        {loading && equipment.length === 0 ? (
          <div className="admin-v2-loading">Loading equipment…</div>
        ) : (
          <div className="eo-grid">
            {/* --- Needs attention --- */}
            <section className="sd-section eo-span">
              <h2 className="sd-section-title">Needs attention</h2>
              {attention.length === 0 ? (
                <div className="sh-empty">
                  <CheckCircleIcon size={26} />
                  <p>Nothing due and nothing short.</p>
                </div>
              ) : (
                <>
                  <ul className="eo-rows">
                    {shownAttention.map(({ item, lead, reasons }) => (
                      <li key={item.id} className="eo-row">
                        <span className="eo-row-icon"><EquipmentIcon size={18} /></span>
                        <div className="eo-row-text">
                          <span className="eo-row-name">{item.name}</span>
                          <span className="eo-row-sub">
                            {item.scheduled_replacement ? 'Scheduled change' : 'Supply'}
                            {item.category ? ` · ${item.category}` : ''}
                          </span>
                        </div>
                        <div className="eo-row-flags">
                          {reasons.map((r) => (
                            <span key={r} className={`eo-flag tone-${REASON[r].tone}`}>
                              {REASON[r].label}
                            </span>
                          ))}
                        </div>
                        <div className="eo-row-qty">
                          <span className={`eo-qty ${item.quantity === 0 ? 'tone-alert' : ''}`}>
                            {item.quantity ?? '—'}
                          </span>
                          <span className="eo-qty-label">On hand</span>
                        </div>
                        {/* Only a scheduled item can have a change logged; a
                            supply that is merely short is restocked instead. */}
                        {canChange && item.scheduled_replacement && ['overdue', 'due', 'soon'].includes(lead) ? (
                          <button type="button" className="sh-btn" disabled={busyId === item.id}
                                  onClick={() => logChange(item)}>
                            <EditIcon size={15} />
                            {busyId === item.id ? 'Saving…' : 'Log change'}
                          </button>
                        ) : (
                          <button type="button" className="sh-btn ghost"
                                  onClick={() => goto('/care/equipment/shipments')}>
                            <PlusIcon size={15} /> Order
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                  {attention.length > shownAttention.length && (
                    <button type="button" className="eo-more"
                            onClick={() => setShowAllAttention(true)}>
                      View all {attention.length} attention items
                      <ChevronRightIcon size={16} />
                    </button>
                  )}
                </>
              )}
            </section>

            {/* --- Incoming shipment --- */}
            <section className="sd-section">
              <h2 className="sd-section-title">
                <PackageIcon size={16} /> Incoming shipment
              </h2>
              {!incoming ? (
                <div className="sh-empty">
                  <PackageIcon size={24} />
                  <p>Nothing on its way.</p>
                </div>
              ) : (
                <>
                  <div className="eo-ship-head">
                    <div>
                      <p className="eo-ship-supplier">{incoming.supplier_name || 'Supplier not set'}</p>
                      <p className="eo-ship-id">
                        Shipment {incoming.order_number || incoming.po_number || `#${incoming.id}`}
                      </p>
                    </div>
                    <span className={`sc-status tone-${statusInfo(incoming.status).tone}`}>
                      {statusInfo(incoming.status).label}
                    </span>
                  </div>
                  <dl className="eo-ship-facts">
                    <div>
                      <dt>Expected</dt>
                      <dd>{incoming.expected_delivery
                        ? dayLabel(new Date(incoming.expected_delivery)) : 'Not set'}</dd>
                    </div>
                    <div><dt>Items</dt><dd>{incoming.item_count ?? 0}</dd></div>
                  </dl>
                  {/* The same rail the Deliveries cards draw. */}
                  <div className="sc-rail">
                    {stepStates(incoming).map((s, i) => (
                      <div key={s.label} className={`sc-step is-${s.state}`}>
                        {i > 0 && <span className="sc-rail-line" />}
                        <span className="sc-rail-node" />
                        <span className="sc-step-label">{s.label}</span>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="sh-btn"
                          onClick={() => goto(`/care/equipment/shipments/${incoming.id}`)}>
                    Open delivery
                  </button>
                </>
              )}
            </section>

            {/* --- Stock readiness --- */}
            <section className="sd-section">
              <h2 className="sd-section-title">Stock readiness</h2>
              {readiness.length === 0 ? (
                <p className="sd-hint">
                  No supply has a reorder point or par level set, so there is nothing
                  to measure readiness against yet.
                </p>
              ) : (
                <>
                  <ul className="eo-bars">
                    {readiness.map((group) => (
                      <li key={group.category} className="eo-bar-row">
                        <span className="eo-bar-label">{group.category}</span>
                        <span className="eo-bar-track">
                          <span className={`eo-bar-fill ${group.percent < 50 ? 'tone-due' : ''}`}
                                style={{ width: `${group.percent}%` }} />
                        </span>
                        <span className="eo-bar-value">{group.percent}%</span>
                      </li>
                    ))}
                  </ul>
                  <p className="sd-hint">
                    Share of each category&rsquo;s supplies stocked to par.
                  </p>
                  {belowMin > 0 && (
                    <p className="eo-warn">
                      <AlertIcon size={15} />
                      {belowMin} item{belowMin === 1 ? '' : 's'} below minimum
                    </p>
                  )}
                </>
              )}
            </section>

            {/* --- Upcoming changes --- */}
            <section className="sd-section eo-span">
              <div className="sd-section-head">
                <h2 className="sd-section-title">
                  <CalendarIcon size={16} /> Upcoming changes
                </h2>
                <button type="button" className="sh-btn ghost"
                        onClick={() => goto('/care/schedule')}>
                  View schedule
                </button>
              </div>
              {upcoming.length === 0 ? (
                <p className="sd-hint">No scheduled changes in the next 30 days.</p>
              ) : (
                <ol className="eo-timeline">
                  {upcoming.map((group) => (
                    <li key={group.inDays} className={`eo-tl-step ${group.isToday ? 'is-today' : ''}`}>
                      <span className="eo-tl-node" />
                      <span className="eo-tl-date">
                        {dayLabel(group.date)}
                        {group.isToday && <span className="eo-tl-today">Today</span>}
                      </span>
                      <ul className="eo-tl-items">
                        {group.items.map((item) => (
                          <li key={item.id}>
                            {item.name}
                            {dueState(item) === 'overdue' && <span className="eo-tl-late">Overdue</span>}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {/* --- Recent activity --- */}
            <section className="sd-section">
              <h2 className="sd-section-title">Recent activity</h2>
              {activity.length === 0 ? (
                <p className="sd-hint">Nothing recorded yet.</p>
              ) : (
                <ul className="eo-activity">
                  {activity.map((entry) => (
                    <li key={entry.id}>
                      <EditIcon size={15} />
                      <span className="eo-act-text">{entry.equipment_name} changed</span>
                      <span className="eo-act-when">{stamp(entry.changed_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" className="sh-btn ghost"
                      onClick={() => goto('/care/equipment/history')}>
                Full history
              </button>
            </section>
          </div>
        )}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2EquipmentOverview;
