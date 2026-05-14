import React, { useState, useEffect } from 'react';
import AdminV2Layout from './AdminV2Layout';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import {
  PlusIcon,
  EditIcon,
  TrashIcon,
  XIcon,
  ShieldIcon
} from '../../components/Icons';
import './AdminV2.css';

const AdminV2Roles = () => {
  const { user } = useAuth();
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    display_name: '',
    description: '',
    is_active: true,
    permission_ids: []
  });
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      fetchRoles();
      fetchPermissions();
    }
  }, [user]);

  const fetchRoles = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${config.apiUrl}/api/users/roles`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setRoles(data);
      } else {
        setError('Failed to load roles');
      }
    } catch (err) {
      setError('Error connecting to server');
      console.error('Error fetching roles:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPermissions = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/users/permissions`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setPermissions(data);
      }
    } catch (err) {
      console.error('Error fetching permissions:', err);
    }
  };

  const handleCreateRole = async (e) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);

    try {
      const response = await fetch(`${config.apiUrl}/api/users/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        setShowCreateModal(false);
        resetForm();
        fetchRoles();
      } else {
        const data = await response.json();
        setFormError(data.detail || 'Failed to create role');
      }
    } catch (err) {
      setFormError('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateRole = async (e) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);

    try {
      const response = await fetch(`${config.apiUrl}/api/users/roles/${selectedRole.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          display_name: formData.display_name,
          description: formData.description,
          is_active: formData.is_active,
          permission_ids: formData.permission_ids
        })
      });

      if (response.ok) {
        setShowEditModal(false);
        resetForm();
        fetchRoles();
      } else {
        const data = await response.json();
        setFormError(data.detail || 'Failed to update role');
      }
    } catch (err) {
      setFormError('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRole = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/users/roles/${selectedRole.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        setShowDeleteModal(false);
        setSelectedRole(null);
        fetchRoles();
      } else {
        const data = await response.json();
        setFormError(data.detail || 'Failed to delete role');
      }
    } catch (err) {
      setFormError('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (role) => {
    setSelectedRole(role);
    setFormData({
      name: role.name,
      display_name: role.display_name,
      description: role.description || '',
      is_active: role.is_active,
      permission_ids: role.permissions?.map(p => p.id) || []
    });
    setFormError(null);
    setShowEditModal(true);
  };

  const openDeleteModal = (role) => {
    setSelectedRole(role);
    setShowDeleteModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      display_name: '',
      description: '',
      is_active: true,
      permission_ids: []
    });
    setFormError(null);
    setSelectedRole(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const handlePermissionToggle = (permissionId) => {
    setFormData(prev => ({
      ...prev,
      permission_ids: prev.permission_ids.includes(permissionId)
        ? prev.permission_ids.filter(id => id !== permissionId)
        : [...prev.permission_ids, permissionId]
    }));
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
        <div className="admin-v2-loading">Please log in to access role management...</div>
      </AdminV2Layout>
    );
  }

  if (loading) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-loading">Loading roles...</div>
      </AdminV2Layout>
    );
  }

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <div className="admin-v2-page-header">
          <div>
            <h1 className="admin-v2-page-title">Role Management</h1>
            <p className="admin-v2-page-subtitle">Manage roles and their permissions</p>
          </div>
          <button className="admin-v2-btn admin-v2-btn-primary" onClick={openCreateModal}>
            <PlusIcon size={16} />
            Add Role
          </button>
        </div>

        {error && (
          <div className="admin-v2-alert admin-v2-alert-error">{error}</div>
        )}

        {/* Summary Stats */}
        <div className="admin-v2-stats-row">
          <div className="admin-v2-stat-card">
            <div className="admin-v2-stat-icon">
              <ShieldIcon size={20} />
            </div>
            <div className="admin-v2-stat-content">
              <span className="admin-v2-stat-value">{roles.length}</span>
              <span className="admin-v2-stat-label">Total Roles</span>
            </div>
          </div>
          <div className="admin-v2-stat-card">
            <div className="admin-v2-stat-icon admin-v2-stat-icon-success">
              <ShieldIcon size={20} />
            </div>
            <div className="admin-v2-stat-content">
              <span className="admin-v2-stat-value">{roles.filter(r => r.is_active).length}</span>
              <span className="admin-v2-stat-label">Active</span>
            </div>
          </div>
          <div className="admin-v2-stat-card">
            <div className="admin-v2-stat-icon admin-v2-stat-icon-info">
              <ShieldIcon size={20} />
            </div>
            <div className="admin-v2-stat-content">
              <span className="admin-v2-stat-value">{permissions.length}</span>
              <span className="admin-v2-stat-label">Permissions</span>
            </div>
          </div>
        </div>

        {/* Roles Table */}
        <div className="admin-v2-table-container">
          <table className="admin-v2-table">
            <thead>
              <tr>
                <th>ROLE</th>
                <th>DESCRIPTION</th>
                <th>PERMISSIONS</th>
                <th>USERS</th>
                <th>STATUS</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {roles.map(role => (
                <tr key={role.id}>
                  <td>
                    <div className="admin-v2-role-info">
                      <span className="admin-v2-role-name">{role.display_name}</span>
                      <small className="admin-v2-role-code">{role.name}</small>
                    </div>
                  </td>
                  <td>
                    <span className="admin-v2-text-muted">
                      {role.description || '—'}
                    </span>
                  </td>
                  <td>
                    <span className="admin-v2-badge admin-v2-badge-info">
                      {role.permissions?.length || 0} permissions
                    </span>
                  </td>
                  <td>
                    <span className="admin-v2-text-muted">
                      {role.user_count || 0} users
                    </span>
                  </td>
                  <td>
                    <span className={`admin-v2-badge ${role.is_active ? 'admin-v2-badge-success' : 'admin-v2-badge-secondary'}`}>
                      {role.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="admin-v2-actions">
                      <button 
                        className="admin-v2-action-btn admin-v2-action-btn-edit"
                        onClick={() => openEditModal(role)}
                        title="Edit role"
                      >
                        <EditIcon size={14} />
                        <span>Edit</span>
                      </button>
                      {!role.is_system_role && (
                        <button 
                          className="admin-v2-action-btn admin-v2-action-btn-delete"
                          onClick={() => openDeleteModal(role)}
                          title="Delete role"
                        >
                          <TrashIcon size={14} />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Create Role Modal */}
        {showCreateModal && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="admin-v2-modal" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Create New Role</h2>
                <button className="admin-v2-modal-close" onClick={() => setShowCreateModal(false)}>
                  <XIcon size={20} />
                </button>
              </div>
              <form onSubmit={handleCreateRole}>
                <div className="admin-v2-modal-body">
                  {formError && (
                    <div className="admin-v2-form-error">{formError}</div>
                  )}
                  
                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label>Role Name (code) *</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value.toLowerCase().replace(/\s+/g, '_')})}
                        required
                        placeholder="e.g., nurse_aide"
                      />
                      <small>Lowercase with underscores, used internally</small>
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Display Name *</label>
                      <input
                        type="text"
                        value={formData.display_name}
                        onChange={e => setFormData({...formData, display_name: e.target.value})}
                        required
                        placeholder="e.g., Nurse Aide"
                      />
                    </div>
                  </div>

                  <div className="admin-v2-form-group">
                    <label>Description</label>
                    <input
                      type="text"
                      value={formData.description}
                      onChange={e => setFormData({...formData, description: e.target.value})}
                      placeholder="Brief description of this role"
                    />
                  </div>

                  <div className="admin-v2-form-group">
                    <label>Permissions</label>
                    <div className="admin-v2-permission-selector">
                      {Object.entries(permissionsByCategory).map(([category, perms]) => (
                        <div key={category} className="admin-v2-permission-category">
                          <h4>{category}</h4>
                          <div className="admin-v2-permission-pills">
                            {perms.map(perm => {
                              const isSelected = formData.permission_ids.includes(perm.id);
                              // Extract just the action from permission name (e.g., "read" from "medications.read")
                              const action = perm.name.includes('.') ? perm.name.split('.').pop() : perm.name;
                              const displayAction = action.charAt(0).toUpperCase() + action.slice(1);
                              return (
                                <button
                                  key={perm.id}
                                  type="button"
                                  className={`admin-v2-permission-pill ${isSelected ? 'selected' : ''}`}
                                  onClick={() => handlePermissionToggle(perm.id)}
                                  title={perm.display_name}
                                >
                                  {displayAction}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      {permissions.length === 0 && (
                        <div className="admin-v2-empty-state-small">
                          No permissions available
                        </div>
                      )}
                    </div>
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
                    {saving ? 'Creating...' : 'Create Role'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Role Modal */}
        {showEditModal && selectedRole && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowEditModal(false)}>
            <div className="admin-v2-modal" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Edit Role: {selectedRole.display_name}</h2>
                <button className="admin-v2-modal-close" onClick={() => setShowEditModal(false)}>
                  <XIcon size={20} />
                </button>
              </div>
              <form onSubmit={handleUpdateRole}>
                <div className="admin-v2-modal-body">
                  {formError && (
                    <div className="admin-v2-form-error">{formError}</div>
                  )}
                  
                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label>Role Name (code)</label>
                      <input
                        type="text"
                        value={formData.name}
                        disabled
                        className="disabled"
                      />
                      <small>Role code cannot be changed</small>
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Display Name *</label>
                      <input
                        type="text"
                        value={formData.display_name}
                        onChange={e => setFormData({...formData, display_name: e.target.value})}
                        required
                      />
                    </div>
                  </div>

                  <div className="admin-v2-form-group">
                    <label>Description</label>
                    <input
                      type="text"
                      value={formData.description}
                      onChange={e => setFormData({...formData, description: e.target.value})}
                      placeholder="Brief description of this role"
                    />
                  </div>

                  <div className="admin-v2-form-group">
                    <label>Status</label>
                    <select
                      value={formData.is_active ? 'active' : 'inactive'}
                      onChange={e => setFormData({...formData, is_active: e.target.value === 'active'})}
                      disabled={selectedRole.is_system_role}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                    {selectedRole.is_system_role && (
                      <small>System roles cannot be deactivated</small>
                    )}
                  </div>

                  <div className="admin-v2-form-group">
                    <label>Permissions</label>
                    <div className="admin-v2-permission-selector">
                      {Object.entries(permissionsByCategory).map(([category, perms]) => (
                        <div key={category} className="admin-v2-permission-category">
                          <h4>{category}</h4>
                          <div className="admin-v2-permission-pills">
                            {perms.map(perm => {
                              const isSelected = formData.permission_ids.includes(perm.id);
                              // Extract just the action from permission name (e.g., "read" from "medications.read")
                              const action = perm.name.includes('.') ? perm.name.split('.').pop() : perm.name;
                              const displayAction = action.charAt(0).toUpperCase() + action.slice(1);
                              return (
                                <button
                                  key={perm.id}
                                  type="button"
                                  className={`admin-v2-permission-pill ${isSelected ? 'selected' : ''}`}
                                  onClick={() => handlePermissionToggle(perm.id)}
                                  title={perm.display_name}
                                >
                                  {displayAction}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      {permissions.length === 0 && (
                        <div className="admin-v2-empty-state-small">
                          No permissions available
                        </div>
                      )}
                    </div>
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
        {showDeleteModal && selectedRole && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowDeleteModal(false)}>
            <div className="admin-v2-modal admin-v2-modal-sm" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Delete Role</h2>
                <button className="admin-v2-modal-close" onClick={() => setShowDeleteModal(false)}>
                  <XIcon size={20} />
                </button>
              </div>
              <div className="admin-v2-modal-body">
                <p>Are you sure you want to delete the role <strong>{selectedRole.display_name}</strong>?</p>
                <p className="admin-v2-text-muted">
                  This will remove the role from all users who have it assigned. This action cannot be undone.
                </p>
              </div>
              <div className="admin-v2-modal-footer">
                <button 
                  className="admin-v2-btn"
                  onClick={() => setShowDeleteModal(false)}
                >
                  Cancel
                </button>
                <button 
                  className="admin-v2-btn admin-v2-btn-danger"
                  onClick={handleDeleteRole}
                  disabled={saving}
                >
                  {saving ? 'Deleting...' : 'Delete Role'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Roles;
