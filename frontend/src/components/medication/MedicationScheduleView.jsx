import React, { useState, useEffect } from 'react';
import config from '../../config';
import { localTimeToUTC, parseCronExpression } from '../../utils/timezone';

/**
 * MedicationScheduleView Component
 * 
 * A comprehensive component for managing medication schedules and viewing filtered scheduled medications.
 * 
 * Usage Examples:
 * 
 * 1. Basic Schedule Management (default usage):
 *    <MedicationScheduleView 
 *      med={medication}
 *      onBack={() => setShowScheduleFor(null)}
 *      fetchMedications={fetchMedications}
 *      loading={loading}
 *      setLoading={setLoading}
 *    />
 * 
 * 2. With Status Filtering for Scheduled Medications:
 *    <MedicationScheduleView 
 *      med={medication}
 *      onBack={() => setShowView('list')}
 *      fetchMedications={fetchMedications}
 *      loading={loading}
 *      setLoading={setLoading}
 *      scheduledMedications={scheduledMedications.scheduled_medications}
 *      showStatusFilters={true}
 *    />
 * 
 * Props:
 * - med: Medication object with schedules
 * - onBack: Function to call when back button is clicked
 * - fetchMedications: Function to refresh medication data
 * - loading: Loading state
 * - setLoading: Function to set loading state
 * - scheduledMedications: Optional array of scheduled medications for filtering
 * - showStatusFilters: Boolean to show/hide status filtering UI
 * - patients: Array of available patients for global medication scheduling
 * - currentPatientId: Current dashboard patient ID (default selection for global meds)
 */

