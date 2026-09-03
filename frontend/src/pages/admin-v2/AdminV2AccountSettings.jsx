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
import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { API_BASE_URL } from '../../config';
import AdminV2Layout from './AdminV2Layout';
import { SettingsIcon, BuildingIcon, KeyIcon, InfoIcon } from '../../components/Icons';
import { EmField, EmSelect } from '../../components/vc/EntityModal';
import { CfgSection, CfgGroup, CfgBadge } from './settings/CfgSection';
import '../../components/vc/entity-card.css';
import './AdminV2.css';
import './settings/settings-page.css';

export default function AdminV2AccountSettings() {
  const { user } = useAuth();
  const { theme, contrast, setTheme, setContrast } = useTheme();
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
          current_password: currentPassword || null,
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
      fetchAccountDetails(); // refresh password_unset so the notice clears
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
        <div className="admin-v2-page">
          <div className="cfg">
            <CfgSection icon={<SettingsIcon size={16} />} title="Access Denied">
              <CfgGroup>
                <p className="cfg-empty">
                  Account settings are only available to system administrators.
                </p>
              </CfgGroup>
            </CfgSection>
          </div>
        </div>
      </AdminV2Layout>
    );
  }

  if (loading) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-page">
          <p className="cfg-loading">Loading account settings...</p>
        </div>
      </AdminV2Layout>
    );
  }

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <div className="cfg cfg-cols">
          <CfgSection icon={<SettingsIcon size={16} />} title="Appearance">
            <CfgGroup>
              <EmField
                label="Theme"
                htmlFor="theme"
                hint="Applies to your profile and follows you across devices. “System” matches your device’s light/dark setting."
              >
                <EmSelect id="theme" value={theme} onChange={(e) => setTheme(e.target.value)}>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="system">System</option>
                </EmSelect>
              </EmField>
              <EmField
                label="Contrast"
                htmlFor="contrast"
                hint="High contrast uses solid lines and stronger colours (WCAG AAA). Combines with either theme."
              >
                <EmSelect id="contrast" value={contrast} onChange={(e) => setContrast(e.target.value)}>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </EmSelect>
              </EmField>
            </CfgGroup>
          </CfgSection>

          <CfgSection
            icon={<BuildingIcon size={16} />}
            title="Account Details"
            actions={
              <button type="submit" form="account-details-form" className="em-submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            }
          >
            <CfgGroup>
              {/* The submit button lives in the section footer, so it reaches
                  this form through the `form` attribute rather than nesting. */}
              <form id="account-details-form" onSubmit={handleSubmit} className="cfg-form">
                {error && <p className="em-error" role="alert">{error}</p>}
                {success && <p className="em-success" role="status">{success}</p>}

                <EmField label="Account Name" htmlFor="name" hint="Display name for this account">
                  <input
                    className="em-input"
                    type="text"
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter account name"
                    required
                  />
                </EmField>

                <EmField
                  label="Account ID (Login)"
                  htmlFor="slug"
                  hint="Used for logging in. Lowercase letters, numbers, and hyphens only."
                >
                  <input
                    className="em-input"
                    type="text"
                    id="slug"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="account-id"
                    required
                    pattern="[a-z0-9-]+"
                  />
                </EmField>

                <EmField label="Timezone" htmlFor="timezone" hint="Default timezone for schedules and logs">
                  <EmSelect id="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                    {timezones.map(tz => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </EmSelect>
                </EmField>
              </form>
            </CfgGroup>
          </CfgSection>

          <CfgSection icon={<KeyIcon size={16} />} title="Account Password">
            <CfgGroup>
              {!showPasswordForm ? (
                <>
                  {accountData?.password_unset && (
                    <p className="cfg-note">
                      No account password has been set yet (setup was completed
                      through Home Assistant). Shared and LAN devices stay in
                      add-only mode until one is set — you can set it now without
                      a current password.
                    </p>
                  )}
                  <p className="cfg-group-hint">
                    The account password is used to log in at the account level before selecting a user profile.
                  </p>
                  <div className="cfg-actions">
                    <button type="button" className="em-cancel" onClick={() => setShowPasswordForm(true)}>
                      {accountData?.password_unset ? 'Set Password' : 'Change Password'}
                    </button>
                  </div>
                </>
              ) : (
                <form onSubmit={handlePasswordChange} className="cfg-form">
                  {passwordError && <p className="em-error" role="alert">{passwordError}</p>}
                  {passwordSuccess && <p className="em-success" role="status">{passwordSuccess}</p>}

                  {/* First human-set password after an HA-ingress setup: the
                      stored password is random, so there's nothing to verify. */}
                  {!accountData?.password_unset && (
                    <EmField label="Current Password" htmlFor="currentPassword">
                      <input
                        className="em-input"
                        type="password"
                        id="currentPassword"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        required
                      />
                    </EmField>
                  )}

                  <EmField label="New Password" htmlFor="newPassword" hint="Minimum 8 characters">
                    <input
                      className="em-input"
                      type="password"
                      id="newPassword"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      minLength={8}
                      required
                    />
                  </EmField>

                  <EmField label="Confirm New Password" htmlFor="confirmPassword">
                    <input
                      className="em-input"
                      type="password"
                      id="confirmPassword"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      minLength={8}
                      required
                    />
                  </EmField>

                  <div className="cfg-actions end">
                    <button
                      type="button"
                      className="em-cancel"
                      onClick={() => {
                        setShowPasswordForm(false);
                        setCurrentPassword('');
                        setNewPassword('');
                        setConfirmPassword('');
                        setPasswordError('');
                      }}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="em-submit" disabled={savingPassword}>
                      {savingPassword ? 'Changing...' : 'Change Password'}
                    </button>
                  </div>
                </form>
              )}
            </CfgGroup>
          </CfgSection>

          <CfgSection icon={<InfoIcon size={16} />} title="Account Information">
            <CfgGroup>
              <dl className="cfg-facts">
                <div>
                  <dt>Account ID</dt>
                  <dd>{accountData?.id}</dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>
                    {accountData?.created_at
                      ? new Date(accountData.created_at).toLocaleDateString()
                      : 'Unknown'}
                  </dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    <CfgBadge tone={accountData?.is_active ? 'ok' : 'alert'}>
                      {accountData?.is_active ? 'Active' : 'Inactive'}
                    </CfgBadge>
                  </dd>
                </div>
                {accountData?.organization && (
                  <div>
                    <dt>Organization</dt>
                    <dd>{accountData.organization.name}</dd>
                  </div>
                )}
              </dl>
            </CfgGroup>
          </CfgSection>
        </div>
      </div>
    </AdminV2Layout>
  );
}
