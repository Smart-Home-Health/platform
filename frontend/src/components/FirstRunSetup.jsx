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
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import config, { apiFetch } from '../config';
import SecuritySetupWizard from './SecuritySetupWizard';
import logoImage from '../assets/logo2.png';
import './FirstRunSetup.css';

export default function FirstRunSetup() {
  const navigate = useNavigate();
  const { completeFirstRunSetup } = useAuth();
  const [showAccountPwTip, setShowAccountPwTip] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    full_name: '',
    email: '',
    pin: '',
    account_name: '',
    account_password: '',
    confirmAccountPassword: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const [accountSlug, setAccountSlug] = useState('');
  // Under HA ingress the backend reports who is signed in to Home Assistant.
  // Their identity is auto-linked by the setup endpoint, so passwords become
  // optional fallbacks and we can prefill the profile.
  const [haIdentity, setHaIdentity] = useState(null);

  useEffect(() => {
    apiFetch(`${config.apiUrl}/api/auth/first-run`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.ha_identity) return;
        setHaIdentity(data.ha_identity);
        setFormData((prev) => ({
          ...prev,
          username: prev.username || data.ha_identity.username
            || (data.ha_identity.display_name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
          full_name: prev.full_name || data.ha_identity.display_name || data.ha_identity.username || '',
        }));
      })
      .catch(() => {});
  }, []);
  // Optional "Secure this install" step, offered on the success screen.
  // Hidden under HA ingress (TLS already handled) or if status can't load.
  const [offerHttps, setOfferHttps] = useState(false);
  const [showHttpsWizard, setShowHttpsWizard] = useState(false);

  useEffect(() => {
    if (!setupComplete) return;
    apiFetch(`${config.apiUrl}/api/security/status`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && !data.ingress && data.mode === 'off') setOfferHttps(true);
      })
      .catch(() => {});
  }, [setupComplete]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation. Under HA ingress passwords are optional (the HA login is
    // auto-linked and becomes the sign-in); when a field IS filled, it still
    // has to be valid.
    const accountPwSkipped = haIdentity && !formData.account_password && !formData.confirmAccountPassword;
    const userPwSkipped = haIdentity && !formData.password && !formData.confirmPassword;

    if (!accountPwSkipped) {
      if (formData.account_password !== formData.confirmAccountPassword) {
        setError('Account passwords do not match');
        return;
      }
      if (formData.account_password.length < 8) {
        setError('Account password must be at least 8 characters');
        return;
      }
    }

    if (!userPwSkipped) {
      if (formData.password !== formData.confirmPassword) {
        setError('User passwords do not match');
        return;
      }
      if (formData.password.length < 8) {
        setError('User password must be at least 8 characters');
        return;
      }
    }

    if (formData.pin && (formData.pin.length < 4 || formData.pin.length > 8)) {
      setError('PIN must be between 4 and 8 digits');
      return;
    }

    if (formData.pin && !/^\d+$/.test(formData.pin)) {
      setError('PIN must contain only numbers');
      return;
    }

    setLoading(true);

    const setupData = {
      username: formData.username,
      password: formData.password || null,
      full_name: formData.full_name,
      email: formData.email || null,
      pin: formData.pin || null,
      account_name: formData.account_name || null,
      account_password: formData.account_password || null
    };

    const result = await completeFirstRunSetup(setupData);

    if (!result.success) {
      setError(result.error);
      setLoading(false);
    } else {
      setAccountSlug(result.data.account_slug);
      setSetupComplete(true);
      setLoading(false);
    }
  };

  const handleContinue = () => {
    navigate('/care', { replace: true });
  };

  // Show success screen with account slug
  if (setupComplete) {
    if (showHttpsWizard) {
      return (
        <div className="first-run-page">
          <div className="first-run-logo">
            <img src={logoImage} alt="Smart Home Health Logo" />
            <span>Smart Home Health</span>
          </div>
          <div className="first-run-card">
            <div className="first-run-header">
              <h1>Secure this install</h1>
              <p>Optional — enables camera scanning on phones and tablets</p>
            </div>
            <SecuritySetupWizard onFinished={handleContinue} />
            <button
              type="button"
              className="link-button"
              style={{ marginTop: '1rem', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', color: 'inherit' }}
              onClick={handleContinue}
            >
              Skip for now — you can do this later in Configuration → Security
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="first-run-page">
        <div className="first-run-logo">
          <img src={logoImage} alt="Smart Home Health Logo" />
          <span>Smart Home Health</span>
        </div>
        <div className="first-run-card">
          <div className="first-run-header">
            <h1>Setup Complete!</h1>
            <p>Your account has been created successfully</p>
          </div>

          <div className="success-info">
            <div className="account-slug-display">
              <label>Your Account Login ID:</label>
              <div className="slug-value">{accountSlug}</div>
              <small>Use this to log into your account in the future</small>
            </div>

            {offerHttps && (
              <button
                className="submit-button"
                onClick={() => setShowHttpsWizard(true)}
              >
                Secure this install (recommended)
              </button>
            )}
            <button
              className="submit-button"
              onClick={handleContinue}
            >
              Continue to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="first-run-page">
      <div className="first-run-logo">
        <img src={logoImage} alt="Smart Home Health Logo" />
        <span>Smart Home Health</span>
      </div>
      <div className="first-run-card">
        <div className="first-run-header">
          <h1>Welcome to Smart Home Health</h1>
          <p>Let's set up your account and administrator profile</p>
        </div>

        {haIdentity && (
          <div className="info-message" style={{ margin: '0 0 1rem', padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(35,134,54,0.12)', border: '1px solid rgba(35,134,54,0.4)' }}>
            Setting up as <strong>{haIdentity.display_name || haIdentity.username}</strong> from
            Home Assistant — this profile will be linked to your HA login, so opening the app
            from the sidebar signs you in automatically. Passwords are optional here: they're
            only needed for access outside Home Assistant (like a shared wall tablet), and an
            administrator can set them later.
          </div>
        )}

        <form onSubmit={handleSubmit} className="first-run-form">
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="account_name">Account Name (Optional)</label>
              <input
                type="text"
                id="account_name"
                name="account_name"
                value={formData.account_name}
                onChange={handleChange}
                placeholder="Smith Family"
              />
              <small className="form-hint">
                Name for your account (defaults to your full name)
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="account_password">
                {haIdentity ? 'Account Password (Optional)' : 'Account Password *'}
                <span
                  className="info-icon-wrap"
                  onMouseEnter={() => setShowAccountPwTip(true)}
                  onMouseLeave={() => setShowAccountPwTip(false)}
                  onClick={() => setShowAccountPwTip(prev => !prev)}
                >
                  <span className="info-icon">i</span>
                  {showAccountPwTip && (
                    <div className="tooltip-box">
                      This password serves as your account's encryption key and protects all stored health data. Without it, the application operates in write-only mode — you can record new entries using your user password, but existing data remains encrypted and inaccessible until the account password is provided. <strong>If this password is lost, encrypted data cannot be recovered.</strong> Please store it somewhere safe.
                    </div>
                  )}
                </span>
              </label>
              <input
                type="password"
                id="account_password"
                name="account_password"
                value={formData.account_password}
                onChange={handleChange}
                required={!haIdentity}
                minLength={formData.account_password ? 8 : undefined}
                placeholder={haIdentity ? 'Optional — for access outside Home Assistant' : 'Minimum 8 characters'}
              />
              <small className="form-hint">
                {haIdentity
                  ? 'Unlocks full viewing on shared/LAN devices — skip it and set it later under Configuration → Account'
                  : 'Encryption key for your account data — store this securely'}
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="confirmAccountPassword">{haIdentity ? 'Confirm Account Password' : 'Confirm Account Password *'}</label>
              <input
                type="password"
                id="confirmAccountPassword"
                name="confirmAccountPassword"
                value={formData.confirmAccountPassword}
                onChange={handleChange}
                required={!haIdentity || !!formData.account_password}
                minLength={formData.account_password ? 8 : undefined}
                placeholder="Re-enter account password"
              />
            </div>

            <div className="form-group">
              <label htmlFor="full_name">Full Name *</label>
              <input
                type="text"
                id="full_name"
                name="full_name"
                value={formData.full_name}
                onChange={handleChange}
                required
                placeholder="John Doe"
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="username">Username *</label>
              <input
                type="text"
                id="username"
                name="username"
                value={formData.username}
                onChange={handleChange}
                required
                minLength={3}
                placeholder="admin"
              />
            </div>

            <div className="form-group">
              <label htmlFor="email">Email (Optional)</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="admin@example.com"
              />
            </div>

            <div className="form-group">
              <label htmlFor="pin">PIN (Optional - for quick login)</label>
              <input
                type="text"
                id="pin"
                name="pin"
                value={formData.pin}
                onChange={handleChange}
                pattern="\d{4,8}"
                placeholder="4-8 digit PIN"
                maxLength={8}
              />
              <small className="form-hint">
                Set a PIN for quick re-authentication after entering your password
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="password">{haIdentity ? 'User Password (Optional)' : 'User Password *'}</label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required={!haIdentity}
                minLength={formData.password ? 8 : undefined}
                placeholder={haIdentity ? 'Optional — you sign in with Home Assistant' : 'Minimum 8 characters'}
              />
              <small className="form-hint">
                {haIdentity
                  ? 'Only needed to sign in outside Home Assistant — can be set later from user management'
                  : 'Password for your user profile'}
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">{haIdentity ? 'Confirm User Password' : 'Confirm User Password *'}</label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                required={!haIdentity || !!formData.password}
                minLength={formData.password ? 8 : undefined}
                placeholder="Re-enter user password"
              />
            </div>
          </div>

          <button
            type="submit"
            className="submit-button"
            disabled={loading}
          >
            {loading ? 'Creating Account...' : 'Create Account & Administrator'}
          </button>
        </form>

        <div className="first-run-footer">
          <p>This will create your account and an administrator profile with full system access</p>
        </div>
      </div>
    </div>
  );
}