const MedicationScheduleView = ({ 
  med, 
  onBack, 
  fetchMedications,
  loading,
  setLoading,
  scheduledMedications = null, // Optional: for filtering daily scheduled medications
  showStatusFilters = false, // Flag to show status filters instead of schedule filters
  patients = [], // List of available patients
  currentPatientId = null // Current dashboard patient ID
}) => {
  const [scheduleMode, setScheduleMode] = useState('weekly'); // 'weekly' or 'monthly'
  const [selectedDays, setSelectedDays] = useState([]); // for weekly
  const [selectedDayOfMonth, setSelectedDayOfMonth] = useState(1); // for monthly
  const [time, setTime] = useState('08:00');
  const [doseAmount, setDoseAmount] = useState('1.000');
  const [selectedPatientId, setSelectedPatientId] = useState(currentPatientId ? String(currentPatientId) : ''); // For global meds

  // Update selectedPatientId when currentPatientId changes (for default selection)
  useEffect(() => {
    console.log('MedicationScheduleView - patients:', patients, 'currentPatientId:', currentPatientId);
    if (currentPatientId) {
      setSelectedPatientId(String(currentPatientId));
    }
  }, [currentPatientId, patients]);

  // Status filter state - default to ready to take, upcoming, and missed
  const [statusFilters, setStatusFilters] = useState({
    on_time: false,           // On time (±1 hour)
    warning: false,           // Warning (1-2 hours off)
    late_early: false,        // Late/Early (>2 hours off)
    upcoming: true,           // Upcoming (default selected)
    missed: true,             // Missed (default selected)
    skipped: false,           // Skipped
    ready_to_take: true       // Ready to take (default selected)
  });

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Helper function to get patient name by ID
  const getPatientName = (patientId) => {
    if (!patientId || !patients || patients.length === 0) return 'Unknown Patient';
    const patient = patients.find(p => p.id === patientId);
    return patient ? `${patient.first_name} ${patient.last_name}` : 'Unknown Patient';
  };

  // Helper function to filter schedules by current patient (for patient-specific medications)
  const getRelevantSchedules = (schedules) => {
    if (!schedules || schedules.length === 0) return [];
    
    // For patient-specific medications, only show schedules for the current patient
    if (!med.is_global && currentPatientId) {
      return schedules.filter(schedule => 
        schedule.patient_id === parseInt(currentPatientId)
      );
    }
    
    // For global medications, show all schedules
    return schedules;
  };

  // Helper function to determine medication status based on timing
  const getMedicationStatus = (medication) => {
    if (!medication.scheduled_time) return 'unknown';
    
    // If already taken
    if (medication.actual_dose !== null && medication.actual_dose !== undefined) {
      if (medication.actual_dose === 0) return 'skipped';
      
      if (medication.actual_time) {
        const scheduledTime = new Date(medication.scheduled_time);
        const actualTime = new Date(medication.actual_time);
        const diffHours = Math.abs(actualTime - scheduledTime) / (1000 * 60 * 60);
        
        if (diffHours <= 1) return 'on_time';
        if (diffHours <= 2) return 'warning';
        return 'late_early';
      }
      return 'on_time'; // taken but no actual time recorded
    }
    
    // Not taken yet - check timing
    const now = new Date();
    const scheduledTime = new Date(medication.scheduled_time);
    const diffHours = (now - scheduledTime) / (1000 * 60 * 60);
    
    if (diffHours < -1) return 'upcoming';     // More than 1 hour before
    if (diffHours <= 1) return 'ready_to_take'; // Within 1 hour window
    return 'missed';                           // More than 1 hour past
  };

  // Helper function to get status display info
  const getStatusInfo = (status) => {
    const statusMap = {
      on_time: { label: 'On Time', color: '#28a745' },
      warning: { label: 'Warning', color: '#ffc107' },
      late_early: { label: 'Late/Early', color: '#fd7e14' },
      upcoming: { label: 'Upcoming', color: '#6f42c1' },
      missed: { label: 'Missed', color: '#dc3545' },
      skipped: { label: 'Skipped', color: '#6c757d' },
      ready_to_take: { label: 'Ready to Take', color: '#007bff' },
      unknown: { label: 'Unknown', color: '#6c757d' }
    };
    return statusMap[status] || statusMap.unknown;
  };

  // Filter scheduled medications based on status filters
  const filterMedicationsByStatus = (medications) => {
    if (!medications || !Array.isArray(medications)) return [];
    
    return medications.filter(med => {
      const status = getMedicationStatus(med);
      return statusFilters[status];
    });
  };

  // Toggle status filter
  const toggleStatusFilter = (filterKey) => {
    setStatusFilters(prev => ({
      ...prev,
      [filterKey]: !prev[filterKey]
    }));
  };

  // Clear all filters
  const clearAllFilters = () => {
    setStatusFilters({
      on_time: false,
      warning: false,
      late_early: false,
      upcoming: false,
      missed: false,
      skipped: false,
      ready_to_take: false
    });
  };

  // Set default filters (ready to take, upcoming, missed)
  const setDefaultFilters = () => {
    setStatusFilters({
      on_time: false,
      warning: false,
      late_early: false,
      upcoming: true,
      missed: true,
      skipped: false,
      ready_to_take: true
    });
  };

  // Select all filters
  const selectAllFilters = () => {
    setStatusFilters({
      on_time: true,
      warning: true,
      late_early: true,
      upcoming: true,
      missed: true,
      skipped: true,
      ready_to_take: true
    });
  };

  // Count medications by status
  const getStatusCounts = (medications) => {
    if (!medications || !Array.isArray(medications)) {
      return {
        on_time: 0, warning: 0, late_early: 0, upcoming: 0, 
        missed: 0, skipped: 0, ready_to_take: 0, total: 0
      };
    }
    
    const counts = {
      on_time: 0, warning: 0, late_early: 0, upcoming: 0, 
      missed: 0, skipped: 0, ready_to_take: 0, total: medications.length
    };
    
    medications.forEach(med => {
      const status = getMedicationStatus(med);
      if (counts.hasOwnProperty(status)) {
        counts[status]++;
      }
    });
    
    return counts;
  };

  // Helper function to separate schedules by type
  const separateSchedules = (schedules) => {
    const weekly = [];
    const monthly = [];
    
    schedules.forEach((schedule) => {
      const cronExpression = schedule.cron_expression;
      const doseAmount = schedule.dose_amount;
      const isActive = schedule.active;
      const scheduleId = schedule.id;
      
      const parsed = parseCronExpression(cronExpression);
      if (parsed) {
        const scheduleObj = {
          id: scheduleId,
          doseAmount,
          isActive,
          parsed
        };
        
        if (parsed.type === 'weekly') {
          weekly.push(scheduleObj);
        } else if (parsed.type === 'monthly') {
          monthly.push(scheduleObj);
        }
      }
    });
    
    return { weekly, monthly };
  };

  const handleAddSchedule = async (medId) => {
    // For global medications, require patient selection
    if (med.is_global && !selectedPatientId) {
      alert('Please select a patient for this global medication schedule.');
      return;
    }
    
    let cron = '';
    let description = '';
    // Convert local time to UTC for cron expression (DB stores in UTC)
    const utc = localTimeToUTC(time);
    
    if (scheduleMode === 'weekly') {
      if (selectedDays.length === 0) return;
      const dow = selectedDays.sort().join(',');
      cron = `${utc.minute} ${utc.hour} * * ${dow}`;
      
      // Generate human-readable description for weekly schedule
      const daysMap = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dayNames = selectedDays.map(d => daysMap[parseInt(d)]).join(', ');
      description = `${dayNames} at ${time}`;
    } else {
      cron = `${utc.minute} ${utc.hour} ${selectedDayOfMonth} * *`;
      
      // Generate human-readable description for monthly schedule
      description = `Day ${selectedDayOfMonth} of each month at ${time}`;
    }
    
    try {
      setLoading(true);
      const scheduleData = {
        type: 'med',
        cron_expression: cron,
        description: description,
        dose_amount: parseFloat(doseAmount) || 1.0,
        active: true,
        notes: ''
      };
      
      // Add patient_id for global medications
      if (med.is_global && selectedPatientId) {
        scheduleData.patient_id = parseInt(selectedPatientId);
      }
      
      const response = await fetch(`${config.apiUrl}/api/add/schedule/${medId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(scheduleData)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to add schedule');
      }
      
      // Refresh the medication data to get updated schedules
      await fetchMedications();
      
      // Reset form
      setSelectedDays([]);
      setSelectedDayOfMonth(1);
      setTime('08:00');
      setDoseAmount('1.000');
      setScheduleMode('weekly');
    } catch (error) {
      console.error('Error adding schedule:', error);
      alert(`Error adding schedule: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSchedule = async (medId, scheduleId) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return;
    
    try {
      setLoading(true);
      const response = await fetch(`${config.apiUrl}/api/schedules/${scheduleId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete schedule');
      }
      
      // Refresh the medication data to get updated schedules
      await fetchMedications();
    } catch (error) {
      console.error('Error deleting schedule:', error);
      alert('Error deleting schedule. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSchedule = async (scheduleId) => {
    try {
      setLoading(true);
      const response = await fetch(`${config.apiUrl}/api/schedules/${scheduleId}/toggle-active`, {
        method: 'POST',
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to toggle schedule');
      }
      
      // Refresh the medication data to get updated schedules
      await fetchMedications();
    } catch (error) {
      console.error('Error toggling schedule:', error);
      alert('Error updating schedule status. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: '#fff', borderRadius: 8, padding: 24, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
      <h3 style={{ margin: '0 0 16px 0', color: '#333' }}>
        Manage Schedules for <span style={{ color: '#007bff' }}>{med.name}</span>
      </h3>
      
      {/* Status Filters - Show when dealing with daily scheduled medications */}
      {showStatusFilters && scheduledMedications && (
        <div style={{ marginBottom: 24, padding: 16, backgroundColor: '#f8f9fa', borderRadius: 8, border: '1px solid #dee2e6' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h4 style={{ margin: 0, color: '#333', fontSize: 16, fontWeight: 600 }}>Filter by Status</h4>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={selectAllFilters}
                style={{
                  padding: '4px 12px',
                  border: '1px solid #28a745',
                  borderRadius: 4,
                  background: '#fff',
                  color: '#28a745',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                  e.target.style.background = '#28a745';
                  e.target.style.color = '#fff';
                }}
                onMouseOut={(e) => {
                  e.target.style.background = '#fff';
                  e.target.style.color = '#28a745';
                }}
              >
                All
              </button>
              <button
                type="button"
                onClick={setDefaultFilters}
                style={{
                  padding: '4px 12px',
                  border: '1px solid #6c757d',
                  borderRadius: 4,
                  background: '#fff',
                  color: '#6c757d',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                  e.target.style.background = '#6c757d';
                  e.target.style.color = '#fff';
                }}
                onMouseOut={(e) => {
                  e.target.style.background = '#fff';
                  e.target.style.color = '#6c757d';
                }}
              >
                Default
              </button>
              <button
                type="button"
                onClick={clearAllFilters}
                style={{
                  padding: '4px 12px',
                  border: '1px solid #dc3545',
                  borderRadius: 4,
                  background: '#fff',
                  color: '#dc3545',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                  e.target.style.background = '#dc3545';
                  e.target.style.color = '#fff';
                }}
                onMouseOut={(e) => {
                  e.target.style.background = '#fff';
                  e.target.style.color = '#dc3545';
                }}
              >
                Clear
              </button>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(() => {
              const statusCounts = getStatusCounts(scheduledMedications);
              
              return Object.entries(statusFilters).map(([filterKey, isSelected]) => {
                const statusInfo = getStatusInfo(filterKey);
                const count = statusCounts[filterKey] || 0;
                
                return (
                  <button
                    key={filterKey}
                    type="button"
                    onClick={() => toggleStatusFilter(filterKey)}
                    disabled={count === 0}
                    style={{
                      padding: '6px 12px',
                      border: `2px solid ${statusInfo.color}`,
                      borderRadius: 6,
                      background: isSelected ? statusInfo.color : '#fff',
                      color: isSelected ? '#fff' : statusInfo.color,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: count > 0 ? 'pointer' : 'not-allowed',
                      opacity: count === 0 ? 0.5 : 1,
                      transition: 'all 0.2s',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    <span style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: isSelected ? '#fff' : statusInfo.color
                    }}></span>
                    {statusInfo.label} ({count})
                  </button>
                );
              });
            })()}
          </div>
          
          {scheduledMedications && (
            <div style={{ marginTop: 12, fontSize: 14, color: '#6c757d' }}>
              Showing {filterMedicationsByStatus(scheduledMedications).length} of {scheduledMedications.length} medications
            </div>
          )}
        </div>
      )}
      
      {/* Add New Schedule Form */}
      <div style={{ marginBottom: 24, padding: 20, backgroundColor: '#f8f9fa', borderRadius: 8, border: '1px solid #dee2e6' }}>
        <h4 style={{ margin: '0 0 16px 0', color: '#333', fontSize: 16, fontWeight: 600 }}>Add New Schedule</h4>
        
        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setScheduleMode('weekly')}
            style={{ 
              padding: '8px 18px', 
              border: 'none', 
              borderRadius: 6, 
              background: scheduleMode === 'weekly' ? '#007bff' : '#f8f9fa', 
              color: scheduleMode === 'weekly' ? '#fff' : '#333', 
              fontWeight: 500, 
              fontSize: 14,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Weekly
          </button>
          <button
            type="button"
            onClick={() => setScheduleMode('monthly')}
            style={{ 
              padding: '8px 18px', 
              border: 'none', 
              borderRadius: 6, 
              background: scheduleMode === 'monthly' ? '#007bff' : '#f8f9fa', 
              color: scheduleMode === 'monthly' ? '#fff' : '#333', 
              fontWeight: 500, 
              fontSize: 14,
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            Monthly
          </button>
        </div>

        {scheduleMode === 'weekly' ? (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontWeight: 600, color: '#333', marginBottom: 8, display: 'block' }}>Select Days</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {daysOfWeek.map((d, i) => (
                <label 
                  key={d} 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 4, 
                    background: selectedDays.includes(i.toString()) ? '#007bff' : '#fff', 
                    color: selectedDays.includes(i.toString()) ? '#fff' : '#333', 
                    borderRadius: 4, 
                    padding: '6px 12px', 
                    cursor: 'pointer', 
                    fontWeight: 500,
                    border: '1px solid #ddd',
                    transition: 'all 0.2s'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedDays.includes(i.toString())}
                    onChange={() => {
                      setSelectedDays(prev => 
                        prev.includes(i.toString()) 
                          ? prev.filter(x => x !== i.toString()) 
                          : [...prev, i.toString()]
                      );
                    }}
                    style={{ accentColor: '#007bff' }}
                  />
                  {d}
                </label>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontWeight: 600, color: '#333', marginBottom: 8, display: 'block' }}>Day of Month</label>
            <select
              value={selectedDayOfMonth}
              onChange={e => setSelectedDayOfMonth(Number(e.target.value))}
              style={{ 
                padding: '8px 16px', 
                border: '2px solid #ddd', 
                borderRadius: 6, 
                fontSize: 14, 
                background: '#fff', 
                color: '#333',
                minWidth: 100
              }}
            >
              {[...Array(28)].map((_, i) => (
                <option key={i+1} value={i+1}>{i+1}</option>
              ))}
            </select>
          </div>
        )}

        {/* Patient Selection for Global Medications */}
        {med.is_global && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontWeight: 600, color: '#333', marginBottom: 8, display: 'block' }}>
              Select Patient
            </label>
            <select
              value={selectedPatientId || ''}
              onChange={e => setSelectedPatientId(e.target.value)}
              style={{ 
                padding: '8px 16px', 
                border: '2px solid #ddd', 
                borderRadius: 6, 
                fontSize: 14, 
                background: '#fff', 
                color: '#333',
                minWidth: 200,
                width: '100%',
                maxWidth: 300
              }}
            >
              <option value="">Select a patient...</option>
              {patients.map(patient => (
                <option key={patient.id} value={patient.id}>
                  {patient.first_name} {patient.last_name}
                </option>
              ))}
            </select>
            {!selectedPatientId && (
              <div style={{ marginTop: 4, fontSize: 12, color: '#dc3545' }}>
                Patient selection required for global medication schedules
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr', gap: 16, alignItems: 'end', marginBottom: 16 }}>
          <div>
            <label style={{ fontWeight: 600, color: '#333', marginBottom: 8, display: 'block' }}>Time</label>
            <input
              type="time"
              value={time}
              onChange={e => setTime(e.target.value)}
              style={{ 
                padding: '8px 12px', 
                border: '2px solid #ddd', 
                borderRadius: 6, 
                fontSize: 14, 
                background: '#fff', 
                color: '#333', 
                width: 120 
              }}
            />
          </div>
          
          <div>
            <label style={{ fontWeight: 600, color: '#333', marginBottom: 8, display: 'block' }}>
              Dose Amount ({med.quantity_unit || 'units'})
            </label>
            <input
              type="number"
              step="0.001"
              min="0"
              value={doseAmount}
              onChange={e => setDoseAmount(e.target.value)}
              style={{ 
                padding: '8px 12px', 
                border: '2px solid #ddd', 
                borderRadius: 6, 
                fontSize: 14, 
                background: '#fff', 
                color: '#333', 
                width: 120 
              }}
              placeholder="1.000"
            />
          </div>

          <div>
            <button
              type="button"
              onClick={() => handleAddSchedule(med.id)}
              style={{ 
                padding: '10px 20px', 
                border: 'none', 
                borderRadius: 6, 
                background: '#28a745', 
                color: '#fff', 
                fontWeight: 500, 
                fontSize: 14,
                cursor: 'pointer',
                transition: 'background-color 0.2s'
              }}
              disabled={loading || (scheduleMode === 'weekly' ? selectedDays.length === 0 : false)}
              onMouseOver={(e) => {
                if (!loading && !(scheduleMode === 'weekly' && selectedDays.length === 0)) {
                  e.target.style.background = '#1e7e34';
                }
              }}
              onMouseOut={(e) => {
                if (!loading && !(scheduleMode === 'weekly' && selectedDays.length === 0)) {
                  e.target.style.background = '#28a745';
                }
              }}
            >
              {loading ? 'Adding...' : 'Add Schedule'}
            </button>
          </div>
        </div>
      </div>

      {/* Existing Schedules */}
      <div style={{ marginBottom: 16 }}>
        <h4 style={{ margin: '0 0 16px 0', color: '#333', fontSize: 16, fontWeight: 600 }}>Current Schedules</h4>
        
        {med.schedules && getRelevantSchedules(med.schedules).length > 0 ? (() => {
          const { weekly, monthly } = separateSchedules(getRelevantSchedules(med.schedules));
          
          return (
            <>
              {weekly.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <h5 style={{ margin: '0 0 12px 0', color: '#495057', fontSize: 14, fontWeight: 600 }}>Weekly Schedules</h5>
                  <div style={{ backgroundColor: '#fff', borderRadius: 8, border: '1px solid #dee2e6', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f8f9fa' }}>
                          <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#495057', borderBottom: '1px solid #dee2e6' }}>
                            Dose
                          </th>
                          <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#495057', borderBottom: '1px solid #dee2e6' }}>
                            Time
                          </th>
                          <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#495057', borderBottom: '1px solid #dee2e6' }}>
                            Days
                          </th>
                          {med.is_global && (
                            <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#495057', borderBottom: '1px solid #dee2e6' }}>
                              Patient
                            </th>
                          )}
                          <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#495057', borderBottom: '1px solid #dee2e6' }}>
                            Status
                          </th>
                          <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#495057', borderBottom: '1px solid #dee2e6' }}>
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {weekly.map((schedule) => (
                          <tr key={schedule.id} style={{ borderBottom: '1px solid #f1f3f4' }}>
                            <td style={{ padding: '12px 16px', fontSize: 14, color: '#333' }}>
                              <strong>{schedule.doseAmount || '1'}</strong> {med.quantity_unit || 'units'}
                            </td>
                            <td style={{ padding: '12px 16px', fontSize: 14, color: '#333' }}>
                              {schedule.parsed.time}
                            </td>
                            <td style={{ padding: '12px 16px', fontSize: 14, color: '#333' }}>
                              {schedule.parsed.days}
                            </td>
                            {med.is_global && (
                              <td style={{ padding: '12px 16px', fontSize: 14, color: '#333' }}>
                                {getPatientName(schedule.patient_id)}
                              </td>
                            )}
                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                              <span style={{
                                display: 'inline-block',
                                padding: '4px 8px',
                                borderRadius: 12,
                                fontSize: 12,
                                fontWeight: 600,
                                color: '#fff',
                                background: schedule.isActive ? '#28a745' : '#6c757d'
                              }}>
                                {schedule.isActive ? 'Active' : 'Paused'}
                              </span>
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => handleToggleSchedule(schedule.id)}
                                  style={{
                                    background: schedule.isActive ? '#ffc107' : '#28a745',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: 4,
                                    padding: '6px 12px',
                                    fontSize: 12,
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    transition: 'background-color 0.2s'
                                  }}
                                  disabled={loading}
                                >
                                  {schedule.isActive ? 'Pause' : 'Resume'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSchedule(med.id, schedule.id)}
                                  style={{ 
                                    background: '#dc3545', 
                                    color: '#fff', 
                                    border: 'none', 
                                    borderRadius: 4, 
                                    padding: '6px 12px', 
                                    fontSize: 12, 
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    transition: 'background-color 0.2s'
                                  }}
                                  disabled={loading}
                                  onMouseOver={(e) => {
                                    if (!loading) e.target.style.background = '#c82333';
                                  }}
                                  onMouseOut={(e) => {
                                    if (!loading) e.target.style.background = '#dc3545';
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              
              {monthly.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <h5 style={{ margin: '0 0 12px 0', color: '#495057', fontSize: 14, fontWeight: 600 }}>Monthly Schedules</h5>
                  <div style={{ backgroundColor: '#fff', borderRadius: 8, border: '1px solid #dee2e6', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f8f9fa' }}>
                          <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#495057', borderBottom: '1px solid #dee2e6' }}>
                            Dose
                          </th>
                          <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#495057', borderBottom: '1px solid #dee2e6' }}>
                            Time
                          </th>
                          <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#495057', borderBottom: '1px solid #dee2e6' }}>
                            Day of Month
                          </th>
                          {med.is_global && (
                            <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#495057', borderBottom: '1px solid #dee2e6' }}>
                              Patient
                            </th>
                          )}
                          <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#495057', borderBottom: '1px solid #dee2e6' }}>
                            Status
                          </th>
                          <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#495057', borderBottom: '1px solid #dee2e6' }}>
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthly.map((schedule) => (
                          <tr key={schedule.id} style={{ borderBottom: '1px solid #f1f3f4' }}>
                            <td style={{ padding: '12px 16px', fontSize: 14, color: '#333' }}>
                              <strong>{schedule.doseAmount || '1'}</strong> {med.quantity_unit || 'units'}
                            </td>
                            <td style={{ padding: '12px 16px', fontSize: 14, color: '#333' }}>
                              {schedule.parsed.time}
                            </td>
                            <td style={{ padding: '12px 16px', fontSize: 14, color: '#333' }}>
                              {schedule.parsed.dayOfMonth}
                            </td>
                            {med.is_global && (
                              <td style={{ padding: '12px 16px', fontSize: 14, color: '#333' }}>
                                {getPatientName(schedule.patient_id)}
                              </td>
                            )}
                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                              <span style={{
                                display: 'inline-block',
                                padding: '4px 8px',
                                borderRadius: 12,
                                fontSize: 12,
                                fontWeight: 600,
                                color: '#fff',
                                background: schedule.isActive ? '#28a745' : '#6c757d'
                              }}>
                                {schedule.isActive ? 'Active' : 'Paused'}
                              </span>
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => handleToggleSchedule(schedule.id)}
                                  style={{
                                    background: schedule.isActive ? '#ffc107' : '#28a745',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: 4,
                                    padding: '6px 12px',
                                    fontSize: 12,
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    transition: 'background-color 0.2s'
                                  }}
                                  disabled={loading}
                                >
                                  {schedule.isActive ? 'Pause' : 'Resume'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSchedule(med.id, schedule.id)}
                                  style={{ 
                                    background: '#dc3545', 
                                    color: '#fff', 
                                    border: 'none', 
                                    borderRadius: 4, 
                                    padding: '6px 12px', 
                                    fontSize: 12, 
                                    fontWeight: 500,
                                    cursor: 'pointer',
                                    transition: 'background-color 0.2s'
                                  }}
                                  disabled={loading}
                                  onMouseOver={(e) => {
                                    if (!loading) e.target.style.background = '#c82333';
                                  }}
                                  onMouseOut={(e) => {
                                    if (!loading) e.target.style.background = '#dc3545';
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          );
        })() : (
          <div style={{ 
            textAlign: 'center', 
            padding: 40, 
            color: '#6c757d', 
            backgroundColor: '#f8f9fa', 
            borderRadius: 8, 
            border: '1px solid #dee2e6' 
          }}>
            <p style={{ margin: '0 0 8px 0', fontSize: 16, fontWeight: 500 }}>No schedules created yet</p>
            <p style={{ margin: 0, fontSize: 14 }}>Add your first schedule using the form above.</p>
          </div>
        )}
      </div>

      {/* Filtered Scheduled Medications - Show when status filters are enabled */}
      {showStatusFilters && scheduledMedications && (
        <div style={{ marginBottom: 24 }}>
          <h4 style={{ margin: '0 0 16px 0', color: '#333', fontSize: 16, fontWeight: 600 }}>
            Filtered Scheduled Medications
          </h4>
          
          {(() => {
            const filteredMeds = filterMedicationsByStatus(scheduledMedications);
            
            if (filteredMeds.length === 0) {
              return (
                <div style={{ 
                  textAlign: 'center', 
                  padding: 40, 
                  color: '#6c757d', 
                  backgroundColor: '#f8f9fa', 
                  borderRadius: 8, 
                  border: '1px solid #dee2e6' 
                }}>
                  <p style={{ margin: '0 0 8px 0', fontSize: 16, fontWeight: 500 }}>No medications match the selected filters</p>
                  <p style={{ margin: 0, fontSize: 14 }}>Try adjusting your filter selection above.</p>
                </div>
              );
            }
            
            return (
              <div style={{ backgroundColor: '#fff', borderRadius: 8, border: '1px solid #dee2e6', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8f9fa' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#495057', borderBottom: '1px solid #dee2e6' }}>
                        Medication
                      </th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#495057', borderBottom: '1px solid #dee2e6' }}>
                        Scheduled Time
                      </th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#495057', borderBottom: '1px solid #dee2e6' }}>
                        Dose
                      </th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: 13, fontWeight: 600, color: '#495057', borderBottom: '1px solid #dee2e6' }}>
                        Status
                      </th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 13, fontWeight: 600, color: '#495057', borderBottom: '1px solid #dee2e6' }}>
                        Actual Time
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMeds.map((medication, index) => {
                      const status = getMedicationStatus(medication);
                      const statusInfo = getStatusInfo(status);
                      
                      return (
                        <tr key={index} style={{ borderBottom: '1px solid #f1f3f4' }}>
                          <td style={{ padding: '12px 16px', fontSize: 14, color: '#333', fontWeight: 500 }}>
                            {medication.medication_name}
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: 14, color: '#333' }}>
                            {new Date(medication.scheduled_time).toLocaleString()}
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: 14, color: '#333' }}>
                            {medication.dose_amount} {medication.quantity_unit || 'units'}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '4px 8px',
                              borderRadius: 12,
                              fontSize: 12,
                              fontWeight: 600,
                              color: '#fff',
                              background: statusInfo.color
                            }}>
                              {statusInfo.label}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: 14, color: '#333' }}>
                            {medication.actual_time ? 
                              new Date(medication.actual_time).toLocaleString() : 
                              '-'
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      )}

      {/* Back Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24, paddingTop: 16, borderTop: '1px solid #dee2e6' }}>
        <button
          type="button"
          onClick={onBack}
          style={{ 
            padding: '10px 24px', 
            border: '2px solid #6c757d', 
            borderRadius: 6, 
            background: '#fff', 
            color: '#6c757d', 
            fontWeight: 500, 
            fontSize: 14,
            cursor: 'pointer',
            transition: 'all 0.2s'
          }}
          onMouseOver={(e) => {
            e.target.style.background = '#6c757d';
            e.target.style.color = '#fff';
          }}
          onMouseOut={(e) => {
            e.target.style.background = '#fff';
            e.target.style.color = '#6c757d';
          }}
        >
          Back to Medications
        </button>
      </div>
    </div>
  );
};

// Export utility functions for use in other components
export const medicationStatusUtils = {
  getMedicationStatus: (medication) => {
    if (!medication.scheduled_time) return 'unknown';
    
    // If already taken
    if (medication.actual_dose !== null && medication.actual_dose !== undefined) {
      if (medication.actual_dose === 0) return 'skipped';
      
      if (medication.actual_time) {
        const scheduledTime = new Date(medication.scheduled_time);
        const actualTime = new Date(medication.actual_time);
        const diffHours = Math.abs(actualTime - scheduledTime) / (1000 * 60 * 60);
        
        if (diffHours <= 1) return 'on_time';
        if (diffHours <= 2) return 'warning';
        return 'late_early';
      }
      return 'on_time'; // taken but no actual time recorded
    }
    
    // Not taken yet - check timing
    const now = new Date();
    const scheduledTime = new Date(medication.scheduled_time);
    const diffHours = (now - scheduledTime) / (1000 * 60 * 60);
    
    if (diffHours < -1) return 'upcoming';     // More than 1 hour before
    if (diffHours <= 1) return 'ready_to_take'; // Within 1 hour window
    return 'missed';                           // More than 1 hour past
  },
  
  getStatusInfo: (status) => {
    const statusMap = {
      on_time: { label: 'On Time', color: '#28a745' },
      warning: { label: 'Warning', color: '#ffc107' },
      late_early: { label: 'Late/Early', color: '#fd7e14' },
      upcoming: { label: 'Upcoming', color: '#6f42c1' },
      missed: { label: 'Missed', color: '#dc3545' },
      skipped: { label: 'Skipped', color: '#6c757d' },
      ready_to_take: { label: 'Ready to Take', color: '#007bff' },
      unknown: { label: 'Unknown', color: '#6c757d' }
    };
    return statusMap[status] || statusMap.unknown;
  },
  
  filterMedicationsByStatus: (medications, statusFilters) => {
    if (!medications || !Array.isArray(medications)) return [];
    
    return medications.filter(med => {
      const status = medicationStatusUtils.getMedicationStatus(med);
      return statusFilters[status];
    });
  },
  
  getDefaultFilters: () => ({
    on_time: false,
    warning: false,
    late_early: false,
    upcoming: true,
    missed: true,
    skipped: false,
    ready_to_take: true
  }),

  // NEW: Check if medication has relevant schedules for patient
  hasRelevantSchedules: (medication, currentPatientId) => {
    if (!medication.schedules || medication.schedules.length === 0) return false;
    
    // For patient-specific medications, only check schedules for current patient
    if (!medication.is_global && currentPatientId) {
      return medication.schedules.some(schedule => 
        schedule.patient_id === parseInt(currentPatientId)
      );
    }
    
    // For global medications, any schedule counts
    return medication.schedules.length > 0;
  },

  // NEW: Get schedule count for current patient
  getRelevantScheduleCount: (medication, currentPatientId) => {
    if (!medication.schedules || medication.schedules.length === 0) return 0;
    
    // For patient-specific medications, count schedules for current patient only
    if (!medication.is_global && currentPatientId) {
      return medication.schedules.filter(schedule => 
        schedule.patient_id === parseInt(currentPatientId)
      ).length;
    }
    
    // For global medications, count all schedules
    return medication.schedules.length;
  }
};

export default MedicationScheduleView;
