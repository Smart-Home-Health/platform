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
import React, { useState, useEffect, useMemo } from 'react';
import ModalBase from './ModalBase';
import config from '../config';
import { useAdminPatient } from '../contexts/AdminPatientContext';
import { useAuth } from '../contexts/AuthContext';
import {
  checkAdministrationWindow,
  formatDurationMinutes,
  getCurrentLocalDateTime,
} from '../utils/timezone';
import IntakeModal from '../pages/admin-v2/components/IntakeModal';
import OutputModal from '../pages/admin-v2/components/OutputModal';
import ScheduleList from './schedule/ScheduleList';
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
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
// Pull in AdminV2 styles so the shared Intake/Output modals render correctly
// when this component is mounted from the live dashboard (which doesn't
// otherwise load admin-v2 CSS). Vite dedupes with admin pages that also import it.
import '../pages/admin-v2/AdminV2.css';

const NutritionModal = ({ onClose }) => {
  const { selectedPatient } = useAdminPatient();
  const { user } = useAuth() || {};
  const [tab, setTab] = useState('scheduled');
  const [scheduled, setScheduled] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' && window.innerWidth <= 768);

  // Off-window confirm (mirrors care-task modal)
  const [windowConfirm, setWindowConfirm] = useState({ open: false, item: null, check: null });

  // PRN flow: 'pick' opens the choice screen; 'intake'/'output' delegate to
  // the shared AdminV2 modal of the same name.
  const [prnMode, setPrnMode] = useState(null); // null | 'pick' | 'intake' | 'output'
  const [prnDefaultDateTime, setPrnDefaultDateTime] = useState('');

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!selectedPatient) return;
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

  // ===== Complete scheduled item =====
  const submitComplete = async (item, earlyOverride = false) => {
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
          notes: 'Completed via live dashboard',
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

  const handleMarkCompleted = (item) => submitComplete(item, false);

  // ===== PRN entry =====
  const openPrnPicker = () => {
    setPrnDefaultDateTime(getCurrentLocalDateTime());
    setPrnMode('pick');
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
        isMobile ? (
          <div className="tw flex w-full gap-2">
            <Select value={tab} onValueChange={setTab}>
              <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="scheduled">Scheduled</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={openPrnPicker}
              disabled={!selectedPatient}
              className="shrink-0 bg-[#6f42c1] text-white hover:bg-[#6f42c1]/90"
            >PRN</Button>
          </div>
        ) : (
          <div className="tw flex w-full items-center gap-2">
            <Button
              size="sm"
              variant={tab === 'scheduled' ? 'default' : 'secondary'}
              onClick={() => setTab('scheduled')}
            >Scheduled</Button>
            <Button
              size="sm"
              onClick={openPrnPicker}
              disabled={!selectedPatient}
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
                ? <>Viewing nutrition for: {selectedPatient.first_name} {selectedPatient.last_name}</>
                : 'No patient selected'}
            </Alert>
          </div>

          <div style={{ flex: 1, overflow: 'auto' }}>
            {tab === 'scheduled' && (
              <ScheduleList
                items={scheduledItems}
                loading={loading}
                title="Scheduled Nutrition"
                emptyText="No scheduled nutrition for today"
                onMarkComplete={(item) => handleMarkCompleted(item._raw)}
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
        const close = () => setWindowConfirm({ open: false, item: null, check: null });
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
                    const item = windowConfirm.item;
                    close();
                    await submitComplete(item, true);
                  }}
                >Complete Anyway</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* PRN pick: intake vs output */}
      <Dialog open={prnMode === 'pick'} onOpenChange={(o) => { if (!o) closePrn(); }}>
        <DialogContent className="sm:max-w-[480px]" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Log Ad-Hoc Nutrition</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              onClick={() => setPrnMode('intake')}
              className="h-auto flex-col gap-1.5 py-6 text-base font-bold"
            >
              <span className="text-2xl leading-none">↓</span>
              Log Intake
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPrnMode('output')}
              className="h-auto flex-col gap-1.5 py-6 text-base font-bold"
            >
              <span className="text-2xl leading-none">↑</span>
              Log Output
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Shared AdminV2 intake form */}
      <IntakeModal
        open={prnMode === 'intake'}
        onClose={closePrn}
        onSaved={onPrnSaved}
        patient={selectedPatient}
        defaultDateTime={prnDefaultDateTime}
      />

      {/* Shared AdminV2 output form */}
      <OutputModal
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
