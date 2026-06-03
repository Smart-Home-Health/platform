/*
 * Smart Home Health Hub
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
import config from '../../config';
import { patientService } from '../../services/patients';

const AdminCareTasks = () => {
  const [careTasks, setCareTasks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active'); // 'active', 'inactive', 'categories'
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAddCategoryForm, setShowAddCategoryForm] = useState(false);
  const [error, setError] = useState(null);
  
  // Add count state variables
  const [activeCareTasksCount, setActiveCareTasksCount] = useState(0);
  const [inactiveCareTasksCount, setInactiveCareTasksCount] = useState(0);
  
  // Current patient tracking for auto-refresh
  const [currentPatient, setCurrentPatient] = useState(null);
  
  const [newCareTask, setNewCareTask] = useState({
    name: '',
    description: '',
    category_id: '',
    estimated_duration_minutes: 30,
    instructions: '',
    notes: ''
  });

  const [newCategory, setNewCategory] = useState({
    name: '',
    description: '',
    color: '#007acc'
  });

  useEffect(() => {
    fetchCurrentPatient();
    fetchData();
    fetchCategories();
    fetchCounts();
  }, [activeTab]);

  // Auto-refresh data when current patient changes
  useEffect(() => {
    if (currentPatient) {
      fetchData();
      fetchCounts();
    }
  }, [currentPatient]);

  // Poll for current patient changes every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchCurrentPatient();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const fetchCurrentPatient = async () => {
    try {
      const newCurrentPatient = await patientService.getCurrentPatient();
      // Only update state if patient actually changed
      if (!currentPatient || currentPatient.id !== newCurrentPatient.id) {
        setCurrentPatient(newCurrentPatient);
      }
    } catch (error) {
      console.error('Error fetching current patient:', error);
    }
  };



  const fetchCounts = async () => {
    try {
      // Use current patient for filtering (relying on backend's get_current_patient)
      const activeResponse = await fetch(`${config.apiUrl}/api/care-tasks/active`);
      const inactiveResponse = await fetch(`${config.apiUrl}/api/care-tasks/inactive`);
      
      if (activeResponse.ok) {
        const activeData = await activeResponse.json();
        setActiveCareTasksCount(activeData.care_tasks?.length || 0);
      }
      
      if (inactiveResponse.ok) {
        const inactiveData = await inactiveResponse.json();
        setInactiveCareTasksCount(inactiveData.care_tasks?.length || 0);
      }
    } catch (error) {
      console.error('Error fetching care task counts:', error);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Use current patient endpoints (backend will use get_current_patient)
      const endpoint = activeTab === 'active' ? '/api/care-tasks/active' : '/api/care-tasks/inactive';
      const response = await fetch(`${config.apiUrl}${endpoint}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setCareTasks(data.care_tasks || []);
    } catch (error) {
      console.error('Error fetching care tasks:', error);
      setError(`Failed to fetch care tasks: ${error.message}`);
      setCareTasks([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/care-task-categories`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setCategories(data.categories || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
      setCategories([]);
    }
  };

  const handleAddCareTask = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${config.apiUrl}/api/add/care-task`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newCareTask),
      });

      if (response.ok) {
        setShowAddForm(false);
        setNewCareTask({
          name: '',
          description: '',
          category_id: '',
          estimated_duration_minutes: 30,
          instructions: '',
          notes: ''
        });
        fetchData();
        fetchCounts();
      } else {
        console.error('Failed to add care task');
      }
    } catch (error) {
      console.error('Error adding care task:', error);
    }
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${config.apiUrl}/api/add/care-task-category`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newCategory),
      });

      if (response.ok) {
        setShowAddCategoryForm(false);
        setNewCategory({
          name: '',
          description: '',
          color: '#007acc'
        });
        fetchCategories();
      } else {
        console.error('Failed to add category');
      }
    } catch (error) {
      console.error('Error adding category:', error);
    }
  };

  const handleToggleActive = async (taskId) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/care-tasks/${taskId}/toggle-active`, {
        method: 'POST',
      });

      if (response.ok) {
        fetchData();
        fetchCounts();
      } else {
        console.error('Failed to toggle care task status');
      }
    } catch (error) {
      console.error('Error toggling care task status:', error);
    }
  };

  const handleDeleteCareTask = async (taskId) => {
    if (window.confirm('Are you sure you want to delete this care task?')) {
      try {
        const response = await fetch(`${config.apiUrl}/api/care-tasks/${taskId}`, {
          method: 'DELETE',
        });

        if (response.ok) {
          fetchData();
          fetchCounts();
        } else {
          console.error('Failed to delete care task');
        }
      } catch (error) {
        console.error('Error deleting care task:', error);
      }
    }
  };

  const handleDeleteCategory = async (categoryId) => {
    if (window.confirm('Are you sure you want to delete this category? This will affect all care tasks using this category.')) {
      try {
        const response = await fetch(`${config.apiUrl}/api/care-task-categories/${categoryId}`, {
          method: 'DELETE',
        });

        if (response.ok) {
          fetchCategories();
        } else {
          console.error('Failed to delete category');
        }
      } catch (error) {
        console.error('Error deleting category:', error);
      }
    }
  };

  const getCategoryName = (categoryId) => {
    const category = categories.find(cat => cat.id === categoryId);
    return category ? category.name : 'Unknown';
  };

  const getCategoryColor = (categoryId) => {
    const category = categories.find(cat => cat.id === categoryId);
    return category ? category.color : '#666';
  };

  if (loading) {
    return <div className="admin-page">
      <div className="loading">Loading care tasks...</div>
    </div>;
  }

  return (
    <div className="admin-page" style={{ margin: '2rem' }}>
      <div className="admin-page-header">
        <h1 className="admin-page-title">Care Task Management</h1>
        <p className="admin-page-description">
          Manage care tasks, categories, and scheduling
        </p>
      </div>

      <div className="admin-section" style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <div className="admin-section-header">
          <h2 className="admin-section-title">Care Tasks</h2>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div className="tab-buttons" style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                className={`btn ${activeTab === 'active' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('active')}
              >
                Active ({activeCareTasksCount})
              </button>
              <button 
                className={`btn ${activeTab === 'inactive' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('inactive')}
              >
                Inactive ({inactiveCareTasksCount})
              </button>
              <button 
                className={`btn ${activeTab === 'categories' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('categories')}
              >
                Categories ({categories.length})
              </button>
            </div>
            {activeTab === 'categories' ? (
              <button 
                className="btn btn-success"
                onClick={() => setShowAddCategoryForm(true)}
              >
                + Add Category
              </button>
            ) : (
              <button 
                className="btn btn-success"
                onClick={() => setShowAddForm(true)}
              >
                + Add Care Task
              </button>
            )}
          </div>
        </div>

        <div className="admin-section-content">
          {showAddForm && (
            <div style={{ 
              marginBottom: '3rem',
              background: '#ffffff',
              border: '1px solid #e9ecef',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{
                background: '#f8f9fa',
                padding: '1.5rem 2rem',
                borderBottom: '1px solid #e9ecef'
              }}>
                <h3 style={{
                  margin: 0,
                  color: '#2c3e50',
                  fontSize: '1.25rem',
                  fontWeight: '600'
                }}>
                  Add New Care Task
                </h3>
              </div>
              
              <form onSubmit={handleAddCareTask} style={{ padding: '2rem' }}>
                {/* Basic Information Section */}
                <div style={{ marginBottom: '2.5rem' }}>
                  <h4 style={{ 
                    margin: '0 0 1.5rem 0',
                    color: '#495057',
                    fontSize: '1rem',
                    fontWeight: '600',
                    borderBottom: '2px solid #e9ecef',
                    paddingBottom: '0.5rem'
                  }}>
                    Basic Information
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '2rem' }}>
                    <div>
                      <label style={{ 
                        display: 'block', 
                        marginBottom: '0.75rem', 
                        fontWeight: '600',
                        color: '#495057'
                      }}>
                        Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={newCareTask.name}
                        onChange={(e) => setNewCareTask({ ...newCareTask, name: e.target.value })}
                        style={{ 
                          width: '100%', 
                          padding: '0.75rem', 
                          border: '1px solid #ced4da', 
                          borderRadius: '6px',
                          fontSize: '1rem',
                          backgroundColor: '#ffffff',
                          color: '#495057',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ 
                        display: 'block', 
                        marginBottom: '0.75rem', 
                        fontWeight: '600',
                        color: '#495057'
                      }}>
                        Category
                      </label>
                      <select
                        value={newCareTask.category_id}
                        onChange={(e) => setNewCareTask({ ...newCareTask, category_id: e.target.value })}
                        style={{ 
                          width: '100%', 
                          padding: '0.75rem', 
                          border: '1px solid #ced4da', 
                          borderRadius: '6px',
                          fontSize: '1rem',
                          backgroundColor: '#ffffff',
                          color: '#495057',
                          boxSizing: 'border-box'
                        }}
                      >
                        <option value="">Select Category</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ 
                        display: 'block', 
                        marginBottom: '0.75rem', 
                        fontWeight: '600',
                        color: '#495057'
                      }}>
                        Duration (minutes)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={newCareTask.estimated_duration_minutes}
                        onChange={(e) => setNewCareTask({ ...newCareTask, estimated_duration_minutes: parseInt(e.target.value) })}
                        style={{ 
                          width: '100%', 
                          padding: '0.75rem', 
                          border: '1px solid #ced4da', 
                          borderRadius: '6px',
                          fontSize: '1rem',
                          backgroundColor: '#ffffff',
                          color: '#495057',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>
                </div>
                
                {/* Detailed Information Section */}
                <div style={{ marginBottom: '2rem' }}>
                  <h4 style={{ 
                    margin: '0 0 1.5rem 0',
                    color: '#495057',
                    fontSize: '1rem',
                    fontWeight: '600',
                    borderBottom: '2px solid #e9ecef',
                    paddingBottom: '0.5rem'
                  }}>
                    Detailed Information
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
                    <div>
                      <label style={{ 
                        display: 'block', 
                        marginBottom: '0.75rem', 
                        fontWeight: '600',
                        color: '#495057'
                      }}>
                        Description
                      </label>
                      <textarea
                        value={newCareTask.description}
                        onChange={(e) => setNewCareTask({ ...newCareTask, description: e.target.value })}
                        style={{ 
                          width: '100%', 
                          padding: '0.75rem', 
                          border: '1px solid #ced4da', 
                          borderRadius: '6px',
                          fontSize: '1rem',
                          backgroundColor: '#ffffff',
                          color: '#495057',
                          boxSizing: 'border-box',
                          minHeight: '80px',
                          resize: 'vertical'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ 
                        display: 'block', 
                        marginBottom: '0.75rem', 
                        fontWeight: '600',
                        color: '#495057'
                      }}>
                        Instructions
                      </label>
                      <textarea
                        value={newCareTask.instructions}
                        onChange={(e) => setNewCareTask({ ...newCareTask, instructions: e.target.value })}
                        style={{ 
                          width: '100%', 
                          padding: '0.75rem', 
                          border: '1px solid #ced4da', 
                          borderRadius: '6px',
                          fontSize: '1rem',
                          backgroundColor: '#ffffff',
                          color: '#495057',
                          boxSizing: 'border-box',
                          minHeight: '100px',
                          resize: 'vertical'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ 
                        display: 'block', 
                        marginBottom: '0.75rem', 
                        fontWeight: '600',
                        color: '#495057'
                      }}>
                        Notes
                      </label>
                      <textarea
                        value={newCareTask.notes}
                        onChange={(e) => setNewCareTask({ ...newCareTask, notes: e.target.value })}
                        style={{ 
                          width: '100%', 
                          padding: '0.75rem', 
                          border: '1px solid #ced4da', 
                          borderRadius: '6px',
                          fontSize: '1rem',
                          backgroundColor: '#ffffff',
                          color: '#495057',
                          boxSizing: 'border-box',
                          minHeight: '60px',
                          resize: 'vertical'
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ 
                  display: 'flex', 
                  gap: '1rem', 
                  justifyContent: 'flex-end',
                  paddingTop: '1.5rem',
                  borderTop: '1px solid #e9ecef'
                }}>
                  <button 
                    type="button" 
                    onClick={() => setShowAddForm(false)}
                    style={{
                      padding: '0.75rem 1.5rem',
                      border: '1px solid #6c757d',
                      borderRadius: '6px',
                      background: '#6c757d',
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      fontWeight: '500',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => e.target.style.background = '#5a6268'}
                    onMouseLeave={(e) => e.target.style.background = '#6c757d'}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    style={{
                      padding: '0.75rem 1.5rem',
                      border: '1px solid #28a745',
                      borderRadius: '6px',
                      background: '#28a745',
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      fontWeight: '500',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => e.target.style.background = '#218838'}
                    onMouseLeave={(e) => e.target.style.background = '#28a745'}
                  >
                    Add Care Task
                  </button>
                </div>
              </form>
            </div>
          )}

          {showAddCategoryForm && (
            <div style={{ 
              marginBottom: '3rem',
              background: '#ffffff',
              border: '1px solid #e9ecef',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{
                background: '#f8f9fa',
                padding: '1.5rem 2rem',
                borderBottom: '1px solid #e9ecef'
              }}>
                <h3 style={{
                  margin: 0,
                  color: '#2c3e50',
                  fontSize: '1.25rem',
                  fontWeight: '600'
                }}>
                  Add New Category
                </h3>
              </div>
              
              <form onSubmit={handleAddCategory} style={{ padding: '2rem' }}>
                {/* Basic Information Section */}
                <div style={{ marginBottom: '2rem' }}>
                  <h4 style={{ 
                    margin: '0 0 1.5rem 0',
                    color: '#495057',
                    fontSize: '1rem',
                    fontWeight: '600',
                    borderBottom: '2px solid #e9ecef',
                    paddingBottom: '0.5rem'
                  }}>
                    Category Details
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                    <div>
                      <label style={{ 
                        display: 'block', 
                        marginBottom: '0.75rem', 
                        fontWeight: '600',
                        color: '#495057'
                      }}>
                        Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={newCategory.name}
                        onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                        style={{ 
                          width: '100%', 
                          padding: '0.75rem', 
                          border: '1px solid #ced4da', 
                          borderRadius: '6px',
                          fontSize: '1rem',
                          backgroundColor: '#ffffff',
                          color: '#495057',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ 
                        display: 'block', 
                        marginBottom: '0.75rem', 
                        fontWeight: '600',
                        color: '#495057'
                      }}>
                        Color
                      </label>
                      <input
                        type="color"
                        value={newCategory.color}
                        onChange={(e) => setNewCategory({ ...newCategory, color: e.target.value })}
                        style={{ 
                          width: '100%', 
                          padding: '0.75rem', 
                          border: '1px solid #ced4da', 
                          borderRadius: '6px',
                          fontSize: '1rem',
                          backgroundColor: '#ffffff',
                          color: '#495057',
                          boxSizing: 'border-box',
                          height: '50px'
                        }}
                      />
                    </div>
                  </div>
                </div>
                
                <div style={{ marginBottom: '2rem' }}>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '0.75rem', 
                    fontWeight: '600',
                    color: '#495057'
                  }}>
                    Description
                  </label>
                  <textarea
                    value={newCategory.description}
                    onChange={(e) => setNewCategory({ ...newCategory, description: e.target.value })}
                    style={{ 
                      width: '100%', 
                      padding: '0.75rem', 
                      border: '1px solid #ced4da', 
                      borderRadius: '6px',
                      fontSize: '1rem',
                      backgroundColor: '#ffffff',
                      color: '#495057',
                      boxSizing: 'border-box',
                      minHeight: '80px',
                      resize: 'vertical'
                    }}
                  />
                </div>

                <div style={{ 
                  display: 'flex', 
                  gap: '1rem', 
                  justifyContent: 'flex-end',
                  paddingTop: '1.5rem',
                  borderTop: '1px solid #e9ecef'
                }}>
                  <button 
                    type="button" 
                    onClick={() => setShowAddCategoryForm(false)}
                    style={{
                      padding: '0.75rem 1.5rem',
                      border: '1px solid #6c757d',
                      borderRadius: '6px',
                      background: '#6c757d',
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      fontWeight: '500',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => e.target.style.background = '#5a6268'}
                    onMouseLeave={(e) => e.target.style.background = '#6c757d'}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    style={{
                      padding: '0.75rem 1.5rem',
                      border: '1px solid #28a745',
                      borderRadius: '6px',
                      background: '#28a745',
                      color: 'white',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      fontWeight: '500',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => e.target.style.background = '#218838'}
                    onMouseLeave={(e) => e.target.style.background = '#28a745'}
                  >
                    Add Category
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'categories' ? (
            <div className="admin-grid">
              {categories.map((category) => (
                <div key={category.id} className="admin-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                    <div 
                      style={{ 
                        width: '20px', 
                        height: '20px', 
                        backgroundColor: category.color, 
                        borderRadius: '4px' 
                      }}
                    ></div>
                    <h3 className="admin-card-title" style={{ margin: 0 }}>
                      {category.name}
                    </h3>
                  </div>
                  <p style={{ color: '#666', marginBottom: '1rem' }}>
                    {category.description || 'No description available'}
                  </p>
                  <div className="admin-actions">
                    <button 
                      className="btn btn-danger"
                      onClick={() => handleDeleteCategory(category.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ 
              background: '#ffffff', 
              borderRadius: '12px', 
              overflow: 'hidden',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e9ecef'
            }}>
              <table style={{ 
                width: '100%', 
                borderCollapse: 'collapse',
                fontSize: '0.9rem'
              }}>
                <thead>
                  <tr style={{ background: '#f8f9fa' }}>
                    <th style={{ 
                      padding: '1rem', 
                      textAlign: 'left', 
                      fontWeight: '600',
                      color: '#2c3e50',
                      borderBottom: '1px solid #e9ecef',
                      fontSize: '0.85rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Name
                    </th>
                    <th style={{ 
                      padding: '1rem', 
                      textAlign: 'left', 
                      fontWeight: '600',
                      color: '#2c3e50',
                      borderBottom: '1px solid #e9ecef',
                      fontSize: '0.85rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Category
                    </th>
                    <th style={{ 
                      padding: '1rem', 
                      textAlign: 'left', 
                      fontWeight: '600',
                      color: '#2c3e50',
                      borderBottom: '1px solid #e9ecef',
                      fontSize: '0.85rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Duration
                    </th>
                    <th style={{ 
                      padding: '1rem', 
                      textAlign: 'left', 
                      fontWeight: '600',
                      color: '#2c3e50',
                      borderBottom: '1px solid #e9ecef',
                      fontSize: '0.85rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Description
                    </th>
                    <th style={{ 
                      padding: '1rem', 
                      textAlign: 'left', 
                      fontWeight: '600',
                      color: '#2c3e50',
                      borderBottom: '1px solid #e9ecef',
                      fontSize: '0.85rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Status
                    </th>
                    <th style={{ 
                      padding: '1rem', 
                      textAlign: 'left', 
                      fontWeight: '600',
                      color: '#2c3e50',
                      borderBottom: '1px solid #e9ecef',
                      fontSize: '0.85rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {careTasks.map((task, index) => (
                    <tr key={task.id} style={{ 
                      backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8f9fa',
                      transition: 'background-color 0.2s ease'
                    }}>
                      <td style={{ 
                        fontWeight: '600', 
                        padding: '1rem',
                        borderBottom: '1px solid #e9ecef',
                        color: '#2c3e50'
                      }}>
                        {task.name}
                      </td>
                      <td style={{ 
                        padding: '1rem',
                        borderBottom: '1px solid #e9ecef',
                        color: '#7f8c8d'
                      }}>
                        {task.category_id && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div 
                              style={{ 
                                width: '12px', 
                                height: '12px', 
                                backgroundColor: getCategoryColor(task.category_id), 
                                borderRadius: '2px' 
                              }}
                            ></div>
                            {getCategoryName(task.category_id)}
                          </div>
                        )}
                      </td>
                      <td style={{ 
                        padding: '1rem',
                        borderBottom: '1px solid #e9ecef',
                        color: '#7f8c8d'
                      }}>
                        {task.estimated_duration_minutes} min
                      </td>
                      <td style={{ 
                        maxWidth: '200px', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis',
                        padding: '1rem',
                        borderBottom: '1px solid #e9ecef',
                        color: '#7f8c8d'
                      }}>
                        {task.description}
                      </td>
                      <td style={{ 
                        padding: '1rem',
                        borderBottom: '1px solid #e9ecef'
                      }}>
                        <span style={{
                          padding: '4px 12px',
                          borderRadius: '20px',
                          fontSize: '0.8rem',
                          fontWeight: '500',
                          backgroundColor: task.active ? '#d4edda' : '#f8d7da',
                          color: task.active ? '#155724' : '#721c24',
                          border: `1px solid ${task.active ? '#c3e6cb' : '#f5c6cb'}`
                        }}>
                          {task.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ 
                        padding: '1rem',
                        borderBottom: '1px solid #e9ecef'
                      }}>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button 
                            onClick={() => handleToggleActive(task.id)}
                            style={{
                              padding: '8px',
                              border: 'none',
                              borderRadius: '6px',
                              background: task.active ? '#ffc107' : '#28a745',
                              color: 'white',
                              cursor: 'pointer',
                              fontSize: '14px',
                              transition: 'all 0.2s ease',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '32px',
                              height: '32px'
                            }}
                            onMouseEnter={(e) => e.target.style.background = task.active ? '#e0a800' : '#218838'}
                            onMouseLeave={(e) => e.target.style.background = task.active ? '#ffc107' : '#28a745'}
                            title={task.active ? 'Deactivate' : 'Activate'}
                          >
                            {task.active ? '⏸️' : '▶️'}
                          </button>
                          <button 
                            onClick={() => handleDeleteCareTask(task.id)}
                            style={{
                              padding: '8px',
                              border: 'none',
                              borderRadius: '6px',
                              background: '#dc3545',
                              color: 'white',
                              cursor: 'pointer',
                              fontSize: '14px',
                              transition: 'all 0.2s ease',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '32px',
                              height: '32px'
                            }}
                            onMouseEnter={(e) => e.target.style.background = '#c82333'}
                            onMouseLeave={(e) => e.target.style.background = '#dc3545'}
                            title="Delete"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {careTasks.length === 0 && activeTab !== 'categories' && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
              No {activeTab} care tasks found.
            </div>
          )}

          {categories.length === 0 && activeTab === 'categories' && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
              No categories found. Add a category to organize your care tasks.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminCareTasks;
