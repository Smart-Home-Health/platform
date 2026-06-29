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
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import logoImage from '../assets/logo2.png';
import './LoginPage.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isAccountAuthenticated, accountAccess, skipAccountPassword } = useAuth();

  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoSkipTried, setAutoSkipTried] = useState(false);

  const from = location.state?.from?.pathname || '/care';

  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    } else if (isAccountAuthenticated) {
      navigate('/select-user', { state: { from: location.state?.from }, replace: true });
    }
  }, [isAuthenticated, isAccountAuthenticated, navigate, from, location.state]);

  // Deployment opts to skip the account password: grab a monitoring-mode token
  // once and let the redirect effect above move on to user selection. Covers
  // landing here after a logout (the on-mount check in AuthContext covers the
  // initial load).
  useEffect(() => {
    if (skipAccountPassword && !isAccountAuthenticated && !autoSkipTried) {
      setAutoSkipTried(true);
      accountAccess(null);
    }
  }, [skipAccountPassword, isAccountAuthenticated, autoSkipTried, accountAccess]);

  const handleUnlockAndContinue = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await accountAccess(password);
    setLoading(false);
    if (result.success) {
      navigate('/select-user', { state: { from: location.state?.from }, replace: true });
    } else {
      setError(result.error || 'Invalid password');
    }
  };

  const handleContinueWithoutUnlock = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await accountAccess(null);
    setLoading(false);
    if (result.success) {
      navigate('/select-user', { state: { from: location.state?.from }, replace: true });
    } else {
      setError(result.error || 'Could not continue');
    }
  };

  // While the account-password skip is resolving, don't flash the password form.
  if (skipAccountPassword && !error) {
    return (
      <div className="login-page">
        <div className="login-container">
          <Link to="/" className="login-logo">
            <img src={logoImage} alt="Smart Home Health Logo" />
            <span>Smart Home Health</span>
          </Link>
          <p className="login-subtitle">Continuing…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <Link to="/" className="login-logo">
          <img src={logoImage} alt="Smart Home Health Logo" />
          <span>Smart Home Health</span>
        </Link>

        <div className="login-card">
          <div className="login-header">
            <h2>Sign In</h2>
            <p>Enter account password to view data, or continue without unlocking to log and record only.</p>
          </div>

          <form onSubmit={handleUnlockAndContinue} className="login-form">
            {error && <div className="error-message">{error}</div>}

            <div className="form-group">
              <label htmlFor="password">Account password</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password to unlock"
                autoFocus
              />
            </div>

            <button type="submit" className="submit-button" disabled={loading}>
              {loading ? 'Signing in...' : 'Unlock and continue'}
            </button>
          </form>

          <div className="login-form login-form-secondary">
            <button
              type="button"
              className="submit-button submit-button-secondary"
              disabled={loading}
              onClick={handleContinueWithoutUnlock}
            >
              Continue without unlocking
            </button>
          </div>

          <div className="login-footer">
            <Link to="/" className="back-link">
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
