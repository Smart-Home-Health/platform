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
// Live-dashboard Equipment panel. Same bones as the medication / care-task
// panels: ModalBase shell, a PanelViewSwitcher between Supplies and History,
// the dock context (not the viewport) deciding narrow vs wide, and vc sheets
// for anything that needs input — no window.prompt, no shadcn primitives.
//
// Data goes through equipmentService. The out-of-stock 409 on a change still
// opens EquipmentRestockGate (shared with the admin inventory page), which
// retries the change once a new on-hand count is saved.
import { useCallback, useEffect, useState } from 'react';
import ModalBase from './ModalBase';
import EquipmentRestockGate from './EquipmentRestockGate';
import PanelViewSwitcher from './section-panel/PanelViewSwitcher';
import ConfirmSheet from './vc/ConfirmSheet';
import EquipmentList from './equipment/EquipmentList';
import EquipmentHistory from './equipment/EquipmentHistory';
import StockActionSheet from './equipment/StockActionSheet';
import { isDue } from './equipment/equipmentStatus';
import { equipmentService } from '../services/equipment';
import { useAdminPatient } from '../contexts/AdminPatientContext';
import { useModalDock } from '../contexts/ModalDockContext';
import './equipment/equipment-panel.css';

const HISTORY_LIMIT = 20;

export default function EquipmentModal({ isOpen = true, onClose }) {
  const { selectedPatient } = useAdminPatient();
  const patientId = selectedPatient?.id ?? null;
  // Wide only at the expanded dock stop; the narrow stop and the phone sheet
  // both get the two-column facts (same rule as DoseScheduleView).
  const { docked, expanded } = useModalDock();
  const wide = docked && expanded;

  const [view, setView] = useState('supplies');
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const [history, setHistory] = useState({ rows: [], loading: false, error: null });
  const [historyFilter, setHistoryFilter] = useState('');

  // One pending action at a time: { kind: 'receive' | 'open' | 'change', item }
  const [action, setAction] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [restockInfo, setRestockInfo] = useState(null);

  const loadEquipment = useCallback(async () => {
    if (!patientId) { setEquipment([]); return; }
    setLoading(true);
    setLoadError(null);
    try {
      setEquipment(await equipmentService.list(patientId));
    } catch (err) {
      setEquipment([]);
      setLoadError(err.message || 'Could not load supplies');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    if (isOpen) loadEquipment();
  }, [isOpen, loadEquipment]);

  useEffect(() => {
    if (view !== 'history' || !patientId) return undefined;
    let cancelled = false;
    setHistory((h) => ({ ...h, loading: true, error: null }));
    equipmentService
      .changeHistory({ patientId, equipmentId: historyFilter || null, limit: HISTORY_LIMIT })
      .then((data) => { if (!cancelled) setHistory({ rows: data?.history || [], loading: false, error: null }); })
      .catch((err) => { if (!cancelled) setHistory({ rows: [], loading: false, error: err.message || 'Could not load history' }); });
    return () => { cancelled = true; };
  }, [view, patientId, historyFilter]);

  const closeAction = () => { setAction(null); setActionError(null); };
  const startAction = (kind) => (item) => { setAction({ kind, item }); setActionError(null); };

  const runStockAction = async (amount) => {
    if (!action) return;
    setActionBusy(true);
    setActionError(null);
    try {
      if (action.kind === 'receive') await equipmentService.receive(action.item.id, amount);
      else await equipmentService.open(action.item.id, amount);
      closeAction();
      await loadEquipment();
    } catch (err) {
      setActionError(err.message || 'Could not save');
    } finally {
      setActionBusy(false);
    }
  };

  // A 409 out-of-stock opens the restock gate, which retries this once the
  // on-hand quantity has been updated.
  const doChange = async (equipmentId) => {
    setActionBusy(true);
    setActionError(null);
    try {
      await equipmentService.logChange(equipmentId, new Date().toISOString());
      setRestockInfo(null);
      closeAction();
      await loadEquipment();
    } catch (err) {
      if (err.status === 409 && err.payload?.error === 'insufficient_quantity') {
        setRestockInfo(err.payload);
        closeAction();
      } else {
        setActionError(err.message || 'Could not record the change');
      }
    } finally {
      setActionBusy(false);
    }
  };

  const dueCount = equipment.filter(isDue).length;
  const views = [
    {
      value: 'supplies',
      label: 'Supplies',
      // The trigger shows the sublabel, so the due count lives there; the
      // note/tone pair colours the same fact inside the menu.
      sublabel: !equipment.length ? 'On hand and due'
        : dueCount > 0 ? `${dueCount} due for change` : 'All on schedule',
      note: equipment.length ? (dueCount > 0 ? `${dueCount} due` : 'All on schedule') : null,
      tone: dueCount > 0 ? 'due' : 'given',
    },
    { value: 'history', label: 'History', sublabel: 'Recent changes' },
  ];

  const title = (
    <span className="mp-modal-title">
      <span>Equipment</span>
      <span className="mp-modal-title-sub">
        {selectedPatient
          ? `${selectedPatient.first_name} ${selectedPatient.last_name} · ${view === 'history' ? 'History' : 'Supplies'}`
          : 'No patient selected'}
      </span>
    </span>
  );

  return (
    <>
      <ModalBase isOpen={isOpen} onClose={onClose} title={title}>
        <div className={`eq-panel ${wide ? 'wide' : 'narrow'}`}>
          <PanelViewSwitcher views={views} value={view} onChange={setView} />
          <div className="eq-scroll">
            {!patientId ? (
              <div className="ld-dose-empty">Select a patient to see their supplies</div>
            ) : view === 'history' ? (
              <EquipmentHistory
                items={equipment}
                rows={history.rows}
                loading={history.loading}
                error={history.error}
                filter={historyFilter}
                onFilter={setHistoryFilter}
              />
            ) : (
              <EquipmentList
                items={equipment}
                loading={loading}
                error={loadError}
                onReceive={startAction('receive')}
                onOpen={startAction('open')}
                onChange={startAction('change')}
              />
            )}
          </div>
        </div>
      </ModalBase>

      <StockActionSheet
        open={!!action && action.kind !== 'change'}
        mode={action?.kind}
        item={action?.item}
        busy={actionBusy}
        error={actionError}
        onSubmit={runStockAction}
        onClose={closeAction}
      />

      <ConfirmSheet
        open={!!action && action.kind === 'change'}
        onOpenChange={(o) => { if (!o) closeAction(); }}
        title="Mark as changed"
        confirmLabel="Mark changed"
        busy={actionBusy}
        error={actionError}
        onConfirm={() => action && doChange(action.item.id)}
      >
        Record <strong>{action?.item?.name}</strong> as changed now?
        {action?.item?.useful_days ? ` The next change falls due in ${action.item.useful_days} days.` : ''}
      </ConfirmSheet>

      <EquipmentRestockGate
        info={restockInfo}
        onClose={() => setRestockInfo(null)}
        onUpdated={() => doChange(restockInfo.equipment_id)}
      />
    </>
  );
}
