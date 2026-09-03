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
import { nutritionService } from '../services/nutrition';
import { rowToItemPayload } from './nutrition/intakeItemRows';
import NutritionFeedPane from './nutrition/NutritionFeedPane';
import IntakeForm from './nutrition/IntakeForm';
import { useModalDock } from '../contexts/ModalDockContext';
import { XIcon } from './Icons';
import PanelViewSwitcher from './section-panel/PanelViewSwitcher';
import './section-panel/section-panel.css';
import { computeScheduleStatus } from './schedule/scheduleStatus';
import ConfirmSheet from './vc/ConfirmSheet';
// Pull in AdminV2 styles so the shared Intake/Output modals render correctly
// when this component is mounted from the live dashboard (which doesn't
// otherwise load admin-v2 CSS). Vite dedupes with admin pages that also import it.
import '../pages/admin-v2/AdminV2.css';

const NutritionModal = ({ onClose }) => {
  const { selectedPatient } = useAdminPatient();
  const { user } = useAuth() || {};
  const { docked, expanded, setExpanded } = useModalDock();
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

  // Anchor body-portalled sheets (PRN Output) over the docked panel instead
  // of centering them on the wall-sized screen — same pattern as the capture
  // panel's ld-capture-docked classes.
  useEffect(() => {
    if (!docked) return undefined;
    document.body.classList.add('ld-nutrition-docked');
    document.body.classList.toggle('ld-nutrition-wide', expanded);
    return () => {
      document.body.classList.remove('ld-nutrition-docked', 'ld-nutrition-wide');
    };
  }, [docked, expanded]);

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
      if (item.fluid_dynamic && !item.completed && item.suggested_amount != null) {
        // Dynamic water spot: the amount is computed from what is left of
        // the daily fluid target, so show that instead of the nominal.
        detail.push(item.suggested_amount > 0
          ? `suggested ${item.suggested_amount} ${item.default_amount_unit || 'ml'}`
          : 'goal met — skip?');
      } else if (item.default_amount != null) {
        detail.push(`${item.default_amount}${item.default_amount_unit ? ' ' + item.default_amount_unit : ''}`);
      }
      if (item.default_calories != null) detail.push(`${item.default_calories} kcal`);
      const isFlush = item.row_kind === 'flush';
      return {
        id: isFlush ? `flush-${item.followup_id}` : `${item.schedule_id}-${item.scheduled_time}`,
        scheduled_time: item.scheduled_time,
        name: item.name,
        description: item.description,
        extra: detail.length ? detail.join(' · ') : null,
        category: null,
        status: computeScheduleStatus(item),
        is_completed: !!item.completed,
        is_yesterday: !!item.is_yesterday,
        // Only the post-feed flush follow-up is skippable from here.
        can_skip: isFlush,
        _raw: item,
      };
    });
  }, [scheduled]);

  const itemKey = (raw) => (raw?.row_kind === 'flush'
    ? `flush-${raw.followup_id}`
    : `${raw?.schedule_id ?? 'prn'}-${raw?.scheduled_time}`);
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

  // ===== Post-feed flush follow-up =====
  const runFlushRow = async (item, note, amount) => {
    try {
      await nutritionService.completeFlush(item.followup_id, {
        notes: note || undefined,
        user_id: user?.id || undefined,
        ...(amount > 0 ? { amount } : {}),
      });
      fetchSchedule();
    } catch (err) {
      console.error('Error running flush:', err);
      alert(err.message || 'Failed to record the flush');
    }
  };

  const skipFlushRow = async (item, note) => {
    try {
      await nutritionService.skipFlush(item.followup_id, {
        notes: note || undefined, user_id: user?.id || undefined,
      });
      fetchSchedule();
    } catch (err) {
      console.error('Error skipping flush:', err);
      alert(err.message || 'Failed to skip the flush');
    }
  };

  // ===== Complete scheduled item =====
  const submitComplete = async (item, { earlyOverride = false, note, items, amount } = {}) => {
    // Flush follow-ups have their own Run path (one-tap from the row,
    // amount-adjustable from the side pane).
    if (item.row_kind === 'flush') {
      await runFlushRow(item, note, amount);
      return;
    }
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
          // The side pane sends the adjusted mix; the quick one-tap paths
          // send nothing and the backend expands the schedule's components.
          ...(items?.length ? { items: items.map(rowToItemPayload) } : {}),
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
          items,
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
    // Docked, the intake form lives in the side pane — no centered dialog on
    // a wall-sized screen. Output (and everything on mobile) keeps the sheet.
    if (mode === 'intake' && docked) {
      setSelectedId(null);
      if (!expanded) setExpanded?.(true);
    }
    setPrnMode(mode);
  };

  // Bulk uses the unified endpoint, which fills each item's defaults from its
  // schedule and publishes the due-count change just as the single path does.
  // It pre-flights the whole batch against the administration window, so one
  // confirmation covers the slot instead of one dialog per item.
  const submitBulk = async (allItems, { earlyOverride = false } = {}) => {
    if (!selectedPatient || allItems.length === 0) return;
    // Flush follow-ups do not go through the cron completion endpoint —
    // "record all" runs them via their own path.
    const flushRows = allItems.filter(i => i.row_kind === 'flush');
    const items = allItems.filter(i => i.row_kind !== 'flush');
    for (const flush of flushRows) {
      await runFlushRow(flush);
    }
    if (items.length === 0) return;
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
            <div className="ld-dose-empty">No patient selected</div>
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

          <div className="ld-panel-scroll">
            {tab === 'scheduled' && (
              <DoseScheduleView
                items={scheduledItems}
                loading={loading}
                emptyText="No scheduled nutrition for today"
                labels={NUTRITION_LABELS}
                selectedId={selectedItem?.id || null}
                onSelect={(item) => {
                  if (item && prnMode === 'intake') setPrnMode(null);
                  setSelectedId(item ? itemKey(item._raw) : null);
                }}
                onRecord={(item, opts) => submitComplete(item._raw, opts)}
                onRecordAll={(items) => submitBulk(items.map(i => i._raw))}
                onSkip={(item, opts) => skipFlushRow(item._raw, opts?.note)}
                detailWide
                detail={(prnMode === 'intake' && docked) ? (
                  <div className="ld-dose-detail em-inline">
                    <div className="ld-dose-detail-head">
                      <h3 className="ld-dose-detail-name">Log intake</h3>
                      <button
                        type="button"
                        className="ld-dose-btn ghost"
                        onClick={closePrn}
                        aria-label="Close intake form"
                      >
                        <XIcon size={16} />
                      </button>
                    </div>
                    <IntakeForm
                      active
                      patient={selectedPatient}
                      defaultDateTime={prnDefaultDateTime}
                      onClose={closePrn}
                      onSaved={onPrnSaved}
                    />
                  </div>
                ) : (selectedItem && !selectedItem.is_completed) ? (
                  <NutritionFeedPane
                    item={selectedItem}
                    patient={selectedPatient}
                    recordingAs={recordingAs}
                    onRecord={(item, opts) => submitComplete(item._raw, opts)}
                    onSkipFlush={(item, opts) => skipFlushRow(item._raw, opts?.note)}
                  />
                ) : (
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
                    onSkip={(item, opts) => skipFlushRow(item._raw, opts?.note)}
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
          <ConfirmSheet
            open
            onOpenChange={(o) => { if (!o) close(); }}
            title={title}
            confirmLabel="Complete anyway"
            onConfirm={async () => {
              const { item, note, items } = windowConfirm;
              close();
              await submitComplete(item, { earlyOverride: true, note, items });
            }}
          >
            <strong className="cs-lead">{heading}</strong>
            <strong>{windowConfirm.item.name}</strong> is scheduled for{' '}
            <strong>{windowConfirm.check.scheduledLocal}</strong> — that&apos;s{' '}
            <strong>{offsetText}</strong>.
          </ConfirmSheet>
        );
      })()}

      {/* Off-window confirm for a whole slot */}
      <ConfirmSheet
        open={bulkConfirm.open}
        onOpenChange={(o) => { if (!o) setBulkConfirm({ open: false, items: [], count: 0 }); }}
        title="Confirm off-window completion"
        confirmLabel="Record anyway"
        onConfirm={async () => {
          const items = bulkConfirm.items;
          setBulkConfirm({ open: false, items: [], count: 0 });
          await submitBulk(items, { earlyOverride: true });
        }}
      >
        <strong className="cs-lead">Some items are outside their window</strong>
        {bulkConfirm.count} item{bulkConfirm.count === 1 ? ' is' : 's are'} outside the
        administration window. Record them anyway?
      </ConfirmSheet>

      {/* Shared AdminV2 intake form — modal only where there is no side
          pane to host it (mobile / undocked). */}
      <IntakeSheet
        open={prnMode === 'intake' && !docked}
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
