import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { PatientSelectorModal } from './components';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import {
  MedicationsIcon,
  ClockIcon,
  CheckIcon,
  XIcon
} from '../../components/Icons';
import { checkAdministrationWindow, formatDurationMinutes } from '../../utils/timezone';
import './AdminV2.css';

const AdminV2MedicationsSchedule = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { 
    patients, 
    selectedPatient: contextPatient, 
    selectPatient: setContextPatient,
    loadingPatients 
  } = useAdminPatient();
  
  // Use context patient as the source of truth
  const selectedPatient = contextPatient;
  const [showPatientModal, setShowPatientModal] = useState(false);
  
  // Schedule data state
  const [scheduledMedications, setScheduledMedications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Status filter state
  const [statusFilters, setStatusFilters] = useState({
    ready: true,
    upcoming: true,
    missed: true,
    completed: false,
    skipped: false
  });

  // Off-window (early or late) administration confirmation modal state
  const [windowConfirm, setWindowConfirm] = useState({ open: false, medication: null, check: null });

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
  }, [searchParams, patients, loadingPatients]);

  // Update URL when context patient changes
  useEffect(() => {
    if (contextPatient && searchParams.get('patient') !== String(contextPatient.id)) {
      setSearchParams({ patient: contextPatient.id });
    }
  }, [contextPatient]);

  // Fetch schedule when patient changes
  useEffect(() => {
    if (selectedPatient) {
      fetchSchedule();
    }
  }, [selectedPatient]);

  const fetchSchedule = async () => {
    if (!selectedPatient) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(
        `${config.apiUrl}/api/schedules/daily?patient_id=${selectedPatient.id}`,
        { credentials: 'include' }
      );

      if (response.ok) {
        const data = await response.json();
        setScheduledMedications(data.scheduled_medications || []);
      } else {
        setError('Failed to load schedule');
      }
    } catch (err) {
      setError('Error connecting to server');
      console.error('Error fetching schedule:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPatient = (patient) => {
    setContextPatient(patient);
    setSearchParams({ patient: patient.id });
    setShowPatientModal(false);
  };

  const handleChangePatient = () => {
    setShowPatientModal(true);
  };

  // Status helpers
  const getStatusInfo = (status) => {
    const statusMap = {
      'on_time': { label: 'On Time', color: '#238636', bg: 'rgba(35, 134, 54, 0.15)', border: '#238636' },
      'completed': { label: 'Completed', color: '#238636', bg: 'rgba(35, 134, 54, 0.15)', border: '#238636' },
      'warning': { label: 'Warning', color: '#9e6a03', bg: 'rgba(158, 106, 3, 0.15)', border: '#9e6a03' },
      'late_early': { label: 'Late/Early', color: '#f85149', bg: 'rgba(248, 81, 73, 0.15)', border: '#f85149' },
      'missed': { label: 'Missed', color: '#f85149', bg: 'rgba(248, 81, 73, 0.15)', border: '#f85149' },
      'upcoming': { label: 'Upcoming', color: '#1f6feb', bg: 'rgba(31, 111, 235, 0.15)', border: '#1f6feb' },
      'ready': { label: 'Ready', color: '#58a6ff', bg: 'rgba(88, 166, 255, 0.15)', border: '#58a6ff' },
      'skipped': { label: 'Skipped', color: '#8b949e', bg: 'rgba(139, 148, 158, 0.15)', border: '#8b949e' }
    };
    return statusMap[status] || statusMap.upcoming;
  };

  const getStatusText = (item) => {
    if (item.is_completed) {
      if (item.actual_dose === 0) return 'Skipped';
      return item.status === 'on_time' ? 'On Time' : 
             item.status === 'warning' ? 'Slight Delay' : 
             item.status === 'late_early' ? 'Late/Early' : 'Completed';
    }
    if (item.status === 'missed') return 'Missed';
    if (item.status === 'ready') return 'Ready to Take';
    return 'Upcoming';
  };

  const getFilteredMedications = () => {
    return scheduledMedications.filter(med => {
      if (med.is_completed) {
        if (med.actual_dose === 0) return statusFilters.skipped;
        return statusFilters.completed;
      }
      if (med.status === 'missed') return statusFilters.missed;
      if (med.status === 'ready') return statusFilters.ready;
      return statusFilters.upcoming;
    });
  };

  // Group medications by day and time
  const groupMedications = (medications) => {
    const groups = {};
    
    medications.forEach(item => {
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

  // Sort time slots
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

  const handleMarkTaken = async (medication) => {
    const check = checkAdministrationWindow(medication.scheduled_time);
    if (check.status === 'early' || check.status === 'late') {
      setWindowConfirm({ open: true, medication, check });
      return;
    }
    await submitMarkTaken(medication, false);
  };

  const submitMarkTaken = async (medication, earlyOverride = false) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/medications/${medication.medication_id}/administer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          schedule_id: medication.schedule_id,
          scheduled_time: medication.scheduled_time,
          dose_amount: medication.dose_amount,
          notes: '',
          early_override: earlyOverride,
          ...(selectedPatient?.id != null && { patient_id: selectedPatient.id })
        })
      });

      if (response.ok) {
        await fetchSchedule();
      } else {
        const data = await response.json().catch(() => ({}));
        const offWindowError = response.status === 409 && (
          data.error === 'early_administration' ||
          data.error === 'late_administration' ||
          data.error === 'off_window_administration'
        );
        if (offWindowError) {
          // Backend caught what the frontend missed — surface the same warning modal.
          setWindowConfirm({
            open: true,
            medication,
            check: checkAdministrationWindow(medication.scheduled_time),
          });
        } else {
          alert(data.detail || 'Failed to mark as taken');
        }
      }
    } catch (err) {
      console.error('Error marking medication as taken:', err);
      alert('Error connecting to server');
    }
  };

  const handleSkip = async (medication) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/medications/${medication.medication_id}/administer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          schedule_id: medication.schedule_id,
          scheduled_time: medication.scheduled_time,
          dose_amount: 0,
          notes: 'Skipped',
          ...(selectedPatient?.id != null && { patient_id: selectedPatient.id })
        })
      });

      if (response.ok) {
        await fetchSchedule();
      } else {
        const data = await response.json();
        alert(data.detail || 'Failed to skip medication');
      }
    } catch (err) {
      console.error('Error skipping medication:', err);
      alert('Error connecting to server');
    }
  };

  // Get stats
  const stats = {
    total: scheduledMedications.length,
    ready: scheduledMedications.filter(m => !m.is_completed && m.status === 'ready').length,
    upcoming: scheduledMedications.filter(m => !m.is_completed && m.status === 'upcoming').length,
    missed: scheduledMedications.filter(m => !m.is_completed && m.status === 'missed').length,
    completed: scheduledMedications.filter(m => m.is_completed && m.actual_dose > 0).length,
    skipped: scheduledMedications.filter(m => m.is_completed && m.actual_dose === 0).length
  };

  // Loading state
  if (loadingPatients) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-loading">Loading patients...</div>
      </AdminV2Layout>
    );
  }

  const filteredMeds = getFilteredMedications();
  const groupedMeds = groupMedications(filteredMeds);
  const sortedDays = Object.keys(groupedMeds).sort((a, b) => new Date(a) - new Date(b));

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {selectedPatient ? (
          <>
            {/* Section Title */}
            <h1 className="schedule-section-title">Daily Medication Schedule</h1>

            {/* Stats Row */}
            <div className="admin-v2-stats-row">
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

            {/* Refresh Button */}
            <div className="admin-v2-page-header">
              <h3 style={{ margin: 0, color: '#e6edf3' }}>
                Today & Yesterday ({filteredMeds.length} of {scheduledMedications.length})
              </h3>
              <button 
                className="admin-v2-btn admin-v2-btn-primary"
                onClick={fetchSchedule}
                disabled={loading}
              >
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            {/* Schedule Content */}
            {loading ? (
              <div className="admin-v2-loading">Loading schedule...</div>
            ) : error ? (
              <div className="admin-v2-error">{error}</div>
            ) : filteredMeds.length === 0 ? (
              <div className="admin-v2-empty-state">
                <MedicationsIcon size={48} />
                <h3>No Scheduled Medications</h3>
                <p className="admin-v2-text-muted">
                  {scheduledMedications.length === 0 
                    ? 'No medications scheduled for today or yesterday'
                    : 'No medications match the selected filters'}
                </p>
              </div>
            ) : (
              <div className="admin-v2-schedule-list">
                {sortedDays.map(dayKey => (
                  <div key={dayKey} className="admin-v2-schedule-day">
                    <div className="admin-v2-schedule-day-header">
                      <h3>{dayKey}</h3>
                    </div>
                    
                    {sortTimeSlots(Object.keys(groupedMeds[dayKey])).map(timeStr => (
                      <div key={timeStr} className="admin-v2-schedule-time-group">
                        <div className="admin-v2-schedule-time-header">
                          <span className="admin-v2-schedule-time">{timeStr}</span>
                          <span className="admin-v2-schedule-count-label">
                            {groupedMeds[dayKey][timeStr].length} medication{groupedMeds[dayKey][timeStr].length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        
                        <div className="admin-v2-schedule-items">
                          {groupedMeds[dayKey][timeStr].map((item, idx) => {
                            const statusInfo = getStatusInfo(item.status);
                            const isCompleted = item.is_completed;
                            
                            return (
                              <div 
                                key={`${item.schedule_id}-${idx}`}
                                className={`admin-v2-schedule-item ${isCompleted ? 'completed' : ''}`}
                                style={{ 
                                  borderLeftColor: statusInfo.border,
                                  backgroundColor: statusInfo.bg
                                }}
                              >
                                <div className="admin-v2-schedule-item-content">
                                  <div className="admin-v2-schedule-item-main">
                                    <span className="admin-v2-schedule-med-name">
                                      {item.medication_name}
                                      {item.concentration && (
                                        <span className="admin-v2-schedule-concentration">
                                          ({item.concentration})
                                        </span>
                                      )}
                                    </span>
                                    <span className="admin-v2-schedule-dose">
                                      {item.dose_amount} {item.dose_unit || 'units'}
                                    </span>
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
                                    {item.actual_time && (
                                      <span className="admin-v2-schedule-actual-time">
                                        Taken at {new Date(item.actual_time).toLocaleTimeString(undefined, { 
                                          hour: 'numeric', 
                                          minute: '2-digit', 
                                          hour12: true 
                                        })}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                
                                {!isCompleted && hasPermission('medications.update') && (
                                  <div className="admin-v2-schedule-item-actions">
                                    <button
                                      className="admin-v2-btn admin-v2-btn-success admin-v2-btn-sm"
                                      onClick={() => handleMarkTaken(item)}
                                    >
                                      {item.status === 'missed' ? 'Take Now' : 'Mark Taken'}
                                    </button>
                                    {item.status === 'missed' && (
                                      <button
                                        className="admin-v2-btn admin-v2-btn-sm"
                                        onClick={() => handleSkip(item)}
                                      >
                                        Skip
                                      </button>
                                    )}
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
                  <span>Ready to Take</span>
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
                <div className="admin-v2-legend-item">
                  <span className="admin-v2-legend-dot" style={{ backgroundColor: '#8b949e' }}></span>
                  <span>Skipped</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="admin-v2-no-patient">
            <MedicationsIcon size={48} />
            <h2>Select a Patient</h2>
            <p>Choose a patient to view their daily medication schedule</p>
            <button 
              className="admin-v2-btn admin-v2-btn-primary"
              onClick={() => setShowPatientModal(true)}
            >
              Select Patient
            </button>
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

        {/* Off-window (early or late) administration confirmation modal */}
        {windowConfirm.open && windowConfirm.medication && (() => {
          const isLate = windowConfirm.check?.status === 'late';
          const title = isLate ? 'Warning: Late Administration' : 'Warning: Early Administration';
          const heading = isLate
            ? 'This medication was scheduled earlier'
            : 'This medication is scheduled later';
          const offsetText = isLate
            ? `${formatDurationMinutes(Math.abs(windowConfirm.check.minutesOffset))} ago`
            : `${formatDurationMinutes(windowConfirm.check.minutesOffset)} from now`;
          const consequence = isLate
            ? 'Giving a medication more than 1 hour late can be unsafe.'
            : 'Giving a medication more than 1 hour early can be unsafe.';
          const confirmLabel = isLate ? 'Confirm Late Administration' : 'Confirm Early Administration';
          const close = () => setWindowConfirm({ open: false, medication: null, check: null });
          return (
            <div className="admin-v2-modal-overlay" onClick={close}>
              <div className="admin-v2-modal admin-v2-modal-sm" onClick={e => e.stopPropagation()}>
                <div className="admin-v2-modal-header">
                  <h2>{title}</h2>
                  <button className="admin-v2-modal-close" onClick={close}>
                    <XIcon size={20} />
                  </button>
                </div>
                <div className="admin-v2-modal-body">
                  <div
                    role="alert"
                    style={{
                      background: 'rgba(187, 128, 9, 0.15)',
                      border: '1px solid rgba(187, 128, 9, 0.6)',
                      borderRadius: 6,
                      padding: '0.75rem 1rem',
                      color: '#e6edf3'
                    }}
                  >
                    <div style={{ fontWeight: 600, color: '#f0883e', marginBottom: '0.35rem' }}>
                      {heading}
                    </div>
                    <div style={{ fontSize: '0.9rem' }}>
                      <strong>{windowConfirm.medication.name}</strong> is scheduled for{' '}
                      <strong>{windowConfirm.check.scheduledLocal}</strong>
                      {' '}— that's <strong>{offsetText}</strong>.
                      {' '}{consequence} Confirm this is intentional.
                    </div>
                  </div>
                </div>
                <div className="admin-v2-modal-footer">
                  <button type="button" className="admin-v2-btn" onClick={close}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="admin-v2-btn"
                    style={{ background: '#bb8009', borderColor: '#bb8009', color: '#0d1117' }}
                    onClick={async () => {
                      const med = windowConfirm.medication;
                      close();
                      await submitMarkTaken(med, true);
                    }}
                  >
                    {confirmLabel}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2MedicationsSchedule;
