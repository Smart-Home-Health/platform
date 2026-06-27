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
  TasksIcon,
  ClockIcon,
  CheckIcon,
  PauseIcon,
  ClipboardListIcon
} from '../../components/Icons';
import { localTimeToUTC, localTimeAndDaysToUTC } from '../../utils/timezone';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { Field, FormRow } from '@/components/ui/field';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import './AdminV2.css';

const CATEGORY_COLOR_PRESETS = ['#a371f7', '#f78166', '#7ee787', '#58a6ff', '#d2a8ff', '#ff7b72', '#ffa657', '#79c0ff'];

// Shared Create/Edit care-task form body (edit adds the Status select). Module
// scope so it isn't recreated each render — a nested component drops input focus.
function CareTaskFormFields({ formData, setFormData, categories, showStatus }) {
  return (
    <>
      <Field label="Task Name" required htmlFor="ct-name">
        <Input
          id="ct-name"
          value={formData.name}
          onChange={e => setFormData({ ...formData, name: e.target.value })}
          required
          placeholder="e.g., Check blood pressure"
        />
      </Field>

      <Field label="Category">
        <Select
          value={formData.category_id ? String(formData.category_id) : '__none__'}
          onValueChange={(v) => setFormData({ ...formData, category_id: v === '__none__' ? '' : v })}
        >
          <SelectTrigger><SelectValue placeholder="-- No Category --" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">-- No Category --</SelectItem>
            {categories.filter(c => c.active).map(cat => (
              <SelectItem key={cat.id} value={String(cat.id)}>{cat.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Description" htmlFor="ct-desc">
        <Textarea
          id="ct-desc"
          value={formData.description}
          onChange={e => setFormData({ ...formData, description: e.target.value })}
          placeholder="Optional details about this task..."
          rows={3}
        />
      </Field>

      {showStatus && (
        <Field label="Status">
          <Select
            value={formData.active ? 'active' : 'inactive'}
            onValueChange={(v) => setFormData({ ...formData, active: v === 'active' })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Paused</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      )}
    </>
  );
}

// Shared Create/Edit category form body (name, description, colour picker).
function CategoryFormFields({ categoryFormData, setCategoryFormData }) {
  return (
    <>
      <Field label="Category Name" required htmlFor="cat-name">
        <Input
          id="cat-name"
          value={categoryFormData.name}
          onChange={e => setCategoryFormData({ ...categoryFormData, name: e.target.value })}
          required
          placeholder="e.g., Wound Care, Monitoring"
        />
      </Field>

      <Field label="Description" htmlFor="cat-desc">
        <Textarea
          id="cat-desc"
          value={categoryFormData.description}
          onChange={e => setCategoryFormData({ ...categoryFormData, description: e.target.value })}
          placeholder="Optional description..."
          rows={2}
        />
      </Field>

      <Field label="Color">
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={categoryFormData.color}
            onChange={e => setCategoryFormData({ ...categoryFormData, color: e.target.value })}
            className="h-9 w-12 cursor-pointer rounded-md border border-border bg-transparent p-0"
          />
          <Input
            value={categoryFormData.color}
            onChange={e => setCategoryFormData({ ...categoryFormData, color: e.target.value })}
            placeholder="#a371f7"
            pattern="^#[0-9A-Fa-f]{6}$"
            className="flex-1"
          />
          <span
            className="h-6 w-6 shrink-0 rounded-full border-2 border-border"
            style={{ backgroundColor: categoryFormData.color }}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {CATEGORY_COLOR_PRESETS.map(color => (
            <button
              key={color}
              type="button"
              onClick={() => setCategoryFormData({ ...categoryFormData, color })}
              className="h-7 w-7 cursor-pointer rounded-full p-0"
              style={{
                backgroundColor: color,
                border: categoryFormData.color === color ? '3px solid #f0f6fc' : '2px solid var(--border)',
              }}
            />
          ))}
        </div>
      </Field>
    </>
  );
}

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
            {error && (
              <div className="tw mb-4"><Alert variant="destructive">{error}</Alert></div>
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
            <div className="tw admin-v2-action-row mb-6 flex flex-wrap gap-4">
              {hasPermission('care_tasks.create') && (
                <Button onClick={openCreateModal}>
                  <PlusIcon size={16} /> Add Care Task
                </Button>
              )}
              <Button
                onClick={() => setShowCategorySection(!showCategorySection)}
                style={{ backgroundColor: '#a371f7', borderColor: '#a371f7', color: 'white' }}
              >
                {showCategorySection ? 'Hide Categories' : 'Manage Categories'}
              </Button>
            </div>

            {/* Categories Management Section */}
            {showCategorySection && (
              <div className="admin-v2-categories-section" style={{ 
                marginBottom: '2rem',
                padding: '1.5rem',
                background: 'var(--card)',
                borderRadius: '8px',
                border: '1px solid var(--border)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0, color: '#f0f6fc' }}>Care Task Categories</h3>
                  <div className="tw">
                    <Button size="sm" onClick={openCreateCategoryModal}>
                      <PlusIcon size={14} /> Add Category
                    </Button>
                  </div>
                </div>

                {categories.length === 0 ? (
                  <p style={{ color: 'var(--muted-foreground)', margin: 0 }}>No categories created yet.</p>
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
                          background: 'var(--secondary)',
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
                                  background: 'var(--border)',
                                  padding: '2px 6px',
                                  borderRadius: '10px',
                                  color: 'var(--muted-foreground)'
                                }}>Default</span>
                              )}
                            </div>
                            {cat.description && (
                              <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--muted-foreground)' }}>
                                {cat.description}
                              </p>
                            )}
                            <span style={{ fontSize: '0.8rem', color: 'var(--muted-foreground)' }}>
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
                  <div className="tw">
                    <Button onClick={openCreateModal}>
                      <PlusIcon size={16} /> Add First Care Task
                    </Button>
                  </div>
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

        {/* Create Care Task Dialog */}
        <Dialog open={showCreateModal} onOpenChange={(o) => { if (!o) setShowCreateModal(false); }}>
          <DialogContent className="sm:max-w-[560px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Add Care Task</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateTask} className="flex flex-col gap-4">
              {formError && <Alert variant="destructive">{formError}</Alert>}
              <CareTaskFormFields formData={formData} setFormData={setFormData} categories={categories} />
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Add Care Task'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit Care Task Dialog */}
        <Dialog open={showEditModal && !!selectedTask} onOpenChange={(o) => { if (!o) setShowEditModal(false); }}>
          <DialogContent className="sm:max-w-[560px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Edit Care Task{selectedTask ? `: ${selectedTask.name}` : ''}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUpdateTask} className="flex flex-col gap-4">
              {formError && <Alert variant="destructive">{formError}</Alert>}
              <CareTaskFormFields formData={formData} setFormData={setFormData} categories={categories} showStatus />
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setShowEditModal(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={showDeleteModal && !!selectedTask} onOpenChange={(o) => { if (!o) setShowDeleteModal(false); }}>
          <DialogContent className="sm:max-w-[440px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Delete Care Task</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-foreground">Are you sure you want to delete <strong>{selectedTask?.name}</strong>?</p>
              <p className="text-muted-foreground">
                This will also delete all schedules and completion history for this task. This action cannot be undone.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
              <Button type="button" variant="destructive" onClick={handleDeleteTask} disabled={saving}>
                {saving ? 'Deleting...' : 'Delete Task'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Schedule Dialog */}
        <Dialog open={showScheduleModal && !!selectedTask} onOpenChange={(o) => { if (!o) setShowScheduleModal(false); }}>
          <DialogContent className="sm:max-w-[640px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Schedule{selectedTask ? `: ${selectedTask.name}` : ''}</DialogTitle>
            </DialogHeader>

            {selectedTask && (
              <div className="flex flex-col gap-4">
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
                <h4 className="text-sm font-semibold text-foreground">Add New Schedule</h4>

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={scheduleMode === 'weekly' ? 'default' : 'secondary'}
                    onClick={() => setScheduleMode('weekly')}
                  >
                    Weekly
                  </Button>
                  <Button
                    type="button"
                    variant={scheduleMode === 'monthly' ? 'default' : 'secondary'}
                    onClick={() => setScheduleMode('monthly')}
                  >
                    Monthly
                  </Button>
                </div>

                {scheduleMode === 'weekly' && (
                  <Field label="Select Days">
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
                  </Field>
                )}

                {scheduleMode === 'monthly' && (
                  <Field label="Day of Month">
                    <Select
                      value={String(selectedDayOfMonth)}
                      onValueChange={(v) => setSelectedDayOfMonth(parseInt(v))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {[...Array(28)].map((_, i) => (
                          <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}

                <Field label="Time" htmlFor="ct-sched-time">
                  <Input
                    id="ct-sched-time"
                    type="time"
                    value={scheduleTime}
                    onChange={e => setScheduleTime(e.target.value)}
                  />
                </Field>

                {/* Nutrition Fields - Only show for nutrition-related tasks */}
                {isNutritionTask(selectedTask) && (
                  <div className="flex flex-col gap-4 border-t border-border pt-4">
                    <div>
                      <h4 className="text-sm font-semibold text-[#58a6ff]">🍽️ Nutrition Information</h4>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Pre-fill nutrition details for this scheduled task. This data will be used when marking the task complete.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <Field label="Type">
                        <Select
                          value={nutritionData.item_type}
                          onValueChange={(v) => setNutritionData({ ...nutritionData, item_type: v })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="liquid">Liquid/Drink</SelectItem>
                            <SelectItem value="food">Food</SelectItem>
                            <SelectItem value="supplement">Supplement</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Item Name" required htmlFor="ct-nut-name" className="sm:col-span-2">
                        <Input
                          id="ct-nut-name"
                          value={nutritionData.item_name}
                          onChange={e => setNutritionData({ ...nutritionData, item_name: e.target.value })}
                          placeholder="e.g., Peptamen, Water, Chicken Soup"
                        />
                      </Field>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <Field label="Amount" required htmlFor="ct-nut-amount">
                        <Input
                          id="ct-nut-amount"
                          type="number"
                          value={nutritionData.amount}
                          onChange={e => setNutritionData({ ...nutritionData, amount: e.target.value })}
                          placeholder="250"
                        />
                      </Field>
                      <Field label="Unit">
                        <Select
                          value={nutritionData.amount_unit}
                          onValueChange={(v) => setNutritionData({ ...nutritionData, amount_unit: v })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ml">ml</SelectItem>
                            <SelectItem value="oz">oz</SelectItem>
                            <SelectItem value="cups">cups</SelectItem>
                            <SelectItem value="grams">grams</SelectItem>
                            <SelectItem value="servings">servings</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <Field label="Calories" htmlFor="ct-nut-cal">
                        <Input
                          id="ct-nut-cal"
                          type="number"
                          value={nutritionData.calories}
                          onChange={e => setNutritionData({ ...nutritionData, calories: e.target.value })}
                          placeholder="375"
                        />
                      </Field>
                    </div>

                    <Field label="Notes" htmlFor="ct-nut-notes">
                      <Textarea
                        id="ct-nut-notes"
                        value={nutritionData.notes}
                        onChange={e => setNutritionData({ ...nutritionData, notes: e.target.value })}
                        placeholder="Additional notes about this nutrition item..."
                        rows={2}
                      />
                    </Field>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setShowScheduleModal(false)}>Close</Button>
              <Button
                type="button"
                onClick={handleAddSchedule}
                disabled={scheduleSaving || (scheduleMode === 'weekly' && selectedDays.length === 0)}
              >
                {scheduleSaving ? 'Adding...' : 'Add Schedule'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create Category Dialog */}
        <Dialog open={showCreateCategoryModal} onOpenChange={(o) => { if (!o) setShowCreateCategoryModal(false); }}>
          <DialogContent className="sm:max-w-[480px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Add Category</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateCategory} className="flex flex-col gap-4">
              {categoryError && <Alert variant="destructive">{categoryError}</Alert>}
              <CategoryFormFields categoryFormData={categoryFormData} setCategoryFormData={setCategoryFormData} />
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setShowCreateCategoryModal(false)}>Cancel</Button>
                <Button type="submit" disabled={categorySaving}>{categorySaving ? 'Creating...' : 'Add Category'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit Category Dialog */}
        <Dialog open={showEditCategoryModal && !!selectedCategory} onOpenChange={(o) => { if (!o) setShowEditCategoryModal(false); }}>
          <DialogContent className="sm:max-w-[480px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Edit Category</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUpdateCategory} className="flex flex-col gap-4">
              {categoryError && <Alert variant="destructive">{categoryError}</Alert>}
              <CategoryFormFields categoryFormData={categoryFormData} setCategoryFormData={setCategoryFormData} />
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setShowEditCategoryModal(false)}>Cancel</Button>
                <Button type="submit" disabled={categorySaving}>{categorySaving ? 'Saving...' : 'Save Changes'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Category Confirmation Dialog */}
        <Dialog open={showDeleteCategoryModal && !!selectedCategory} onOpenChange={(o) => { if (!o) setShowDeleteCategoryModal(false); }}>
          <DialogContent className="sm:max-w-[440px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Delete Category</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-foreground">
                Are you sure you want to delete the category{' '}
                <strong style={{ color: selectedCategory?.color }}>{selectedCategory?.name}</strong>?
              </p>
              {selectedCategory && getCategoryTaskCount(selectedCategory.id) > 0 && (
                <p className="text-[#d29922]">
                  ⚠️ This category has {getCategoryTaskCount(selectedCategory.id)} task(s) assigned. You must reassign or delete those tasks first.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setShowDeleteCategoryModal(false)}>Cancel</Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDeleteCategory}
                disabled={categorySaving || (selectedCategory && getCategoryTaskCount(selectedCategory.id) > 0)}
              >
                {categorySaving ? 'Deleting...' : 'Delete Category'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2CareTasks;
