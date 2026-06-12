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
  ShieldIcon
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

// Category-grouped permission toggle pills, shared by the create/edit dialogs.
function PermissionSelector({ permissionsByCategory, selectedIds, onToggle }) {
  const categories = Object.entries(permissionsByCategory);
  if (categories.length === 0) {
    return <p className="text-sm text-muted-foreground">No permissions available</p>;
  }
  return (
    <div className="flex max-h-64 flex-col gap-4 overflow-y-auto rounded-md border border-border bg-background/40 p-3">
      {categories.map(([category, perms]) => (
        <div key={category} className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{category}</h4>
          <div className="flex flex-wrap gap-2">
            {perms.map(perm => {
              const isSelected = selectedIds.includes(perm.id);
              const action = perm.name.includes('.') ? perm.name.split('.').pop() : perm.name;
              const displayAction = action.charAt(0).toUpperCase() + action.slice(1);
              return (
                <button
                  key={perm.id}
                  type="button"
                  onClick={() => onToggle(perm.id)}
                  title={perm.display_name}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    isSelected
                      ? "border-ring bg-ring/20 text-foreground"
                      : "border-border bg-secondary text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  {displayAction}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

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
    } catch {
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
    } catch {
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
    } catch {
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
        <div className="tw mb-4 flex justify-end">
          <Button onClick={openCreateModal}>
            <PlusIcon size={16} />
            Add Role
          </Button>
        </div>

        {error && (
          <div className="tw mb-4">
            <Alert variant="destructive">{error}</Alert>
          </div>
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

        {/* Create Role Dialog */}
        <Dialog open={showCreateModal} onOpenChange={(o) => { if (!o) setShowCreateModal(false); }}>
          <DialogContent className="sm:max-w-[640px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Create New Role</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateRole} className="flex flex-col gap-4">
              {formError && <Alert variant="destructive">{formError}</Alert>}

              <FormRow>
                <Field label="Role Name (code)" required htmlFor="role-name" hint="Lowercase with underscores, used internally">
                  <Input
                    id="role-name"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                    required
                    placeholder="e.g., nurse_aide"
                  />
                </Field>
                <Field label="Display Name" required htmlFor="role-display">
                  <Input
                    id="role-display"
                    value={formData.display_name}
                    onChange={e => setFormData({ ...formData, display_name: e.target.value })}
                    required
                    placeholder="e.g., Nurse Aide"
                  />
                </Field>
              </FormRow>

              <Field label="Description" htmlFor="role-desc">
                <Input
                  id="role-desc"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of this role"
                />
              </Field>

              <Field label="Permissions">
                <PermissionSelector
                  permissionsByCategory={permissionsByCategory}
                  selectedIds={formData.permission_ids}
                  onToggle={handlePermissionToggle}
                />
              </Field>

              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create Role'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Edit Role Dialog */}
        <Dialog open={showEditModal && !!selectedRole} onOpenChange={(o) => { if (!o) setShowEditModal(false); }}>
          <DialogContent className="sm:max-w-[640px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Edit Role: {selectedRole?.display_name}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUpdateRole} className="flex flex-col gap-4">
              {formError && <Alert variant="destructive">{formError}</Alert>}

              <FormRow>
                <Field label="Role Name (code)" htmlFor="role-name-edit" hint="Role code cannot be changed">
                  <Input id="role-name-edit" value={formData.name} disabled />
                </Field>
                <Field label="Display Name" required htmlFor="role-display-edit">
                  <Input
                    id="role-display-edit"
                    value={formData.display_name}
                    onChange={e => setFormData({ ...formData, display_name: e.target.value })}
                    required
                  />
                </Field>
              </FormRow>

              <Field label="Description" htmlFor="role-desc-edit">
                <Input
                  id="role-desc-edit"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of this role"
                />
              </Field>

              <Field
                label="Status"
                hint={selectedRole?.is_system_role ? 'System roles cannot be deactivated' : undefined}
              >
                <Select
                  value={formData.is_active ? 'active' : 'inactive'}
                  onValueChange={(v) => setFormData({ ...formData, is_active: v === 'active' })}
                  disabled={selectedRole?.is_system_role}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Permissions">
                <PermissionSelector
                  permissionsByCategory={permissionsByCategory}
                  selectedIds={formData.permission_ids}
                  onToggle={handlePermissionToggle}
                />
              </Field>

              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setShowEditModal(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={showDeleteModal && !!selectedRole} onOpenChange={(o) => { if (!o) setShowDeleteModal(false); }}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle>Delete Role</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-foreground">
                Are you sure you want to delete the role <strong>{selectedRole?.display_name}</strong>?
              </p>
              <p className="text-muted-foreground">
                This will remove the role from all users who have it assigned. This action cannot be undone.
              </p>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeleteRole} disabled={saving}>
                {saving ? 'Deleting...' : 'Delete Role'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Roles;
