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
import AdminV2Layout from './AdminV2Layout';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import {
  PlusIcon,
  EditIcon,
  TrashIcon,
  XIcon,
  ShieldIcon,
  KeyIcon,
  UsersIcon,
  SearchIcon
} from '../../components/Icons';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert } from '@/components/ui/alert';
import { Field, FormRow } from '@/components/ui/field';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import './AdminV2.css';

// Scrollable checkbox list used for role / patient assignment. Module-scope so
// it isn't recreated each render.
function ToggleList({ items, selectedIds, onToggle, getId, renderLabel, isDisabled, empty }) {
  if (!items || items.length === 0) {
    return (
      <div className="rounded-md border border-border bg-background/40 p-3 text-sm text-muted-foreground">
        {empty}
      </div>
    );
  }
  return (
    <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-border bg-background/40 p-2">
      {items.map(item => {
        const id = getId(item);
        const disabled = isDisabled ? isDisabled(item) : false;
        return (
          <label
            key={id}
            className={cn(
              "flex items-start gap-2 rounded px-2 py-1.5",
              disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-accent"
            )}
          >
            <Checkbox
              className="mt-0.5"
              checked={selectedIds.includes(id)}
              onCheckedChange={() => onToggle(id)}
              disabled={disabled}
            />
            <span className="text-sm text-foreground">{renderLabel(item)}</span>
          </label>
        );
      })}
    </div>
  );
}

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
    } catch {
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
    } catch {
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
    } catch {
      setFormError('Error connecting to server');
    } finally {
      setSaving(false);
    }
  };

  // System-admin-only: flag a user to reset their password on next sign-in.
  const handleForcePasswordReset = async (u) => {
    if (!window.confirm(
      `Require ${u.full_name || u.username} to set a new password on their next sign-in?`
    )) return;
    try {
      const response = await fetch(
        `${config.apiUrl}/api/users/${u.id}/force-password-reset`,
        { method: 'POST', credentials: 'include' }
      );
      if (response.ok) {
        fetchUsers();
      } else {
        const data = await response.json();
        alert(data.detail || 'Failed to require first login');
      }
    } catch {
      alert('Error connecting to server');
    }
  };

  const openEditModal = (u) => {
    setSelectedUser(u);
    setFormData({
      username: u.username,
      full_name: u.full_name,
      email: u.email || '',
      password: '',
      pin: '',
      is_active: u.is_active,
      role_ids: u.roles?.map(r => r.id) || [],
      patient_ids: u.patient_ids || []
    });
    setFormError(null);
    setShowEditModal(true);
  };

  const openDeleteModal = (u) => {
    setSelectedUser(u);
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

  // Render the role + patient assignment fields shared by both dialogs.
  const renderRoleField = (disableSystemAdmin) => (
    <Field label="Roles">
      <ToggleList
        items={roles}
        selectedIds={formData.role_ids}
        onToggle={handleRoleToggle}
        getId={(r) => r.id}
        isDisabled={disableSystemAdmin ? (r) => r.name === 'system_admin' && selectedUser?.is_system_admin : undefined}
        renderLabel={(r) => (
          <>
            {r.display_name}
            {r.description && <small className="block text-xs text-muted-foreground">{r.description}</small>}
          </>
        )}
        empty="No roles available"
      />
    </Field>
  );

  const renderPatientField = () => (
    <Field label="Patient Assignments">
      {isFormSystemAdmin() ? (
        <div className="rounded-md border border-border bg-background/40 p-3 text-sm text-muted-foreground">
          System admins have access to all patients automatically.
        </div>
      ) : (
        <ToggleList
          items={patients}
          selectedIds={formData.patient_ids}
          onToggle={handlePatientToggle}
          getId={(p) => p.id}
          renderLabel={(p) => (
            <>
              {p.first_name} {p.last_name}
              {p.medical_record_number && <small className="block text-xs text-muted-foreground">MRN: {p.medical_record_number}</small>}
            </>
          )}
          empty="No patients configured yet."
        />
      )}
    </Field>
  );

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
        {error && (
          <div className="tw mb-4">
            <Alert variant="destructive">{error}</Alert>
          </div>
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
                    {u.force_password_reset && (
                      <span
                        className="admin-v2-status-badge"
                        title="This user must set a new password on next sign-in"
                        style={{ marginLeft: 6 }}
                      >
                        First login pending
                      </span>
                    )}
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
                      {user.is_system_admin && u.id !== user.id && !u.force_password_reset && (
                        <button
                          className="admin-v2-action-btn"
                          onClick={() => handleForcePasswordReset(u)}
                          title="Require this user to set a new password on next sign-in"
                        >
                          <KeyIcon size={14} />
                          <span>Require first login</span>
                        </button>
                      )}
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

        {/* Create User Dialog */}
        <Dialog open={showCreateModal} onOpenChange={(o) => { if (!o) setShowCreateModal(false); }}>
          <DialogContent className="sm:max-w-[640px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Create New User</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateUser} className="flex flex-col gap-4">
              {formError && <Alert variant="destructive">{formError}</Alert>}

              <FormRow>
                <Field label="Username" required htmlFor="u-username">
                  <Input
                    id="u-username"
                    value={formData.username}
                    onChange={e => setFormData({ ...formData, username: e.target.value })}
                    required
                    minLength={3}
                    placeholder="Enter username"
                  />
                </Field>
                <Field label="Full Name" required htmlFor="u-fullname">
                  <Input
                    id="u-fullname"
                    value={formData.full_name}
                    onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                    required
                    placeholder="Enter full name"
                  />
                </Field>
              </FormRow>

              <FormRow>
                <Field label="Email" htmlFor="u-email">
                  <Input
                    id="u-email"
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    placeholder="Enter email address"
                  />
                </Field>
                <Field label="Password" required htmlFor="u-password">
                  <Input
                    id="u-password"
                    type="password"
                    value={formData.password}
                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                    required
                    minLength={8}
                    placeholder="Min 8 characters"
                  />
                </Field>
              </FormRow>

              <FormRow>
                <Field label="PIN (4-8 digits)" htmlFor="u-pin">
                  <Input
                    id="u-pin"
                    type="password"
                    value={formData.pin}
                    onChange={e => setFormData({ ...formData, pin: e.target.value })}
                    placeholder="Optional quick-login PIN"
                    maxLength={8}
                    pattern="[0-9]*"
                  />
                </Field>
                <Field label="Status">
                  <Select
                    value={formData.is_active ? 'active' : 'inactive'}
                    onValueChange={(v) => setFormData({ ...formData, is_active: v === 'active' })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </FormRow>

              {renderRoleField(false)}
              {renderPatientField()}

              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create User'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit User Dialog */}
        <Dialog open={showEditModal && !!selectedUser} onOpenChange={(o) => { if (!o) setShowEditModal(false); }}>
          <DialogContent className="sm:max-w-[640px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Edit User: {selectedUser?.username}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUpdateUser} className="flex flex-col gap-4">
              {formError && <Alert variant="destructive">{formError}</Alert>}

              <FormRow>
                <Field label="Username" htmlFor="u-username-edit" hint="Username cannot be changed">
                  <Input id="u-username-edit" value={formData.username} disabled />
                </Field>
                <Field label="Full Name" required htmlFor="u-fullname-edit">
                  <Input
                    id="u-fullname-edit"
                    value={formData.full_name}
                    onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                    required
                    placeholder="Enter full name"
                  />
                </Field>
              </FormRow>

              <FormRow>
                <Field label="Email" htmlFor="u-email-edit">
                  <Input
                    id="u-email-edit"
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    placeholder="Enter email address"
                  />
                </Field>
                <Field label="New PIN (leave blank to keep)" htmlFor="u-pin-edit">
                  <Input
                    id="u-pin-edit"
                    type="password"
                    value={formData.pin}
                    onChange={e => setFormData({ ...formData, pin: e.target.value })}
                    placeholder="Enter new PIN"
                    maxLength={8}
                    pattern="[0-9]*"
                  />
                </Field>
              </FormRow>

              <Field
                label="Status"
                hint={selectedUser?.is_system_admin ? 'System admin status cannot be changed' : undefined}
              >
                <Select
                  value={formData.is_active ? 'active' : 'inactive'}
                  onValueChange={(v) => setFormData({ ...formData, is_active: v === 'active' })}
                  disabled={selectedUser?.is_system_admin}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              {renderRoleField(true)}
              {renderPatientField()}

              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setShowEditModal(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={showDeleteModal && !!selectedUser} onOpenChange={(o) => { if (!o) setShowDeleteModal(false); }}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle>Delete User</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2 text-sm">
              {formError && <Alert variant="destructive">{formError}</Alert>}
              <p className="text-foreground">
                Are you sure you want to delete the user <strong>{selectedUser?.full_name}</strong> (@{selectedUser?.username})?
              </p>
              <p className="text-muted-foreground">This action cannot be undone.</p>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeleteUser} disabled={saving}>
                {saving ? 'Deleting...' : 'Delete User'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Users;
