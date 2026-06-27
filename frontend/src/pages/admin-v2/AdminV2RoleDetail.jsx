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
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import AdminV2Layout from './AdminV2Layout';
import { ChevronLeftIcon } from '../../components/Icons';
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Field, FormRow } from '@/components/ui/field';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { PermissionSelector } from './components/PermissionSelector';
import './AdminV2.css';

const emptyForm = {
  name: '', display_name: '', description: '', is_active: true, permission_ids: [],
};

export default function AdminV2RoleDetail() {
  const { roleId } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const [role, setRole] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [formData, setFormData] = useState(emptyForm);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingPerms, setSavingPerms] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const hasPermission = (permission) => {
    if (!currentUser) return false;
    if (currentUser.is_system_admin) return true;
    return currentUser.permissions?.includes(permission) || false;
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [rRes, permsRes] = await Promise.all([
        fetch(`${config.apiUrl}/api/users/roles/${roleId}`, { credentials: 'include' }),
        fetch(`${config.apiUrl}/api/users/permissions`, { credentials: 'include' }),
      ]);
      if (!rRes.ok) { setError('Failed to load role'); return; }
      const r = await rRes.json();
      if (permsRes.ok) setPermissions(await permsRes.json());
      setRole(r);
      setFormData({
        name: r.name,
        display_name: r.display_name,
        description: r.description || '',
        is_active: r.is_active,
        permission_ids: r.permissions?.map(p => p.id) || [],
      });
    } catch (err) {
      setError('Error connecting to server');
      console.error('Error loading role:', err);
    } finally {
      setLoading(false);
    }
  }, [roleId]);

  useEffect(() => { if (currentUser) load(); }, [currentUser, load]);

  const flash = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 2500); };

  const handlePermissionToggle = (permissionId) => {
    setFormData(prev => ({
      ...prev,
      permission_ids: prev.permission_ids.includes(permissionId)
        ? prev.permission_ids.filter(id => id !== permissionId)
        : [...prev.permission_ids, permissionId],
    }));
  };

  const permissionsByCategory = permissions.reduce((acc, perm) => {
    (acc[perm.category] = acc[perm.category] || []).push(perm);
    return acc;
  }, {});

  const putRole = async (body) => {
    const res = await fetch(`${config.apiUrl}/api/users/roles/${roleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || 'Request failed');
    }
    return res.json();
  };

  const saveDetails = async () => {
    setSavingDetails(true);
    setError('');
    try {
      await putRole({
        display_name: formData.display_name,
        description: formData.description,
        is_active: formData.is_active,
      });
      await load();
      flash('Details saved');
    } catch (err) {
      setError(err.message || 'Failed to save details');
    } finally {
      setSavingDetails(false);
    }
  };

  const savePermissions = async () => {
    setSavingPerms(true);
    setError('');
    try {
      await putRole({ permission_ids: formData.permission_ids });
      await load();
      flash('Permissions saved');
    } catch (err) {
      setError(err.message || 'Failed to save permissions');
    } finally {
      setSavingPerms(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError('');
    try {
      const res = await fetch(`${config.apiUrl}/api/users/roles/${roleId}`, {
        method: 'DELETE', credentials: 'include',
      });
      if (res.ok) {
        navigate('/care/configuration/users/roles');
      } else {
        setError((await res.json()).detail || 'Failed to delete role');
        setShowDelete(false);
      }
    } catch {
      setError('Error connecting to server');
      setShowDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-page"><div className="admin-v2-loading">Loading role…</div></div>
      </AdminV2Layout>
    );
  }

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <div className="tw space-y-6">
          <div className="flex items-center justify-between gap-3">
            <button
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              onClick={() => navigate('/care/configuration/users/roles')}
            >
              <ChevronLeftIcon size={16} /> Roles
            </button>
            <div className="flex items-center gap-2">
              {role?.is_system_role && <Badge variant="secondary">System role</Badge>}
              {typeof role?.user_count === 'number' && (
                <Badge variant="secondary">{role.user_count} {role.user_count === 1 ? 'user' : 'users'}</Badge>
              )}
              <Badge variant={role?.is_active ? 'success' : 'secondary'}>
                {role?.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>

          {error && <Alert variant="destructive" role="alert">{error}</Alert>}
          {success && <Alert variant="success" role="status">{success}</Alert>}

          {/* Basic details */}
          <Card>
            <CardHeader>
              <CardTitle>{role ? role.display_name : 'Role'}</CardTitle>
              <p className="text-sm text-muted-foreground">{role?.name} · Basic details</p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <FormRow>
                <Field label="Role Name (code)" htmlFor="rd-name" hint="Role code cannot be changed">
                  <Input id="rd-name" value={formData.name} disabled />
                </Field>
                <Field label="Display Name" required htmlFor="rd-display">
                  <Input
                    id="rd-display"
                    value={formData.display_name}
                    onChange={e => setFormData({ ...formData, display_name: e.target.value })}
                    required
                  />
                </Field>
              </FormRow>

              <Field label="Description" htmlFor="rd-desc">
                <Input
                  id="rd-desc"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of this role"
                />
              </Field>

              <Field
                label="Status"
                hint={role?.is_system_role ? 'System roles cannot be deactivated' : undefined}
              >
                <Select
                  value={formData.is_active ? 'active' : 'inactive'}
                  onValueChange={(v) => setFormData({ ...formData, is_active: v === 'active' })}
                  disabled={role?.is_system_role}
                >
                  <SelectTrigger className="sm:w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </CardContent>
            <CardFooter className="flex flex-wrap gap-3">
              <Button onClick={saveDetails} disabled={savingDetails}>
                {savingDetails ? 'Saving…' : 'Save details'}
              </Button>
              {role && !role.is_system_role && hasPermission('roles.delete') && (
                <Button variant="destructive" className="sm:ml-auto" onClick={() => setShowDelete(true)}>
                  Delete role
                </Button>
              )}
            </CardFooter>
          </Card>

          {/* Permissions */}
          <Card>
            <CardHeader>
              <CardTitle>Permissions</CardTitle>
              <p className="text-sm text-muted-foreground">
                Choose what users with this role are allowed to do.
              </p>
            </CardHeader>
            <CardContent>
              <PermissionSelector
                permissionsByCategory={permissionsByCategory}
                selectedIds={formData.permission_ids}
                onToggle={handlePermissionToggle}
              />
            </CardContent>
            <CardFooter>
              <Button onClick={savePermissions} disabled={savingPerms}>
                {savingPerms ? 'Saving…' : 'Save permissions'}
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Delete confirmation */}
        <Dialog open={showDelete} onOpenChange={(o) => { if (!o) setShowDelete(false); }}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle>Delete Role</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-foreground">
                Are you sure you want to delete the role <strong>{role?.display_name}</strong>?
              </p>
              <p className="text-muted-foreground">
                This will remove the role from all users who have it assigned. This action cannot be undone.
              </p>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setShowDelete(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete Role'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminV2Layout>
  );
}
