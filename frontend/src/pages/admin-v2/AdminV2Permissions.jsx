import React, { useState, useEffect } from 'react';
import AdminV2Layout from './AdminV2Layout';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import {
  PlusIcon,
  EditIcon,
  TrashIcon,
  XIcon,
  KeyIcon
} from '../../components/Icons';
import './AdminV2.css';

const AdminV2Permissions = () => {
  const { user } = useAuth();
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedPermission, setSelectedPermission] = useState(null);
  
  // Form states
  const [formData, setFormData] = useState({
    name: '',
    display_name: '',
    description: '',
    category: '',
    is_active: true
  });

  // Category options based on nav sections
  const categories = [
    'patients',
    'medications',
    'care_tasks',
    'equipment',
    'nutrition',
    'providers',
    'businesses',
    'monitoring',
    'vitals',
    'users',
    'roles',
    'settings',
    'audit'
  ];

  useEffect(() => {
    if (user) {
      fetchPermissions();
    }
  }, [user]);

  const fetchPermissions = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${config.apiUrl}/api/users/permissions`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setPermissions(data);
      } else {
        setError('Failed to load permissions');
      }
    } catch (err) {
      setError('Error connecting to server');
      console.error('Error fetching permissions:', err);
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setFormData({
      name: '',
      display_name: '',
      description: '',
      category: categories[0],
      is_active: true
    });
    setShowCreateModal(true);
  };

  const openEditModal = (permission) => {
    setSelectedPermission(permission);
    setFormData({
      name: permission.name,
      display_name: permission.display_name,
      description: permission.description || '',
      category: permission.category,
      is_active: permission.is_active
    });
    setShowEditModal(true);
  };

  const openDeleteModal = (permission) => {
    setSelectedPermission(permission);
    setShowDeleteModal(true);
  };

  const handleCreatePermission = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${config.apiUrl}/api/users/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData)
      });
      
      if (response.ok) {
        setShowCreateModal(false);
        fetchPermissions();
      } else {
        const data = await response.json();
        setError(data.detail || 'Failed to create permission');
      }
    } catch (err) {
      setError('Error creating permission');
      console.error('Error:', err);
    }
  };

  const handleUpdatePermission = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${config.apiUrl}/api/users/permissions/${selectedPermission.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData)
      });
      
      if (response.ok) {
        setShowEditModal(false);
        fetchPermissions();
      } else {
        const data = await response.json();
        setError(data.detail || 'Failed to update permission');
      }
    } catch (err) {
      setError('Error updating permission');
      console.error('Error:', err);
    }
  };

  const handleDeletePermission = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/users/permissions/${selectedPermission.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      
      if (response.ok) {
        setShowDeleteModal(false);
        fetchPermissions();
      } else {
        const data = await response.json();
        setError(data.detail || 'Failed to delete permission');
      }
    } catch (err) {
      setError('Error deleting permission');
      console.error('Error:', err);
    }
  };

  // Group permissions by category
  const permissionsByCategory = permissions.reduce((acc, perm) => {
    if (!acc[perm.category]) {
      acc[perm.category] = [];
    }
    acc[perm.category].push(perm);
    return acc;
  }, {});

  if (!user) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-loading">Please log in to access permission management...</div>
      </AdminV2Layout>
    );
  }

  if (loading) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-loading">Loading permissions...</div>
      </AdminV2Layout>
    );
  }

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <div className="admin-v2-page-header">
          <div>
            <h1 className="admin-v2-page-title">Permission Management</h1>
            <p className="admin-v2-page-subtitle">Manage system permissions for role-based access control</p>
          </div>
          <button className="admin-v2-btn admin-v2-btn-primary" onClick={openCreateModal}>
            <PlusIcon size={16} />
            Add Permission
          </button>
        </div>

        {error && (
          <div className="admin-v2-alert admin-v2-alert-error">{error}</div>
        )}

        {/* Summary Stats */}
        <div className="admin-v2-stats-row">
          <div className="admin-v2-stat-card">
            <div className="admin-v2-stat-icon admin-v2-stat-icon-info">
              <KeyIcon size={20} />
            </div>
            <div className="admin-v2-stat-content">
              <span className="admin-v2-stat-value">{permissions.length}</span>
              <span className="admin-v2-stat-label">Total Permissions</span>
            </div>
          </div>
          <div className="admin-v2-stat-card">
            <div className="admin-v2-stat-icon admin-v2-stat-icon-success">
              <KeyIcon size={20} />
            </div>
            <div className="admin-v2-stat-content">
              <span className="admin-v2-stat-value">{permissions.filter(p => p.is_active).length}</span>
              <span className="admin-v2-stat-label">Active</span>
            </div>
          </div>
          <div className="admin-v2-stat-card">
            <div className="admin-v2-stat-icon">
              <KeyIcon size={20} />
            </div>
            <div className="admin-v2-stat-content">
              <span className="admin-v2-stat-value">{Object.keys(permissionsByCategory).length}</span>
              <span className="admin-v2-stat-label">Categories</span>
            </div>
          </div>
        </div>

        {/* Permissions Table */}
        <div className="admin-v2-table-container">
          <table className="admin-v2-table">
            <thead>
              <tr>
                <th>PERMISSION</th>
                <th>CATEGORY</th>
                <th>DESCRIPTION</th>
                <th>STATUS</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {permissions.map(permission => (
                <tr key={permission.id}>
                  <td>
                    <div className="admin-v2-permission-info">
                      <span className="admin-v2-permission-name">{permission.display_name}</span>
                      <small className="admin-v2-permission-code">{permission.name}</small>
                    </div>
                  </td>
                  <td>
                    <span className="admin-v2-badge admin-v2-badge-secondary">
                      {permission.category}
                    </span>
                  </td>
                  <td>
                    <span className="admin-v2-text-muted">
                      {permission.description || '—'}
                    </span>
                  </td>
                  <td>
                    <span className={`admin-v2-badge ${permission.is_active ? 'admin-v2-badge-success' : 'admin-v2-badge-secondary'}`}>
                      {permission.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="admin-v2-actions">
                      <button 
                        className="admin-v2-action-btn admin-v2-action-btn-edit"
                        onClick={() => openEditModal(permission)}
                        title="Edit permission"
                      >
                        <EditIcon size={14} />
                        <span>Edit</span>
                      </button>
                      <button 
                        className="admin-v2-action-btn admin-v2-action-btn-delete"
                        onClick={() => openDeleteModal(permission)}
                        title="Delete permission"
                      >
                        <TrashIcon size={14} />
                        <span>Delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {permissions.length === 0 && (
                <tr>
                  <td colSpan="5" className="admin-v2-empty-cell">
                    No permissions found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Permissions by Category */}
        <div className="admin-v2-section">
          <h2>Permissions by Category</h2>
          <div className="admin-v2-permission-categories">
            {Object.entries(permissionsByCategory).map(([category, perms]) => (
              <div key={category} className="admin-v2-category-card">
                <div className="admin-v2-category-header">
                  <h3>{category}</h3>
                  <span className="admin-v2-badge">{perms.length}</span>
                </div>
                <div className="admin-v2-category-permissions">
                  {perms.map(perm => (
                    <div key={perm.id} className="admin-v2-category-permission">
                      <span className={`admin-v2-status-dot ${perm.is_active ? 'active' : 'inactive'}`}></span>
                      <span>{perm.display_name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Create Permission Modal */}
        {showCreateModal && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="admin-v2-modal" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Create Permission</h2>
                <button className="admin-v2-modal-close" onClick={() => setShowCreateModal(false)}>
                  <XIcon size={20} />
                </button>
              </div>
              <form onSubmit={handleCreatePermission}>
                <div className="admin-v2-modal-body">
                  <div className="admin-v2-form-group">
                    <label htmlFor="category">Category</label>
                    <select
                      id="category"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      required
                    >
                      {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div className="admin-v2-form-group">
                    <label htmlFor="name">Permission Code</label>
                    <input
                      type="text"
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g., patients.create"
                      required
                    />
                    <small className="admin-v2-form-hint">Use format: category.action (e.g., patients.create)</small>
                  </div>
                  <div className="admin-v2-form-group">
                    <label htmlFor="display_name">Display Name</label>
                    <input
                      type="text"
                      id="display_name"
                      value={formData.display_name}
                      onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                      placeholder="e.g., Create Patients"
                      required
                    />
                  </div>
                  <div className="admin-v2-form-group">
                    <label htmlFor="description">Description</label>
                    <input
                      type="text"
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Brief description of the permission"
                    />
                  </div>
                </div>
                <div className="admin-v2-modal-footer">
                  <button 
                    type="button" 
                    className="admin-v2-btn admin-v2-btn-secondary"
                    onClick={() => setShowCreateModal(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="admin-v2-btn admin-v2-btn-primary"
                  >
                    Create Permission
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Permission Modal */}
        {showEditModal && selectedPermission && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowEditModal(false)}>
            <div className="admin-v2-modal" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Edit Permission</h2>
                <button className="admin-v2-modal-close" onClick={() => setShowEditModal(false)}>
                  <XIcon size={20} />
                </button>
              </div>
              <form onSubmit={handleUpdatePermission}>
                <div className="admin-v2-modal-body">
                  <div className="admin-v2-form-group">
                    <label htmlFor="edit-category">Category</label>
                    <select
                      id="edit-category"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      required
                    >
                      {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div className="admin-v2-form-group">
                    <label htmlFor="edit-name">Permission Code</label>
                    <input
                      type="text"
                      id="edit-name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="admin-v2-form-group">
                    <label htmlFor="edit-display_name">Display Name</label>
                    <input
                      type="text"
                      id="edit-display_name"
                      value={formData.display_name}
                      onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="admin-v2-form-group">
                    <label htmlFor="edit-description">Description</label>
                    <input
                      type="text"
                      id="edit-description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    />
                  </div>
                  <div className="admin-v2-form-group">
                    <label className="admin-v2-checkbox-label">
                      <input
                        type="checkbox"
                        checked={formData.is_active}
                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      />
                      Active
                    </label>
                  </div>
                </div>
                <div className="admin-v2-modal-footer">
                  <button 
                    type="button" 
                    className="admin-v2-btn admin-v2-btn-secondary"
                    onClick={() => setShowEditModal(false)}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="admin-v2-btn admin-v2-btn-primary"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Permission Modal */}
        {showDeleteModal && selectedPermission && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowDeleteModal(false)}>
            <div className="admin-v2-modal admin-v2-modal-sm" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Delete Permission</h2>
                <button className="admin-v2-modal-close" onClick={() => setShowDeleteModal(false)}>
                  <XIcon size={20} />
                </button>
              </div>
              <div className="admin-v2-modal-body">
                <p>Are you sure you want to delete the permission <strong>{selectedPermission.display_name}</strong>?</p>
                <p className="admin-v2-text-muted">This will remove the permission from all roles that have it assigned.</p>
              </div>
              <div className="admin-v2-modal-footer">
                <button 
                  type="button" 
                  className="admin-v2-btn admin-v2-btn-secondary"
                  onClick={() => setShowDeleteModal(false)}
                >
                  Cancel
                </button>
                <button 
                  type="button" 
                  className="admin-v2-btn admin-v2-btn-danger"
                  onClick={handleDeletePermission}
                >
                  Delete Permission
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Permissions;
