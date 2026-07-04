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
import { useSearchParams } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { PatientSelectorModal, IntakeModal, OutputModal } from './components';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import { NutritionIcon } from '../../components/Icons';
import ScheduleList from '../../components/schedule/ScheduleList';
import { computeScheduleStatus } from '../../components/schedule/scheduleStatus';
import {
  checkAdministrationWindow,
  formatDurationMinutes,
  getCurrentLocalDateTime,
} from '../../utils/timezone';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import './AdminV2.css';

// Daily nutrition schedule view (today + yesterday), the admin counterpart of
// the live-dashboard NutritionModal. Data comes from the unified
// /api/schedule/daily endpoint with include_prior_day=true so missed items
// from yesterday stay visible, same as the meds/care-tasks schedule pages.
const AdminV2NutritionSchedule = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    patients,
    selectedPatient: contextPatient,
    selectPatient: setContextPatient,
    loadingPatients
  } = useAdminPatient();

  const selectedPatient = contextPatient;
  const [showPatientModal, setShowPatientModal] = useState(false);

  const [scheduled, setScheduled] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Off-window confirm (mirrors the live nutrition modal)
  const [windowConfirm, setWindowConfirm] = useState({ open: false, item: null, check: null });

  // PRN flow: 'pick' opens the choice screen; 'intake'/'output' delegate to
  // the shared AdminV2 modal of the same name.
  const [prnMode, setPrnMode] = useState(null); // null | 'pick' | 'intake' | 'output'
  const [prnDefaultDateTime, setPrnDefaultDateTime] = useState('');

  // Check URL params for patient ID or use context patient
  useEffect(() => {
    const patientId = searchParams.get('patient');
    if (patientId && patients.length > 0) {
      const patient = patients.find(p => p.id === parseInt(patientId));
      if (patient && patient.id !== contextPatient?.id) {
        setContextPatient(patient);
      }
    } else if (!patientId && !contextPatient && patients.length > 0 && !loadingPatients) {
      setShowPatientModal(true);
    }
  }, [searchParams, patients, loadingPatients]);

  // Update URL when context patient changes
  useEffect(() => {
    if (contextPatient && searchParams.get('patient') !== String(contextPatient.id)) {
      setSearchParams({ patient: contextPatient.id });
    }
  }, [contextPatient]);

  useEffect(() => {
    if (selectedPatient) {
      fetchSchedule();
    }
  }, [selectedPatient]);

  const fetchSchedule = async () => {
    if (!selectedPatient) return;
    setLoading(true);
    setError(null);
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
      } else {
        setError('Failed to load schedule');
      }
    } catch (err) {
      setError('Error connecting to server');
      console.error('Error fetching nutrition schedule:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPatient = (patient) => {
    setContextPatient(patient);
    setSearchParams({ patient: patient.id });
    setShowPatientModal(false);
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
          notes: 'Completed via admin schedule',
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

  if (loadingPatients) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-loading">Loading patients...</div>
      </AdminV2Layout>
    );
  }

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {selectedPatient ? (
          <>
            <div className="admin-v2-page-header tw">
              <h3 style={{ margin: 0, color: 'var(--foreground)' }}>
                Today & Yesterday
              </h3>
              <div className="tw flex items-center gap-2">
                <Button
                  onClick={openPrnPicker}
                  className="bg-[#6f42c1] text-white hover:bg-[#6f42c1]/90"
                >PRN</Button>
                <Button onClick={fetchSchedule} disabled={loading}>
                  {loading ? 'Refreshing...' : 'Refresh'}
                </Button>
              </div>
            </div>

            {error ? (
              <div className="tw"><Alert variant="destructive">{error}</Alert></div>
            ) : (
              <ScheduleList
                items={scheduledItems}
                loading={loading}
                title="Scheduled Nutrition"
                emptyText="No scheduled nutrition for today or yesterday"
                onMarkComplete={(item) => handleMarkCompleted(item._raw)}
              />
            )}
          </>
        ) : (
          <div className="admin-v2-no-patient">
            <NutritionIcon size={48} />
            <h2>Select a Patient</h2>
            <p>Choose a patient to view their daily nutrition schedule</p>
            <div className="tw">
              <Button onClick={() => setShowPatientModal(true)}>
                Select Patient
              </Button>
            </div>
          </div>
        )}

        {/* Patient Selector Modal */}
        {showPatientModal && (
          <PatientSelectorModal
            patients={patients}
            selectedPatient={selectedPatient}
            onSelectPatient={handleSelectPatient}
            onClose={() => setShowPatientModal(false)}
            loading={loadingPatients}
          />
        )}

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
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2NutritionSchedule;
