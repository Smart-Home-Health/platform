import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { API_BASE_URL } from '../../config';
import AdminV2Layout from './AdminV2Layout';
import './AdminV2.css';

export default function AdminV2AccountSettings() {
  const { account, user } = useAuth();

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
        <div className="admin-v2-page-header">
          <h1 className="admin-v2-page-title">Account Settings</h1>
          <p className="admin-v2-page-subtitle">
            Manage your account name, login credentials, and preferences
          </p>
        </div>

        <div className="admin-v2-content-grid">
          {/* Account Details Card */}
          <div className="admin-v2-card">
            <div className="admin-v2-card-header">
              <h2>Account Details</h2>
            </div>
            <div className="admin-v2-card-body">
              {error && <div className="admin-v2-alert error">{error}</div>}
              {success && <div className="admin-v2-alert success">{success}</div>}
              
              <form onSubmit={handleSubmit} className="admin-v2-form">
                <div className="admin-v2-form-group">
                  <label htmlFor="name">Account Name</label>
                  <input
                    type="text"
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter account name"
                    required
                  />
                  <span className="admin-v2-form-help">
                    Display name for this account
                  </span>
                </div>

                <div className="admin-v2-form-group">
                  <label htmlFor="slug">Account ID (Login)</label>
                  <input
                    type="text"
                    id="slug"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    placeholder="account-id"
                    required
                    pattern="[a-z0-9-]+"
                  />
                  <span className="admin-v2-form-help">
                    Used for logging in. Lowercase letters, numbers, and hyphens only.
                  </span>
                </div>

                <div className="admin-v2-form-group">
                  <label htmlFor="timezone">Timezone</label>
                  <select
                    id="timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                  >
                    {timezones.map(tz => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </select>
                  <span className="admin-v2-form-help">
                    Default timezone for schedules and logs
                  </span>
                </div>

                <div className="admin-v2-form-actions">
                  <button type="submit" className="admin-v2-btn primary" disabled={saving}>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Password Card */}
          <div className="admin-v2-card">
            <div className="admin-v2-card-header">
              <h2>Account Password</h2>
            </div>
            <div className="admin-v2-card-body">
              {!showPasswordForm ? (
                <div className="admin-v2-password-info">
                  <p>The account password is used to log in at the account level before selecting a user profile.</p>
                  <button 
                    className="admin-v2-btn secondary"
                    onClick={() => setShowPasswordForm(true)}
                  >
                    Change Password
                  </button>
                </div>
              ) : (
                <form onSubmit={handlePasswordChange} className="admin-v2-form">
                  {passwordError && <div className="admin-v2-alert error">{passwordError}</div>}
                  {passwordSuccess && <div className="admin-v2-alert success">{passwordSuccess}</div>}
                  
                  <div className="admin-v2-form-group">
                    <label htmlFor="currentPassword">Current Password</label>
                    <input
                      type="password"
                      id="currentPassword"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required
                    />
                  </div>

                  <div className="admin-v2-form-group">
                    <label htmlFor="newPassword">New Password</label>
                    <input
                      type="password"
                      id="newPassword"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      minLength={8}
                      required
                    />
                    <span className="admin-v2-form-help">
                      Minimum 8 characters
                    </span>
                  </div>

                  <div className="admin-v2-form-group">
                    <label htmlFor="confirmPassword">Confirm New Password</label>
                    <input
                      type="password"
                      id="confirmPassword"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      minLength={8}
                      required
                    />
                  </div>

                  <div className="admin-v2-form-actions">
                    <button 
                      type="button" 
                      className="admin-v2-btn secondary"
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
                    <button type="submit" className="admin-v2-btn primary" disabled={savingPassword}>
                      {savingPassword ? 'Changing...' : 'Change Password'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* Account Info Card */}
          <div className="admin-v2-card">
            <div className="admin-v2-card-header">
              <h2>Account Information</h2>
            </div>
            <div className="admin-v2-card-body">
              <div className="admin-v2-info-list">
                <div className="admin-v2-info-item">
                  <span className="admin-v2-info-label">Account ID</span>
                  <span className="admin-v2-info-value">{accountData?.id}</span>
                </div>
                <div className="admin-v2-info-item">
                  <span className="admin-v2-info-label">Created</span>
                  <span className="admin-v2-info-value">
                    {accountData?.created_at 
                      ? new Date(accountData.created_at).toLocaleDateString() 
                      : 'Unknown'}
                  </span>
                </div>
                <div className="admin-v2-info-item">
                  <span className="admin-v2-info-label">Status</span>
                  <span className={`admin-v2-badge ${accountData?.is_active ? 'success' : 'error'}`}>
                    {accountData?.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                {accountData?.organization && (
                  <div className="admin-v2-info-item">
                    <span className="admin-v2-info-label">Organization</span>
                    <span className="admin-v2-info-value">{accountData.organization.name}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminV2Layout>
  );
}
