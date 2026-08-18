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
import { useState, useEffect, useMemo } from 'react';
import ModalBase from './ModalBase';
import config from '../config';
import { useAdminPatient } from '../contexts/AdminPatientContext';
import { useAuth } from '../contexts/AuthContext';
import {
  checkAdministrationWindow,
  formatDurationMinutes,
  getCurrentLocalDateTime,
} from '../utils/timezone';
import IntakeSheet from './nutrition/IntakeSheet';
import OutputSheet from './nutrition/OutputSheet';
import DoseScheduleView from './schedule/DoseScheduleView';
import DoseDetailPane from './schedule/DoseDetailPane';
import { NUTRITION_LABELS } from './schedule/scheduleLabels';
import { rollupSchedule } from './schedule/scheduleRollup';
import PanelViewSwitcher from './section-panel/PanelViewSwitcher';
import './section-panel/section-panel.css';
import { computeScheduleStatus } from './schedule/scheduleStatus';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
// Pull in AdminV2 styles so the shared Intake/Output modals render correctly
// when this component is mounted from the live dashboard (which doesn't
// otherwise load admin-v2 CSS). Vite dedupes with admin pages that also import it.
import '../pages/admin-v2/AdminV2.css';

const NutritionModal = ({ onClose }) => {
  const { selectedPatient } = useAdminPatient();
  const { user } = useAuth() || {};
  const [tab, setTab] = useState('scheduled');
  // Keyed on the schedule slot, not the normalized id — see the medication
  // panel: the id embeds the log and changes the moment an item is recorded.
  const [selectedId, setSelectedId] = useState(null);
  const [bulkConfirm, setBulkConfirm] = useState({ open: false, items: [], count: 0 });
  const [scheduled, setScheduled] = useState([]);
  const [loading, setLoading] = useState(false);

  // Off-window confirm (mirrors care-task modal)
  const [windowConfirm, setWindowConfirm] = useState({ open: false, item: null, check: null });

  // PRN flow: 'pick' opens the choice screen; 'intake'/'output' delegate to
  // the shared AdminV2 modal of the same name.
  const [prnMode, setPrnMode] = useState(null); // null | 'pick' | 'intake' | 'output'
  const [prnDefaultDateTime, setPrnDefaultDateTime] = useState('');

  useEffect(() => {
    if (!selectedPatient) return;
    if (tab === 'scheduled') fetchSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchSchedule is recreated each render and selectedPatient is tracked via its id; effect is intentionally keyed on tab/patient id only
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
        setScheduled(data.nutrition || []);
      }
    } catch (err) {
      console.error('Error fetching nutrition schedule:', err);
    } finally {
      setLoading(false);
    }
  };

  // Normalize the API rows into the shape ScheduleList expects.
  const scheduledItems = useMemo(() => {
    return scheduled.map(item => {
      const detail = [];
      if (item.default_item) detail.push(item.default_item);
      if (item.default_amount != null) {
        detail.push(`${item.default_amount}${item.default_amount_unit ? ' ' + item.default_amount_unit : ''}`);
      }
      if (item.default_calories != null) detail.push(`${item.default_calories} kcal`);
      return {
        id: `${item.schedule_id}-${item.scheduled_time}`,
        scheduled_time: item.scheduled_time,
        name: item.name,
        description: item.description,
        extra: detail.length ? detail.join(' · ') : null,
        category: null,
        status: computeScheduleStatus(item),
        is_completed: !!item.completed,
        is_yesterday: !!item.is_yesterday,
        _raw: item,
      };
    });
  }, [scheduled]);

  const itemKey = (raw) => `${raw?.schedule_id ?? 'prn'}-${raw?.scheduled_time}`;
  const selectedItem = useMemo(
    () => scheduledItems.find(i => itemKey(i._raw) === selectedId) || null,
    [scheduledItems, selectedId]
  );
  const recordingAs = user?.full_name || user?.username || null;

  // Nutrition has a single view, so the row shows a heading rather than a
  // dropdown — the outstanding count still earns its place.
  const viewOptions = useMemo(() => {
    const { counts } = rollupSchedule(scheduledItems);
    const outstanding = counts.missed + counts.due;
    return [{
      value: 'scheduled',
      label: 'Scheduled',
      sublabel: "Today's nutrition",
      note: counts.missed > 0
        ? `${counts.missed} missed`
        : (outstanding > 0 ? `${outstanding} due` : 'All done'),
      tone: counts.missed > 0 || outstanding > 0 ? 'due' : 'given',
    }];
  }, [scheduledItems]);

  // ===== Complete scheduled item =====
  const submitComplete = async (item, { earlyOverride = false, note } = {}) => {
    try {
      const res = await fetch(`${config.apiUrl}/api/schedule/complete/nutrition`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schedule_id: item.schedule_id,
          scheduled_time: item.scheduled_time,
          patient_id: selectedPatient.id,
          user_id: user?.id || null,
          completed_at: null,
          notes: note || 'Completed via live dashboard',
          early_override: earlyOverride,
        }),
      });
      if (res.ok) {
        fetchSchedule();
        return;
      }
      const errorData = await res.json().catch(() => ({}));
      const offWindow = res.status === 409 && (
        errorData.error === 'early_administration' ||
        errorData.error === 'late_administration' ||
        errorData.error === 'off_window_administration'
      );
      if (offWindow && !earlyOverride) {
        setWindowConfirm({
          open: true,
          item,
          note,
          check: checkAdministrationWindow(item.scheduled_time),
        });
        return;
      }
      alert(errorData.detail || errorData.error || 'Failed to mark as completed');
    } catch (err) {
      console.error('Error completing nutrition item:', err);
      alert('Error connecting to server');
    }
  };

  // ===== PRN entry =====
  // Seeds the form's default time, which the direct Intake/Output buttons
  // would otherwise skip.
  const openPrn = (mode) => {
    setPrnDefaultDateTime(getCurrentLocalDateTime());
    setPrnMode(mode);
  };

  // Bulk uses the unified endpoint, which fills each item's defaults from its
  // schedule and publishes the due-count change just as the single path does.
  // It pre-flights the whole batch against the administration window, so one
  // confirmation covers the slot instead of one dialog per item.
  const submitBulk = async (items, { earlyOverride = false } = {}) => {
    if (!selectedPatient || items.length === 0) return;
    try {
      const res = await fetch(`${config.apiUrl}/api/schedule/complete/bulk`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nutrition: items.map(i => ({
            schedule_id: i.schedule_id,
            scheduled_time: i.scheduled_time,
            patient_id: selectedPatient.id,
            user_id: user?.id || null,
            completed_at: null,
            early_override: earlyOverride,
          })),
        }),
      });
      if (res.ok) { fetchSchedule(); return; }
      const err = await res.json().catch(() => ({}));
      const offWindow = res.status === 409 && (
        err.error === 'early_administration' ||
        err.error === 'late_administration' ||
        err.error === 'off_window_administration'
      );
      if (offWindow && !earlyOverride) {
        setBulkConfirm({ open: true, items, count: err.early_items?.length || items.length });
        return;
      }
      alert(err.detail || err.error || 'Failed to record all');
    } catch (err) {
      console.error('Error completing nutrition items:', err);
      alert('Error connecting to server');
    }
  };

  const closePrn = () => setPrnMode(null);

  const onPrnSaved = () => {
    closePrn();
    fetchSchedule();
  };

  // ===== Render =====
  return (
    <>
      <ModalBase isOpen={true} onClose={onClose} title={
        <span className="mp-modal-title">
          <span>Nutrition</span>
          <span className="mp-modal-title-sub">
            {selectedPatient
              ? `${selectedPatient.first_name} ${selectedPatient.last_name} \u00b7 Schedule`
              : 'No patient selected'}
          </span>
        </span>
      }>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {!selectedPatient && (
            <div className="tw" style={{ marginBottom: 16 }}>
              <Alert variant="warning">No patient selected</Alert>
            </div>
          )}

          {/* Two entry points rather than one PRN: intake and output are
              different records, and the extra pick dialog was a tap with
              nothing else in it. */}
          <PanelViewSwitcher
            views={viewOptions}
            value={tab}
            onChange={setTab}
            actions={[
              { label: 'Intake', onClick: () => openPrn('intake'), disabled: !selectedPatient,
                title: 'Log an ad-hoc intake' },
              { label: 'Output', onClick: () => openPrn('output'), disabled: !selectedPatient,
                title: 'Log an output' },
            ]}
          />

          <div style={{ flex: 1, overflow: 'auto' }}>
            {tab === 'scheduled' && (
              <DoseScheduleView
                items={scheduledItems}
                loading={loading}
                emptyText="No scheduled nutrition for today"
                labels={NUTRITION_LABELS}
                selectedId={selectedItem?.id || null}
                onSelect={(item) => setSelectedId(item ? itemKey(item._raw) : null)}
                onRecord={(item, opts) => submitComplete(item._raw, opts)}
                onRecordAll={(items) => submitBulk(items.map(i => i._raw))}
                detail={(
                  <DoseDetailPane
                    item={selectedItem}
                    patientId={selectedPatient?.id}
                    recordingAs={recordingAs}
                    labels={NUTRITION_LABELS}
                    scheduleHref="/care/nutrition/schedule"
                    historyQuery={(item, pid) => (item?._raw?.schedule_id
                      ? `/api/patients/${pid}/nutrition-intake?schedule_id=${item._raw.schedule_id}&limit=10`
                      : null)}
                    mapHistoryRow={(row) => ({
                      id: row.id,
                      at: row.consumed_at,
                      status: 'Taken',
                      tone: 'given',
                      meta: row.amount != null
                        ? `${row.amount}${row.amount_unit ? ` ${row.amount_unit}` : ''}`
                        : null,
                      note: row.notes,
                    })}
                    onRecord={(item, opts) => submitComplete(item._raw, opts)}
                  />
                )}
              />
            )}
          </div>
        </div>
      </ModalBase>

      {/* Off-window confirm */}
      {windowConfirm.open && windowConfirm.item && windowConfirm.check && (() => {
        const isLate = windowConfirm.check.status === 'late';
        const title = isLate ? 'Confirm Late Completion' : 'Confirm Early Completion';
        const heading = isLate
          ? 'This nutrition item was scheduled earlier'
          : 'This nutrition item is scheduled later';
        const offsetText = isLate
          ? `${formatDurationMinutes(Math.abs(windowConfirm.check.minutesOffset))} ago`
          : `${formatDurationMinutes(windowConfirm.check.minutesOffset)} from now`;
        const close = () => setWindowConfirm({ open: false, item: null, note: undefined, check: null });
        return (
          <Dialog open onOpenChange={(o) => { if (!o) close(); }}>
            <DialogContent className="sm:max-w-[440px]" aria-describedby={undefined}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[rgba(240,136,62,0.2)] text-[#f0883e]">⚠</span>
                  {title}
                </DialogTitle>
              </DialogHeader>
              <Alert variant="warning">
                <div className="mb-1.5 font-semibold text-[#f0883e]">{heading}</div>
                <div>
                  <strong>{windowConfirm.item.name}</strong> is scheduled for{' '}
                  <strong>{windowConfirm.check.scheduledLocal}</strong> — that's{' '}
                  <strong>{offsetText}</strong>.
                </div>
              </Alert>
              <DialogFooter>
                <Button variant="secondary" onClick={close}>Cancel</Button>
                <Button
                  onClick={async () => {
                    const { item, note } = windowConfirm;
                    close();
                    await submitComplete(item, { earlyOverride: true, note });
                  }}
                >Complete Anyway</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Off-window confirm for a whole slot */}
      <Dialog open={bulkConfirm.open} onOpenChange={(o) => { if (!o) setBulkConfirm({ open: false, items: [], count: 0 }); }}>
        <DialogContent className="sm:max-w-[440px]" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[rgba(240,136,62,0.2)] text-[#f0883e]">⚠</span>
              Confirm Off-Window Completion
            </DialogTitle>
          </DialogHeader>
          <Alert variant="warning">
            <div className="mb-1.5 font-semibold text-[#f0883e]">Some items are outside their window</div>
            <div>
              {bulkConfirm.count} item{bulkConfirm.count === 1 ? ' is' : 's are'} outside the
              administration window. Record them anyway?
            </div>
          </Alert>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setBulkConfirm({ open: false, items: [], count: 0 })}>Cancel</Button>
            <Button onClick={async () => {
              const items = bulkConfirm.items;
              setBulkConfirm({ open: false, items: [], count: 0 });
              await submitBulk(items, { earlyOverride: true });
            }}>Record Anyway</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shared AdminV2 intake form */}
      <IntakeSheet
        open={prnMode === 'intake'}
        onClose={closePrn}
        onSaved={onPrnSaved}
        patient={selectedPatient}
        defaultDateTime={prnDefaultDateTime}
      />

      {/* Shared AdminV2 output form */}
      <OutputSheet
        open={prnMode === 'output'}
        onClose={closePrn}
        onSaved={onPrnSaved}
        patient={selectedPatient}
        defaultDateTime={prnDefaultDateTime}
      />
    </>
  );
};

export default NutritionModal;
