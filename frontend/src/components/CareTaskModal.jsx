import React, { useState, useEffect } from 'react';
import ModalBase from './ModalBase';
import config from '../config';
import { useAdminPatient } from '../contexts/AdminPatientContext';
import CareTaskListView from './care-task/CareTaskListView';
import CareTaskScheduleView from './care-task/CareTaskScheduleView';
import CareTaskScheduledView from './care-task/CareTaskScheduledView';
import NutritionTrackingModal from './nutrition/NutritionTrackingModal';

const CareTaskModal = ({ onClose }) => {
  const { selectedPatient } = useAdminPatient();
  const [tab, setTab] = useState('scheduled');
  const [activeTasks, setActiveTasks] = useState([]);
  const [inactiveTasks, setInactiveTasks] = useState([]);
  const [scheduledTasks, setScheduledTasks] = useState({ scheduled_care_tasks: [] });
  const [categories, setCategories] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showScheduleFor, setShowScheduleFor] = useState(null); // task id or null
  const [showHistory, setShowHistory] = useState(false); // show history view
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  
  // Add category modal state
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [categoryFormData, setCategoryFormData] = useState({
    name: '',
    description: '',
    color: '#6f42c1'
  });

  // Add CSS for animations
  React.useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  React.useEffect(() => {
    if (!document.getElementById('care-task-modal-styles')) {
      const style = document.createElement('style');
      style.id = 'care-task-modal-styles';
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes slideUp {
          0% { 
            opacity: 0;
            transform: translateY(20px);
          }
          100% { 
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        /* Force readable text in form inputs */
        .care-task-input,
        .care-task-textarea,
        .care-task-select,
        input.care-task-input,
        textarea.care-task-textarea,
        select.care-task-select {
          color: #ffffff !important;
          background-color: #2d3748 !important;
          border: 1px solid #4a5568 !important;
        }
        
        .care-task-input::placeholder,
        .care-task-textarea::placeholder,
        input.care-task-input::placeholder,
        textarea.care-task-textarea::placeholder {
          color: #a0aec0 !important;
          opacity: 1 !important;
        }
        
        .care-task-select option,
        select.care-task-select option {
          color: #ffffff !important;
          background-color: #2d3748 !important;
        }
        
        /* Additional overrides for any conflicting styles */
        form input[type="text"].care-task-input,
        form textarea.care-task-textarea,
        form select.care-task-select {
          color: #ffffff !important;
          background-color: #2d3748 !important;
          border: 1px solid #4a5568 !important;
        }
        
        /* Very specific selectors to override any global styles */
        div form input.care-task-input,
        div form textarea.care-task-textarea,
        div form select.care-task-select {
          color: #ffffff !important;
          background-color: #2d3748 !important;
          border: 1px solid #4a5568 !important;
          -webkit-text-fill-color: #ffffff !important;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // Form data for adding/editing tasks
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category_id: ''
  });

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState({ open: false, item: null });
  
  // Skip confirmation modal state
  const [skipModal, setSkipModal] = useState({ open: false, item: null });

  // Mark All modal state
  const [markAllModal, setMarkAllModal] = useState({ 
    open: false, 
    timeGroup: null, 
    tasks: [], 
    selectedTasks: new Set(),
    loading: false,
    completedTasks: new Set()
  });

  // Nutrition tracking modal state
  const [nutritionModal, setNutritionModal] = useState({
    open: false,
    careTaskLogId: null,
    careTaskName: '',
    nutritionData: null  // Add nutrition prefill data
  });

  // Status filter state for scheduled tasks - match backend status values
  const [statusFilters, setStatusFilters] = useState({
    pending: true,        // Tasks that haven't reached scheduled time yet (>30 min away)
    due_warning: true,    // Tasks that are getting close (15-30 min away)
    due_on_time: true,    // Tasks that are ready now (±15 min)
    due_late: true,       // Tasks that are overdue
    upcoming: true,       // General upcoming status
    missed: true,         // Tasks that were missed
    completed: false,     // Hidden by default - completed tasks
    skipped: false        // Hidden by default - skipped tasks
  });

  // Status filters visibility toggle
  const [showFilters, setShowFilters] = useState(false);

  // Load tasks when patient or tab changes
  useEffect(() => {
    if (!selectedPatient) return;
    fetchCategories();
    if (tab === 'active' || tab === 'inactive') {
      fetchTasks();
    } else if (tab === 'scheduled') {
      fetchScheduledTasks();
    }
  }, [tab, selectedPatient?.id]);

  // Pre-select first category when categories load and adding new task
  useEffect(() => {
    if (tab === 'add' && categories.length > 0 && !editingTask) {
      setFormData(prev => ({
        ...prev,
        category_id: prev.category_id || String(categories[0].id)
      }));
    }
  }, [categories, editingTask, tab]);

  const fetchCategories = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/care-task-categories`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        console.log('Fetched categories:', data);
        setCategories(data.categories || []);
      } else {
        console.error('Failed to fetch categories:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error fetching care task categories:', error);
    }
  };

  const fetchTasks = async () => {
    if (!selectedPatient) return;
    setLoading(true);
    try {
      const [activeResponse, inactiveResponse] = await Promise.all([
        fetch(`${config.apiUrl}/api/admin/care-tasks/active?patient_id=${selectedPatient.id}`, { credentials: 'include' }),
        fetch(`${config.apiUrl}/api/admin/care-tasks/inactive?patient_id=${selectedPatient.id}`, { credentials: 'include' })
      ]);

      if (activeResponse.ok && inactiveResponse.ok) {
        const activeData = await activeResponse.json();
        const inactiveData = await inactiveResponse.json();
        setActiveTasks(activeData.care_tasks || []);
        setInactiveTasks(inactiveData.care_tasks || []);
      }
    } catch (error) {
      console.error('Error fetching care tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchScheduledTasks = async () => {
    if (!selectedPatient) return;
    setLoading(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/care-task-schedules/daily?patient_id=${selectedPatient.id}`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setScheduledTasks(data);
      }
    } catch (error) {
      console.error('Error fetching scheduled care tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTaskSchedules = async (taskId) => {
    try {
      const patientParam = selectedPatient ? `?patient_id=${selectedPatient.id}` : '';
      const response = await fetch(`${config.apiUrl}/api/care-tasks/${taskId}/schedules${patientParam}`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        return data.schedules || [];
      }
    } catch (error) {
      console.error('Error fetching task schedules:', error);
    }
    return [];
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      category_id: ''
    });
    setEditingTask(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const url = editingTask 
        ? `${config.apiUrl}/api/care-tasks/${editingTask.id}`
        : `${config.apiUrl}/api/add/care-task`;
      
      const method = editingTask ? 'PUT' : 'POST';
      
      // For new care tasks, include patient_id to assign to selected patient
      const submitData = { ...formData };
      if (!editingTask && selectedPatient) {
        submitData.patient_id = selectedPatient.id;
      }
      
      const response = await fetch(url, {
        method,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submitData),
      });

      if (response.ok) {
        resetForm();
        setShowAddForm(false);
        await fetchTasks();
        console.log(`Care task ${editingTask ? 'updated' : 'added'} successfully`);
      } else {
        const errorData = await response.json();
        console.error('Error:', errorData);
      }
    } catch (error) {
      console.error('Error submitting care task:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (task) => {
    setEditingTask(task);
    setFormData({
      name: task.name || '',
      description: task.description || '',
      category_id: task.category_id || '',
      active: task.active !== undefined ? task.active : true
    });
    setTab('add');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this care task?')) {
      return;
    }

    try {
      const response = await fetch(`${config.apiUrl}/api/care-tasks/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        await fetchTasks();
        console.log('Care task deleted successfully');
      } else {
        console.error('Failed to delete care task');
      }
    } catch (error) {
      console.error('Error deleting care task:', error);
    }
  };

  const handleDeleteCategory = async (categoryId) => {
    if (!window.confirm('Are you sure you want to delete this category? This action cannot be undone if there are no tasks assigned to it.')) {
      return;
    }

    try {
      const response = await fetch(`${config.apiUrl}/api/care-task-categories/${categoryId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        await fetchCategories();
        console.log('Category deleted successfully');
      } else {
        const errorData = await response.json();
        alert(errorData.detail || 'Failed to delete category');
      }
    } catch (error) {
      console.error('Error deleting category:', error);
      alert('Error deleting category');
    }
  };

  const toggleActive = async (id) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/care-tasks/${id}/toggle-active`, {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        await fetchTasks();
        console.log('Care task status toggled successfully');
      } else {
        console.error('Failed to toggle care task status');
      }
    } catch (error) {
      console.error('Error toggling care task status:', error);
    }
  };

  const formatSchedule = (task) => {
    if (!task.schedules || task.schedules.length === 0) {
      return 'No schedule set';
    }

    return task.schedules.map(schedule => schedule.description).join(', ');
  };

  const formatTime = (timeString) => {
    if (!timeString) return '';
    const date = new Date(timeString);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'ready_to_take':
      case 'on_time':
        return {
          bg: '#d4edda',
          border: '#28a745',
          text: '#155724'
        };
      case 'upcoming':
        return {
          bg: '#d1ecf1',
          border: '#17a2b8',
          text: '#0c5460'
        };
      case 'warning':
      case 'late_early':
        return {
          bg: '#fff3cd',
          border: '#ffc107',
          text: '#856404'
        };
      case 'missed':
        return {
          bg: '#f8d7da',
          border: '#dc3545',
          text: '#721c24'
        };
      case 'skipped':
        return {
          bg: '#f8f9fa',
          border: '#6c757d',
          text: '#495057'
        };
      default:
        return {
          bg: '#f8f9fa',
          border: '#6c757d',
          text: '#495057'
        };
    }
  };

  const getStatusText = (item) => {
    // Implementation for status text logic
    const now = new Date();
    const scheduledTime = new Date(item.scheduled_time);
    const timeDiff = (scheduledTime - now) / (1000 * 60); // difference in minutes

    if (timeDiff > 60) {
      return 'upcoming';
    } else if (timeDiff > 0 && timeDiff <= 15) {
      return 'ready_to_take';
    } else if (timeDiff <= 0 && timeDiff >= -15) {
      return 'on_time';
    } else if (timeDiff < -15 && timeDiff >= -60) {
      return 'warning';
    } else if (timeDiff < -60) {
      return 'missed';
    }
    return 'upcoming';
  };

  const handleMarkCompleted = async (task) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/care-task-schedule/${task.schedule_id}/complete`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scheduled_time: task.scheduled_time,
          notes: `Completed via web interface`
        })
      });

      if (response.ok) {
        const result = await response.json();
        
        // Check if nutrition tracking is required
        if (result.requires_nutrition_tracking && result.care_task) {
          setNutritionModal({
            open: true,
            careTaskLogId: result.id,
            careTaskName: result.care_task.name,
            nutritionData: result.nutrition_data || null
          });
        }
        
        // Refresh scheduled tasks to update the view
        fetchScheduledTasks();
      } else {
        console.error('Failed to mark task as completed');
      }
    } catch (error) {
      console.error('Error marking task as completed:', error);
    }
  };

  const handleSkipTask = async (task) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/care-task-schedule/${task.schedule_id}/skip`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scheduled_time: task.scheduled_time,
          notes: `Skipped via web interface`
        })
      });

      if (response.ok) {
        // Refresh scheduled tasks to update the view
        fetchScheduledTasks();
      } else {
        console.error('Failed to skip task');
      }
    } catch (error) {
      console.error('Error skipping task:', error);
    }
  };

  // Helper function to parse cron expression
  const allTasks = [...activeTasks, ...inactiveTasks];

  const renderTaskCard = (task) => (
    <div key={task.id} className="medication-card" style={{
      backgroundColor: '#fff',
      borderRadius: '6px',
      padding: '12px',
      marginBottom: '8px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      border: `1px solid ${task.active ? '#28a745' : '#6c757d'}`,
      borderLeft: `4px solid ${task.active ? '#28a745' : '#6c757d'}`
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <h4 style={{ margin: 0, color: '#333', fontSize: '16px', fontWeight: '600', truncate: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {task.name}
            </h4>
            {task.category && (
              <span style={{ fontSize: '12px', color: '#666', fontWeight: '500' }}>
                {task.category.name}
              </span>
            )}
          </div>
          
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', fontSize: '13px', color: '#666' }}>
            <span>
              <strong>Description:</strong> {task.description || 'No description'}
            </span>
            {task.schedules && task.schedules.length > 0 && (
              <span style={{ 
                background: '#e3f2fd', 
                color: '#1976d2', 
                padding: '2px 6px', 
                borderRadius: '10px', 
                fontSize: '11px',
                fontWeight: '600'
              }}>
                {task.schedules.length} schedule{task.schedules.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '4px', marginLeft: '12px', flexShrink: 0 }}>
          <button
            onClick={() => setShowScheduleFor(task.id)}
            style={{
              padding: '4px 8px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: task.schedules && task.schedules.length > 0 ? '#ffc107' : '#17a2b8',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: '600'
            }}
            title="Manage schedules"
          >
            📅
          </button>
          <button
            onClick={() => handleEdit(task)}
            style={{
              padding: '4px 8px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: '#007bff',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: '600'
            }}
            title="Edit care task"
          >
            ✏️
          </button>
          <button
            onClick={() => toggleActive(task.id)}
            style={{
              padding: '4px 8px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: task.active ? '#6c757d' : '#28a745',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: '600'
            }}
            title={task.active ? 'Pause care task' : 'Resume care task'}
          >
            {task.active ? '⏸️' : '▶️'}
          </button>
          <button
            onClick={() => handleDelete(task.id)}
            style={{
              padding: '4px 8px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: '#dc3545',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: '600'
            }}
            title="Delete care task"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  );

  // Show schedule view if a task is selected for scheduling
  if (showScheduleFor) {
    const selectedTask = allTasks.find(task => task.id === showScheduleFor);
    return (
      <ModalBase isOpen={true} onClose={() => setShowScheduleFor(null)} title={`Schedule - ${selectedTask ? selectedTask.name : 'Unknown Task'}`}>
        <CareTaskScheduleView
          taskId={showScheduleFor}
          taskName={selectedTask ? selectedTask.name : 'Unknown Task'}
          onClose={() => setShowScheduleFor(null)}
        />
      </ModalBase>
    );
  }

  const handleAddCategory = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(`${config.apiUrl}/api/add/care-task-category`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(categoryFormData),
      });

      if (response.ok) {
        await fetchCategories();
        setCategoryFormData({ name: '', description: '', color: '#6f42c1' });
        setShowAddCategoryModal(false);
        console.log('Category added successfully');
      } else {
        const errorData = await response.json();
        alert(errorData.detail || 'Failed to add category');
      }
    } catch (error) {
      console.error('Error adding category:', error);
      alert('Error adding category');
    } finally {
      setLoading(false);
    }
  };

  const getCategoryTaskCount = (categoryId) => {
    return activeTasks.filter(task => task.category_id === categoryId).length;
  };

  return (
    <>
      <ModalBase isOpen={true} onClose={onClose} title={
      isMobile ? (
        <select
          value={tab}
          onChange={(e) => {
            setTab(e.target.value);
            setShowAddForm(false);
            setShowScheduleFor(null);
          }}
          style={{
            width: '100%',
            padding: '12px 16px',
            fontSize: '15px',
            fontWeight: '600',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            backgroundColor: '#1a2332',
            color: '#fff',
            cursor: 'pointer',
            outline: 'none',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
            WebkitAppearance: 'none',
            MozAppearance: 'none',
            appearance: 'none',
            backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'white\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6 9 12 15 18 9\'%3e%3c/polyline%3e%3c/svg%3e")',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 12px center',
            backgroundSize: '20px',
            paddingRight: '40px'
          }}
        >
          <option value="scheduled" style={{ backgroundColor: '#1a2332', color: '#fff' }}>📅 Scheduled Today</option>
          <option value="active" style={{ backgroundColor: '#1a2332', color: '#fff' }}>✓ Active ({activeTasks.length})</option>
          <option value="inactive" style={{ backgroundColor: '#1a2332', color: '#fff' }}>⏸ Inactive ({inactiveTasks.length})</option>
          <option value="categories" style={{ backgroundColor: '#1a2332', color: '#fff' }}>📁 Categories</option>
          <option value="add" style={{ backgroundColor: '#1a2332', color: '#fff' }}>➕ Add Task</option>
        </select>
      ) : (
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px', 
        width: '100%'
      }}>
        <button
          onClick={() => { setTab('scheduled'); setShowAddForm(false); setShowScheduleFor(null); }}
          style={{
            padding: '8px 14px',
            border: 'none',
            borderRadius: '6px',
            backgroundColor: tab === 'scheduled' ? '#007bff' : '#f8f9fa',
            color: tab === 'scheduled' ? '#fff' : '#333',
            cursor: 'pointer',
            fontWeight: '500',
            fontSize: '13px',
            whiteSpace: 'nowrap',
            flexShrink: 0
          }}
        >
          Scheduled Today
        </button>
        <button
          onClick={() => { setTab('active'); setShowAddForm(false); setShowScheduleFor(null); }}
          style={{
            padding: '8px 14px',
            border: 'none',
            borderRadius: '6px',
            backgroundColor: tab === 'active' ? '#007bff' : '#f8f9fa',
            color: tab === 'active' ? '#fff' : '#333',
            cursor: 'pointer',
            fontWeight: '500',
            fontSize: '13px',
            whiteSpace: 'nowrap',
            flexShrink: 0
          }}
        >
          Active ({activeTasks.length})
        </button>
        <button
          onClick={() => { setTab('inactive'); setShowAddForm(false); setShowScheduleFor(null); }}
          style={{
            padding: '8px 14px',
            border: 'none',
            borderRadius: '6px',
            backgroundColor: tab === 'inactive' ? '#007bff' : '#f8f9fa',
            color: tab === 'inactive' ? '#fff' : '#333',
            cursor: 'pointer',
            fontWeight: '500',
            fontSize: '13px',
            whiteSpace: 'nowrap',
            flexShrink: 0
          }}
        >
          Inactive ({inactiveTasks.length})
        </button>
        <button
          onClick={() => { setTab('categories'); setShowScheduleFor(null); }}
          style={{
            padding: '8px 14px',
            border: 'none',
            borderRadius: '6px',
            backgroundColor: tab === 'categories' ? '#6f42c1' : '#f8f9fa',
            color: tab === 'categories' ? '#fff' : '#333',
            cursor: 'pointer',
            fontWeight: '500',
            fontSize: '13px',
            whiteSpace: 'nowrap',
            flexShrink: 0
          }}
        >
          Categories
        </button>
        <button
          onClick={() => { setTab('add'); setShowScheduleFor(null); }}
          style={{
            padding: '8px 14px',
            border: 'none',
            borderRadius: '6px',
            backgroundColor: tab === 'add' ? '#28a745' : '#f8f9fa',
            color: tab === 'add' ? '#fff' : '#333',
            cursor: 'pointer',
            fontWeight: '500',
            fontSize: '13px',
            whiteSpace: 'nowrap',
            flexShrink: 0
          }}
        >
          + Add Task
        </button>
      </div>
      )
    }>
      {/* Content Area */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Current Patient Info */}
        {(tab === 'scheduled' || tab === 'active' || tab === 'inactive') && (
          <div style={{ 
            marginBottom: 16, 
            padding: 12, 
            backgroundColor: selectedPatient ? '#e8f4fd' : '#fff3cd', 
            borderRadius: 6, 
            border: selectedPatient ? '1px solid #b3d7ff' : '1px solid #ffeaa7',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <span style={{ 
              fontSize: 14, 
              color: selectedPatient ? '#0066cc' : '#856404', 
              fontWeight: 500 
            }}>
              {selectedPatient ? (
                <>
                  {tab === 'scheduled' ? 'Viewing schedule for:' : 'Viewing care tasks for:'} {selectedPatient.first_name} {selectedPatient.last_name}
                </>
              ) : (
                'No patient selected - showing global templates only'
              )}
            </span>
          </div>
        )}
        
        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '40px' }}>
              <div>Loading...</div>
            </div>
          )}

          {!loading && tab === 'scheduled' && (
            <CareTaskScheduledView
              scheduledTasks={scheduledTasks}
              getStatusColor={getStatusColor}
              getStatusText={getStatusText}
              handleMarkCompleted={handleMarkCompleted}
              handleSkipTask={handleSkipTask}
              statusFilters={statusFilters}
              setStatusFilters={setStatusFilters}
              showFilters={showFilters}
              setShowFilters={setShowFilters}
            />
          )}

          {!loading && (tab === 'active' || tab === 'inactive') && (
            <div>
              <CareTaskListView
                tasks={tab === 'active' ? activeTasks : inactiveTasks}
                setShowAddForm={() => setTab('add')}
                handleEdit={handleEdit}
                toggleActive={toggleActive}
                handleDelete={handleDelete}
                setShowScheduleFor={setShowScheduleFor}
                type={tab}
              />
            </div>
          )}

          {/* Categories Tab */}
          {!loading && tab === 'categories' && (
            <div style={{ padding: '20px' }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginBottom: '20px',
                borderBottom: '2px solid #f0f0f0',
                paddingBottom: '15px'
              }}>
                <h3 style={{ 
                  margin: 0, 
                  color: '#ffffff', 
                  fontSize: '24px', 
                  fontWeight: '700',
                  textShadow: '0 1px 3px rgba(0, 0, 0, 0.3)'
                }}>
                  Manage Categories
                </h3>
                <button
                  onClick={() => setShowAddCategoryModal(true)}
                  style={{
                    padding: '10px 20px',
                    border: 'none',
                    borderRadius: '8px',
                    backgroundColor: '#28a745',
                    color: '#fff',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 2px 4px rgba(40, 167, 69, 0.3)',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseOver={(e) => e.target.style.backgroundColor = '#218838'}
                  onMouseOut={(e) => e.target.style.backgroundColor = '#28a745'}
                >
                  + Add Category
                </button>
              </div>
              
              {categories.length > 0 ? (
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
                  gap: '16px' 
                }}>
                  {categories.map(category => {
                    const taskCount = getCategoryTaskCount(category.id);
                    const categoryColor = category.color || '#6f42c1';
                    return (
                      <div key={category.id} style={{
                        backgroundColor: '#fff',
                        borderRadius: '8px',
                        padding: '16px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                        border: '1px solid #e9ecef',
                        borderTop: `4px solid ${categoryColor}`,
                        transition: 'all 0.2s ease',
                        position: 'relative'
                      }}>
                        <div style={{ marginBottom: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                            <div style={{
                              width: '12px',
                              height: '12px',
                              borderRadius: '50%',
                              backgroundColor: categoryColor
                            }}></div>
                            <h4 style={{ 
                              margin: 0, 
                              color: '#333', 
                              fontSize: '16px', 
                              fontWeight: '600',
                              flex: 1
                            }}>
                              {category.name}
                            </h4>
                            {category.is_default && (
                              <span style={{
                                fontSize: '10px',
                                color: categoryColor,
                                fontWeight: '700',
                                padding: '2px 6px',
                                backgroundColor: `${categoryColor}15`,
                                borderRadius: '4px',
                                border: `1px solid ${categoryColor}40`
                              }}>
                                DEFAULT
                              </span>
                            )}
                          </div>
                          
                          <div style={{
                            fontSize: '13px',
                            color: '#666',
                            fontWeight: '500',
                            backgroundColor: '#f8f9fa',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            display: 'inline-block',
                            marginBottom: '8px'
                          }}>
                            {taskCount} task{taskCount !== 1 ? 's' : ''}
                          </div>
                          
                          {category.description && (
                            <p style={{ 
                              margin: 0, 
                              color: '#6c757d', 
                              fontSize: '13px', 
                              lineHeight: '1.4',
                              overflow: 'hidden',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical'
                            }}>
                              {category.description}
                            </p>
                          )}
                        </div>
                        
                        {!category.is_default && (
                          <button
                            onClick={() => handleDeleteCategory(category.id)}
                            style={{
                              position: 'absolute',
                              top: '12px',
                              right: '12px',
                              padding: '4px 8px',
                              border: 'none',
                              borderRadius: '4px',
                              backgroundColor: '#dc3545',
                              color: '#fff',
                              cursor: 'pointer',
                              fontSize: '11px',
                              fontWeight: '600',
                              opacity: '0.7',
                              transition: 'all 0.2s ease'
                            }}
                            onMouseOver={(e) => {
                              e.target.style.opacity = '1';
                              e.target.style.backgroundColor = '#c82333';
                            }}
                            onMouseOut={(e) => {
                              e.target.style.opacity = '0.7';
                              e.target.style.backgroundColor = '#dc3545';
                            }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '40px 20px',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '12px',
                  border: '2px dashed #dee2e6'
                }}>
                  <p style={{ color: '#6c757d', fontSize: '16px', margin: '0 0 15px 0' }}>
                    No categories available.
                  </p>
                  <button
                    onClick={() => setShowAddCategoryModal(true)}
                    style={{
                      padding: '10px 20px',
                      border: 'none',
                      borderRadius: '8px',
                      backgroundColor: '#28a745',
                      color: '#fff',
                      cursor: 'pointer',
                      fontWeight: '600',
                      fontSize: '14px'
                    }}
                  >
                    Add Your First Category
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Add Task Tab */}
          {!loading && tab === 'add' && (
            <div style={{ padding: '24px' }}>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                marginBottom: '24px',
                paddingBottom: '16px',
                borderBottom: '2px solid #f8f9fa'
              }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  backgroundColor: '#007bff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: '12px'
                }}>
                  <span style={{ color: '#fff', fontSize: '16px', fontWeight: '700' }}>
                    {editingTask ? '✏️' : '+'}
                  </span>
                </div>
                <h3 style={{ 
                  margin: '0', 
                  color: '#ffffff', 
                  fontSize: '24px', 
                  fontWeight: '700',
                  textShadow: '0 1px 3px rgba(0, 0, 0, 0.3)'
                }}>
                  {editingTask ? 'Edit Care Task' : 'Add New Care Task'}
                </h3>
              </div>
              <form onSubmit={handleSubmit} style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '24px',
                backgroundColor: 'rgba(30,32,40,0.95)',
                padding: '24px',
                borderRadius: '12px',
                border: '1px solid #4a5568',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
                maxWidth: '100%',
                overflow: 'hidden', // Prevent content from spilling out
                boxSizing: 'border-box'
              }}>
                
                {/* Patient Context for New Tasks */}
                {!editingTask && (
                  <div style={{ 
                    marginBottom: 8, 
                    padding: 12, 
                    backgroundColor: selectedPatient ? '#e8f4fd' : '#fff3cd', 
                    borderRadius: 6, 
                    border: selectedPatient ? '1px solid #b3d7ff' : '1px solid #ffeaa7',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}>
                    <span style={{ 
                      fontSize: 14, 
                      color: selectedPatient ? '#0066cc' : '#856404', 
                      fontWeight: 500 
                    }}>
                      {selectedPatient ? (
                        <>Creating task for: {selectedPatient.first_name} {selectedPatient.last_name}</>
                      ) : (
                        'Creating global task template (no patient selected)'
                      )}
                    </span>
                  </div>
                )}
                
                {/* Category Selection - First Priority */}
                <div>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '12px', 
                    fontWeight: '700', 
                    color: '#ffffff',
                    fontSize: '16px',
                    letterSpacing: '0.5px'
                  }}>
                    Category *
                  </label>
                  <div style={{ 
                    position: 'relative'
                  }}>
                    <select
                      value={formData.category_id}
                      onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                      className="care-task-select"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        backgroundColor: '#2d3748',
                        border: '1px solid #4a5568',
                        borderRadius: '6px',
                        color: '#ffffff',
                        fontSize: '14px',
                        outline: 'none',
                        transition: 'border-color 0.2s ease',
                        boxSizing: 'border-box',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        appearance: 'none'
                      }}
                      required
                    >
                      <option value="" style={{ color: '#ffffff', backgroundColor: '#2d3748' }}>
                        🏷️ Select a category... ({categories.length} available)
                      </option>
                      {categories.map(category => (
                        <option 
                          key={category.id} 
                          value={category.id}
                          style={{ 
                            color: '#ffffff', // White text for dark theme
                            fontWeight: '600',
                            padding: '8px',
                            backgroundColor: '#2d3748' // Dark background
                          }}
                        >
                          {category.name} {category.description ? `- ${category.description}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Category Info */}
                  {formData.category_id && (
                    <div style={{
                      marginTop: '12px',
                      padding: '12px 16px',
                      backgroundColor: '#1a202c',
                      borderRadius: '8px',
                      border: '1px solid #4a5568',
                      fontSize: '14px',
                      color: '#ffffff'
                    }}>
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px',
                        fontWeight: '600'
                      }}>
                        <div style={{
                          width: '12px',
                          height: '12px',
                          borderRadius: '50%',
                          backgroundColor: categories.find(c => c.id == formData.category_id)?.color || '#6f42c1'
                        }}></div>
                        {categories.find(c => c.id == formData.category_id)?.name}
                      </div>
                      {categories.find(c => c.id == formData.category_id)?.description && (
                        <div style={{ 
                          marginTop: '6px',
                          fontSize: '13px',
                          color: '#cbd5e0',
                          fontStyle: 'italic'
                        }}>
                          {categories.find(c => c.id == formData.category_id)?.description}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Task Name - With Better Bounds */}
                <div>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '10px', 
                    fontWeight: '700', 
                    color: '#ffffff',
                    fontSize: '15px',
                    letterSpacing: '0.5px'
                  }}>
                    Task Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter a clear, descriptive task name"
                    className="care-task-input"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: '#2d3748',
                      border: '1px solid #4a5568',
                      borderRadius: '6px',
                      color: '#ffffff',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'border-color 0.2s ease',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit'
                    }}
                    required
                  />
                </div>

                {/* Description with Better Styling and Bounds */}
                <div>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '10px', 
                    fontWeight: '700', 
                    color: '#ffffff',
                    fontSize: '15px',
                    letterSpacing: '0.5px'
                  }}>
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Provide detailed instructions or notes for this care task..."
                    rows={4}
                    className="care-task-textarea"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: '#2d3748',
                      border: '1px solid #4a5568',
                      borderRadius: '6px',
                      color: '#ffffff',
                      fontSize: '14px',
                      outline: 'none',
                      transition: 'border-color 0.2s ease',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit',
                      resize: 'vertical',
                      minHeight: '80px'
                    }}
                  />
                </div>

                {/* Active Status with Better Styling */}
                <div style={{
                  backgroundColor: '#1a202c',
                  padding: '12px',
                  borderRadius: '6px',
                  border: '1px solid #4a5568'
                }}>
                  <label style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '10px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#ffffff'
                  }}>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="checkbox"
                        checked={formData.active}
                        onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                        style={{
                          width: '20px',
                          height: '20px',
                          cursor: 'pointer',
                          accentColor: '#007bff'
                        }}
                      />
                    </div>
                    <div>
                      <div style={{ fontWeight: '700', marginBottom: '2px' }}>Active Task</div>
                      <div style={{ fontSize: '13px', color: '#cbd5e0', fontWeight: '400' }}>
                        {formData.active 
                          ? 'This task will be available for scheduling and completion'
                          : 'This task will be saved but not active for use'
                        }
                      </div>
                    </div>
                  </label>
                </div>

                {/* Enhanced Action Buttons */}
                <div style={{ 
                  display: 'flex', 
                  gap: '16px', 
                  paddingTop: '8px',
                  borderTop: '1px solid #f1f3f4'
                }}>
                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      flex: 1,
                      padding: '16px 24px',
                      border: 'none',
                      borderRadius: '12px',
                      background: loading ? '#ccc' : 'linear-gradient(135deg, #007bff, #0056b3)',
                      color: '#fff',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      fontWeight: '700',
                      fontSize: '15px',
                      boxShadow: loading ? 'none' : '0 4px 15px rgba(0, 123, 255, 0.4)',
                      transition: 'all 0.3s ease',
                      fontFamily: 'inherit',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                    onMouseOver={(e) => {
                      if (!loading) {
                        e.target.style.transform = 'translateY(-2px)';
                        e.target.style.boxShadow = '0 6px 20px rgba(0, 123, 255, 0.5)';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (!loading) {
                        e.target.style.transform = 'translateY(0)';
                        e.target.style.boxShadow = '0 4px 15px rgba(0, 123, 255, 0.4)';
                      }
                    }}
                  >
                    {loading ? (
                      <>
                        <div style={{
                          width: '16px',
                          height: '16px',
                          border: '2px solid rgba(255, 255, 255, 0.3)',
                          borderTop: '2px solid #fff',
                          borderRadius: '50%',
                          animation: 'spin 1s linear infinite'
                        }}></div>
                        Saving...
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: '16px' }}>
                          {editingTask ? '✏️' : '+'}
                        </span>
                        {editingTask ? 'Update Task' : 'Add Task'}
                      </>
                    )}
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => {
                      setEditingTask(null);
                      setFormData({ name: '', description: '', category_id: '', active: true });
                      setTab('active');
                    }}
                    style={{
                      padding: '16px 24px',
                      border: '2px solid #e9ecef',
                      borderRadius: '12px',
                      backgroundColor: '#fff',
                      color: '#6c757d',
                      cursor: 'pointer',
                      fontWeight: '600',
                      fontSize: '15px',
                      transition: 'all 0.3s ease',
                      fontFamily: 'inherit'
                    }}
                    onMouseOver={(e) => {
                      e.target.style.backgroundColor = '#f8f9fa';
                      e.target.style.borderColor = '#6c757d';
                      e.target.style.transform = 'translateY(-1px)';
                      e.target.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                    }}
                    onMouseOut={(e) => {
                      e.target.style.backgroundColor = '#fff';
                      e.target.style.borderColor = '#e9ecef';
                      e.target.style.transform = 'translateY(0)';
                      e.target.style.boxShadow = 'none';
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </ModalBase>

    {/* Add Category Modal */}
    {showAddCategoryModal && (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1050,
        animation: 'fadeIn 0.3s ease-out'
      }}>
        <div style={{
          backgroundColor: '#fff',
          borderRadius: '16px',
          padding: '32px',
          maxWidth: '520px',
          width: '90%',
          maxHeight: '85vh',
          overflow: 'auto',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)',
          border: '1px solid rgba(255, 255, 255, 0.8)',
          backdropFilter: 'blur(10px)',
          animation: 'slideUp 0.3s ease-out'
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            marginBottom: '24px',
            paddingBottom: '16px',
            borderBottom: '2px solid #f8f9fa'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              backgroundColor: '#6f42c1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '12px'
            }}>
              <span style={{ color: '#fff', fontSize: '18px', fontWeight: '700' }}>+</span>
            </div>
            <h3 style={{ 
              margin: '0', 
              color: '#2c3e50', 
              fontSize: '28px', 
              fontWeight: '700',
              background: 'linear-gradient(135deg, #6f42c1, #007bff)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent'
            }}>
              Add New Category
            </h3>
          </div>
          
          <form onSubmit={handleAddCategory}>
            <div style={{ marginBottom: '24px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '10px', 
                fontWeight: '700', 
                color: '#2c3e50',
                fontSize: '15px',
                letterSpacing: '0.5px'
              }}>
                Category Name *
              </label>
              <input
                type="text"
                value={categoryFormData.name}
                onChange={(e) => setCategoryFormData({ ...categoryFormData, name: e.target.value })}
                placeholder="e.g., Physical Therapy, Medication Reminders"
                required
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  border: '2px solid #e9ecef',
                  borderRadius: '12px',
                  fontSize: '15px',
                  fontWeight: '500',
                  transition: 'all 0.3s ease',
                  backgroundColor: '#fdfdfd',
                  outline: 'none',
                  fontFamily: 'inherit'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#6f42c1';
                  e.target.style.backgroundColor = '#fff';
                  e.target.style.boxShadow = '0 0 0 3px rgba(111, 66, 193, 0.1)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#e9ecef';
                  e.target.style.backgroundColor = '#fdfdfd';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>
            
            <div style={{ marginBottom: '24px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '10px', 
                fontWeight: '700', 
                color: '#2c3e50',
                fontSize: '15px',
                letterSpacing: '0.5px'
              }}>
                Description
              </label>
              <textarea
                value={categoryFormData.description}
                onChange={(e) => setCategoryFormData({ ...categoryFormData, description: e.target.value })}
                placeholder="Brief description of what this category includes"
                rows={3}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  border: '2px solid #e9ecef',
                  borderRadius: '12px',
                  fontSize: '15px',
                  fontWeight: '500',
                  resize: 'vertical',
                  transition: 'all 0.3s ease',
                  backgroundColor: '#fdfdfd',
                  outline: 'none',
                  fontFamily: 'inherit',
                  minHeight: '80px'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#6f42c1';
                  e.target.style.backgroundColor = '#fff';
                  e.target.style.boxShadow = '0 0 0 3px rgba(111, 66, 193, 0.1)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#e9ecef';
                  e.target.style.backgroundColor = '#fdfdfd';
                  e.target.style.boxShadow = 'none';
                }}
              />
            </div>
            
            <div style={{ marginBottom: '32px' }}>
              <label style={{ 
                display: 'block', 
                marginBottom: '12px', 
                fontWeight: '700', 
                color: '#2c3e50',
                fontSize: '15px',
                letterSpacing: '0.5px'
              }}>
                Category Color
              </label>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '16px',
                padding: '16px',
                backgroundColor: '#f8f9fa',
                borderRadius: '12px',
                border: '2px solid #e9ecef'
              }}>
                <div style={{ 
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <input
                    type="color"
                    value={categoryFormData.color}
                    onChange={(e) => setCategoryFormData({ ...categoryFormData, color: e.target.value })}
                    style={{
                      width: '60px',
                      height: '60px',
                      border: '3px solid #fff',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      backgroundColor: 'transparent',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseOver={(e) => {
                      e.target.style.transform = 'scale(1.05)';
                      e.target.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.2)';
                    }}
                    onMouseOut={(e) => {
                      e.target.style.transform = 'scale(1)';
                      e.target.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.15)';
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ 
                    color: '#495057', 
                    fontSize: '14px',
                    fontWeight: '600',
                    marginBottom: '4px'
                  }}>
                    Selected Color
                  </div>
                  <div style={{ 
                    backgroundColor: '#fff',
                    padding: '10px 16px',
                    borderRadius: '8px',
                    border: '1px solid #dee2e6',
                    fontFamily: 'Monaco, Consolas, monospace',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#6c757d',
                    letterSpacing: '1px'
                  }}>
                    {categoryFormData.color.toUpperCase()}
                  </div>
                </div>
              </div>
            </div>
            
            <div style={{ 
              display: 'flex', 
              gap: '16px', 
              justifyContent: 'flex-end',
              paddingTop: '20px',
              borderTop: '1px solid #f1f3f4'
            }}>
              <button
                type="button"
                onClick={() => {
                  setShowAddCategoryModal(false);
                  setCategoryFormData({ name: '', description: '', color: '#6f42c1' });
                }}
                style={{
                  padding: '14px 28px',
                  border: '2px solid #e9ecef',
                  borderRadius: '12px',
                  backgroundColor: '#fff',
                  color: '#6c757d',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '15px',
                  transition: 'all 0.3s ease',
                  fontFamily: 'inherit'
                }}
                onMouseOver={(e) => {
                  e.target.style.backgroundColor = '#f8f9fa';
                  e.target.style.borderColor = '#6c757d';
                  e.target.style.transform = 'translateY(-1px)';
                  e.target.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.1)';
                }}
                onMouseOut={(e) => {
                  e.target.style.backgroundColor = '#fff';
                  e.target.style.borderColor = '#e9ecef';
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = 'none';
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: '14px 28px',
                  border: 'none',
                  borderRadius: '12px',
                  background: loading ? '#ccc' : 'linear-gradient(135deg, #28a745, #20c997)',
                  color: '#fff',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontWeight: '700',
                  fontSize: '15px',
                  boxShadow: loading ? 'none' : '0 4px 15px rgba(40, 167, 69, 0.4)',
                  transition: 'all 0.3s ease',
                  fontFamily: 'inherit',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                onMouseOver={(e) => {
                  if (!loading) {
                    e.target.style.transform = 'translateY(-2px)';
                    e.target.style.boxShadow = '0 6px 20px rgba(40, 167, 69, 0.5)';
                  }
                }}
                onMouseOut={(e) => {
                  if (!loading) {
                    e.target.style.transform = 'translateY(0)';
                    e.target.style.boxShadow = '0 4px 15px rgba(40, 167, 69, 0.4)';
                  }
                }}
              >
                <span style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px',
                  justifyContent: 'center'
                }}>
                  {loading ? (
                    <>
                      <div style={{
                        width: '16px',
                        height: '16px',
                        border: '2px solid rgba(255, 255, 255, 0.3)',
                        borderTop: '2px solid #fff',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                      }}></div>
                      Adding...
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: '16px' }}>+</span>
                      Add Category
                    </>
                  )}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

    {/* Nutrition Tracking Modal */}
    <NutritionTrackingModal
      isOpen={nutritionModal.open}
      onClose={() => setNutritionModal({ open: false, careTaskLogId: null, careTaskName: '', nutritionData: null })}
      careTaskLogId={nutritionModal.careTaskLogId}
      careTaskName={nutritionModal.careTaskName}
      nutritionData={nutritionModal.nutritionData}
      onSave={(result) => {
        console.log('Nutrition data saved:', result);
        // Refresh the scheduled tasks to update the view
        fetchScheduledTasks();
      }}
    />
    </>
  );
};

export default CareTaskModal;
