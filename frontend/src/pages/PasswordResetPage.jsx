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
/**
 * Forced first-login password reset, on the shared AuthShell.
 *
 * Reached from UserSelectionPage when the backend reports
 * requires_password_reset (never by URL — without router state it bounces
 * back to /select-user). The user sets a new password and optionally a PIN;
 * on success the backend clears the flag and issues a full session, and we
 * continue to the intended page.
 */
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AuthShell from './AuthShell';
import './auth.css';

export default function PasswordResetPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { resetPassword, isAuthenticated, isAccountAuthenticated } = useAuth();

  const state = location.state || {};
  const userId = state.userId;
  const fullName = state.fullName;
  // When the user signed in with their password we carry it through so they
  // don't have to retype it; for a PIN attempt there's nothing to carry.
  const carriedPassword = state.currentPassword || null;

  const from = state.from?.pathname
    ? `${state.from.pathname}${state.from.search || ''}`
    : '/care';
  const openLiveModal = state.openLiveModal || null;

  const [currentPassword, setCurrentPassword] = useState(carriedPassword || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Guard: need a target user and an account session to be here.
  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true, state: openLiveModal ? { openLiveModal } : {} });
    } else if (!isAccountAuthenticated) {
      navigate('/login', { replace: true });
    } else if (!userId) {
      navigate('/select-user', { replace: true });
    }
  }, [isAuthenticated, isAccountAuthenticated, userId, navigate, from, openLiveModal]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!currentPassword) {
      setError('Enter your current password');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from your current password');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    if (pin || confirmPin) {
      if (!/^\d{4,8}$/.test(pin)) {
        setError('PIN must be 4-8 digits');
        return;
      }
      if (pin !== confirmPin) {
        setError('PINs do not match');
        return;
      }
    }

    setLoading(true);
    const result = await resetPassword(userId, currentPassword, newPassword, pin || null);
    setLoading(false);

    if (result.success) {
      navigate(from, { replace: true, state: openLiveModal ? { openLiveModal } : {} });
    } else {
      setError(result.error || 'Password reset failed');
    }
  };

  const field = (id, label, props) => (
    <div className="au-field">
      <label className="au-label" htmlFor={id}>{label}</label>
      <div className="au-input-wrap plain">
        <input type="password" id={id} {...props} />
      </div>
    </div>
  );

  return (
    <AuthShell>
      <div className="au-eyebrow">First sign-in</div>
      <h2 className="au-title">Set Your Password</h2>
      <p className="au-subtitle">
        {fullName
          ? `Welcome, ${fullName}. Choose a new password to continue.`
          : 'Choose a new password to continue.'}
      </p>

      <form onSubmit={handleSubmit} className="au-form au-dense">
        {error && <div className="au-error">{error}</div>}

        {!carriedPassword && field('currentPassword', 'Current password', {
          value: currentPassword,
          onChange: (e) => setCurrentPassword(e.target.value),
          placeholder: 'Enter your current password',
          autoFocus: true,
          required: true,
        })}

        {field('newPassword', 'New password', {
          value: newPassword,
          onChange: (e) => setNewPassword(e.target.value),
          placeholder: 'At least 8 characters',
          autoFocus: !!carriedPassword,
          required: true,
        })}

        {field('confirmPassword', 'Confirm new password', {
          value: confirmPassword,
          onChange: (e) => setConfirmPassword(e.target.value),
          placeholder: 'Re-enter new password',
          required: true,
        })}

        <div className="au-grid">
          {field('pin', 'PIN (optional)', {
            inputMode: 'numeric',
            value: pin,
            onChange: (e) => setPin(e.target.value.replace(/\D/g, '')),
            placeholder: '4–8 digits for quick sign-in',
            maxLength: 8,
            pattern: '\\d*',
          })}
          {pin && field('confirmPin', 'Confirm PIN', {
            inputMode: 'numeric',
            value: confirmPin,
            onChange: (e) => setConfirmPin(e.target.value.replace(/\D/g, '')),
            placeholder: 'Re-enter PIN',
            maxLength: 8,
            pattern: '\\d*',
          })}
        </div>

        <button type="submit" className="au-primary" disabled={loading}>
          {loading ? 'Saving…' : 'Save & continue'}
        </button>
      </form>
    </AuthShell>
  );
}
