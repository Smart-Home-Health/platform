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
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL } from '../../config';
import AdminV2Layout from './AdminV2Layout';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Field } from '@/components/ui/field';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import './AdminV2.css';

export default function AdminV2AccountSettings() {
  const { user } = useAuth();
  const [accountData, setAccountData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form states
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [timezone, setTimezone] = useState('');

  // Password change
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    fetchAccountDetails();
  }, []);

  const fetchAccountDetails = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/account`, {
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to fetch account details');
      const data = await res.json();
      setAccountData(data);
      setName(data.name || '');
      setSlug(data.slug || '');
      setTimezone(data.timezone || 'UTC');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/account`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name, slug, timezone })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to update account');
      }

      const data = await res.json();
      setAccountData(data);
      setSuccess('Account settings updated successfully');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters');
      return;
    }

    setSavingPassword(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/account/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to change password');
      }

      setPasswordSuccess('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordForm(false);
    } catch (err) {
      setPasswordError(err.message);
    } finally {
      setSavingPassword(false);
    }
  };

  // Common timezone options
  const timezones = [
    'UTC',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Phoenix',
    'America/Anchorage',
    'Pacific/Honolulu',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Australia/Sydney',
  ];

  // Only system admins can access account settings
  if (user && !user.is_system_admin) {
    return (
      <AdminV2Layout>
        <div style={{ padding: '2rem', color: '#8b949e', textAlign: 'center' }}>
          <h3 style={{ color: '#e6edf3' }}>Access Denied</h3>
          <p>Account settings are only available to system administrators.</p>
        </div>
      </AdminV2Layout>
    );
  }

  if (loading) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-page">
          <div className="admin-v2-loading">Loading account settings...</div>
        </div>
      </AdminV2Layout>
    );
  }

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <div className="tw grid gap-6 lg:grid-cols-2">
          {/* Account Details Card */}
          <Card>
            <CardHeader><CardTitle>Account Details</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                {error && <Alert variant="destructive">{error}</Alert>}
                {success && <Alert variant="success">{success}</Alert>}

                <Field label="Account Name" htmlFor="name" hint="Display name for this account">
                  <Input
                    type="text"
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter account name"
                    required
                  />
                </Field>

                <Field
                  label="Account ID (Login)"
                  htmlFor="slug"
                  hint="Used for logging in. Lowercase letters, numbers, and hyphens only."
                >
                  <Input
                    type="text"
                    id="slug"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="account-id"
                    required
                    pattern="[a-z0-9-]+"
                  />
                </Field>

                <Field label="Timezone" htmlFor="timezone" hint="Default timezone for schedules and logs">
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger id="timezone"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {timezones.map(tz => (
                        <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <div className="flex justify-end">
                  <Button type="submit" disabled={saving}>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Password Card */}
          <Card>
            <CardHeader><CardTitle>Account Password</CardTitle></CardHeader>
            <CardContent>
              {!showPasswordForm ? (
                <div className="flex flex-col items-start gap-4">
                  <p className="text-sm text-muted-foreground">
                    The account password is used to log in at the account level before selecting a user profile.
                  </p>
                  <Button variant="secondary" onClick={() => setShowPasswordForm(true)}>
                    Change Password
                  </Button>
                </div>
              ) : (
                <form onSubmit={handlePasswordChange} className="flex flex-col gap-4">
                  {passwordError && <Alert variant="destructive">{passwordError}</Alert>}
                  {passwordSuccess && <Alert variant="success">{passwordSuccess}</Alert>}

                  <Field label="Current Password" htmlFor="currentPassword">
                    <Input
                      type="password"
                      id="currentPassword"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                    />
                  </Field>

                  <Field label="New Password" htmlFor="newPassword" hint="Minimum 8 characters">
                    <Input
                      type="password"
                      id="newPassword"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      minLength={8}
                      required
                    />
                  </Field>

                  <Field label="Confirm New Password" htmlFor="confirmPassword">
                    <Input
                      type="password"
                      id="confirmPassword"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      minLength={8}
                      required
                    />
                  </Field>

                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setShowPasswordForm(false);
                        setCurrentPassword('');
                        setNewPassword('');
                        setConfirmPassword('');
                        setPasswordError('');
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={savingPassword}>
                      {savingPassword ? 'Changing...' : 'Change Password'}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>

          {/* Account Info Card */}
          <Card>
            <CardHeader><CardTitle>Account Information</CardTitle></CardHeader>
            <CardContent>
              <dl className="flex flex-col divide-y divide-border text-sm">
                <div className="flex items-center justify-between py-2">
                  <dt className="text-muted-foreground">Account ID</dt>
                  <dd className="font-medium text-foreground">{accountData?.id}</dd>
                </div>
                <div className="flex items-center justify-between py-2">
                  <dt className="text-muted-foreground">Created</dt>
                  <dd className="font-medium text-foreground">
                    {accountData?.created_at
                      ? new Date(accountData.created_at).toLocaleDateString()
                      : 'Unknown'}
                  </dd>
                </div>
                <div className="flex items-center justify-between py-2">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>
                    <span
                      className={
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium " +
                        (accountData?.is_active
                          ? "bg-success/20 text-[#3fb950]"
                          : "bg-destructive/20 text-[#ff7b72]")
                      }
                    >
                      {accountData?.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </dd>
                </div>
                {accountData?.organization && (
                  <div className="flex items-center justify-between py-2">
                    <dt className="text-muted-foreground">Organization</dt>
                    <dd className="font-medium text-foreground">{accountData.organization.name}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminV2Layout>
  );
}
