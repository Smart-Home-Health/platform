import React, { useState, useEffect } from 'react';
import config from '../../../config';
import { useAdminPatient } from '../../../contexts/AdminPatientContext';

const CareTaskSchedule = () => {
  const { selectedPatientId } = useAdminPatient();
  const [scheduledTasks, setScheduledTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilters, setStatusFilters] = useState({
    pending: true,
    due_warning: true,
    due_on_time: true,
    due_late: true,
    upcoming: true,
    missed: true,
    completed: false,
    skipped: false
  });

  useEffect(() => {
    fetchScheduledTasks();
  }, [selectedPatientId]);

  const fetchScheduledTasks = async () => {
    setLoading(true);
    try {
      const url = selectedPatientId 
        ? `${config.apiUrl}/api/care-task-schedules/daily?patient_id=${selectedPatientId}`
        : `${config.apiUrl}/api/care-task-schedules/daily`;
      console.log('Fetching care tasks from:', url);
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        console.log('Received care task data:', data);
        setScheduledTasks(data.scheduled_care_tasks || []);
      } else {
        console.error('Failed to fetch care tasks:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error fetching scheduled care tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkCompleted = async (logId) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/care-tasks/log/${logId}/mark-completed`, {
        method: 'POST'
      });
      if (response.ok) {
        fetchScheduledTasks();
      }
    } catch (error) {
      console.error('Error marking care task as completed:', error);
    }
  };

  const handleSkip = async (logId) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/care-tasks/log/${logId}/skip`, {
        method: 'POST'
      });
      if (response.ok) {
        fetchScheduledTasks();
      }
    } catch (error) {
      console.error('Error skipping care task:', error);
    }
  };

  const getStatusColor = (status) => {
    const statusColors = {
      pending: { bg: '#e3f2fd', border: '#2196f3', text: '#0d47a1' },
      due_warning: { bg: '#fff3cd', border: '#ffc107', text: '#856404' },
      due_on_time: { bg: '#d4edda', border: '#28a745', text: '#155724' },
      due_late: { bg: '#f8d7da', border: '#dc3545', text: '#721c24' },
      upcoming: { bg: '#d1ecf1', border: '#17a2b8', text: '#0c5460' },
      missed: { bg: '#f8d7da', border: '#dc3545', text: '#721c24' },
      completed: { bg: '#d4edda', border: '#28a745', text: '#155724' },
      skipped: { bg: '#e2e3e5', border: '#6c757d', text: '#383d41' }
    };
    return statusColors[status] || { bg: '#f8f9fa', border: '#dee2e6', text: '#495057' };
  };

  const getStatusText = (item) => {
    if (item.completed_at) return 'Completed';
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

  const filteredTasks = scheduledTasks.filter(task => {
    if (task.completed_at) return statusFilters.completed;
    if (task.skipped_at) return statusFilters.skipped;
    return statusFilters[task.status] !== false;
  });

  // Group by day and time
  const groupedTasks = {};
  filteredTasks.forEach(item => {
    const dayKey = formatDate(item.scheduled_time);
    const timeStr = formatTime(item.scheduled_time);
    
    if (!groupedTasks[dayKey]) groupedTasks[dayKey] = {};
    if (!groupedTasks[dayKey][timeStr]) groupedTasks[dayKey][timeStr] = [];
    groupedTasks[dayKey][timeStr].push(item);
  });

  const sortedDays = Object.keys(groupedTasks).sort((a, b) => 
    new Date(a) - new Date(b)
  );

  if (loading) {
    return <div style={{ padding: '20px', textAlign: 'center' }}>Loading scheduled care tasks...</div>;
  }

  return (
    <div className="schedule-section">
      <div className="schedule-header">
        <h2>Care Task Schedule</h2>
        <p style={{ fontSize: '14px', color: '#666', marginBottom: '12px' }}>
          Found {scheduledTasks.length} scheduled care tasks ({filteredTasks.length} after filters)
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
          No scheduled care tasks found
        </div>
      ) : (
        sortedDays.map(dayKey => (
          <div key={dayKey} className="day-group">
            <h3 className="day-header">{dayKey}</h3>
            {Object.keys(groupedTasks[dayKey]).sort((a, b) => {
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
                <div className="task-list">
                  {groupedTasks[dayKey][timeStr].map((item, idx) => {
                    const colors = getStatusColor(item.status);
                    const isCompleted = item.completed_at;
                    
                    return (
                      <div
                        key={`${item.id}-${idx}`}
                        className="task-item"
                        style={{
                          backgroundColor: colors.bg,
                          borderLeft: `4px solid ${colors.border}`,
                          opacity: isCompleted ? 0.7 : 1
                        }}
                      >
                        <div className="task-info">
                          <div className="task-name">{item.care_task_name}</div>
                          {item.care_task_description && (
                            <div className="task-details">{item.care_task_description}</div>
                          )}
                          {item.category_name && (
                            <div className="task-category">Category: {item.category_name}</div>
                          )}
                          <div className="task-status" style={{ color: colors.text }}>
                            {getStatusText(item)}
                          </div>
                        </div>
                        {!isCompleted && !item.skipped_at && (
                          <div className="task-actions">
                            <button
                              className="btn btn-sm btn-success"
                              onClick={() => handleMarkCompleted(item.id)}
                            >
                              Mark Complete
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

export default CareTaskSchedule;
