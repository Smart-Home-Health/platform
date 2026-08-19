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
// Equipment history: changes, deliveries and stock activity as one timeline.
//
// The page used to show the change log alone, which meant a supply could go
// from four on hand to zero, or a box of eighteen items could arrive, and
// neither appeared in the thing called History. All three records are read
// together here; the merging rules live in lib/equipmentHistory.js.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import {
  EquipmentIcon, PackageIcon, SearchIcon, ChevronRightIcon,
  ChevronDownIcon, FileTextIcon, WrenchIcon,
} from '../../components/Icons';
import ChipGroup from '../../components/vc/ChipGroup';
import { equipmentService } from '../../services/equipment';
import { shipmentService } from '../../services/shipments';
import { statusInfo } from '../../lib/shipmentStatus';
import {
  EVENT_TYPES, RANGES, buildTimeline, filterEvents, withinRange, byDay,
  timelineSummary, toCsv,
} from '../../lib/equipmentHistory';
import './AdminV2.css';
import './components/shipments-page.css';
import './components/equipment-overview.css';
import './components/equipment-history.css';

const time = (value) => new Date(value).toLocaleTimeString(undefined, {
  hour: 'numeric', minute: '2-digit',
});
const dayHeading = (date, today) => {
  const same = date.toDateString() === today.toDateString();
  if (same) return 'Today';
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
};
const spanLabel = (from, to) => {
  if (!from) return null;
  const fmt = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return from.toDateString() === to.toDateString() ? fmt(from) : `${fmt(from)}–${fmt(to)}`;
};

