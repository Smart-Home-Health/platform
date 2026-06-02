import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import logoImage from '../assets/logo2.png';
import './LoginPage.css';

/**
 * Forced first-login password reset.
 *
 * Reached from UserSelectionPage when the backend reports requires_password_reset.
 * The user sets a new password and (optionally) a PIN; on success the backend
 * clears the flag and issues a full session, and we continue to the intended page.
 */
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

  return (
    <div className="login-page">
      <div className="login-container">
        <Link to="/" className="login-logo">
          <img src={logoImage} alt="Smart Home Health Logo" />
          <span>Smart Home Health</span>
        </Link>

        <div className="login-card">
          <div className="login-header">
            <h2>Set Your Password</h2>
            <p>
              {fullName
                ? `Welcome, ${fullName}. Please choose a new password to continue.`
                : 'Please choose a new password to continue.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            {error && <div className="error-message">{error}</div>}

            {!carriedPassword && (
              <div className="form-group">
                <label htmlFor="currentPassword">Current Password</label>
                <input
                  type="password"
                  id="currentPassword"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter your current password"
                  autoFocus
                  required
                />
              </div>
            )}

            <div className="form-group">
              <label htmlFor="newPassword">New Password</label>
              <input
                type="password"
                id="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoFocus={!!carriedPassword}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm New Password</label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="pin">PIN (optional)</label>
              <input
                type="password"
                id="pin"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="4-8 digits for quick sign-in"
                maxLength={8}
                pattern="\d*"
              />
            </div>

            {pin && (
              <div className="form-group">
                <label htmlFor="confirmPin">Confirm PIN</label>
                <input
                  type="password"
                  id="confirmPin"
                  inputMode="numeric"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="Re-enter PIN"
                  maxLength={8}
                  pattern="\d*"
                />
              </div>
            )}

            <button type="submit" className="submit-button" disabled={loading}>
              {loading ? 'Saving...' : 'Save & Continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
