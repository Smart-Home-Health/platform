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
  KeyIcon
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
import { Field } from '@/components/ui/field';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import './AdminV2.css';

// Category options based on nav sections.
const CATEGORIES = [
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

// Shared create/edit form body (edit adds the Active toggle). Defined at module
// scope so it isn't recreated each render — a nested component would drop input
// focus on every keystroke.
function PermissionForm({ formData, setFormData, onSubmit, onCancel, showActive, submitLabel }) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field label="Category">
        <Select
          value={formData.category}
          onValueChange={(v) => setFormData({ ...formData, category: v })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map(cat => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Permission Code" required htmlFor="perm-code" hint="Use format: category.action (e.g., patients.create)">
        <Input
          id="perm-code"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="e.g., patients.create"
          required
        />
      </Field>

      <Field label="Display Name" required htmlFor="perm-display">
        <Input
          id="perm-display"
          value={formData.display_name}
          onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
          placeholder="e.g., Create Patients"
          required
        />
      </Field>

      <Field label="Description" htmlFor="perm-desc">
        <Input
          id="perm-desc"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Brief description of the permission"
        />
      </Field>

      {showActive && (
        <label className="flex w-fit cursor-pointer items-center gap-2">
          <Checkbox
            checked={formData.is_active}
            onCheckedChange={(v) => setFormData({ ...formData, is_active: v === true })}
          />
          <span className="text-sm text-foreground">Active</span>
        </label>
      )}

      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit">{submitLabel}</Button>
      </DialogFooter>
    </form>
  );
}

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
      category: CATEGORIES[0],
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
        <div className="tw mb-4 flex justify-end">
          <Button onClick={openCreateModal}>
            <PlusIcon size={16} />
            Add Permission
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
        <div className="tw mt-6">
          <h2 className="mb-3 text-base font-semibold text-foreground">Permissions by Category</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(permissionsByCategory).map(([category, perms]) => (
              <Card key={category}>
                <CardHeader className="flex-row items-center justify-between py-3">
                  <CardTitle className="text-sm">{category}</CardTitle>
                  <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                    {perms.length}
                  </span>
                </CardHeader>
                <CardContent className="flex flex-col gap-1.5 py-3">
                  {perms.map(perm => (
                    <div key={perm.id} className="flex items-center gap-2 text-sm text-foreground">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: perm.is_active ? '#3fb950' : 'var(--muted-foreground)' }}
                      />
                      <span>{perm.display_name}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Create Permission Dialog */}
        <Dialog open={showCreateModal} onOpenChange={(o) => { if (!o) setShowCreateModal(false); }}>
          <DialogContent className="sm:max-w-[560px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Create Permission</DialogTitle>
            </DialogHeader>
            <PermissionForm
              formData={formData}
              setFormData={setFormData}
              onSubmit={handleCreatePermission}
              onCancel={() => setShowCreateModal(false)}
              showActive={false}
              submitLabel="Create Permission"
            />
          </DialogContent>
        </Dialog>

        {/* Edit Permission Dialog */}
        <Dialog open={showEditModal && !!selectedPermission} onOpenChange={(o) => { if (!o) setShowEditModal(false); }}>
          <DialogContent className="sm:max-w-[560px]" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Edit Permission</DialogTitle>
            </DialogHeader>
            <PermissionForm
              formData={formData}
              setFormData={setFormData}
              onSubmit={handleUpdatePermission}
              onCancel={() => setShowEditModal(false)}
              showActive
              submitLabel="Save Changes"
            />
          </DialogContent>
        </Dialog>

        {/* Delete Permission Dialog */}
        <Dialog open={showDeleteModal && !!selectedPermission} onOpenChange={(o) => { if (!o) setShowDeleteModal(false); }}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle>Delete Permission</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-foreground">
                Are you sure you want to delete the permission <strong>{selectedPermission?.display_name}</strong>?
              </p>
              <p className="text-muted-foreground">
                This will remove the permission from all roles that have it assigned.
              </p>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeletePermission}>Delete Permission</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Permissions;
