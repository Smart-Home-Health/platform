/*
 * Smart Home Health Hub
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
import React, { useState, useEffect, useMemo } from 'react';
import ModalBase from './ModalBase';
import config from '../config';
import { useAdminPatient } from '../contexts/AdminPatientContext';
import ScheduleList from './schedule/ScheduleList';
import { computeScheduleStatus } from './schedule/scheduleStatus';
import { checkAdministrationWindow, formatDurationMinutes, getCurrentLocalDateTime } from '../utils/timezone';
import MedicationDoseModal from '../pages/admin-v2/components/MedicationDoseModal';
import UpdateQuantityModal from '../pages/admin-v2/components/UpdateQuantityModal';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

const OFF_WINDOW_ERRORS = ['early_administration', 'late_administration', 'off_window_administration'];

const MedicationModal = ({ onClose }) => {
  const { selectedPatient } = useAdminPatient();
  const [tab, setTab] = useState('scheduled');
  const [scheduled, setScheduled] = useState([]);          // raw `medications` rows from /api/schedule/daily
  const [activeMedications, setActiveMedications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);

  // Off-window confirm (shared shape for single + bulk completion).
  const [windowConfirm, setWindowConfirm] = useState({ open: false, title: '', heading: '', detail: '', onConfirm: null });
  // Low-quantity gate — `info` is the backend 409 body; `retry` re-runs the action.
  const [qtyGate, setQtyGate] = useState({ open: false, info: null, retry: null });
  // PRN: pick an as-needed med, then the shared dose modal collects dose/time.
  const [prnPickerOpen, setPrnPickerOpen] = useState(false);
  const [prnMed, setPrnMed] = useState(null);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!selectedPatient) return;
    fetchActiveMedications();
    if (tab === 'scheduled') fetchSchedule();
  }, [tab, selectedPatient?.id]);

  const fetchSchedule = async () => {
    if (!selectedPatient) return;
    setLoading(true);
    try {
      const today = new Date();
      const dateParam = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const tz = -today.getTimezoneOffset();
      const res = await fetch(
        `${config.apiUrl}/api/schedule/daily?patient_id=${selectedPatient.id}&target_date=${dateParam}&tz_offset_minutes=${tz}&include_prior_day=true`,
        { credentials: 'include' }
      );
      if (res.ok) {
        const data = await res.json();
        setScheduled(data.medications || []);
      }
    } catch (err) {
      console.error('Error fetching medication schedule:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchActiveMedications = async () => {
    if (!selectedPatient) return;
    try {
      const res = await fetch(
        `${config.apiUrl}/api/admin/medications/active?patient_id=${selectedPatient.id}`,
        { credentials: 'include' }
      );
      if (res.ok) setActiveMedications(await res.json());
    } catch (err) {
      console.error('Error fetching medications:', err);
    }
  };

  // Normalize the unified `medications` rows into the shape ScheduleList expects.
  const scheduledItems = useMemo(() => {
    return scheduled.map(item => {
      const dose = item.dose_amount != null
        ? `${item.dose_amount}${item.dose_unit ? ' ' + item.dose_unit : ''}`
        : null;
      const status = computeScheduleStatus(item);
      return {
        id: `${item.schedule_id ?? 'prn'}-${item.scheduled_time}-${item.log_id ?? ''}`,
        scheduled_time: item.scheduled_time,
        name: item.name,
        description: item.description,
        extra: dose,
        category: null,
        status,
        is_completed: status === 'completed' || status === 'skipped',
        is_yesterday: !!item.is_yesterday,
        completeLabel: status === 'missed' ? 'Take Now' : 'Mark Taken',
        skipLabel: 'Skip',
        showSkip: true,
        _raw: item,
      };
    });
  }, [scheduled]);

  const formatTimestamp = (iso) => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
      });
    } catch {
      return null;
    }
  };

  // ===== Completion / skip (unified endpoints) =====
  const submitMed = async (med, { override = false, skip = false } = {}) => {
    if (!selectedPatient) return;
    try {
      const res = await fetch(`${config.apiUrl}/api/schedule/complete/medication`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schedule_id: med.schedule_id,
          scheduled_time: med.scheduled_time,
          patient_id: selectedPatient.id,
          dose_amount: skip ? 0 : (med.dose_amount ?? null),
          completed_at: null,
          notes: skip ? 'Dose skipped via live dashboard' : 'Administered via live dashboard',
          early_override: override,
        }),
      });
      if (res.ok) { fetchSchedule(); fetchActiveMedications(); return; }
      const err = await res.json().catch(() => ({}));
      if (res.status === 409 && err.error === 'insufficient_quantity') {
        setQtyGate({ open: true, info: err, retry: () => submitMed(med, { override, skip }) });
        return;
      }
      if (res.status === 409 && OFF_WINDOW_ERRORS.includes(err.error) && !override && !skip) {
        const check = checkAdministrationWindow(med.scheduled_time);
        const isLate = check.status === 'late';
        setWindowConfirm({
          open: true,
          title: isLate ? 'Confirm Late Administration' : 'Confirm Early Administration',
          heading: isLate ? 'This dose was scheduled earlier' : 'This dose is scheduled later',
          detail: `${med.name} is scheduled for ${check.scheduledLocal} — that's ${
            isLate
              ? `${formatDurationMinutes(Math.abs(check.minutesOffset))} ago`
              : `${formatDurationMinutes(check.minutesOffset)} from now`
          }.`,
          onConfirm: () => submitMed(med, { override: true }),
        });
        return;
      }
      window.alert(err.detail || err.error || 'Failed to record dose');
    } catch (err) {
      console.error('Error completing medication:', err);
      window.alert('Error connecting to server');
    }
  };

  const submitBulk = async (meds, { override = false } = {}) => {
    if (!selectedPatient || meds.length === 0) return;
    try {
      const res = await fetch(`${config.apiUrl}/api/schedule/complete/bulk`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          medications: meds.map(m => ({
            schedule_id: m.schedule_id,
            scheduled_time: m.scheduled_time,
            patient_id: selectedPatient.id,
            dose_amount: m.dose_amount ?? null,
            completed_at: null,
            early_override: override,
          })),
        }),
      });
      if (res.ok) { fetchSchedule(); fetchActiveMedications(); return; }
      const err = await res.json().catch(() => ({}));
      if (res.status === 409 && err.error === 'insufficient_quantity') {
        setQtyGate({ open: true, info: err, retry: () => submitBulk(meds, { override }) });
        return;
      }
      if (res.status === 409 && OFF_WINDOW_ERRORS.includes(err.error) && !override) {
        const n = err.early_items?.length || meds.length;
        setWindowConfirm({
          open: true,
          title: 'Confirm Off-Window Administration',
          heading: 'Some doses are outside their window',
          detail: `${n} dose${n === 1 ? '' : 's'} are outside the administration window. Administer them anyway?`,
          onConfirm: () => submitBulk(meds, { override: true }),
        });
        return;
      }
      window.alert(err.detail || err.error || 'Failed to mark all');
    } catch (err) {
      console.error('Error completing medications:', err);
      window.alert('Error connecting to server');
    }
  };

  const closeWindowConfirm = () => setWindowConfirm({ open: false, title: '', heading: '', detail: '', onConfirm: null });

  // ===== PRN =====
  const openPrnPicker = () => setPrnPickerOpen(true);
  const pickPrnMed = (med) => { setPrnPickerOpen(false); setPrnMed(med); };
  const prnMedications = activeMedications.filter(m => m.as_needed);

  // Active-meds reference card (on-hand / last given / next due). Info-only;
  // admin actions live in /admin-v2/medications.
  const renderMedicationCard = (med) => {
    const lastGiven = formatTimestamp(med.last_administered);
    const nextDue = formatTimestamp(med.next_due);
    return (
      <div key={med.id} className="medication-card" style={{
        backgroundColor: '#fff', borderRadius: '6px', padding: '12px', marginBottom: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #28a745', borderLeft: '4px solid #28a745'
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
            <h4 style={{ margin: 0, color: '#333', fontSize: '16px', fontWeight: 600 }}>{med.name}</h4>
            {med.concentration && (
              <span style={{ fontSize: 12, color: '#666', fontWeight: 500 }}>{med.concentration}</span>
            )}
            {med.as_needed && (
              <span style={{ background: '#ede1ff', color: '#6f42c1', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>PRN</span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '6px 16px', fontSize: 13, color: '#555' }}>
            <span><strong style={{ color: '#333' }}>On hand:</strong> {med.quantity ?? '—'} {med.quantity_unit || 'units'}</span>
            <span>
              <strong style={{ color: '#333' }}>Last given:</strong>{' '}
              {lastGiven
                ? <>{lastGiven}{med.last_dose_amount != null && <span style={{ color: '#888' }}> ({med.last_dose_amount})</span>}</>
                : <span style={{ color: '#999' }}>never</span>}
            </span>
            {nextDue && <span><strong style={{ color: '#333' }}>Next due:</strong> {nextDue}</span>}
          </div>
          {med.notes && (
            <div style={{ fontSize: 12, color: '#777', marginTop: 8, fontStyle: 'italic' }}>
              {med.notes.length > 80 ? med.notes.substring(0, 80) + '…' : med.notes}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ===== Render =====
  return (
    <>
      <ModalBase isOpen={true} onClose={onClose} title={
        isMobile ? (
          <div className="tw flex w-full gap-2">
            <Select value={tab} onValueChange={setTab}>
              <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="active">Active ({activeMedications.length})</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={openPrnPicker}
              disabled={!selectedPatient || prnMedications.length === 0}
              className="shrink-0 bg-[#6f42c1] text-white hover:bg-[#6f42c1]/90"
            >PRN</Button>
          </div>
        ) : (
          <div className="tw flex w-full items-center gap-2">
            <Button size="sm" variant={tab === 'scheduled' ? 'default' : 'secondary'} onClick={() => setTab('scheduled')}>Scheduled</Button>
            <Button size="sm" variant={tab === 'active' ? 'default' : 'secondary'} onClick={() => setTab('active')}>Active ({activeMedications.length})</Button>
            <Button
              size="sm"
              onClick={openPrnPicker}
              disabled={!selectedPatient || prnMedications.length === 0}
              className="bg-[#6f42c1] text-white hover:bg-[#6f42c1]/90"
            >PRN</Button>
          </div>
        )
      }>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Patient banner */}
          <div className="tw" style={{ marginBottom: 16 }}>
            <Alert variant={selectedPatient ? 'default' : 'warning'}>
              {selectedPatient
                ? <>Viewing medications for: {selectedPatient.first_name} {selectedPatient.last_name}</>
                : 'No patient selected'}
            </Alert>
          </div>

          <div style={{ flex: 1, overflow: 'auto' }}>
            {tab === 'scheduled' && (
              <ScheduleList
                items={scheduledItems}
                loading={loading}
                title="Scheduled Medications"
                emptyText="No scheduled medications for today"
                onMarkComplete={(item) => submitMed(item._raw)}
                onSkip={(item) => submitMed(item._raw, { skip: true })}
                onMarkAll={(items) => submitBulk(items.map(i => i._raw))}
              />
            )}
            {tab === 'active' && (
              loading
                ? <div style={{ textAlign: 'center', padding: 40, color: '#a0aec0' }}>Loading…</div>
                : activeMedications.length === 0
                  ? <div style={{ textAlign: 'center', padding: 40, color: '#a0aec0' }}>No active medications.</div>
                  : <div>{activeMedications.map(renderMedicationCard)}</div>
            )}
          </div>
        </div>
      </ModalBase>

      {/* Off-window confirm (single + bulk) */}
      <Dialog open={windowConfirm.open} onOpenChange={(o) => { if (!o) closeWindowConfirm(); }}>
        <DialogContent className="sm:max-w-[440px]" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[rgba(240,136,62,0.2)] text-[#f0883e]">⚠</span>
              {windowConfirm.title}
            </DialogTitle>
          </DialogHeader>
          <Alert variant="warning">
            <div className="mb-1.5 font-semibold text-[#f0883e]">{windowConfirm.heading}</div>
            <div>{windowConfirm.detail}</div>
          </Alert>
          <DialogFooter>
            <Button variant="secondary" onClick={closeWindowConfirm}>Cancel</Button>
            <Button onClick={() => { const fn = windowConfirm.onConfirm; closeWindowConfirm(); fn && fn(); }}>
              Administer Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PRN pick: choose an as-needed med */}
      <Dialog open={prnPickerOpen} onOpenChange={(o) => { if (!o) setPrnPickerOpen(false); }}>
        <DialogContent className="sm:max-w-[480px]" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Give a PRN (as-needed) medication</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {prnMedications.length === 0 ? (
              <p className="text-sm text-muted-foreground">No as-needed medications for this patient.</p>
            ) : prnMedications.map(med => (
              <Button
                key={med.id}
                type="button"
                variant="secondary"
                onClick={() => pickPrnMed(med)}
                className="h-auto justify-between py-3"
              >
                <span>{med.name}{med.concentration ? ` · ${med.concentration}` : ''}</span>
                <span className="text-xs text-muted-foreground">{med.quantity ?? '—'} {med.quantity_unit || ''} on hand</span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Shared dose modal for the chosen PRN med */}
      <MedicationDoseModal
        open={!!prnMed}
        onClose={() => setPrnMed(null)}
        onSaved={() => { setPrnMed(null); fetchSchedule(); fetchActiveMedications(); }}
        patient={selectedPatient}
        medication={prnMed}
        defaultDateTime={getCurrentLocalDateTime()}
      />

      {/* Low-quantity gate */}
      {qtyGate.open && qtyGate.info && (
        <UpdateQuantityModal
          info={qtyGate.info}
          onClose={() => setQtyGate({ open: false, info: null, retry: null })}
          onUpdated={() => {
            const retry = qtyGate.retry;
            setQtyGate({ open: false, info: null, retry: null });
            fetchActiveMedications();
            if (retry) retry();
          }}
        />
      )}
    </>
  );
};

export default MedicationModal;
