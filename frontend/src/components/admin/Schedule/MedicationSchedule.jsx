import React, { useState, useEffect } from 'react';
import config from '../../../config';
import { useAdminPatient } from '../../../contexts/AdminPatientContext';

const MedicationSchedule = () => {
  const { selectedPatientId } = useAdminPatient();
  const [scheduledMedications, setScheduledMedications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilters, setStatusFilters] = useState({
    on_time: true,
    warning: true,
    late_early: true,
    upcoming: true,
    missed: true,
    skipped: false,
    ready_to_take: true
  });

  useEffect(() => {
    fetchScheduledMedications();
  }, [selectedPatientId]);

  const fetchScheduledMedications = async () => {
    setLoading(true);
    try {
      const url = selectedPatientId 
        ? `${config.apiUrl}/api/schedules/daily?patient_id=${selectedPatientId}`
        : `${config.apiUrl}/api/schedules/daily`;
      console.log('Fetching medications from:', url);
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        console.log('Received medication data:', data);
        setScheduledMedications(data.scheduled_medications || []);
      } else {
        console.error('Failed to fetch medications:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error fetching scheduled medications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkTaken = async (logId) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/medications/log/${logId}/mark-taken`, {
        method: 'POST'
      });
      if (response.ok) {
        fetchScheduledMedications();
      }
    } catch (error) {
      console.error('Error marking medication as taken:', error);
    }
  };

  const handleSkip = async (logId) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/medications/log/${logId}/skip`, {
        method: 'POST'
      });
      if (response.ok) {
        fetchScheduledMedications();
      }
    } catch (error) {
      console.error('Error skipping medication:', error);
    }
  };

  const getStatusColor = (status) => {
    const statusColors = {
      on_time: { bg: '#d4edda', border: '#28a745', text: '#155724' },
      warning: { bg: '#fff3cd', border: '#ffc107', text: '#856404' },
      late_early: { bg: '#f8d7da', border: '#dc3545', text: '#721c24' },
      upcoming: { bg: '#d1ecf1', border: '#17a2b8', text: '#0c5460' },
      missed: { bg: '#f8d7da', border: '#dc3545', text: '#721c24' },
      skipped: { bg: '#e2e3e5', border: '#6c757d', text: '#383d41' },
      ready_to_take: { bg: '#d4edda', border: '#28a745', text: '#155724' }
    };
    return statusColors[status] || { bg: '#f8f9fa', border: '#dee2e6', text: '#495057' };
  };

  const getStatusText = (item) => {
    if (item.is_completed) return 'Taken';
    if (item.skipped_at) return 'Skipped';
    return item.status?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Pending';
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  const filteredMedications = scheduledMedications.filter(med => {
    if (med.is_completed) return statusFilters.on_time;
    if (med.skipped_at) return statusFilters.skipped;
    return statusFilters[med.status] !== false;
  });

  // Group by day and time
  const groupedMedications = {};
  filteredMedications.forEach(item => {
    const dayKey = formatDate(item.scheduled_time);
    const timeStr = formatTime(item.scheduled_time);
    
    if (!groupedMedications[dayKey]) groupedMedications[dayKey] = {};
    if (!groupedMedications[dayKey][timeStr]) groupedMedications[dayKey][timeStr] = [];
    groupedMedications[dayKey][timeStr].push(item);
  });

  const sortedDays = Object.keys(groupedMedications).sort((a, b) => 
    new Date(a) - new Date(b)
  );

  if (loading) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Loading scheduled medications...</div>;
  }

  return (
    <div className="schedule-section">
      <div className="schedule-header">
        <h2>Medication Schedule</h2>
        <p style={{ fontSize: '14px', color: '#666', marginBottom: '12px' }}>
          Found {scheduledMedications.length} scheduled medications ({filteredMedications.length} after filters)
        </p>
        <div className="filter-controls">
          <button 
            className="btn btn-sm btn-secondary"
            onClick={() => {
              const allTrue = Object.values(statusFilters).every(v => v);
              const newFilters = {};
              Object.keys(statusFilters).forEach(key => {
                newFilters[key] = !allTrue;
              });
              setStatusFilters(newFilters);
            }}
          >
            Toggle All
          </button>
          {Object.keys(statusFilters).map(status => (
            <label key={status} className="filter-checkbox">
              <input
                type="checkbox"
                checked={statusFilters[status]}
                onChange={(e) => setStatusFilters({
                  ...statusFilters,
                  [status]: e.target.checked
                })}
              />
              <span>{status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
            </label>
          ))}
        </div>
      </div>

      {sortedDays.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
          No scheduled medications found
        </div>
      ) : (
        sortedDays.map(dayKey => (
          <div key={dayKey} className="day-group">
            <h3 className="day-header">{dayKey}</h3>
            {Object.keys(groupedMedications[dayKey]).sort((a, b) => {
              const parse = t => {
                const [h, m, ampm] = t.match(/(\d+):(\d+)\s*(AM|PM)/i).slice(1);
                let hour = parseInt(h, 10);
                if (/pm/i.test(ampm) && hour !== 12) hour += 12;
                if (/am/i.test(ampm) && hour === 12) hour = 0;
                return hour * 60 + parseInt(m, 10);
              };
              return parse(a) - parse(b);
            }).map(timeStr => (
              <div key={timeStr} className="time-group">
                <div className="time-header">{timeStr}</div>
                <div className="medication-list">
                  {groupedMedications[dayKey][timeStr].map((item, idx) => {
                    const colors = getStatusColor(item.status);
                    const isCompleted = item.is_completed;
                    
                    return (
                      <div
                        key={`${item.id}-${idx}`}
                        className="medication-item"
                        style={{
                          backgroundColor: colors.bg,
                          borderLeft: `4px solid ${colors.border}`,
                          opacity: isCompleted ? 0.7 : 1
                        }}
                      >
                        <div className="medication-info">
                          <div className="medication-name">{item.medication_name}</div>
                          <div className="medication-details">
                            {item.quantity} {item.quantity_unit}
                            {item.instructions && ` - ${item.instructions}`}
                          </div>
                          <div className="medication-status" style={{ color: colors.text }}>
                            {getStatusText(item)}
                          </div>
                        </div>
                        {!isCompleted && !item.skipped_at && (
                          <div className="medication-actions">
                            <button
                              className="btn btn-sm btn-success"
                              onClick={() => handleMarkTaken(item.id)}
                            >
                              Mark Taken
                            </button>
                            <button
                              className="btn btn-sm btn-warning"
                              onClick={() => handleSkip(item.id)}
                            >
                              Skip
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
        ))
      )}
    </div>
  );
};

export default MedicationSchedule;
