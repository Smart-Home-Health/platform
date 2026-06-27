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
import { useNavigate } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { PlusIcon, UsersIcon, SearchIcon } from '../../components/Icons';
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Field, FormRow } from '@/components/ui/field';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { ToggleList } from './components/ToggleList';
import './AdminV2.css';

const getUserInitials = (name) =>
  (name || '')
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

// Login is "stale" if more than 30 days ago, or never.
const isStaleLogin = (lastLogin) => {
  if (!lastLogin) return true;
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  return new Date(lastLogin) < thirtyDaysAgo;
};

const emptyForm = {
  username: '', full_name: '', email: '', password: '', pin: '',
  is_active: true, role_ids: [], patient_ids: [],
};

const AdminV2Users = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterStaleLogin, setFilterStaleLogin] = useState(false);

  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.is_system_admin) return true;
    return user.permissions?.includes(permission) || false;
  };

  // Create dialog
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

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
      const response = await fetch(`${config.apiUrl}/api/users`, { credentials: 'include' });
      if (response.ok) setUsers(await response.json());
      else setError('Failed to load users');
    } catch (err) {
      setError('Error connecting to server');
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/users/roles`, { credentials: 'include' });
      if (response.ok) setRoles(await response.json());
    } catch (err) {
      console.error('Error fetching roles:', err);
    }
  };

  const fetchPatients = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/patients`, { credentials: 'include' });
      if (response.ok) setPatients(await response.json());
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
        body: JSON.stringify({ patient_ids: patientIds }),
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
      const payload = {
        username: formData.username,
        full_name: formData.full_name,
        password: formData.password,
        email: formData.email || null,
        pin: formData.pin || null,
        is_active: formData.is_active,
        role_ids: formData.role_ids,
      };
      const response = await fetch(`${config.apiUrl}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        const created = await response.json();
        if (formData.patient_ids.length > 0) {
          await savePatientAssignments(created.id, formData.patient_ids);
        }
        setShowCreateModal(false);
        setFormData(emptyForm);
        fetchUsers();
      } else {
        const data = await response.json();
        if (Array.isArray(data.detail)) {
          setFormError(data.detail.map(err => err.msg || err.message || JSON.stringify(err)).join(', '));
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

  const openCreateModal = () => {
    setFormData(emptyForm);
    setFormError(null);
    setShowCreateModal(true);
  };

  const handleRoleToggle = (roleId) => {
    setFormData(prev => ({
      ...prev,
      role_ids: prev.role_ids.includes(roleId)
        ? prev.role_ids.filter(id => id !== roleId)
        : [...prev.role_ids, roleId],
    }));
  };

  const handlePatientToggle = (patientId) => {
    setFormData(prev => ({
      ...prev,
      patient_ids: prev.patient_ids.includes(patientId)
        ? prev.patient_ids.filter(id => id !== patientId)
        : [...prev.patient_ids, patientId],
    }));
  };

  const isFormSystemAdmin = () => formData.role_ids.some(rid => {
    const role = roles.find(r => r.id === rid);
    return role && role.name === 'system_admin';
  });

  // Filter users
  const filteredUsers = users.filter(u => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        u.full_name.toLowerCase().includes(query) ||
        u.username.toLowerCase().includes(query) ||
        (u.email && u.email.toLowerCase().includes(query));
      if (!matchesSearch) return false;
    }
    if (filterRole !== 'all') {
      if (!u.roles?.some(r => r.id === parseInt(filterRole))) return false;
    }
    if (filterStatus === 'active' && !u.is_active) return false;
    if (filterStatus === 'inactive' && u.is_active) return false;
    if (filterStaleLogin && !isStaleLogin(u.last_login)) return false;
    return true;
  });

  const stats = {
    total: users.length,
    active: users.filter(u => u.is_active).length,
    admins: users.filter(u => u.is_system_admin).length,
  };

  if (!user) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-loading">Please log in to access user management...</div>
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
              { label: 'Total', value: stats.total },
              { label: 'Active', value: stats.active },
              { label: 'Admins', value: stats.admins },
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
                placeholder="Search by name, username, or email…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="sm:w-40"><SelectValue placeholder="All roles" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {roles.map(role => (
                  <SelectItem key={role.id} value={String(role.id)}>{role.display_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="sm:w-36"><SelectValue placeholder="All status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap">
              <Checkbox checked={filterStaleLogin} onCheckedChange={(v) => setFilterStaleLogin(v === true)} />
              <span className="text-sm text-foreground">No login &gt; 30d</span>
            </label>
            {hasPermission('users.create') && (
              <Button className="gap-1.5" onClick={openCreateModal}>
                <PlusIcon size={16} /> Add User
              </Button>
            )}
          </div>

          {error && <Alert variant="destructive">{error}</Alert>}

          {/* User cards */}
          {loading ? (
            <div className="admin-v2-loading">Loading users…</div>
          ) : filteredUsers.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                <UsersIcon size={40} />
                <h3 className="text-foreground">No users found</h3>
                <p className="text-sm text-muted-foreground">
                  {searchQuery ? 'No users match your search.' : 'Add a user to get started.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => navigate(`/care/configuration/users/${u.id}`)}
                  className="w-full min-w-0 text-left"
                >
                  <Card className={`transition-colors hover:border-ring ${!u.is_active ? 'opacity-60' : ''}`}>
                    <CardContent className="flex items-center gap-3 py-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-foreground">
                        {getUserInitials(u.full_name)}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate font-medium text-foreground">{u.full_name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          @{u.username}{u.email ? ` · ${u.email}` : ''}
                        </span>
                        <span className="mt-1 flex flex-wrap gap-1">
                          {u.is_system_admin && <Badge variant="default">Admin</Badge>}
                          {(u.roles || []).filter(r => r.name !== 'system_admin').slice(0, 2).map(r => (
                            <Badge key={r.id} variant="secondary">{r.display_name}</Badge>
                          ))}
                          {(!u.roles || u.roles.length === 0) && (
                            <span className="text-xs text-muted-foreground">No roles</span>
                          )}
                        </span>
                      </div>
                      {!u.is_active && <Badge variant="secondary">Inactive</Badge>}
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          )}
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
                    required minLength={3} placeholder="Enter username"
                  />
                </Field>
                <Field label="Full Name" required htmlFor="u-fullname">
                  <Input
                    id="u-fullname"
                    value={formData.full_name}
                    onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                    required placeholder="Enter full name"
                  />
                </Field>
              </FormRow>

              <FormRow>
                <Field label="Email" htmlFor="u-email">
                  <Input
                    id="u-email" type="email"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    placeholder="Enter email address"
                  />
                </Field>
                <Field label="Password" required htmlFor="u-password">
                  <Input
                    id="u-password" type="password"
                    value={formData.password}
                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                    required minLength={8} placeholder="Min 8 characters"
                  />
                </Field>
              </FormRow>

              <FormRow>
                <Field label="PIN (4-8 digits)" htmlFor="u-pin">
                  <Input
                    id="u-pin" type="password"
                    value={formData.pin}
                    onChange={e => setFormData({ ...formData, pin: e.target.value })}
                    placeholder="Optional quick-login PIN" maxLength={8} pattern="[0-9]*"
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

              <Field label="Roles">
                <ToggleList
                  items={roles}
                  selectedIds={formData.role_ids}
                  onToggle={handleRoleToggle}
                  getId={(r) => r.id}
                  renderLabel={(r) => (
                    <>
                      {r.display_name}
                      {r.description && <small className="block text-xs text-muted-foreground">{r.description}</small>}
                    </>
                  )}
                  empty="No roles available"
                />
              </Field>

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

              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create User'}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Users;
