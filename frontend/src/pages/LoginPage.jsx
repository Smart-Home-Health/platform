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
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  UnlockIcon,
  LockIcon,
  EyeIcon,
  EyeOffIcon,
  ClipboardListIcon,
  ChevronRightIcon,
  BackArrowIcon,
} from '../components/Icons';
import AuthShell from './AuthShell';
import './auth.css';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isAccountAuthenticated, accountAccess, skipAccountPassword } = useAuth();

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      accountAccess(null).then((result) => {
        // On failure (backend starting up, network error, ...) surface an error
        // so the guarded "Continuing…" screen falls through to the normal login
        // form instead of hanging forever.
        if (!result?.success) {
          setError(result?.error || 'Could not continue automatically. Please try again.');
        }
      });
    }
  }, [skipAccountPassword, isAccountAuthenticated, autoSkipTried, accountAccess]);

  const handleUnlockAndContinue = async (e) => {
    e.preventDefault();
    setError('');
    // accountAccess() treats a blank password as a request for restricted
    // access — never what someone clicking "Unlock full access" meant.
    if (!password.trim()) {
      setError('Enter the account password, or use quick entry below.');
      return;
    }
    setLoading(true);
    const result = await accountAccess(password);
    setLoading(false);
    if (result.success) {
      navigate('/select-user', { state: { from: location.state?.from }, replace: true });
    } else {
      setError(result.error || 'Invalid password');
    }
  };

  const handleContinueWithoutUnlock = async () => {
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
      <AuthShell>
        <p className="au-continuing">Continuing…</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="au-eyebrow">Access Control</div>
      <h2 className="au-title">Unlock Care Record</h2>
      <p className="au-subtitle">Enter the account password for full access to patient data and settings.</p>

      <form onSubmit={handleUnlockAndContinue} className="au-form">
        {error && <div className="au-error">{error}</div>}

        <label className="au-label" htmlFor="password">Account password</label>
        <div className="au-input-wrap">
          <input
            type={showPassword ? 'text' : 'password'}
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password"
            autoFocus
            required
          />
          <button
            type="button"
            className="au-eye"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
          </button>
        </div>

        <button type="submit" className="au-primary" disabled={loading}>
          <UnlockIcon size={18} /> {loading ? 'Unlocking…' : 'Unlock full access'}
        </button>
        <div className="au-caps">View · Edit · Export · Settings</div>
      </form>

      <div className="au-or"><em>or</em></div>

      <div className="au-quick">
        <span className="au-quick-icon" aria-hidden="true"><ClipboardListIcon size={24} /></span>
        <div className="au-quick-title">Quick entry</div>
        <p className="au-quick-body">Record medications, vitals and care tasks without viewing protected history.</p>
        <button
          type="button"
          className="au-quick-btn"
          disabled={loading}
          onClick={handleContinueWithoutUnlock}
        >
          Continue in quick entry <ChevronRightIcon size={16} />
        </button>
        <div className="au-quick-caps"><LockIcon size={13} /> Record only · Patient data locked</div>
      </div>

      <div className="au-footer">
        <Link to="/" className="au-back">
          <BackArrowIcon size={16} /> Back to home
        </Link>
      </div>
    </AuthShell>
  );
}
