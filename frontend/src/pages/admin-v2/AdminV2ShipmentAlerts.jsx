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
// What a delivery got wrong: short counts, damage, the wrong item, and what
// the supplier still owes. Each one is either resolved or turned into a
// follow-up order.
//
// The follow-up used to navigate to `result.shipment_id`, a key the endpoint
// does not return -- it returns followup_shipment_id -- so a successful
// follow-up landed on /shipments/undefined. Its supplier picker was inert
// too: the request model takes alert_ids and nothing else, so the chosen
// supplier was dropped on the floor. The follow-up inherits the supplier of
// the shipment the alerts came from, which is what it always did.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import PatientGate from './components/PatientGate';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import { AlertIcon, CheckIcon, PackageIcon } from '../../components/Icons';
import ChipGroup from '../../components/vc/ChipGroup';
import { shipmentService } from '../../services/shipments';
import './AdminV2.css';
import './components/shipments-page.css';

const ALERT_TYPES = [
  { value: '', label: 'All' },
  { value: 'short', label: 'Short' },
  { value: 'wrong_item', label: 'Wrong item' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'extra', label: 'Extra' },
  { value: 'backorder', label: 'Backorder' },
];

const TYPE_LABEL = Object.fromEntries(ALERT_TYPES.map((t) => [t.value, t.label]));

const shortDate = (value) => (value ? new Date(value).toLocaleDateString() : '—');

const AdminV2ShipmentAlerts = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const {
    patients, selectedPatient: contextPatient,
    selectPatient: setContextPatient, loadingPatients,
  } = useAdminPatient();
  const selectedPatient = contextPatient;

  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [typeFilter, setTypeFilter] = useState('');
  const [showResolved, setShowResolved] = useState(false);
  const [selected, setSelected] = useState([]);
  const [creating, setCreating] = useState(false);

  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.is_system_admin) return true;
    return user.permissions?.includes(permission) || false;
  };

  const canUpdate = hasPermission('shipments.update');
  const canCreate = hasPermission('shipments.create');

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

  const fetchAlerts = useCallback(async () => {
    if (!selectedPatient) return;
    setLoading(true);
    setError(null);
    try {
      const data = await shipmentService.listAlerts({
        patient_id: selectedPatient.id,
        alert_type: typeFilter || undefined,
        // The endpoint reads this as the string 'true'; anything else means
        // unresolved, so send it only when we actually want resolved ones.
        resolved: showResolved ? 'true' : undefined,
      });
      setAlerts(data.alerts || []);
      setSelected([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedPatient, typeFilter, showResolved]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const visible = useMemo(
    () => (showResolved ? alerts : alerts.filter((a) => !a.resolved)),
    [alerts, showResolved],
  );
  const selectable = visible.filter((a) => !a.resolved);

  const toggle = (alertId) => setSelected((prev) => (
    prev.includes(alertId) ? prev.filter((x) => x !== alertId) : [...prev, alertId]
  ));

  const toggleAll = () => setSelected(
    selected.length === selectable.length ? [] : selectable.map((a) => a.id),
  );

  const resolve = async (alertId) => {
    try {
      await shipmentService.resolveAlert(alertId);
      fetchAlerts();
    } catch (err) {
      setError(err.message);
    }
  };

  const createFollowup = async () => {
    if (selected.length === 0) return;
    setCreating(true);
    setError(null);
    try {
      const result = await shipmentService.createFollowupOrder(selected);
      if (result.success && result.followup_shipment_id) {
        navigate(
          `/care/equipment/shipments/${result.followup_shipment_id}?patient=${selectedPatient.id}`,
        );
      } else {
        setError(result.error || 'Failed to create the follow-up order');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  if (loadingPatients) {
    return <AdminV2Layout><div className="admin-v2-loading">Loading patients…</div></AdminV2Layout>;
  }
  if (!selectedPatient) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-page">
          <PatientGate message="Choose a patient to view their delivery alerts." />
        </div>
      </AdminV2Layout>
    );
  }

  const unresolved = alerts.filter((a) => !a.resolved).length;

  return (
    <AdminV2Layout>
      <div className="admin-v2-page sh-page">
        {error && <div className="sh-error" role="alert">{error}</div>}

        <div className="sh-head">
          <h1 className="sh-title">Delivery problems</h1>
          <div className="sh-head-actions">
            <button type="button" className={`sh-btn ${showResolved ? 'active' : ''}`}
                    aria-pressed={showResolved}
                    onClick={() => setShowResolved((v) => !v)}>
              {showResolved ? 'Hide resolved' : 'Show resolved'}
            </button>
            {canCreate && selected.length > 0 && (
              <button type="button" className="sh-btn primary" disabled={creating}
                      onClick={createFollowup}>
                <PackageIcon size={16} />
                {creating ? 'Creating…' : `Order the difference (${selected.length})`}
              </button>
            )}
          </div>
        </div>

        <ChipGroup options={ALERT_TYPES} value={typeFilter} onChange={setTypeFilter}
                   label="Problem" scroll />

        {loading ? (
          <div className="admin-v2-loading">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="sh-empty">
            <CheckIcon size={26} />
            <p>{unresolved === 0 && !showResolved
              ? 'Nothing outstanding — every delivery reconciled.'
              : 'Nothing matches that.'}</p>
          </div>
        ) : (
          <>
            {canCreate && selectable.length > 0 && (
              <label className="sa-selectall">
                <input type="checkbox"
                       checked={selected.length === selectable.length && selectable.length > 0}
                       onChange={toggleAll} />
                <span>Select all {selectable.length} outstanding</span>
              </label>
            )}

            <div className="sh-list">
              {visible.map((a) => (
                <article key={a.id} className={`sa-card ${a.resolved ? 'is-resolved' : ''}`}>
                  <div className="sa-head">
                    {canCreate && !a.resolved && (
                      <input type="checkbox" aria-label={`Select ${TYPE_LABEL[a.alert_type] || a.alert_type} alert`}
                             checked={selected.includes(a.id)} onChange={() => toggle(a.id)} />
                    )}
                    <AlertIcon size={16} />
                    <span className="sa-type">{TYPE_LABEL[a.alert_type] || a.alert_type}</span>
                    {a.resolved
                      ? <span className="sa-tag resolved">Resolved</span>
                      : <span className="sa-tag open">Outstanding</span>}
                  </div>

                  {a.notes && <p className="sa-notes">{a.notes}</p>}

                  <dl className="sa-facts">
                    <div><dt>Expected</dt><dd>{a.expected_qty ?? '—'}</dd></div>
                    <div><dt>Actual</dt><dd>{a.actual_qty ?? '—'}</dd></div>
                    <div><dt>Raised</dt><dd>{shortDate(a.created_at)}</dd></div>
                  </dl>

                  <div className="sa-actions">
                    <button type="button" className="sh-btn ghost"
                            onClick={() => navigate(
                              `/care/equipment/shipments/${a.shipment_id}?patient=${selectedPatient.id}`,
                            )}>
                      Open the delivery
                    </button>
                    {a.followup_shipment_id && (
                      <button type="button" className="sh-btn ghost"
                              onClick={() => navigate(
                                `/care/equipment/shipments/${a.followup_shipment_id}?patient=${selectedPatient.id}`,
                              )}>
                        Open the follow-up
                      </button>
                    )}
                    {canUpdate && !a.resolved && (
                      <button type="button" className="sh-btn" onClick={() => resolve(a.id)}>
                        <CheckIcon size={15} /> Mark resolved
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2ShipmentAlerts;
