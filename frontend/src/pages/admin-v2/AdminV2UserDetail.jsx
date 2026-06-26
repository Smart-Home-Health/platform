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
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import AdminV2Layout from './AdminV2Layout';
import { ToggleList } from './components/ToggleList';
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
import './AdminV2.css';

const emptyForm = {
  username: '', full_name: '', email: '', pin: '',
  is_active: true, role_ids: [], patient_ids: [],
};

export default function AdminV2UserDetail() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const [target, setTarget] = useState(null); // loaded user (with roles)
  const [roles, setRoles] = useState([]);
  const [patients, setPatients] = useState([]);
  const [formData, setFormData] = useState(emptyForm);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showResetPw, setShowResetPw] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [requireChange, setRequireChange] = useState(false);
  const [resettingPw, setResettingPw] = useState(false);

  const hasPermission = (permission) => {
    if (!currentUser) return false;
    if (currentUser.is_system_admin) return true;
    return currentUser.permissions?.includes(permission) || false;
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [uRes, pRes, rolesRes, patientsRes] = await Promise.all([
        fetch(`${config.apiUrl}/api/users/${userId}`, { credentials: 'include' }),
        fetch(`${config.apiUrl}/api/users/${userId}/patients`, { credentials: 'include' }),
        fetch(`${config.apiUrl}/api/users/roles`, { credentials: 'include' }),
        fetch(`${config.apiUrl}/api/patients`, { credentials: 'include' }),
      ]);
      if (!uRes.ok) { setError('Failed to load user'); return; }
      const u = await uRes.json();
      const patientIds = pRes.ok ? (await pRes.json()).patient_ids || [] : [];
      if (rolesRes.ok) setRoles(await rolesRes.json());
      if (patientsRes.ok) setPatients(await patientsRes.json());
      setTarget(u);
      setFormData({
        username: u.username,
        full_name: u.full_name,
        email: u.email || '',
        pin: '',
        is_active: u.is_active,
        role_ids: u.roles?.map(r => r.id) || [],
        patient_ids: patientIds,
      });
    } catch (err) {
      setError('Error connecting to server');
      console.error('Error loading user:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { if (currentUser) load(); }, [currentUser, load]);

  const flash = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 2500); };

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

  const saveDetails = async () => {
    setSavingDetails(true);
    setError('');
    try {
      const res = await fetch(`${config.apiUrl}/api/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          full_name: formData.full_name,
          email: formData.email || null,
          is_active: formData.is_active,
          pin: formData.pin || null,
        }),
      });
      if (res.ok) {
        setTarget(await res.json());
        setFormData(prev => ({ ...prev, pin: '' }));
        flash('Details saved');
      } else {
        const data = await res.json();
        setError(Array.isArray(data.detail)
          ? data.detail.map(e => e.msg || e.message || JSON.stringify(e)).join(', ')
          : (data.detail || 'Failed to save details'));
      }
    } catch {
      setError('Error connecting to server');
    } finally {
      setSavingDetails(false);
    }
  };

  const saveAccess = async () => {
    setSavingAccess(true);
    setError('');
    try {
      // Roles: diff against currently loaded roles.
      const currentRoleIds = target.roles?.map(r => r.id) || [];
      for (const roleId of formData.role_ids) {
        if (!currentRoleIds.includes(roleId)) {
          await fetch(`${config.apiUrl}/api/users/${userId}/roles/${roleId}`, {
            method: 'POST', credentials: 'include',
          });
        }
      }
      for (const roleId of currentRoleIds) {
        if (!formData.role_ids.includes(roleId)) {
          await fetch(`${config.apiUrl}/api/users/${userId}/roles/${roleId}`, {
            method: 'DELETE', credentials: 'include',
          });
        }
      }
      // Patient assignments.
      await fetch(`${config.apiUrl}/api/users/${userId}/patients`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ patient_ids: formData.patient_ids }),
      });
      await load();
      flash('Access saved');
    } catch {
      setError('Error connecting to server');
    } finally {
      setSavingAccess(false);
    }
  };

  const handleForcePasswordReset = async () => {
    if (!window.confirm(
      `Require ${target.full_name || target.username} to set a new password on their next sign-in?`
    )) return;
    try {
      const res = await fetch(`${config.apiUrl}/api/users/${userId}/force-password-reset`, {
        method: 'POST', credentials: 'include',
      });
      if (res.ok) { setTarget(await res.json()); flash('First-login reset requested'); }
      else setError((await res.json()).detail || 'Failed to require first login');
    } catch {
      setError('Error connecting to server');
    }
  };

  const openResetPw = () => {
    setNewPassword('');
    setConfirmPassword('');
    setRequireChange(false);
    setError('');
    setShowResetPw(true);
  };

  const handleResetPassword = async () => {
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setResettingPw(true);
    setError('');
    try {
      const res = await fetch(`${config.apiUrl}/api/users/${userId}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ new_password: newPassword, require_change: requireChange }),
      });
      if (res.ok) {
        setTarget(await res.json());
        setShowResetPw(false);
        flash('Password reset');
      } else {
        const data = await res.json();
        setError(Array.isArray(data.detail)
          ? data.detail.map(e => e.msg || e.message || JSON.stringify(e)).join(', ')
          : (data.detail || 'Failed to reset password'));
      }
    } catch {
      setError('Error connecting to server');
    } finally {
      setResettingPw(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError('');
    try {
      const res = await fetch(`${config.apiUrl}/api/users/${userId}`, {
        method: 'DELETE', credentials: 'include',
      });
      if (res.ok) {
        navigate('/care/configuration/users');
      } else {
        setError((await res.json()).detail || 'Failed to delete user');
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
        <div className="admin-v2-page"><div className="admin-v2-loading">Loading user…</div></div>
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
              onClick={() => navigate('/care/configuration/users')}
            >
              <ChevronLeftIcon size={16} /> Users
            </button>
            <div className="flex items-center gap-2">
              {target?.force_password_reset && <Badge variant="secondary">First login pending</Badge>}
              <Badge variant={target?.is_active ? 'success' : 'secondary'}>
                {target?.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>

          {error && <Alert variant="destructive" role="alert">{error}</Alert>}
          {success && <Alert variant="success" role="status">{success}</Alert>}

          {/* Basic details */}
          <Card>
            <CardHeader>
              <CardTitle>{target ? target.full_name : 'User'}</CardTitle>
              <p className="text-sm text-muted-foreground">@{target?.username} · Basic details</p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <FormRow>
                <Field label="Username" htmlFor="ud-username" hint="Username cannot be changed">
                  <Input id="ud-username" value={formData.username} disabled />
                </Field>
                <Field label="Full Name" required htmlFor="ud-fullname">
                  <Input
                    id="ud-fullname"
                    value={formData.full_name}
                    onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                    required placeholder="Enter full name"
                  />
                </Field>
              </FormRow>

              <FormRow>
                <Field label="Email" htmlFor="ud-email">
                  <Input
                    id="ud-email" type="email"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    placeholder="Enter email address"
                  />
                </Field>
                <Field label="New PIN (leave blank to keep)" htmlFor="ud-pin">
                  <Input
                    id="ud-pin" type="password"
                    value={formData.pin}
                    onChange={e => setFormData({ ...formData, pin: e.target.value })}
                    placeholder="Enter new PIN" maxLength={8} pattern="[0-9]*"
                  />
                </Field>
              </FormRow>

              <Field
                label="Status"
                hint={target?.is_system_admin ? 'System admin status cannot be changed' : undefined}
              >
                <Select
                  value={formData.is_active ? 'active' : 'inactive'}
                  onValueChange={(v) => setFormData({ ...formData, is_active: v === 'active' })}
                  disabled={target?.is_system_admin}
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
              {currentUser?.is_system_admin && target && target.id !== currentUser.id && (
                <Button variant="secondary" onClick={openResetPw}>
                  Reset password
                </Button>
              )}
              {currentUser?.is_system_admin && target && target.id !== currentUser.id && !target.force_password_reset && (
                <Button variant="secondary" onClick={handleForcePasswordReset}>
                  Require first login
                </Button>
              )}
              {target && !target.is_system_admin && hasPermission('users.delete') && (
                <Button variant="destructive" className="sm:ml-auto" onClick={() => setShowDelete(true)}>
                  Delete user
                </Button>
              )}
            </CardFooter>
          </Card>

          {/* Roles & patient access */}
          <Card>
            <CardHeader>
              <CardTitle>Roles &amp; access</CardTitle>
              <p className="text-sm text-muted-foreground">
                Assign roles and the patients this user can access.
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Field label="Roles">
                <ToggleList
                  items={roles}
                  selectedIds={formData.role_ids}
                  onToggle={handleRoleToggle}
                  getId={(r) => r.id}
                  isDisabled={(r) => r.name === 'system_admin' && target?.is_system_admin}
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
            </CardContent>
            <CardFooter>
              <Button onClick={saveAccess} disabled={savingAccess}>
                {savingAccess ? 'Saving…' : 'Save access'}
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Reset password */}
        <Dialog open={showResetPw} onOpenChange={(o) => { if (!o) setShowResetPw(false); }}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle>Reset Password</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Set a new password for <strong className="text-foreground">{target?.full_name}</strong> (@{target?.username}).
              </p>
              {error && <Alert variant="destructive" role="alert">{error}</Alert>}
              <Field label="New password" htmlFor="rp-new">
                <Input
                  id="rp-new" type="password" autoComplete="new-password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                />
              </Field>
              <Field label="Confirm password" htmlFor="rp-confirm">
                <Input
                  id="rp-confirm" type="password" autoComplete="new-password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                />
              </Field>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={requireChange}
                  onChange={e => setRequireChange(e.target.checked)}
                />
                Require the user to choose a new password at next sign-in
              </label>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setShowResetPw(false)}>Cancel</Button>
              <Button onClick={handleResetPassword} disabled={resettingPw}>
                {resettingPw ? 'Resetting…' : 'Reset password'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirmation */}
        <Dialog open={showDelete} onOpenChange={(o) => { if (!o) setShowDelete(false); }}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle>Delete User</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-foreground">
                Are you sure you want to delete <strong>{target?.full_name}</strong> (@{target?.username})?
              </p>
              <p className="text-muted-foreground">This action cannot be undone.</p>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setShowDelete(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete User'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminV2Layout>
  );
}
