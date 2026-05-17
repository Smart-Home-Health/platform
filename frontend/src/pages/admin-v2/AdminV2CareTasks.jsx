import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { PatientHeader, PatientSelectorModal } from './components';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import {
  PlusIcon,
  EditIcon,
  TrashIcon,
  XIcon,
  TasksIcon,
  ClockIcon,
  CheckIcon,
  PauseIcon,
  ClipboardListIcon
} from '../../components/Icons';
import { localTimeToUTC, localTimeAndDaysToUTC } from '../../utils/timezone';
import './AdminV2.css';

const AdminV2CareTasks = () => {
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
  
  // Category modal states
  const [showCategorySection, setShowCategorySection] = useState(false);
  const [showCreateCategoryModal, setShowCreateCategoryModal] = useState(false);
  const [showEditCategoryModal, setShowEditCategoryModal] = useState(false);
  const [showDeleteCategoryModal, setShowDeleteCategoryModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [categoryFormData, setCategoryFormData] = useState({
    name: '',
    description: '',
    color: '#a371f7'
  });
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryError, setCategoryError] = useState(null);
  
  // Schedule form state
  const [scheduleMode, setScheduleMode] = useState('weekly');
  const [selectedDays, setSelectedDays] = useState([]);
  const [selectedDayOfMonth, setSelectedDayOfMonth] = useState(1);
  const [scheduleTime, setScheduleTime] = useState('08:00');
  const [scheduleSaving, setScheduleSaving] = useState(false);
  
  // Nutrition-specific schedule fields
  const [nutritionData, setNutritionData] = useState({
    item_type: 'liquid',
    item_name: '',
    amount: '',
    amount_unit: 'ml',
    calories: '',
    notes: ''
  });
  
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

  // Fetch categories on mount
  useEffect(() => {
    fetchCategories();
  }, []);

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

  // Fetch care tasks when patient is selected
  useEffect(() => {
    if (selectedPatient) {
      fetchCareTasks();
    }
  }, [selectedPatient]);

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
    setContextPatient(patient);
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
    // Reset nutrition data
    setNutritionData({
      item_type: 'liquid',
      item_name: '',
      amount: '',
      amount_unit: 'ml',
      calories: '',
      notes: ''
    });
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

  const getCategoryById = (categoryId) => {
    return categories.find(c => c.id === categoryId);
  };

  // Check if a task is nutrition-related based on category
  const isNutritionTask = (task) => {
    if (!task || !task.category_id) return false;
    const category = getCategoryById(task.category_id);
    return category && category.name.toLowerCase() === 'nutrition';
  };

  // Category management handlers
  const openCreateCategoryModal = () => {
    setCategoryFormData({ name: '', description: '', color: '#a371f7' });
    setCategoryError(null);
    setShowCreateCategoryModal(true);
  };

  const openEditCategoryModal = (category) => {
    setSelectedCategory(category);
    setCategoryFormData({
      name: category.name,
      description: category.description || '',
      color: category.color || '#a371f7'
    });
    setCategoryError(null);
    setShowEditCategoryModal(true);
  };

  const openDeleteCategoryModal = (category) => {
    setSelectedCategory(category);
    setShowDeleteCategoryModal(true);
  };

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    setCategorySaving(true);
    setCategoryError(null);

    try {
      const response = await fetch(`${config.apiUrl}/api/add/care-task-category`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(categoryFormData)
      });

      if (response.ok) {
        setShowCreateCategoryModal(false);
        fetchCategories();
        setCategoryFormData({ name: '', description: '', color: '#a371f7' });
      } else {
        const data = await response.json();
        setCategoryError(data.detail || 'Failed to create category');
      }
    } catch (err) {
      setCategoryError('Error creating category');
    } finally {
      setCategorySaving(false);
    }
  };

  const handleUpdateCategory = async (e) => {
    e.preventDefault();
    if (!selectedCategory) return;
    
    setCategorySaving(true);
    setCategoryError(null);

    try {
      const response = await fetch(`${config.apiUrl}/api/care-task-categories/${selectedCategory.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(categoryFormData)
      });

      if (response.ok) {
        setShowEditCategoryModal(false);
        setSelectedCategory(null);
        fetchCategories();
        fetchCareTasks(); // Refresh tasks to show updated category info
      } else {
        const data = await response.json();
        setCategoryError(data.detail || 'Failed to update category');
      }
    } catch (err) {
      setCategoryError('Error updating category');
    } finally {
      setCategorySaving(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!selectedCategory) return;
    
    setCategorySaving(true);

    try {
      const response = await fetch(`${config.apiUrl}/api/care-task-categories/${selectedCategory.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        setShowDeleteCategoryModal(false);
        setSelectedCategory(null);
        fetchCategories();
        fetchCareTasks(); // Refresh tasks
      } else {
        const data = await response.json();
        alert(data.detail || 'Failed to delete category');
      }
    } catch (err) {
      alert('Error deleting category');
    } finally {
      setCategorySaving(false);
    }
  };

  // Get task count for a category
  const getCategoryTaskCount = (categoryId) => {
    return careTasks.filter(t => t.category_id === categoryId).length;
  };

  // Add schedule handler
  const handleAddSchedule = async () => {
    if (!selectedTask) return;
    
    let cron = '';
    let description = '';

    if (scheduleMode === 'weekly') {
      if (selectedDays.length === 0) return;
      // Convert local time AND local days-of-week to UTC together — the cron's
      // day list must shift when the time conversion crosses midnight.
      const utc = localTimeAndDaysToUTC(scheduleTime, selectedDays);
      cron = `${utc.minute} ${utc.hour} * * ${utc.days.join(',')}`;
      const dayNames = selectedDays
        .slice()
        .sort((a, b) => a - b)
        .map(d => daysOfWeek[d])
        .join(', ');
      description = `Every ${dayNames} at ${scheduleTime}`;
    } else {
      const utc = localTimeToUTC(scheduleTime);
      cron = `${utc.minute} ${utc.hour} ${selectedDayOfMonth} * *`;
      description = `Monthly on day ${selectedDayOfMonth} at ${scheduleTime}`;
    }

    // Prepare notes with nutrition data if applicable
    let notes = null;
    if (isNutritionTask(selectedTask) && nutritionData.item_name && nutritionData.amount) {
      notes = JSON.stringify({
        nutrition: {
          item_type: nutritionData.item_type,
          item_name: nutritionData.item_name,
          amount: parseFloat(nutritionData.amount),
          amount_unit: nutritionData.amount_unit,
          calories: nutritionData.calories ? parseFloat(nutritionData.calories) : null
        },
        custom_notes: nutritionData.notes
      });
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
          patient_id: selectedPatient.id,
          notes: notes
        })
      });

      if (response.ok) {
        setShowScheduleModal(false);
        setSelectedDays([]);
        setScheduleTime('08:00');
        // Reset nutrition data
        setNutritionData({
          item_type: 'liquid',
          item_name: '',
          amount: '',
          amount_unit: 'ml',
          calories: '',
          notes: ''
        });
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
            {/* Section Title */}
            <h1 className="schedule-section-title">Care Tasks Overview</h1>

            {error && (
              <div className="admin-v2-error-banner">{error}</div>
            )}

            {/* Stats Cards */}
            <div className="admin-v2-summary-stats admin-v2-care-tasks-summary">
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-icon tasks">
                  <ClipboardListIcon size={24} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{careTasks.length}</h4>
                  <p>Total Tasks</p>
                </div>
              </div>
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-icon admin-v2-stat-icon-success">
                  <CheckIcon size={24} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{activeTasks.length}</h4>
                  <p>Active</p>
                </div>
              </div>
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-icon admin-v2-stat-icon-muted">
                  <PauseIcon size={24} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{inactiveTasks.length}</h4>
                  <p>Paused</p>
                </div>
              </div>
              <div className="admin-v2-stat-card">
                <div className="admin-v2-stat-icon tasks">
                  <ClockIcon size={24} />
                </div>
                <div className="admin-v2-stat-info">
                  <h4>{scheduledTasks.length}</h4>
                  <p>Scheduled</p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="admin-v2-action-row" style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              {hasPermission('care_tasks.create') && (
                <button 
                  className="admin-v2-btn admin-v2-btn-primary"
                  onClick={openCreateModal}
                >
                  <PlusIcon size={16} /> Add Care Task
                </button>
              )}
              <button 
                className={`admin-v2-btn ${showCategorySection ? 'admin-v2-btn-secondary' : ''}`}
                onClick={() => setShowCategorySection(!showCategorySection)}
                style={{ 
                  backgroundColor: '#a371f7',
                  borderColor: '#a371f7',
                  color: 'white'
                }}
              >
                {showCategorySection ? 'Hide Categories' : 'Manage Categories'}
              </button>
            </div>

            {/* Categories Management Section */}
            {showCategorySection && (
              <div className="admin-v2-categories-section" style={{ 
                marginBottom: '2rem',
                padding: '1.5rem',
                background: '#161b22',
                borderRadius: '8px',
                border: '1px solid #30363d'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0, color: '#f0f6fc' }}>Care Task Categories</h3>
                  <button 
                    className="admin-v2-btn admin-v2-btn-primary admin-v2-btn-sm"
                    onClick={openCreateCategoryModal}
                  >
                    <PlusIcon size={14} /> Add Category
                  </button>
                </div>

                {categories.length === 0 ? (
                  <p style={{ color: '#8b949e', margin: 0 }}>No categories created yet.</p>
                ) : (
                  <div className="admin-v2-category-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: '1rem'
                  }}>
                    {categories.map(cat => (
                      <div 
                        key={cat.id} 
                        className="admin-v2-category-card"
                        style={{
                          background: '#21262d',
                          borderRadius: '6px',
                          padding: '1rem',
                          borderLeft: `4px solid ${cat.color || '#a371f7'}`,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.5rem'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span 
                                style={{
                                  width: '12px',
                                  height: '12px',
                                  borderRadius: '50%',
                                  backgroundColor: cat.color || '#a371f7',
                                  display: 'inline-block'
                                }}
                              />
                              <strong style={{ color: '#f0f6fc' }}>{cat.name}</strong>
                              {cat.is_default && (
                                <span style={{
                                  fontSize: '0.7rem',
                                  background: '#30363d',
                                  padding: '2px 6px',
                                  borderRadius: '10px',
                                  color: '#8b949e'
                                }}>Default</span>
                              )}
                            </div>
                            {cat.description && (
                              <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: '#8b949e' }}>
                                {cat.description}
                              </p>
                            )}
                            <span style={{ fontSize: '0.8rem', color: '#6e7681' }}>
                              {getCategoryTaskCount(cat.id)} task{getCategoryTaskCount(cat.id) !== 1 ? 's' : ''}
                            </span>
                          </div>
                          
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button 
                              className="admin-v2-action-btn"
                              onClick={() => openEditCategoryModal(cat)}
                              title="Edit category"
                            >
                              <EditIcon size={14} />
                            </button>
                            {!cat.is_default && (
                              <button 
                                className="admin-v2-action-btn delete"
                                onClick={() => openDeleteCategoryModal(cat)}
                                title="Delete category"
                              >
                                <TrashIcon size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
                                {task.schedules.length}
                              </span>
                            ) : (
                              <span className="admin-v2-table-muted">—</span>
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
          <PatientSelectorModal
            patients={patients}
            selectedPatient={selectedPatient}
            onSelectPatient={handleSelectPatient}
            onClose={() => setShowPatientModal(false)}
            loading={loadingPatients}
          />
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

                  {/* Nutrition Fields - Only show for nutrition-related tasks */}
                  {isNutritionTask(selectedTask) && (
                    <div className="admin-v2-nutrition-section">
                      <h4 style={{ marginTop: '1.5rem', marginBottom: '1rem', color: '#58a6ff' }}>
                        🍽️ Nutrition Information
                      </h4>
                      <p style={{ fontSize: '0.85rem', color: '#8b949e', marginBottom: '1rem' }}>
                        Pre-fill nutrition details for this scheduled task. This data will be used when marking the task complete.
                      </p>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem', marginBottom: '1rem' }}>
                        <div className="admin-v2-form-group">
                          <label>Type</label>
                          <select
                            value={nutritionData.item_type}
                            onChange={e => setNutritionData({ ...nutritionData, item_type: e.target.value })}
                          >
                            <option value="liquid">Liquid/Drink</option>
                            <option value="food">Food</option>
                            <option value="supplement">Supplement</option>
                          </select>
                        </div>

                        <div className="admin-v2-form-group">
                          <label>Item Name *</label>
                          <input
                            type="text"
                            value={nutritionData.item_name}
                            onChange={e => setNutritionData({ ...nutritionData, item_name: e.target.value })}
                            placeholder="e.g., Peptamen, Water, Chicken Soup"
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                        <div className="admin-v2-form-group">
                          <label>Amount *</label>
                          <input
                            type="number"
                            value={nutritionData.amount}
                            onChange={e => setNutritionData({ ...nutritionData, amount: e.target.value })}
                            placeholder="250"
                          />
                        </div>

                        <div className="admin-v2-form-group">
                          <label>Unit</label>
                          <select
                            value={nutritionData.amount_unit}
                            onChange={e => setNutritionData({ ...nutritionData, amount_unit: e.target.value })}
                          >
                            <option value="ml">ml</option>
                            <option value="oz">oz</option>
                            <option value="cups">cups</option>
                            <option value="grams">grams</option>
                            <option value="servings">servings</option>
                          </select>
                        </div>

                        <div className="admin-v2-form-group">
                          <label>Calories</label>
                          <input
                            type="number"
                            value={nutritionData.calories}
                            onChange={e => setNutritionData({ ...nutritionData, calories: e.target.value })}
                            placeholder="375"
                          />
                        </div>
                      </div>

                      <div className="admin-v2-form-group">
                        <label>Notes</label>
                        <textarea
                          value={nutritionData.notes}
                          onChange={e => setNutritionData({ ...nutritionData, notes: e.target.value })}
                          placeholder="Additional notes about this nutrition item..."
                          rows={2}
                        />
                      </div>
                    </div>
                  )}
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

        {/* Create Category Modal */}
        {showCreateCategoryModal && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowCreateCategoryModal(false)}>
            <div className="admin-v2-modal admin-v2-modal-sm" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Add Category</h2>
                <button className="admin-v2-modal-close" onClick={() => setShowCreateCategoryModal(false)}>
                  <XIcon size={20} />
                </button>
              </div>
              <form onSubmit={handleCreateCategory}>
                <div className="admin-v2-modal-body">
                  {categoryError && (
                    <div className="admin-v2-form-error">{categoryError}</div>
                  )}
                  
                  <div className="admin-v2-form-group">
                    <label>Category Name *</label>
                    <input
                      type="text"
                      value={categoryFormData.name}
                      onChange={e => setCategoryFormData({...categoryFormData, name: e.target.value})}
                      required
                      placeholder="e.g., Wound Care, Monitoring"
                    />
                  </div>

                  <div className="admin-v2-form-group">
                    <label>Description</label>
                    <textarea
                      value={categoryFormData.description}
                      onChange={e => setCategoryFormData({...categoryFormData, description: e.target.value})}
                      placeholder="Optional description..."
                      rows={2}
                    />
                  </div>

                  <div className="admin-v2-form-group">
                    <label>Color</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <input
                        type="color"
                        value={categoryFormData.color}
                        onChange={e => setCategoryFormData({...categoryFormData, color: e.target.value})}
                        style={{ 
                          width: '50px', 
                          height: '40px', 
                          border: 'none', 
                          borderRadius: '4px',
                          cursor: 'pointer',
                          padding: 0
                        }}
                      />
                      <input
                        type="text"
                        value={categoryFormData.color}
                        onChange={e => setCategoryFormData({...categoryFormData, color: e.target.value})}
                        placeholder="#a371f7"
                        pattern="^#[0-9A-Fa-f]{6}$"
                        style={{ flex: 1 }}
                      />
                      <span 
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          backgroundColor: categoryFormData.color,
                          border: '2px solid #30363d'
                        }}
                      />
                    </div>
                    <div style={{ 
                      display: 'flex', 
                      gap: '0.5rem', 
                      marginTop: '0.5rem',
                      flexWrap: 'wrap' 
                    }}>
                      {['#a371f7', '#f78166', '#7ee787', '#58a6ff', '#d2a8ff', '#ff7b72', '#ffa657', '#79c0ff'].map(color => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setCategoryFormData({...categoryFormData, color})}
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            backgroundColor: color,
                            border: categoryFormData.color === color ? '3px solid #f0f6fc' : '2px solid #30363d',
                            cursor: 'pointer',
                            padding: 0
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="admin-v2-modal-footer">
                  <button 
                    type="button" 
                    className="admin-v2-btn"
                    onClick={() => setShowCreateCategoryModal(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="admin-v2-btn admin-v2-btn-primary"
                    disabled={categorySaving}
                  >
                    {categorySaving ? 'Creating...' : 'Add Category'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Category Modal */}
        {showEditCategoryModal && selectedCategory && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowEditCategoryModal(false)}>
            <div className="admin-v2-modal admin-v2-modal-sm" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Edit Category</h2>
                <button className="admin-v2-modal-close" onClick={() => setShowEditCategoryModal(false)}>
                  <XIcon size={20} />
                </button>
              </div>
              <form onSubmit={handleUpdateCategory}>
                <div className="admin-v2-modal-body">
                  {categoryError && (
                    <div className="admin-v2-form-error">{categoryError}</div>
                  )}
                  
                  <div className="admin-v2-form-group">
                    <label>Category Name *</label>
                    <input
                      type="text"
                      value={categoryFormData.name}
                      onChange={e => setCategoryFormData({...categoryFormData, name: e.target.value})}
                      required
                    />
                  </div>

                  <div className="admin-v2-form-group">
                    <label>Description</label>
                    <textarea
                      value={categoryFormData.description}
                      onChange={e => setCategoryFormData({...categoryFormData, description: e.target.value})}
                      placeholder="Optional description..."
                      rows={2}
                    />
                  </div>

                  <div className="admin-v2-form-group">
                    <label>Color</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <input
                        type="color"
                        value={categoryFormData.color}
                        onChange={e => setCategoryFormData({...categoryFormData, color: e.target.value})}
                        style={{ 
                          width: '50px', 
                          height: '40px', 
                          border: 'none', 
                          borderRadius: '4px',
                          cursor: 'pointer',
                          padding: 0
                        }}
                      />
                      <input
                        type="text"
                        value={categoryFormData.color}
                        onChange={e => setCategoryFormData({...categoryFormData, color: e.target.value})}
                        placeholder="#a371f7"
                        pattern="^#[0-9A-Fa-f]{6}$"
                        style={{ flex: 1 }}
                      />
                      <span 
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          backgroundColor: categoryFormData.color,
                          border: '2px solid #30363d'
                        }}
                      />
                    </div>
                    <div style={{ 
                      display: 'flex', 
                      gap: '0.5rem', 
                      marginTop: '0.5rem',
                      flexWrap: 'wrap' 
                    }}>
                      {['#a371f7', '#f78166', '#7ee787', '#58a6ff', '#d2a8ff', '#ff7b72', '#ffa657', '#79c0ff'].map(color => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setCategoryFormData({...categoryFormData, color})}
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            backgroundColor: color,
                            border: categoryFormData.color === color ? '3px solid #f0f6fc' : '2px solid #30363d',
                            cursor: 'pointer',
                            padding: 0
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="admin-v2-modal-footer">
                  <button 
                    type="button" 
                    className="admin-v2-btn"
                    onClick={() => setShowEditCategoryModal(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="admin-v2-btn admin-v2-btn-primary"
                    disabled={categorySaving}
                  >
                    {categorySaving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Category Confirmation Modal */}
        {showDeleteCategoryModal && selectedCategory && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowDeleteCategoryModal(false)}>
            <div className="admin-v2-modal admin-v2-modal-sm" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Delete Category</h2>
                <button className="admin-v2-modal-close" onClick={() => setShowDeleteCategoryModal(false)}>
                  <XIcon size={20} />
                </button>
              </div>
              <div className="admin-v2-modal-body">
                <p>Are you sure you want to delete the category <strong style={{ color: selectedCategory.color }}>{selectedCategory.name}</strong>?</p>
                {getCategoryTaskCount(selectedCategory.id) > 0 && (
                  <p className="admin-v2-warning-text">
                    ⚠️ This category has {getCategoryTaskCount(selectedCategory.id)} task(s) assigned. You must reassign or delete those tasks first.
                  </p>
                )}
              </div>
              <div className="admin-v2-modal-footer">
                <button 
                  type="button" 
                  className="admin-v2-btn"
                  onClick={() => setShowDeleteCategoryModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="admin-v2-btn admin-v2-btn-danger"
                  onClick={handleDeleteCategory}
                  disabled={categorySaving || getCategoryTaskCount(selectedCategory.id) > 0}
                >
                  {categorySaving ? 'Deleting...' : 'Delete Category'}
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
