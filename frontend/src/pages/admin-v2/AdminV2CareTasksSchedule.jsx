import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { PatientHeader, PatientSelectorModal } from './components';
import { TasksIcon, ClockIcon, CheckIcon, XIcon } from '../../components/Icons';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import config from '../../config';
import './AdminV2.css';

const AdminV2CareTasksSchedule = () => {
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
  const [scheduledTasks, setScheduledTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Status filter state
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

  // Permission helper
  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.is_system_admin) return true;
    return user.permissions?.includes(permission) || false;
  };

  // Check for patient param and sync with context
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
  }, [patients, searchParams, loadingPatients]);

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
        setScheduledTasks(data.scheduled_care_tasks || []);
      } else {
        setError('Failed to fetch schedule');
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
      'pending': { label: 'Pending', color: '#1f6feb', bg: 'rgba(31, 111, 235, 0.15)', border: '#1f6feb' },
      'due_warning': { label: 'Due Warning', color: '#9e6a03', bg: 'rgba(158, 106, 3, 0.15)', border: '#9e6a03' },
      'due_on_time': { label: 'Due On Time', color: '#238636', bg: 'rgba(35, 134, 54, 0.15)', border: '#238636' },
      'due_late': { label: 'Due Late', color: '#f85149', bg: 'rgba(248, 81, 73, 0.15)', border: '#f85149' },
      'upcoming': { label: 'Upcoming', color: '#58a6ff', bg: 'rgba(88, 166, 255, 0.15)', border: '#58a6ff' },
      'missed': { label: 'Missed', color: '#f85149', bg: 'rgba(248, 81, 73, 0.15)', border: '#f85149' },
      'completed': { label: 'Completed', color: '#238636', bg: 'rgba(35, 134, 54, 0.15)', border: '#238636' },
      'skipped': { label: 'Skipped', color: '#8b949e', bg: 'rgba(139, 148, 158, 0.15)', border: '#8b949e' }
    };
    return statusMap[status] || statusMap.upcoming;
  };

  const getStatusText = (item) => {
    if (item.is_completed) {
      if (item.status === 'skipped') return 'Skipped';
      return 'Completed';
    }
    const statusInfo = getStatusInfo(item.status);
    return statusInfo.label;
  };

  const getFilteredTasks = () => {
    return scheduledTasks.filter(task => {
      return statusFilters[task.status] !== false;
    });
  };

  // Group tasks by day and time
  const groupTasks = (tasks) => {
    const groups = {};
    
    tasks.forEach(item => {
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
        const [time, period] = t.split(' ');
        let [hours, minutes] = time.split(':').map(Number);
        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;
        return hours * 60 + minutes;
      };
      return parseTime(a) - parseTime(b);
    });
  };

  const handleMarkCompleted = async (task) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/care-task-schedules/${task.schedule_id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          notes: ''
        })
      });

      if (response.ok) {
        fetchSchedule();
      } else {
        const errorData = await response.json();
        alert(errorData.detail || 'Failed to mark task as completed');
      }
    } catch (err) {
      console.error('Error marking task as completed:', err);
      alert('Error connecting to server');
    }
  };

  const handleSkipTask = async (task) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/care-task-schedules/${task.schedule_id}/skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          notes: 'Skipped'
        })
      });

      if (response.ok) {
        fetchSchedule();
      } else {
        const errorData = await response.json();
        alert(errorData.detail || 'Failed to skip task');
      }
    } catch (err) {
      console.error('Error skipping task:', err);
      alert('Error connecting to server');
    }
  };

  // Get stats
  const stats = {
    total: scheduledTasks.length,
    ready: scheduledTasks.filter(t => ['due_on_time', 'due_warning', 'due_late'].includes(t.status)).length,
    upcoming: scheduledTasks.filter(t => ['pending', 'upcoming'].includes(t.status)).length,
    missed: scheduledTasks.filter(t => t.status === 'missed').length,
    completed: scheduledTasks.filter(t => t.status === 'completed').length,
    skipped: scheduledTasks.filter(t => t.status === 'skipped').length
  };

  // Loading state
  if (loadingPatients) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-loading">Loading patients...</div>
      </AdminV2Layout>
    );
  }

  const filteredTasks = getFilteredTasks();
  const groupedTasks = groupTasks(filteredTasks);
  const sortedDays = Object.keys(groupedTasks).sort((a, b) => new Date(a) - new Date(b));

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {selectedPatient ? (
          <>
            {/* Section Title */}
            <h1 className="schedule-section-title">Daily Care Tasks Schedule</h1>

            {/* Stats Row */}
            <div className="admin-v2-stats-row">
              <div 
                className={`admin-v2-stat-card ${statusFilters.due_on_time && statusFilters.due_warning && statusFilters.due_late ? 'selected' : ''}`}
                onClick={() => setStatusFilters(f => ({ 
                  ...f, 
                  due_on_time: !f.due_on_time,
                  due_warning: !f.due_warning,
                  due_late: !f.due_late
                }))}
                style={{ cursor: 'pointer' }}
              >
                <div className="admin-v2-stat-icon" style={{ background: 'rgba(35, 134, 54, 0.15)' }}>
                  <ClockIcon size={20} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{stats.ready}</h4>
                  <p>Ready</p>
                </div>
              </div>
              <div 
                className={`admin-v2-stat-card ${statusFilters.pending && statusFilters.upcoming ? 'selected' : ''}`}
                onClick={() => setStatusFilters(f => ({ 
                  ...f, 
                  pending: !f.pending,
                  upcoming: !f.upcoming
                }))}
                style={{ cursor: 'pointer' }}
              >
                <div className="admin-v2-stat-icon" style={{ background: 'rgba(88, 166, 255, 0.15)' }}>
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
                Today & Yesterday ({filteredTasks.length} of {scheduledTasks.length})
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
            ) : filteredTasks.length === 0 ? (
              <div className="admin-v2-empty-state">
                <TasksIcon size={48} />
                <h3>No Scheduled Care Tasks</h3>
                <p className="admin-v2-text-muted">
                  {scheduledTasks.length === 0 
                    ? 'No care tasks scheduled for today or yesterday'
                    : 'No care tasks match the selected filters'}
                </p>
              </div>
            ) : (
              <div className="admin-v2-schedule-list">
                {sortedDays.map(dayKey => (
                  <div key={dayKey} className="admin-v2-schedule-day">
                    <div className="admin-v2-schedule-day-header">
                      <h3>{dayKey}</h3>
                    </div>
                    
                    {sortTimeSlots(Object.keys(groupedTasks[dayKey])).map(timeStr => (
                      <div key={timeStr} className="admin-v2-schedule-time-group">
                        <div className="admin-v2-schedule-time-header">
                          <span className="admin-v2-schedule-time">{timeStr}</span>
                          <span className="admin-v2-schedule-count-label">
                            {groupedTasks[dayKey][timeStr].length} task{groupedTasks[dayKey][timeStr].length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        
                        <div className="admin-v2-schedule-items">
                          {groupedTasks[dayKey][timeStr].map((item, idx) => {
                            const statusInfo = getStatusInfo(item.status);
                            const isCompleted = item.is_completed;
                            const categoryColor = item.care_task_category_color || '#6f42c1';
                            
                            return (
                              <div 
                                key={`${item.schedule_id}-${idx}`}
                                className={`admin-v2-schedule-item ${isCompleted ? 'completed' : ''}`}
                                style={{ 
                                  borderLeftColor: categoryColor,
                                  backgroundColor: statusInfo.bg
                                }}
                              >
                                <div className="admin-v2-schedule-item-content">
                                  <div className="admin-v2-schedule-item-main">
                                    <span className="admin-v2-schedule-med-name">
                                      {item.care_task_name}
                                      {item.care_task_category_name && (
                                        <span 
                                          className="admin-v2-schedule-concentration"
                                          style={{ 
                                            backgroundColor: categoryColor + '30',
                                            color: categoryColor,
                                            padding: '2px 8px',
                                            borderRadius: '4px',
                                            marginLeft: '8px'
                                          }}
                                        >
                                          {item.care_task_category_name}
                                        </span>
                                      )}
                                    </span>
                                    {item.care_task_description && (
                                      <span className="admin-v2-schedule-dose" style={{ opacity: 0.8 }}>
                                        {item.care_task_description}
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
                                    {item.completed_time && (
                                      <span className="admin-v2-schedule-actual-time">
                                        Completed at {new Date(item.completed_time).toLocaleTimeString(undefined, { 
                                          hour: 'numeric', 
                                          minute: '2-digit', 
                                          hour12: true 
                                        })}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                
                                {!isCompleted && hasPermission('care_tasks.update') && (
                                  <div className="admin-v2-schedule-item-actions">
                                    <button
                                      className="admin-v2-btn admin-v2-btn-success admin-v2-btn-sm"
                                      onClick={() => handleMarkCompleted(item)}
                                    >
                                      {item.status === 'missed' ? 'Complete Now' : 'Mark Complete'}
                                    </button>
                                    {item.status === 'missed' && (
                                      <button
                                        className="admin-v2-btn admin-v2-btn-sm"
                                        onClick={() => handleSkipTask(item)}
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
                  <span className="admin-v2-legend-dot" style={{ backgroundColor: '#238636' }}></span>
                  <span>Due On Time</span>
                </div>
                <div className="admin-v2-legend-item">
                  <span className="admin-v2-legend-dot" style={{ backgroundColor: '#9e6a03' }}></span>
                  <span>Due Warning</span>
                </div>
                <div className="admin-v2-legend-item">
                  <span className="admin-v2-legend-dot" style={{ backgroundColor: '#f85149' }}></span>
                  <span>Due Late / Missed</span>
                </div>
                <div className="admin-v2-legend-item">
                  <span className="admin-v2-legend-dot" style={{ backgroundColor: '#58a6ff' }}></span>
                  <span>Upcoming</span>
                </div>
                <div className="admin-v2-legend-item">
                  <span className="admin-v2-legend-dot" style={{ backgroundColor: '#8b949e' }}></span>
                  <span>Skipped</span>
                </div>
              </div>
              <div className="admin-v2-legend-category-note">
                <strong>Category Colors:</strong> Left border indicates task category
              </div>
            </div>
          </>
        ) : (
          <div className="admin-v2-no-patient">
            <TasksIcon size={48} />
            <h2>Select a Patient</h2>
            <p>Choose a patient to view their daily care tasks schedule</p>
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
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2CareTasksSchedule;