const AdminV2EquipmentHistory = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    patients, selectedPatient: contextPatient,
    selectPatient: setContextPatient, loadingPatients,
  } = useAdminPatient();
  const selectedPatient = contextPatient;

  const [changes, setChanges] = useState([]);
  const [counts, setCounts] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [type, setType] = useState('all');
  const [search, setSearch] = useState('');
  const [range, setRange] = useState(90);
  const [collapsed, setCollapsed] = useState({});

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
      const [history, stock, ships] = await Promise.all([
        equipmentService.changeHistory({ patientId: selectedPatient.id, limit: 200 }),
        equipmentService.recentCounts({ patientId: selectedPatient.id, limit: 200 }),
        shipmentService.listShipments({ patient_id: selectedPatient.id, is_template: false }),
      ]);
      setChanges(history.history || []);
      setCounts(stock.counts || []);
      setShipments(ships.shipments || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedPatient]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const today = new Date();
  const timeline = useMemo(
    () => buildTimeline({ changes, counts, shipments }),
    [changes, counts, shipments],
  );
  const visible = useMemo(
    () => filterEvents(withinRange(timeline, range, today), { type, search }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `today` is recreated each render; the window only moves when the range does
    [timeline, range, type, search],
  );
  const days = useMemo(() => byDay(visible), [visible]);
  const summary = useMemo(() => timelineSummary(visible), [visible]);

  const goto = (path) => navigate(`${path}?patient=${selectedPatient.id}`);

  const exportCsv = () => {
    // Exports what is on screen, not the whole log — otherwise the file and
    // the page disagree about what "this history" means.
    const blob = new Blob([toCsv(visible)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `equipment-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

  const renderEvent = (event) => {
    if (event.kind === 'stock') {
      const rose = event.direction === 'up';
      return (
        <article className="eh-card kind-stock">
          <header className="eh-card-head">
            <span className="eh-kind">Stock adjustment</span>
            <span className="eh-time">{time(event.at)}</span>
          </header>
          <p className="eh-line">
            <strong>{event.title}</strong> changed{' '}
            <span className="eh-num">{event.before}</span>
            {' → '}
            <span className={`eh-num ${rose ? 'is-up' : 'is-down'}`}>{event.after}</span>
            {' on hand'}
          </p>
          <p className="eh-meta">
            {event.who ? `by ${event.who}` : 'by an unrecorded user'}
            {event.note ? ` · ${event.note}` : ''}
          </p>
          {event.equipmentId && (
            <button type="button" className="eh-link" onClick={() => goto('/care/equipment/inventory')}>
              View supply <ChevronRightIcon size={15} />
            </button>
          )}
        </article>
      );
    }

    if (event.kind === 'delivery') {
      const info = statusInfo(event.status);
      return (
        <article className="eh-card kind-delivery">
          <header className="eh-card-head">
            <span className="eh-kind">Shipment received</span>
            <span className="eh-time">{time(event.at)}</span>
          </header>
          <p className="eh-line">
            <strong>{event.title}</strong> · {event.reference}
            <span className={`sc-status tone-${info.tone} eh-status`}>{info.label}</span>
          </p>
          <p className="eh-meta">{event.itemCount} items</p>
          <button type="button" className="eh-link"
                  onClick={() => goto(`/care/equipment/shipments/${event.shipmentId}`)}>
            View shipment <ChevronRightIcon size={15} />
          </button>
        </article>
      );
    }

    // A change set. One change is stated as one change, not as a set of one.
    const items = event.items || [];
    const single = items.length === 1;
    const isCollapsed = collapsed[event.id];
    return (
      <article className="eh-card kind-change">
        <header className="eh-card-head">
          <span className="eh-kind">{single ? 'Scheduled change' : 'Scheduled changes'}</span>
          <span className="eh-time">
            {time(event.at)}
            {!single && (
              <button type="button" className="eh-toggle"
                      aria-expanded={!isCollapsed}
                      aria-label={isCollapsed ? 'Show the items' : 'Hide the items'}
                      onClick={() => setCollapsed((c) => ({ ...c, [event.id]: !c[event.id] }))}>
                <ChevronDownIcon size={16} />
              </button>
            )}
          </span>
        </header>
        <p className="eh-line">
          {single
            ? <strong>{items[0].title}</strong>
            : `${items.length} equipment items changed`}
        </p>
        {/* Worded as what it is: several changes logged by one person on one
            day. Nothing records that they were done as a single action. */}
        <p className="eh-meta">
          {event.who ? `logged by ${event.who}` : 'logged by an unrecorded user'}
        </p>
        {!single && !isCollapsed && (
          <ul className="eh-set">
            {items.map((item, i) => (
              <li key={item.id}>
                <span className="eh-set-num">{i + 1}</span>
                <span className="eh-set-name">{item.title}</span>
                {item.note && <span className="eh-set-note">{item.note}</span>}
                <span className="eh-set-tag">Changed</span>
              </li>
            ))}
          </ul>
        )}
        {single && items[0].note && <p className="eh-meta">{items[0].note}</p>}
      </article>
    );
  };

  return (
    <AdminV2Layout>
      <div className="admin-v2-page sh-page eh-page">
        {error && <div className="sh-error" role="alert">{error}</div>}

        <div className="eo-head">
          <div>
            <h1 className="sh-title">Equipment history</h1>
            <p className="eo-sub">Changes, deliveries, and inventory activity.</p>
          </div>
          <button type="button" className="sh-btn" onClick={exportCsv}
                  disabled={visible.length === 0}>
            <FileTextIcon size={16} /> Export
          </button>
        </div>

        <div className="eh-controls">
          <div className="sh-search">
            <SearchIcon size={16} />
            <input type="text" value={search} aria-label="Search history"
                   placeholder="Search equipment, supplier or note"
                   onChange={(e) => setSearch(e.target.value)} />
          </div>
          <label className="eh-range">
            <span className="eh-range-label">Range</span>
            <select className="em-input" value={range} aria-label="Date range"
                    onChange={(e) => setRange(Number(e.target.value))}>
              {RANGES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </label>
        </div>

        <ChipGroup options={EVENT_TYPES} value={type} onChange={setType}
                   label="Show" scroll />

        <p className="eh-summary">
          {summary.count} event{summary.count === 1 ? '' : 's'}
          {summary.from && ` · ${spanLabel(summary.from, summary.to)}`}
        </p>

        {loading && timeline.length === 0 ? (
          <div className="admin-v2-loading">Loading history…</div>
        ) : days.length === 0 ? (
          <div className="sh-empty">
            <EquipmentIcon size={26} />
            <p>
              {search || type !== 'all'
                ? 'Nothing matches that.'
                : 'Nothing recorded in this period.'}
            </p>
          </div>
        ) : (
          <ol className="eh-timeline">
            {days.map((day) => (
              <li key={day.key} className="eh-day">
                <div className="eh-day-rail">
                  <span className={`eh-day-label ${
                    day.date.toDateString() === today.toDateString() ? 'is-today' : ''}`}>
                    {dayHeading(day.date, today)}
                  </span>
                </div>
                <div className="eh-day-events">
                  {day.events.map((event) => (
                    <div key={event.id} className={`eh-event kind-${event.kind}`}>
                      <span className="eh-node" aria-hidden="true">
                        {event.kind === 'delivery' && <PackageIcon size={16} />}
                        {event.kind === 'stock' && <PackageIcon size={16} />}
                        {event.kind === 'change' && <WrenchIcon size={16} />}
                      </span>
                      {renderEvent(event)}
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2EquipmentHistory;
