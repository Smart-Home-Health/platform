import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import {
  PlusIcon,
  EditIcon,
  TrashIcon,
  XIcon,
  TasksIcon,
  ClockIcon
} from '../../components/Icons';
import './AdminV2.css';

const AdminV2CareTasks = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Patient state
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [loadingPatients, setLoadingPatients] = useState(true);
  
  // Care tasks state
  const [careTasks, setCareTasks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  
  // Schedule form state
  const [scheduleMode, setScheduleMode] = useState('weekly');
  const [selectedDays, setSelectedDays] = useState([]);
  const [selectedDayOfMonth, setSelectedDayOfMonth] = useState(1);
  const [scheduleTime, setScheduleTime] = useState('08:00');
  const [scheduleSaving, setScheduleSaving] = useState(false);
  
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category_id: '',
    active: true
  });
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Permission helper
  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.is_system_admin) return true;
    return user.permissions?.includes(permission) || false;
  };

  // Fetch patients and categories on mount
  useEffect(() => {
    fetchPatients();
    fetchCategories();
  }, []);

  // Check URL params for patient ID
  useEffect(() => {
    const patientId = searchParams.get('patient');
    if (patientId && patients.length > 0) {
      const patient = patients.find(p => p.id === parseInt(patientId));
      if (patient) {
        setSelectedPatient(patient);
      }
    } else if (!patientId && patients.length > 0 && !selectedPatient) {
      setShowPatientModal(true);
    }
  }, [searchParams, patients]);

  // Fetch care tasks when patient is selected
  useEffect(() => {
    if (selectedPatient) {
      fetchCareTasks();
    }
  }, [selectedPatient]);

  const fetchPatients = async () => {
    try {
      setLoadingPatients(true);
      const response = await fetch(`${config.apiUrl}/api/patients?active_only=false`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setPatients(data);
      }
    } catch (err) {
      console.error('Error fetching patients:', err);
    } finally {
      setLoadingPatients(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/care-task-categories`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        // Extract categories array from response object
        setCategories(data.categories || []);
      }
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  const fetchCareTasks = async () => {
    if (!selectedPatient) return [];
    
    try {
      setLoading(true);
      setError(null);
      
      // Fetch both active and inactive tasks
      const [activeRes, inactiveRes] = await Promise.all([
        fetch(`${config.apiUrl}/api/admin/care-tasks/active?patient_id=${selectedPatient.id}`, {
          credentials: 'include'
        }),
        fetch(`${config.apiUrl}/api/admin/care-tasks/inactive?patient_id=${selectedPatient.id}`, {
          credentials: 'include'
        })
      ]);

      if (activeRes.ok && inactiveRes.ok) {
        const activeData = await activeRes.json();
        const inactiveData = await inactiveRes.json();
        
        // Extract care_tasks array from response objects
        const activeTasks = activeData.care_tasks || [];
        const inactiveTasks = inactiveData.care_tasks || [];
        
        // Combine and sort: active first (alphabetically), then inactive (alphabetically)
        const allTasks = [
          ...activeTasks.sort((a, b) => a.name.localeCompare(b.name)),
          ...inactiveTasks.sort((a, b) => a.name.localeCompare(b.name))
        ];
        
        setCareTasks(allTasks);
        return allTasks;
      } else {
        setError('Failed to load care tasks');
        return [];
      }
    } catch (err) {
      setError('Error connecting to server');
      console.error('Error fetching care tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPatient = (patient) => {
    setSelectedPatient(patient);
    setSearchParams({ patient: patient.id });
    setShowPatientModal(false);
  };

  const handleChangePatient = () => {
    setShowPatientModal(true);
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);

    try {
      const payload = {
        ...formData,
        patient_id: selectedPatient.id,
        category_id: formData.category_id ? parseInt(formData.category_id) : null
      };

      const response = await fetch(`${config.apiUrl}/api/add/care-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        setShowCreateModal(false);
        resetForm();
        fetchCareTasks();
      } else {
        const data = await response.json();
        if (Array.isArray(data.detail)) {
          setFormError(data.detail.map(err => err.msg).join(', '));
        } else {
          setFormError(data.detail || 'Failed to create care task');
        }
      }
    } catch (err) {
      setFormError('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateTask = async (e) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);

    try {
      const payload = {
        ...formData,
        category_id: formData.category_id ? parseInt(formData.category_id) : null
      };

      const response = await fetch(`${config.apiUrl}/api/care-tasks/${selectedTask.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        setShowEditModal(false);
        resetForm();
        fetchCareTasks();
      } else {
        const data = await response.json();
        setFormError(data.detail || 'Failed to update care task');
      }
    } catch (err) {
      setFormError('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTask = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/care-tasks/${selectedTask.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        setShowDeleteModal(false);
        setSelectedTask(null);
        fetchCareTasks();
      } else {
        const data = await response.json();
        setFormError(data.detail || 'Failed to delete care task');
      }
    } catch (err) {
      setFormError('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (taskId) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/care-tasks/${taskId}/toggle-active`, {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        fetchCareTasks();
      }
    } catch (err) {
      console.error('Error toggling task status:', err);
    }
  };

  const openEditModal = (task) => {
    setSelectedTask(task);
    setFormData({
      name: task.name,
      description: task.description || '',
      category_id: task.category_id || '',
      active: task.active
    });
    setFormError(null);
    setShowEditModal(true);
  };

  const openDeleteModal = (task) => {
    setSelectedTask(task);
    setFormError(null);
    setShowDeleteModal(true);
  };

  const openScheduleModal = (task) => {
    setSelectedTask(task);
    setScheduleMode('weekly');
    setSelectedDays([]);
    setSelectedDayOfMonth(1);
    setScheduleTime('08:00');
    setShowScheduleModal(true);
  };

  const openCreateModal = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      category_id: '',
      active: true
    });
    setFormError(null);
    setSelectedTask(null);
  };

  const getInitials = (name) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getCategoryById = (categoryId) => {
    return categories.find(c => c.id === categoryId);
  };

  // Add schedule handler
  const handleAddSchedule = async () => {
    if (!selectedTask) return;
    
    let cron = '';
    let description = '';
    let [hour, minute] = scheduleTime.split(':').map(Number);
    
    if (scheduleMode === 'weekly') {
      if (selectedDays.length === 0) return;
      const dayList = selectedDays.sort((a, b) => a - b).join(',');
      cron = `${minute} ${hour} * * ${dayList}`;
      const dayNames = selectedDays.map(d => daysOfWeek[d]).join(', ');
      description = `Every ${dayNames} at ${scheduleTime}`;
    } else {
      cron = `${minute} ${hour} ${selectedDayOfMonth} * *`;
      description = `Monthly on day ${selectedDayOfMonth} at ${scheduleTime}`;
    }

    setScheduleSaving(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/add/care-task-schedule/${selectedTask.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          cron_expression: cron,
          description: description,
          patient_id: selectedPatient.id
        })
      });

      if (response.ok) {
        setShowScheduleModal(false);
        setSelectedDays([]);
        setScheduleTime('08:00');
        fetchCareTasks();
      } else {
        const data = await response.json();
        alert(data.detail || 'Failed to add schedule');
      }
    } catch (err) {
      alert('Error adding schedule');
    } finally {
      setScheduleSaving(false);
    }
  };

  // Stats
  const activeTasks = careTasks.filter(t => t.active);
  const inactiveTasks = careTasks.filter(t => !t.active);
  const scheduledTasks = careTasks.filter(t => t.schedules && t.schedules.length > 0);

  // Loading state
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
            {/* Patient Context Header */}
            <div className="schedule-patient-header">
              <div className="schedule-patient-info">
                <div className="schedule-patient-avatar">
                  {getInitials(`${selectedPatient.first_name} ${selectedPatient.last_name}`)}
                </div>
                <div className="schedule-patient-name-row">
                  <h2>{selectedPatient.first_name} {selectedPatient.last_name}</h2>
                  <button 
                    className="schedule-edit-patient-btn"
                    onClick={handleChangePatient}
                    title="Change Patient"
                  >
                    <EditIcon size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* Section Title */}
            <h1 className="schedule-section-title">Care Tasks Overview</h1>

            {error && (
              <div className="admin-v2-error-banner">{error}</div>
            )}

            {/* Stats Cards */}
            <div className="admin-v2-stats-row">
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-value">{careTasks.length}</div>
                <div className="admin-v2-stat-label">Total Tasks</div>
              </div>
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-value admin-v2-stat-success">{activeTasks.length}</div>
                <div className="admin-v2-stat-label">Active</div>
              </div>
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-value admin-v2-stat-muted">{inactiveTasks.length}</div>
                <div className="admin-v2-stat-label">Paused</div>
              </div>
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-value" style={{ color: '#a371f7' }}>{scheduledTasks.length}</div>
                <div className="admin-v2-stat-label">Scheduled</div>
              </div>
            </div>

            {/* Add Task Button */}
            {hasPermission('care_tasks.create') && (
              <div style={{ marginBottom: '1.5rem' }}>
                <button 
                  className="admin-v2-btn admin-v2-btn-primary"
                  onClick={openCreateModal}
                >
                  <PlusIcon size={16} /> Add Care Task
                </button>
              </div>
            )}

            {/* Care Tasks Table */}
            {loading ? (
              <div className="admin-v2-loading">Loading care tasks...</div>
            ) : careTasks.length === 0 ? (
              <div className="admin-v2-empty-state">
                <TasksIcon size={48} />
                <h3>No care tasks found for this patient.</h3>
                {hasPermission('care_tasks.create') && (
                  <button 
                    className="admin-v2-btn admin-v2-btn-primary"
                    onClick={openCreateModal}
                  >
                    <PlusIcon size={16} /> Add First Care Task
                  </button>
                )}
              </div>
            ) : (
              <div className="admin-v2-table-container">
                <table className="admin-v2-table">
                  <thead>
                    <tr>
                      <th>Task Name</th>
                      <th>Category</th>
                      <th>Schedules</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {careTasks.map(task => {
                      const category = getCategoryById(task.category_id);
                      return (
                        <tr key={task.id} className={!task.active ? 'inactive-row' : ''}>
                          <td>
                            <div className="admin-v2-table-primary">
                              {task.name}
                            </div>
                            {task.description && (
                              <div className="admin-v2-table-secondary">
                                {task.description}
                              </div>
                            )}
                          </td>
                          <td>
                            {category ? (
                              <span 
                                className="admin-v2-category-badge"
                                style={{ 
                                  backgroundColor: `${category.color}20`,
                                  color: category.color,
                                  borderColor: category.color
                                }}
                              >
                                {category.name}
                              </span>
                            ) : (
                              <span className="admin-v2-table-muted">—</span>
                            )}
                          </td>
                          <td>
                            {task.schedules && task.schedules.length > 0 ? (
                              <span className="admin-v2-schedule-count">
                                <ClockIcon size={14} />
                                {task.schedules.length} schedule{task.schedules.length !== 1 ? 's' : ''}
                              </span>
                            ) : (
                              <span className="admin-v2-table-muted">No schedule</span>
                            )}
                          </td>
                          <td>
                            <span className={`admin-v2-status-badge ${task.active ? 'active' : 'inactive'}`}>
                              {task.active ? 'Active' : 'Paused'}
                            </span>
                          </td>
                          <td>
                            <div className="admin-v2-table-actions">
                              <button 
                                className="admin-v2-action-btn"
                                onClick={() => openScheduleModal(task)}
                                title="Manage Schedule"
                              >
                                <ClockIcon size={14} />
                              </button>
                              {hasPermission('care_tasks.update') && (
                                <button 
                                  className="admin-v2-action-btn"
                                  onClick={() => openEditModal(task)}
                                  title="Edit"
                                >
                                  <EditIcon size={14} />
                                </button>
                              )}
                              {hasPermission('care_tasks.update') && (
                                <button 
                                  className={`admin-v2-action-btn ${task.active ? 'pause' : 'resume'}`}
                                  onClick={() => handleToggleActive(task.id)}
                                  title={task.active ? 'Pause' : 'Resume'}
                                >
                                  {task.active ? '⏸' : '▶'}
                                </button>
                              )}
                              {hasPermission('care_tasks.delete') && (
                                <button 
                                  className="admin-v2-action-btn delete"
                                  onClick={() => openDeleteModal(task)}
                                  title="Delete"
                                >
                                  <TrashIcon size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <div className="admin-v2-placeholder-page">
            <TasksIcon size={64} />
            <h2>Select a Patient</h2>
            <p>Choose a patient to view and manage their care tasks.</p>
          </div>
        )}

        {/* Patient Selection Modal */}
        {showPatientModal && (
          <div className="admin-v2-modal-overlay">
            <div className="admin-v2-modal admin-v2-modal-sm">
              <div className="admin-v2-modal-header">
                <h2>Select Patient</h2>
                {selectedPatient && (
                  <button 
                    className="admin-v2-modal-close"
                    onClick={() => setShowPatientModal(false)}
                  >
                    <XIcon size={20} />
                  </button>
                )}
              </div>
              <div className="admin-v2-modal-body">
                <div className="admin-v2-patient-list">
                  {patients.map(patient => (
                    <button
                      key={patient.id}
                      className={`admin-v2-patient-list-item ${selectedPatient?.id === patient.id ? 'selected' : ''}`}
                      onClick={() => handleSelectPatient(patient)}
                    >
                      <div className="admin-v2-patient-list-avatar">
                        {patient.first_name?.[0]}{patient.last_name?.[0]}
                      </div>
                      <div className="admin-v2-patient-list-info">
                        <span className="name">{patient.first_name} {patient.last_name}</span>
                        {patient.date_of_birth && (
                          <span className="dob">DOB: {patient.date_of_birth}</span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create Care Task Modal */}
        {showCreateModal && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="admin-v2-modal" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Add Care Task</h2>
                <button className="admin-v2-modal-close" onClick={() => setShowCreateModal(false)}>
                  <XIcon size={20} />
                </button>
              </div>
              <form onSubmit={handleCreateTask}>
                <div className="admin-v2-modal-body">
                  {formError && (
                    <div className="admin-v2-form-error">{formError}</div>
                  )}
                  
                  <div className="admin-v2-form-group">
                    <label>Task Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      required
                      placeholder="e.g., Check blood pressure"
                    />
                  </div>

                  <div className="admin-v2-form-group">
                    <label>Category</label>
                    <select
                      value={formData.category_id}
                      onChange={e => setFormData({...formData, category_id: e.target.value})}
                    >
                      <option value="">-- No Category --</option>
                      {categories.filter(c => c.active).map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="admin-v2-form-group">
                    <label>Description</label>
                    <textarea
                      value={formData.description}
                      onChange={e => setFormData({...formData, description: e.target.value})}
                      placeholder="Optional details about this task..."
                      rows={3}
                    />
                  </div>
                </div>
                <div className="admin-v2-modal-footer">
                  <button 
                    type="button" 
                    className="admin-v2-btn"
                    onClick={() => setShowCreateModal(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="admin-v2-btn admin-v2-btn-primary"
                    disabled={saving}
                  >
                    {saving ? 'Creating...' : 'Add Care Task'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Care Task Modal */}
        {showEditModal && selectedTask && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowEditModal(false)}>
            <div className="admin-v2-modal" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Edit Care Task: {selectedTask.name}</h2>
                <button className="admin-v2-modal-close" onClick={() => setShowEditModal(false)}>
                  <XIcon size={20} />
                </button>
              </div>
              <form onSubmit={handleUpdateTask}>
                <div className="admin-v2-modal-body">
                  {formError && (
                    <div className="admin-v2-form-error">{formError}</div>
                  )}
                  
                  <div className="admin-v2-form-group">
                    <label>Task Name *</label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: e.target.value})}
                      required
                    />
                  </div>

                  <div className="admin-v2-form-group">
                    <label>Category</label>
                    <select
                      value={formData.category_id}
                      onChange={e => setFormData({...formData, category_id: e.target.value})}
                    >
                      <option value="">-- No Category --</option>
                      {categories.filter(c => c.active).map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="admin-v2-form-group">
                    <label>Description</label>
                    <textarea
                      value={formData.description}
                      onChange={e => setFormData({...formData, description: e.target.value})}
                      placeholder="Optional details about this task..."
                      rows={3}
                    />
                  </div>

                  <div className="admin-v2-form-group">
                    <label>Status</label>
                    <select
                      value={formData.active ? 'active' : 'inactive'}
                      onChange={e => setFormData({...formData, active: e.target.value === 'active'})}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Paused</option>
                    </select>
                  </div>
                </div>
                <div className="admin-v2-modal-footer">
                  <button 
                    type="button" 
                    className="admin-v2-btn"
                    onClick={() => setShowEditModal(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="admin-v2-btn admin-v2-btn-primary"
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteModal && selectedTask && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowDeleteModal(false)}>
            <div className="admin-v2-modal admin-v2-modal-sm" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Delete Care Task</h2>
                <button className="admin-v2-modal-close" onClick={() => setShowDeleteModal(false)}>
                  <XIcon size={20} />
                </button>
              </div>
              <div className="admin-v2-modal-body">
                <p>Are you sure you want to delete <strong>{selectedTask.name}</strong>?</p>
                <p className="admin-v2-warning-text">
                  This will also delete all schedules and completion history for this task. This action cannot be undone.
                </p>
              </div>
              <div className="admin-v2-modal-footer">
                <button 
                  type="button" 
                  className="admin-v2-btn"
                  onClick={() => setShowDeleteModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="admin-v2-btn admin-v2-btn-danger"
                  onClick={handleDeleteTask}
                  disabled={saving}
                >
                  {saving ? 'Deleting...' : 'Delete Task'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Schedule Modal */}
        {showScheduleModal && selectedTask && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowScheduleModal(false)}>
            <div className="admin-v2-modal" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Schedule: {selectedTask.name}</h2>
                <button className="admin-v2-modal-close" onClick={() => setShowScheduleModal(false)}>
                  <XIcon size={20} />
                </button>
              </div>
              <div className="admin-v2-modal-body">
                {/* Existing Schedules */}
                {selectedTask.schedules && selectedTask.schedules.length > 0 && (
                  <div className="admin-v2-schedule-list">
                    <h4>Current Schedules</h4>
                    {selectedTask.schedules.map(schedule => (
                      <div key={schedule.id} className="admin-v2-schedule-item">
                        <span>{schedule.description || schedule.cron_expression}</span>
                        <span className={`admin-v2-status-badge ${schedule.active ? 'active' : 'inactive'}`}>
                          {schedule.active ? 'Active' : 'Paused'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add New Schedule */}
                <div className="admin-v2-schedule-form">
                  <h4>Add New Schedule</h4>
                  
                  <div className="admin-v2-schedule-mode">
                    <button
                      type="button"
                      className={`admin-v2-btn ${scheduleMode === 'weekly' ? 'admin-v2-btn-primary' : ''}`}
                      onClick={() => setScheduleMode('weekly')}
                    >
                      Weekly
                    </button>
                    <button
                      type="button"
                      className={`admin-v2-btn ${scheduleMode === 'monthly' ? 'admin-v2-btn-primary' : ''}`}
                      onClick={() => setScheduleMode('monthly')}
                    >
                      Monthly
                    </button>
                  </div>

                  {scheduleMode === 'weekly' && (
                    <div className="admin-v2-form-group">
                      <label>Select Days</label>
                      <div className="admin-v2-day-picker">
                        {daysOfWeek.map((day, index) => (
                          <button
                            key={day}
                            type="button"
                            className={`admin-v2-day-btn ${selectedDays.includes(index) ? 'selected' : ''}`}
                            onClick={() => {
                              if (selectedDays.includes(index)) {
                                setSelectedDays(selectedDays.filter(d => d !== index));
                              } else {
                                setSelectedDays([...selectedDays, index]);
                              }
                            }}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {scheduleMode === 'monthly' && (
                    <div className="admin-v2-form-group">
                      <label>Day of Month</label>
                      <select
                        value={selectedDayOfMonth}
                        onChange={e => setSelectedDayOfMonth(parseInt(e.target.value))}
                      >
                        {[...Array(28)].map((_, i) => (
                          <option key={i+1} value={i+1}>{i+1}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="admin-v2-form-group">
                    <label>Time</label>
                    <input
                      type="time"
                      value={scheduleTime}
                      onChange={e => setScheduleTime(e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="admin-v2-modal-footer">
                <button 
                  type="button" 
                  className="admin-v2-btn"
                  onClick={() => setShowScheduleModal(false)}
                >
                  Close
                </button>
                <button 
                  type="button" 
                  className="admin-v2-btn admin-v2-btn-primary"
                  onClick={handleAddSchedule}
                  disabled={scheduleSaving || (scheduleMode === 'weekly' && selectedDays.length === 0)}
                >
                  {scheduleSaving ? 'Adding...' : 'Add Schedule'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2CareTasks;
