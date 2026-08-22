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
// First-run setup: create the account and its first administrator. Rendered
// by App instead of the router while the backend reports no admin user.
// Three screens on the shared AuthShell: the form, the "Setup Complete!"
// screen with the account login id, and the optional secure-install step
// (SecuritySetupWizard — shared with Configuration → Security, left as is).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import config, { apiFetch } from '../config';
import SecuritySetupWizard from './SecuritySetupWizard';
import AuthShell from '../pages/AuthShell';
import { InfoIcon } from './Icons';
import '../pages/auth.css';

const slugify = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

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
    confirmAccountPassword: '',
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
          username: prev.username || data.ha_identity.username || slugify(data.ha_identity.display_name),
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
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Under HA ingress passwords are optional (the HA login is auto-linked
    // and becomes the sign-in); when a field IS filled it still has to be valid.
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
    const result = await completeFirstRunSetup({
      username: formData.username,
      password: formData.password || null,
      full_name: formData.full_name,
      email: formData.email || null,
      pin: formData.pin || null,
      account_name: formData.account_name || null,
      account_password: formData.account_password || null,
    });
    if (!result.success) {
      setError(result.error);
      setLoading(false);
    } else {
      setAccountSlug(result.data.account_slug);
      setSetupComplete(true);
      setLoading(false);
    }
  };

  const handleContinue = () => navigate('/care', { replace: true });

  // A labelled input. `name` attributes stay exactly as the backend expects.
  const field = ({ id, label, hint, span = false, type = 'text', ...input }) => (
    <div className={`au-field${span ? ' au-span' : ''}`}>
      <label className="au-label" htmlFor={id}>{label}</label>
      <div className="au-input-wrap plain">
        <input type={type} id={id} name={id} value={formData[id]} onChange={handleChange} {...input} />
      </div>
      {hint && <span className="au-hint">{hint}</span>}
    </div>
  );

  if (setupComplete && showHttpsWizard) {
    return (
      <AuthShell>
        <div className="au-eyebrow">First run · Step 2 of 2</div>
        <h1 className="au-title">Secure this install</h1>
        <p className="au-subtitle">Optional — encrypts connections from phones, tablets and other devices.</p>
        <div className="au-embed">
          <SecuritySetupWizard onFinished={handleContinue} />
        </div>
        <div className="au-footer">
          <button type="button" className="au-toggle" onClick={handleContinue}>
            Skip for now — you can do this later in Configuration → Security
          </button>
        </div>
      </AuthShell>
    );
  }

  if (setupComplete) {
    return (
      <AuthShell>
        <div className="au-eyebrow">First run</div>
        <h1 className="au-title">Setup Complete!</h1>
        <p className="au-subtitle">Your account has been created successfully.</p>

        <div className="au-slug">
          <span className="au-slug-label">Your account login id</span>
          <span className="au-slug-value">{accountSlug}</span>
          <span className="au-slug-note">Use this to log into your account in the future.</span>
        </div>

        <div className="au-actions">
          {offerHttps && (
            <button type="button" className="au-primary" onClick={() => setShowHttpsWizard(true)}>
              Secure this install (recommended)
            </button>
          )}
          <button type="button" className={offerHttps ? 'au-account-btn' : 'au-primary'} onClick={handleContinue}>
            Continue to Dashboard
          </button>
        </div>
      </AuthShell>
    );
  }

  const req = (label) => (haIdentity ? `${label} (optional)` : label);

  return (
    <AuthShell>
      <div className="au-eyebrow">First run</div>
      <h1 className="au-title">Welcome to Smart Home Health</h1>
      <p className="au-subtitle">Set up the account and its administrator profile.</p>

      {haIdentity && (
        <div className="au-notice">
          Setting up as <strong>{haIdentity.display_name || haIdentity.username}</strong> from
          Home Assistant — this profile will be linked to your HA login, so opening the app
          from the sidebar signs you in automatically. Passwords are optional here: they're
          only needed for access outside Home Assistant (like a shared wall tablet), and an
          administrator can set them later.
        </div>
      )}

      <form onSubmit={handleSubmit} className="au-form au-dense">
        {error && <div className="au-error">{error}</div>}

        <div className="au-group">
          <div className="au-group-label">Account</div>
          <div className="au-grid">
            {field({
              id: 'account_name', label: 'Account name (optional)', span: true,
              placeholder: 'Smith Family', hint: 'Defaults to your full name',
            })}
            <div className="au-field">
              <div className="au-label au-label-row">
                <label htmlFor="account_password">{req('Account password')}</label>
                <span className="au-tip-wrap">
                  <button
                    type="button"
                    className="au-tip"
                    aria-label="About the account password"
                    aria-expanded={showAccountPwTip}
                    onMouseEnter={() => setShowAccountPwTip(true)}
                    onMouseLeave={() => setShowAccountPwTip(false)}
                    onClick={() => setShowAccountPwTip((prev) => !prev)}
                  >
                    <InfoIcon size={14} />
                  </button>
                  {showAccountPwTip && (
                    <div className="au-tip-box" role="tooltip">
                      This password is your account's encryption key and protects all stored
                      health data. Without it the app runs write-only — you can record new
                      entries with your user password, but existing data stays encrypted until
                      the account password is entered. <strong>If it is lost, encrypted data
                      cannot be recovered.</strong> Store it somewhere safe.
                    </div>
                  )}
                </span>
              </div>
              <div className="au-input-wrap plain">
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
              </div>
              <span className="au-hint">
                {haIdentity
                  ? 'Unlocks full viewing on shared/LAN devices — skip it and set it later under Configuration → Account'
                  : 'Encryption key for your account data — store this securely'}
              </span>
            </div>
            {field({
              id: 'confirmAccountPassword', label: haIdentity ? 'Confirm account password' : 'Confirm account password',
              type: 'password', placeholder: 'Re-enter account password',
              required: !haIdentity || !!formData.account_password,
              minLength: formData.account_password ? 8 : undefined,
            })}
          </div>
        </div>

        <div className="au-group">
          <div className="au-group-label">Administrator</div>
          <div className="au-grid">
            {field({ id: 'full_name', label: 'Full name', placeholder: 'John Doe', required: true, autoFocus: true })}
            {field({ id: 'username', label: 'Username', placeholder: 'admin', required: true, minLength: 3 })}
            {field({ id: 'email', label: 'Email (optional)', type: 'email', placeholder: 'admin@example.com' })}
            {field({
              id: 'pin', label: 'PIN (optional)', placeholder: '4–8 digits', maxLength: 8, pattern: '\\d{4,8}',
              inputMode: 'numeric', hint: 'Quick re-authentication after entering your password',
            })}
            {field({
              id: 'password', label: req('User password'), type: 'password',
              required: !haIdentity, minLength: formData.password ? 8 : undefined,
              placeholder: haIdentity ? 'Optional — you sign in with Home Assistant' : 'Minimum 8 characters',
              hint: haIdentity
                ? 'Only needed to sign in outside Home Assistant — can be set later from user management'
                : 'Password for your user profile',
            })}
            {field({
              id: 'confirmPassword', label: 'Confirm user password', type: 'password',
              placeholder: 'Re-enter user password',
              required: !haIdentity || !!formData.password, minLength: formData.password ? 8 : undefined,
            })}
          </div>
        </div>

        <button type="submit" className="au-primary" disabled={loading}>
          {loading ? 'Creating account…' : 'Create account & administrator'}
        </button>
      </form>

      <div className="au-footer">
        <p className="au-footnote">Creates the account and an administrator profile with full access</p>
      </div>
    </AuthShell>
  );
}
