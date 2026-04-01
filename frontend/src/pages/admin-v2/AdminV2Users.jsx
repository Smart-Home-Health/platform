import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import {
  PlusIcon,
  EditIcon,
  TrashIcon,
  CheckIcon,
  XIcon,
  ShieldIcon,
  KeyIcon,
  UsersIcon,
  SearchIcon
} from '../../components/Icons';
import './AdminV2.css';

const AdminV2Users = () => {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterStaleLogin, setFilterStaleLogin] = useState(false);

  // Permission helper
  const hasPermission = (permission) => {
    if (!user) return false;
    // System admins have all permissions
    if (user.is_system_admin) return true;
    return user.permissions?.includes(permission) || false;
  };
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  
  // Form state
  const [formData, setFormData] = useState({
    username: '',
    full_name: '',
    email: '',
    password: '',
    pin: '',
    is_active: true,
    role_ids: [],
    patient_ids: []
  });
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Fetch users, roles, and patients only when authenticated
  useEffect(() => {
    if (user) {
      fetchUsers();
      fetchRoles();
      fetchPatients();
    }
  }, [user]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`${config.apiUrl}/api/users`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      } else {
        setError('Failed to load users');
      }
    } catch (err) {
      setError('Error connecting to server');
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/users/roles`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setRoles(data);
      }
    } catch (err) {
      console.error('Error fetching roles:', err);
    }
  };

  const fetchPatients = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/patients`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setPatients(data);
      }
    } catch (err) {
      console.error('Error fetching patients:', err);
    }
  };

  const savePatientAssignments = async (userId, patientIds) => {
    try {
      await fetch(`${config.apiUrl}/api/users/${userId}/patients`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ patient_ids: patientIds })
      });
    } catch (err) {
      console.error('Error saving patient assignments:', err);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);

    try {
      // Clean up form data - send null instead of empty strings for optional fields
      const payload = {
        username: formData.username,
        full_name: formData.full_name,
        password: formData.password,
        email: formData.email || null,
        pin: formData.pin || null,
        is_active: formData.is_active,
        role_ids: formData.role_ids
      };

      const response = await fetch(`${config.apiUrl}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const created = await response.json();
        if (formData.patient_ids.length > 0) {
          await savePatientAssignments(created.id, formData.patient_ids);
        }
        setShowCreateModal(false);
        resetForm();
        fetchUsers();
      } else {
        const data = await response.json();
        // Handle validation errors (array) or simple error (string)
        if (Array.isArray(data.detail)) {
          const messages = data.detail.map(err => err.msg || err.message || JSON.stringify(err));
          setFormError(messages.join(', '));
        } else {
          setFormError(data.detail || 'Failed to create user');
        }
      }
    } catch (err) {
      setFormError('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateUser = async (e) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);

    try {
      const response = await fetch(`${config.apiUrl}/api/users/${selectedUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          full_name: formData.full_name,
          email: formData.email || null,
          is_active: formData.is_active,
          pin: formData.pin || null
        })
      });

      if (response.ok) {
        // Update roles if changed
        await updateUserRoles(selectedUser.id, formData.role_ids);
        // Update patient assignments
        await savePatientAssignments(selectedUser.id, formData.patient_ids);
        setShowEditModal(false);
        resetForm();
        fetchUsers();
      } else {
        const data = await response.json();
        // Handle validation errors (array) or simple error (string)
        if (Array.isArray(data.detail)) {
          const messages = data.detail.map(err => err.msg || err.message || JSON.stringify(err));
          setFormError(messages.join(', '));
        } else {
          setFormError(data.detail || 'Failed to update user');
        }
      }
    } catch (err) {
      setFormError('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const updateUserRoles = async (userId, newRoleIds) => {
    const currentRoleIds = selectedUser.roles?.map(r => r.id) || [];
    
    // Add new roles
    for (const roleId of newRoleIds) {
      if (!currentRoleIds.includes(roleId)) {
        await fetch(`${config.apiUrl}/api/users/${userId}/roles/${roleId}`, {
          method: 'POST',
          credentials: 'include'
        });
      }
    }
    
    // Remove old roles
    for (const roleId of currentRoleIds) {
      if (!newRoleIds.includes(roleId)) {
        await fetch(`${config.apiUrl}/api/users/${userId}/roles/${roleId}`, {
          method: 'DELETE',
          credentials: 'include'
        });
      }
    }
  };

  const handleDeleteUser = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/users/${selectedUser.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        setShowDeleteModal(false);
        setSelectedUser(null);
        fetchUsers();
      } else {
        const data = await response.json();
        setFormError(data.detail || 'Failed to delete user');
      }
    } catch (err) {
      setFormError('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (user) => {
    setSelectedUser(user);
    setFormData({
      username: user.username,
      full_name: user.full_name,
      email: user.email || '',
      password: '',
      pin: '',
      is_active: user.is_active,
      role_ids: user.roles?.map(r => r.id) || [],
      patient_ids: user.patient_ids || []
    });
    setFormError(null);
    setShowEditModal(true);
  };

  const openDeleteModal = (user) => {
    setSelectedUser(user);
    setFormError(null);
    setShowDeleteModal(true);
  };

  const openCreateModal = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const resetForm = () => {
    setFormData({
      username: '',
      full_name: '',
      email: '',
      password: '',
      pin: '',
      is_active: true,
      role_ids: [],
      patient_ids: []
    });
    setFormError(null);
    setSelectedUser(null);
  };

  const handleRoleToggle = (roleId) => {
    setFormData(prev => ({
      ...prev,
      role_ids: prev.role_ids.includes(roleId)
        ? prev.role_ids.filter(id => id !== roleId)
        : [...prev.role_ids, roleId]
    }));
  };

  const handlePatientToggle = (patientId) => {
    setFormData(prev => ({
      ...prev,
      patient_ids: prev.patient_ids.includes(patientId)
        ? prev.patient_ids.filter(id => id !== patientId)
        : [...prev.patient_ids, patientId]
    }));
  };

  // Check if the user being created/edited has a system_admin role
  const isFormSystemAdmin = () => {
    return formData.role_ids.some(rid => {
      const role = roles.find(r => r.id === rid);
      return role && role.name === 'system_admin';
    });
  };

  const getInitials = (name) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Check if login is stale (> 30 days ago or never)
  const isStaleLogin = (lastLogin) => {
    if (!lastLogin) return true;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return new Date(lastLogin) < thirtyDaysAgo;
  };

  // Filter users
  const filteredUsers = users.filter(u => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch = 
        u.full_name.toLowerCase().includes(query) ||
        u.username.toLowerCase().includes(query) ||
        (u.email && u.email.toLowerCase().includes(query));
      if (!matchesSearch) return false;
    }
    
    // Role filter
    if (filterRole) {
      const hasRole = u.roles?.some(r => r.id === parseInt(filterRole));
      if (!hasRole) return false;
    }
    
    // Status filter
    if (filterStatus === 'active' && !u.is_active) return false;
    if (filterStatus === 'inactive' && u.is_active) return false;
    
    // Stale login filter
    if (filterStaleLogin && !isStaleLogin(u.last_login)) return false;
    
    return true;
  });

  const hasActiveFilters = searchQuery || filterRole || filterStatus || filterStaleLogin;

  // Show loading while waiting for auth
  if (!user) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-loading">Please log in to access user management...</div>
      </AdminV2Layout>
    );
  }

  if (loading) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-loading">Loading users...</div>
      </AdminV2Layout>
    );
  }

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {/* Page Header */}
        <div className="admin-v2-page-header">
          <div className="admin-v2-header-content">
            <div className="admin-v2-header-icon">
              <UsersIcon size={32} />
            </div>
            <div className="admin-v2-header-text">
              <h1>User Management</h1>
              <p>Manage user accounts, roles, and permissions</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="admin-v2-error-banner">{error}</div>
        )}

        {/* Summary Stats */}
        <div className="admin-v2-summary-stats" style={{ marginBottom: '1.5rem' }}>
          <div className="admin-v2-stat-card">
            <div className="admin-v2-stat-icon patients">
              <UsersIcon size={24} />
            </div>
            <div className="admin-v2-stat-info">
              <h4>{users.filter(u => u.is_active).length}/{users.length}</h4>
              <p>Active Users</p>
            </div>
          </div>
          <div className="admin-v2-stat-card">
            <div className="admin-v2-stat-icon tasks">
              <ShieldIcon size={24} />
            </div>
            <div className="admin-v2-stat-info">
              <h4>{users.filter(u => u.is_system_admin).length}</h4>
              <p>Admins</p>
            </div>
          </div>
          <div className="admin-v2-stat-card">
            <div className="admin-v2-stat-icon medications">
              <KeyIcon size={24} />
            </div>
            <div className="admin-v2-stat-info">
              <h4>{users.filter(u => u.has_pin).length}</h4>
              <p>With PIN</p>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="admin-v2-filter-bar">
          <div className="admin-v2-search-box">
            <SearchIcon size={16} />
            <input
              type="text"
              placeholder="Search by name, username, or email..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="admin-v2-search-clear" onClick={() => setSearchQuery('')}>
                <XIcon size={14} />
              </button>
            )}
          </div>
          <select
            value={filterRole}
            onChange={e => setFilterRole(e.target.value)}
            className="admin-v2-filter-select"
          >
            <option value="">All Roles</option>
            {roles.map(role => (
              <option key={role.id} value={role.id}>{role.display_name}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="admin-v2-filter-select"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <label className="admin-v2-checkbox">
            <input
              type="checkbox"
              checked={filterStaleLogin}
              onChange={e => setFilterStaleLogin(e.target.checked)}
            />
            <span>No login {'>'} 30 days</span>
          </label>
          {hasActiveFilters && (
            <button
              className="admin-v2-btn admin-v2-btn-sm"
              onClick={() => {
                setSearchQuery('');
                setFilterRole('');
                setFilterStatus('');
                setFilterStaleLogin(false);
              }}
            >
              <XIcon size={14} /> Clear
            </button>
          )}
          {hasPermission('users.create') && (
            <button 
              className="admin-v2-btn admin-v2-btn-primary"
              onClick={openCreateModal}
            >
              <PlusIcon size={16} /> Add User
            </button>
          )}
        </div>

        {/* Users Table */}
        <div className="admin-v2-table-container">
          <table className="admin-v2-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Roles</th>
                <th>Patients</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(u => (
                <tr key={u.id}>
                  <td>
                    <div className="admin-v2-user-cell">
                      <div className="admin-v2-user-avatar">
                        {getInitials(u.full_name)}
                      </div>
                      <div className="admin-v2-user-info">
                        <span className="admin-v2-user-name">{u.full_name}</span>
                        <span className="admin-v2-user-username">@{u.username}</span>
                      </div>
                    </div>
                  </td>
                  <td>{u.email || '-'}</td>
                  <td>
                    <div className="admin-v2-role-badges">
                      {u.roles?.map(role => (
                        <span key={role.id} className={`admin-v2-role-badge ${role.name === 'system_admin' ? 'admin' : ''}`}>
                          {role.display_name}
                        </span>
                      ))}
                      {(!u.roles || u.roles.length === 0) && (
                        <span className="admin-v2-role-badge none">No roles</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="admin-v2-patient-count">
                      {u.is_system_admin ? 'All' : `${(u.patient_ids || []).length} assigned`}
                    </span>
                  </td>
                  <td>
                    <span className={`admin-v2-status-badge ${u.is_active ? 'active' : 'inactive'}`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <span className={isStaleLogin(u.last_login) ? 'admin-v2-text-warning' : ''}>
                      {u.last_login 
                        ? new Date(u.last_login).toLocaleDateString() 
                        : 'Never'}
                    </span>
                  </td>
                  <td>
                    <div className="admin-v2-table-actions">
                      <button 
                        className="admin-v2-action-btn admin-v2-action-btn-edit"
                        onClick={() => openEditModal(u)}
                        title="Edit user"
                      >
                        <EditIcon size={14} />
                        <span>Edit</span>
                      </button>
                      {!u.is_system_admin && (
                        <button 
                          className="admin-v2-action-btn admin-v2-action-btn-delete"
                          onClick={() => openDeleteModal(u)}
                          title="Delete user"
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

        {/* Create User Modal */}
        {showCreateModal && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="admin-v2-modal" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Create New User</h2>
                <button className="admin-v2-modal-close" onClick={() => setShowCreateModal(false)}>
                  <XIcon size={20} />
                </button>
              </div>
              <form onSubmit={handleCreateUser}>
                <div className="admin-v2-modal-body">
                  {formError && (
                    <div className="admin-v2-form-error">{formError}</div>
                  )}
                  
                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label>Username *</label>
                      <input
                        type="text"
                        value={formData.username}
                        onChange={e => setFormData({...formData, username: e.target.value})}
                        required
                        minLength={3}
                        placeholder="Enter username"
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Full Name *</label>
                      <input
                        type="text"
                        value={formData.full_name}
                        onChange={e => setFormData({...formData, full_name: e.target.value})}
                        required
                        placeholder="Enter full name"
                      />
                    </div>
                  </div>

                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label>Email</label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={e => setFormData({...formData, email: e.target.value})}
                        placeholder="Enter email address"
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Password *</label>
                      <input
                        type="password"
                        value={formData.password}
                        onChange={e => setFormData({...formData, password: e.target.value})}
                        required
                        minLength={8}
                        placeholder="Min 8 characters"
                      />
                    </div>
                  </div>

                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label>PIN (4-8 digits)</label>
                      <input
                        type="password"
                        value={formData.pin}
                        onChange={e => setFormData({...formData, pin: e.target.value})}
                        placeholder="Optional quick-login PIN"
                        maxLength={8}
                        pattern="[0-9]*"
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Status</label>
                      <select
                        value={formData.is_active ? 'active' : 'inactive'}
                        onChange={e => setFormData({...formData, is_active: e.target.value === 'active'})}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                  </div>

                  <div className="admin-v2-form-group">
                    <label>Roles</label>
                    <div className="admin-v2-role-selector">
                      {roles.map(role => (
                        <label key={role.id} className="admin-v2-role-option">
                          <input
                            type="checkbox"
                            checked={formData.role_ids.includes(role.id)}
                            onChange={() => handleRoleToggle(role.id)}
                          />
                          <span className="admin-v2-role-option-label">
                            {role.display_name}
                            <small>{role.description}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="admin-v2-form-group">
                    <label>Patient Assignments</label>
                    {isFormSystemAdmin() ? (
                      <div className="admin-v2-placeholder-box">
                        System admins have access to all patients automatically.
                      </div>
                    ) : patients.length === 0 ? (
                      <div className="admin-v2-placeholder-box">No patients configured yet.</div>
                    ) : (
                      <div className="admin-v2-role-selector">
                        {patients.map(p => (
                          <label key={p.id} className="admin-v2-role-option">
                            <input
                              type="checkbox"
                              checked={formData.patient_ids.includes(p.id)}
                              onChange={() => handlePatientToggle(p.id)}
                            />
                            <span className="admin-v2-role-option-label">
                              {p.first_name} {p.last_name}
                              {p.medical_record_number && <small>MRN: {p.medical_record_number}</small>}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
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
                    {saving ? 'Creating...' : 'Create User'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit User Modal */}
        {showEditModal && selectedUser && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowEditModal(false)}>
            <div className="admin-v2-modal" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Edit User: {selectedUser.username}</h2>
                <button className="admin-v2-modal-close" onClick={() => setShowEditModal(false)}>
                  <XIcon size={20} />
                </button>
              </div>
              <form onSubmit={handleUpdateUser}>
                <div className="admin-v2-modal-body">
                  {formError && (
                    <div className="admin-v2-form-error">{formError}</div>
                  )}
                  
                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label>Username</label>
                      <input
                        type="text"
                        value={formData.username}
                        disabled
                        className="disabled"
                      />
                      <small>Username cannot be changed</small>
                    </div>
                    <div className="admin-v2-form-group">
                      <label>Full Name *</label>
                      <input
                        type="text"
                        value={formData.full_name}
                        onChange={e => setFormData({...formData, full_name: e.target.value})}
                        required
                        placeholder="Enter full name"
                      />
                    </div>
                  </div>

                  <div className="admin-v2-form-row">
                    <div className="admin-v2-form-group">
                      <label>Email</label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={e => setFormData({...formData, email: e.target.value})}
                        placeholder="Enter email address"
                      />
                    </div>
                    <div className="admin-v2-form-group">
                      <label>New PIN (leave blank to keep)</label>
                      <input
                        type="password"
                        value={formData.pin}
                        onChange={e => setFormData({...formData, pin: e.target.value})}
                        placeholder="Enter new PIN"
                        maxLength={8}
                        pattern="[0-9]*"
                      />
                    </div>
                  </div>

                  <div className="admin-v2-form-group">
                    <label>Status</label>
                    <select
                      value={formData.is_active ? 'active' : 'inactive'}
                      onChange={e => setFormData({...formData, is_active: e.target.value === 'active'})}
                      disabled={selectedUser.is_system_admin}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                    {selectedUser.is_system_admin && (
                      <small>System admin status cannot be changed</small>
                    )}
                  </div>

                  <div className="admin-v2-form-group">
                    <label>Roles</label>
                    <div className="admin-v2-role-selector">
                      {roles.map(role => (
                        <label key={role.id} className="admin-v2-role-option">
                          <input
                            type="checkbox"
                            checked={formData.role_ids.includes(role.id)}
                            onChange={() => handleRoleToggle(role.id)}
                            disabled={role.name === 'system_admin' && selectedUser.is_system_admin}
                          />
                          <span className="admin-v2-role-option-label">
                            {role.display_name}
                            <small>{role.description}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="admin-v2-form-group">
                    <label>Patient Assignments</label>
                    {isFormSystemAdmin() ? (
                      <div className="admin-v2-placeholder-box">
                        System admins have access to all patients automatically.
                      </div>
                    ) : patients.length === 0 ? (
                      <div className="admin-v2-placeholder-box">No patients configured yet.</div>
                    ) : (
                      <div className="admin-v2-role-selector">
                        {patients.map(p => (
                          <label key={p.id} className="admin-v2-role-option">
                            <input
                              type="checkbox"
                              checked={formData.patient_ids.includes(p.id)}
                              onChange={() => handlePatientToggle(p.id)}
                            />
                            <span className="admin-v2-role-option-label">
                              {p.first_name} {p.last_name}
                              {p.medical_record_number && <small>MRN: {p.medical_record_number}</small>}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
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
        {showDeleteModal && selectedUser && (
          <div className="admin-v2-modal-overlay" onClick={() => setShowDeleteModal(false)}>
            <div className="admin-v2-modal admin-v2-modal-sm" onClick={e => e.stopPropagation()}>
              <div className="admin-v2-modal-header">
                <h2>Delete User</h2>
                <button className="admin-v2-modal-close" onClick={() => setShowDeleteModal(false)}>
                  <XIcon size={20} />
                </button>
              </div>
              <div className="admin-v2-modal-body">
                {formError && (
                  <div className="admin-v2-form-error">{formError}</div>
                )}
                <p>Are you sure you want to delete the user <strong>{selectedUser.full_name}</strong> (@{selectedUser.username})?</p>
                <p className="admin-v2-warning-text">This action cannot be undone.</p>
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
                  onClick={handleDeleteUser}
                  disabled={saving}
                >
                  {saving ? 'Deleting...' : 'Delete User'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Users;
