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
import { useNavigate } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { PlusIcon, ShieldIcon, SearchIcon } from '../../components/Icons';
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Field, FormRow } from '@/components/ui/field';
import { PermissionSelector } from './components/PermissionSelector';
import './AdminV2.css';

const emptyForm = {
  name: '', display_name: '', description: '', is_active: true, permission_ids: [],
};

const AdminV2Roles = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Create dialog
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
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
      const response = await fetch(`${config.apiUrl}/api/users/roles`, { credentials: 'include' });
      if (response.ok) setRoles(await response.json());
      else setError('Failed to load roles');
    } catch (err) {
      setError('Error connecting to server');
      console.error('Error fetching roles:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPermissions = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/users/permissions`, { credentials: 'include' });
      if (response.ok) setPermissions(await response.json());
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
        body: JSON.stringify(formData),
      });
      if (response.ok) {
        setShowCreateModal(false);
        setFormData(emptyForm);
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

  const openCreateModal = () => {
    setFormData(emptyForm);
    setFormError(null);
    setShowCreateModal(true);
  };

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

  const filtered = roles.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.display_name.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      (r.description && r.description.toLowerCase().includes(q))
    );
  });

  const stats = {
    total: roles.length,
    active: roles.filter(r => r.is_active).length,
    permissions: permissions.length,
  };

  if (!user) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-loading">Please log in to access role management...</div>
      </AdminV2Layout>
    );
  }

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <div className="tw space-y-6">
          {/* Stats — compact, 3 across even on mobile */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total Roles', value: stats.total },
              { label: 'Active', value: stats.active },
              { label: 'Permissions', value: stats.permissions },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="flex flex-col items-center gap-0.5 py-4">
                  <span className="text-2xl font-semibold text-foreground">{s.value}</span>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</span>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Filter bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                <SearchIcon size={16} />
              </span>
              <Input
                className="pl-9"
                placeholder="Search roles…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button className="gap-1.5" onClick={openCreateModal}>
              <PlusIcon size={16} /> Add Role
            </Button>
          </div>

          {error && <Alert variant="destructive">{error}</Alert>}

          {/* Role cards */}
          {loading ? (
            <div className="admin-v2-loading">Loading roles…</div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                <ShieldIcon size={40} />
                <h3 className="text-foreground">No roles found</h3>
                <p className="text-sm text-muted-foreground">
                  {searchQuery ? 'No roles match your search.' : 'Add a role to get started.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((r) => (
                <button
                  key={r.id}
                  onClick={() => navigate(`/care/configuration/users/roles/${r.id}`)}
                  className="w-full min-w-0 text-left"
                >
                  <Card className={`transition-colors hover:border-ring ${!r.is_active ? 'opacity-60' : ''}`}>
                    <CardContent className="flex items-center gap-3 py-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground">
                        <ShieldIcon size={20} />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate font-medium text-foreground">{r.display_name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {r.name}
                          {r.description ? ` · ${r.description}` : ''}
                        </span>
                        <span className="mt-1">
                          <Badge variant="secondary">{r.permissions?.length || 0} permissions</Badge>
                        </span>
                      </div>
                      {!r.is_active && <Badge variant="secondary">Inactive</Badge>}
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          )}
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
                    required placeholder="e.g., nurse_aide"
                  />
                </Field>
                <Field label="Display Name" required htmlFor="role-display">
                  <Input
                    id="role-display"
                    value={formData.display_name}
                    onChange={e => setFormData({ ...formData, display_name: e.target.value })}
                    required placeholder="e.g., Nurse Aide"
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
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Roles;
