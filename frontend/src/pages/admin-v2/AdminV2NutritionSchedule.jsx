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
import {
  NutritionIcon,
  ClockIcon,
  CheckIcon,
  XIcon
} from '../../components/Icons';
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
// the live-dashboard NutritionModal, rendered with the same admin-v2 schedule
// styling as the meds/care-tasks schedule pages. Data comes from the unified
// /api/schedule/daily endpoint with include_prior_day=true so missed items
// from yesterday stay visible.
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

  // Status filter state (mirrors the meds schedule page)
  const [statusFilters, setStatusFilters] = useState({
    ready: true,
    upcoming: true,
    missed: true,
    completed: false
  });

  // Off-window confirm (mirrors the live nutrition modal)
  const [windowConfirm, setWindowConfirm] = useState({ open: false, item: null, check: null });

  // PRN flow: 'pick' opens the choice screen; 'intake'/'output' delegate to
  // the shared AdminV2 modal of the same name.
  const [prnMode, setPrnMode] = useState(null); // null | 'pick' | 'intake' | 'output'
  const [prnDefaultDateTime, setPrnDefaultDateTime] = useState('');

  // Permission helper
  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.is_system_admin) return true;
    return user.permissions?.includes(permission) || false;
  };

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-way URL→context sync; adding contextPatient would re-run on selection change and revert it to the stale URL param
  }, [searchParams, patients, loadingPatients]);

  // Update URL when context patient changes
  useEffect(() => {
    if (contextPatient && searchParams.get('patient') !== String(contextPatient.id)) {
      setSearchParams({ patient: contextPatient.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-way context→URL sync; runs only when the selection changes
  }, [contextPatient]);

  useEffect(() => {
    if (selectedPatient) {
      fetchSchedule();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch helper is recreated each render; effect is keyed on patient change only
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

  // Normalize rows: attach the shared time-based status and a coarse bucket
  // matching the meds page's filters (ready / upcoming / missed / completed).
  const items = useMemo(() => {
    return scheduled.map(item => {
      const status = computeScheduleStatus(item);
      let bucket;
      if (status === 'completed' || status === 'skipped') bucket = 'completed';
      else if (status === 'missed') bucket = 'missed';
      else if (status === 'due_on_time' || status === 'due_warning') bucket = 'ready';
      else bucket = 'upcoming'; // 'pending'
      const detail = [];
      if (item.default_item) detail.push(item.default_item);
      if (item.default_amount != null) {
        detail.push(`${item.default_amount}${item.default_amount_unit ? ' ' + item.default_amount_unit : ''}`);
      }
      if (item.default_calories != null) detail.push(`${item.default_calories} kcal`);
      return { ...item, _status: status, _bucket: bucket, _detail: detail.join(' · ') };
    });
  }, [scheduled]);

  // Status display helpers (same palette as the meds schedule page)
  const getStatusInfo = (bucket) => {
    const statusMap = {
      'completed': { label: 'Completed', color: '#238636', bg: 'rgba(35, 134, 54, 0.15)', border: '#238636' },
      'missed': { label: 'Missed', color: '#f85149', bg: 'rgba(248, 81, 73, 0.15)', border: '#f85149' },
      'upcoming': { label: 'Upcoming', color: '#1f6feb', bg: 'rgba(31, 111, 235, 0.15)', border: '#1f6feb' },
      'ready': { label: 'Ready', color: '#58a6ff', bg: 'rgba(88, 166, 255, 0.15)', border: '#58a6ff' }
    };
    return statusMap[bucket] || statusMap.upcoming;
  };

  const getStatusText = (item) => {
    if (item._bucket === 'completed') return item.is_prn ? 'PRN Logged' : 'Completed';
    if (item._bucket === 'missed') return 'Missed';
    if (item._bucket === 'ready') return 'Ready';
    return 'Upcoming';
  };

  const filteredItems = items.filter(item => statusFilters[item._bucket]);

  // Group by day and time (same shape as the meds schedule page)
  const groupItems = (list) => {
    const groups = {};
    list.forEach(item => {
      const dateObj = new Date(item.scheduled_time);
      const dayKey = dateObj.toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      const timeStr = dateObj.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      if (!groups[dayKey]) groups[dayKey] = {};
      if (!groups[dayKey][timeStr]) groups[dayKey][timeStr] = [];
      groups[dayKey][timeStr].push(item);
    });
    return groups;
  };

  const sortTimeSlots = (times) => {
    return times.sort((a, b) => {
      const parseTime = (t) => {
        const match = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (!match) return 0;
        let [, h, m, ampm] = match;
        let hour = parseInt(h, 10);
        if (/pm/i.test(ampm) && hour !== 12) hour += 12;
        if (/am/i.test(ampm) && hour === 12) hour = 0;
        return hour * 60 + parseInt(m, 10);
      };
      return parseTime(a) - parseTime(b);
    });
  };

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

  // Get stats
  const stats = {
    ready: items.filter(i => i._bucket === 'ready').length,
    upcoming: items.filter(i => i._bucket === 'upcoming').length,
    missed: items.filter(i => i._bucket === 'missed').length,
    completed: items.filter(i => i._bucket === 'completed').length
  };

  if (loadingPatients) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-loading">Loading patients...</div>
      </AdminV2Layout>
    );
  }

  const grouped = groupItems(filteredItems);
  const sortedDays = Object.keys(grouped).sort((a, b) => new Date(a) - new Date(b));

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {selectedPatient ? (
          <>
            {/* Stats Row */}
            <div className="admin-v2-summary-stats admin-v2-meds-schedule-summary">
              <div
                className={`admin-v2-stat-card ${statusFilters.ready ? 'selected' : ''}`}
                onClick={() => setStatusFilters(f => ({ ...f, ready: !f.ready }))}
                style={{ cursor: 'pointer' }}
              >
                <div className="admin-v2-stat-icon" style={{ background: 'rgba(88, 166, 255, 0.15)' }}>
                  <ClockIcon size={20} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{stats.ready}</h4>
                  <p>Ready</p>
                </div>
              </div>
              <div
                className={`admin-v2-stat-card ${statusFilters.upcoming ? 'selected' : ''}`}
                onClick={() => setStatusFilters(f => ({ ...f, upcoming: !f.upcoming }))}
                style={{ cursor: 'pointer' }}
              >
                <div className="admin-v2-stat-icon" style={{ background: 'rgba(31, 111, 235, 0.15)' }}>
                  <ClockIcon size={20} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{stats.upcoming}</h4>
                  <p>Upcoming</p>
                </div>
              </div>
              <div
                className={`admin-v2-stat-card ${statusFilters.missed ? 'selected' : ''}`}
                onClick={() => setStatusFilters(f => ({ ...f, missed: !f.missed }))}
                style={{ cursor: 'pointer' }}
              >
                <div className="admin-v2-stat-icon" style={{ background: 'rgba(248, 81, 73, 0.15)' }}>
                  <XIcon size={20} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{stats.missed}</h4>
                  <p>Missed</p>
                </div>
              </div>
              <div
                className={`admin-v2-stat-card ${statusFilters.completed ? 'selected' : ''}`}
                onClick={() => setStatusFilters(f => ({ ...f, completed: !f.completed }))}
                style={{ cursor: 'pointer' }}
              >
                <div className="admin-v2-stat-icon" style={{ background: 'rgba(35, 134, 54, 0.15)' }}>
                  <CheckIcon size={20} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{stats.completed}</h4>
                  <p>Completed</p>
                </div>
              </div>
            </div>

            {/* PRN + Refresh Buttons */}
            <div className="admin-v2-page-header tw">
              <h3 style={{ margin: 0, color: 'var(--foreground)' }}>
                Today & Yesterday ({filteredItems.length} of {items.length})
              </h3>
              <div className="tw flex items-center gap-2">
                {hasPermission('nutrition.create') && (
                  <Button
                    onClick={openPrnPicker}
                    className="bg-[#6f42c1] text-white hover:bg-[#6f42c1]/90"
                  >PRN</Button>
                )}
                <Button onClick={fetchSchedule} disabled={loading}>
                  {loading ? 'Refreshing...' : 'Refresh'}
                </Button>
              </div>
            </div>

            {/* Schedule Content */}
            {loading ? (
              <div className="admin-v2-loading">Loading schedule...</div>
            ) : error ? (
              <div className="tw"><Alert variant="destructive">{error}</Alert></div>
            ) : filteredItems.length === 0 ? (
              <div className="admin-v2-empty-state">
                <NutritionIcon size={48} />
                <h3>No Scheduled Nutrition</h3>
                <p className="admin-v2-text-muted">
                  {items.length === 0
                    ? 'No nutrition scheduled for today or yesterday'
                    : 'No items match the selected filters'}
                </p>
              </div>
            ) : (
              <div className="admin-v2-schedule-list">
                {sortedDays.map(dayKey => (
                  <div key={dayKey} className="admin-v2-schedule-day">
                    <div className="admin-v2-schedule-day-header">
                      <h3>{dayKey}</h3>
                    </div>

                    {sortTimeSlots(Object.keys(grouped[dayKey])).map(timeStr => (
                      <div key={timeStr} className="admin-v2-schedule-time-group">
                        <div className="admin-v2-schedule-time-header">
                          <span className="admin-v2-schedule-time">{timeStr}</span>
                          <span className="admin-v2-schedule-count-label">
                            {grouped[dayKey][timeStr].length} item{grouped[dayKey][timeStr].length !== 1 ? 's' : ''}
                          </span>
                        </div>

                        <div className="admin-v2-schedule-items">
                          {grouped[dayKey][timeStr].map((item, idx) => {
                            const statusInfo = getStatusInfo(item._bucket);
                            const isCompleted = item._bucket === 'completed';

                            return (
                              <div
                                key={`${item.schedule_id ?? 'prn'}-${item.scheduled_time}-${idx}`}
                                className={`admin-v2-schedule-item ${isCompleted ? 'completed' : ''}`}
                                style={{
                                  borderLeftColor: statusInfo.border,
                                  backgroundColor: statusInfo.bg
                                }}
                              >
                                <div className="admin-v2-schedule-item-content">
                                  <div className="admin-v2-schedule-item-main">
                                    <span className="admin-v2-schedule-med-name">
                                      {item.name}
                                    </span>
                                    {item._detail && (
                                      <span className="admin-v2-schedule-dose">
                                        {item._detail}
                                      </span>
                                    )}
                                  </div>
                                  <div className="admin-v2-schedule-item-status">
                                    <span
                                      className="admin-v2-schedule-status-badge"
                                      style={{
                                        backgroundColor: statusInfo.border,
                                        color: '#fff'
                                      }}
                                    >
                                      {getStatusText(item)}
                                    </span>
                                    {item.completed_at && (
                                      <span className="admin-v2-schedule-actual-time">
                                        Completed at {new Date(item.completed_at).toLocaleTimeString(undefined, {
                                          hour: 'numeric',
                                          minute: '2-digit',
                                          hour12: true
                                        })}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {!isCompleted && !item.is_prn && hasPermission('nutrition.update') && (
                                  <div className="admin-v2-schedule-item-actions">
                                    <button
                                      className="admin-v2-btn admin-v2-btn-success admin-v2-btn-sm"
                                      onClick={() => handleMarkCompleted(item)}
                                    >
                                      {item._bucket === 'missed' ? 'Complete Now' : 'Mark Complete'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Legend */}
            <div className="admin-v2-schedule-legend">
              <h4>Status Legend</h4>
              <div className="admin-v2-legend-items">
                <div className="admin-v2-legend-item">
                  <span className="admin-v2-legend-dot" style={{ backgroundColor: '#58a6ff' }}></span>
                  <span>Ready</span>
                </div>
                <div className="admin-v2-legend-item">
                  <span className="admin-v2-legend-dot" style={{ backgroundColor: '#1f6feb' }}></span>
                  <span>Upcoming</span>
                </div>
                <div className="admin-v2-legend-item">
                  <span className="admin-v2-legend-dot" style={{ backgroundColor: '#f85149' }}></span>
                  <span>Missed</span>
                </div>
                <div className="admin-v2-legend-item">
                  <span className="admin-v2-legend-dot" style={{ backgroundColor: '#238636' }}></span>
                  <span>Completed</span>
                </div>
              </div>
            </div>
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
