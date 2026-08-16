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
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  LockIcon,
  UnlockIcon,
  ChevronRightIcon,
  BackArrowIcon,
} from '../components/Icons';
import AuthShell from './AuthShell';
import './auth.css';

// Credential chips shown next to clinical roles on the picker cards.
const ROLE_ABBREVIATIONS = {
  'registered nurse': 'RN',
  'licensed practical nurse': 'LPN',
  'certified nursing assistant': 'CNA',
};

const initialsOf = (name) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

export default function UserSelectionPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    account,
    isAuthenticated,
    isAccountAuthenticated,
    getAccountUsers,
    selectUser,
    logout,
    haIdentity,
    readRestricted
  } = useAuth();

  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [usePassword, setUsePassword] = useState(false);

  // Get the intended destination from location state or default to /care
  const fromLocation = location.state?.from;
  const from = fromLocation?.pathname
    ? `${fromLocation.pathname}${fromLocation.search || ''}`
    : '/care';
  const openLiveModal = location.state?.openLiveModal || null;

  // If already fully authenticated, redirect to intended destination
  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true, state: openLiveModal ? { openLiveModal } : {} });
    } else if (!isAccountAuthenticated) {
      // No account logged in - redirect to login
      navigate('/login', { state: { from: location.state?.from }, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openLiveModal is derived from location.state, which is already a dependency
  }, [isAuthenticated, isAccountAuthenticated, navigate, from, location.state]);

  // Fetch users for the account
  useEffect(() => {
    if (isAccountAuthenticated && !isAuthenticated) {
      fetchAccountUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch helper is recreated each render; effect is keyed on auth state change only
  }, [isAccountAuthenticated, isAuthenticated]);

  const fetchAccountUsers = async () => {
    const data = await getAccountUsers();
    setUsers(data);
  };

  const handleUserSelect = (user) => {
    setSelectedUser(user);
    setPassword('');
    setPin('');
    setError('');
    setUsePassword(user.requires_full_password || !user.has_pin);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const usingPin = !usePassword && selectedUser.has_pin;
    // Guard the PIN length client-side so a too-short PIN gets a clear message
    // instead of the backend's Pydantic 422 ("String should have at least…").
    if (usingPin && (pin.length < 4 || pin.length > 8)) {
      setError('PIN must be 4–8 digits');
      return;
    }

    setLoading(true);

    let result;

    if (usePassword || !selectedUser.has_pin) {
      // Full password login
      result = await selectUser(selectedUser.id, null, password);
    } else {
      // PIN verification
      result = await selectUser(selectedUser.id, pin, null);

      if (result.requiresPassword) {
        setUsePassword(true);
        setError('Full password required (daily requirement)');
        setLoading(false);
        return;
      }
    }

    // Forced first-login: route to the password reset screen, carrying the
    // just-entered password (if any) so the user doesn't have to retype it.
    if (result.requiresPasswordReset) {
      navigate('/first-login', {
        state: {
          userId: selectedUser.id,
          fullName: selectedUser.full_name || selectedUser.username,
          currentPassword: usePassword ? password : null,
          from: fromLocation,
          openLiveModal,
        },
      });
      setLoading(false);
      return;
    }

    if (result.success) {
      // Redirect to intended destination
      navigate(from, { replace: true, state: openLiveModal ? { openLiveModal } : {} });
    } else {
      setError(result.error || 'Authentication failed');
    }

    setLoading(false);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const roleChip = (user) => {
    for (const role of user.roles || []) {
      const abbrev = ROLE_ABBREVIATIONS[(role.display_name || role.name || '').toLowerCase()];
      if (abbrev) return abbrev;
    }
    return null;
  };

  return (
    <AuthShell>
      <div className="au-eyebrow">Care Session</div>
      <h2 className="au-title">Who is documenting?</h2>
      <p className="au-subtitle">
        {haIdentity && !haIdentity.mapped
          ? `Signed in with Home Assistant as ${haIdentity.display_name || haIdentity.username || 'an unlinked user'} — choose your profile.`
          : account?.name
            ? `${account.name} — select your profile. Activity in this session will be recorded under your name.`
            : 'Select your profile. Activity in this session will be recorded under your name.'}
      </p>

      <div className={`au-access${readRestricted ? '' : ' full'}`}>
        {readRestricted ? <LockIcon size={16} /> : <UnlockIcon size={16} />}
        <span className="au-access-label">Access · {readRestricted ? 'Quick entry' : 'Full'}</span>
        <span className="au-access-sep" aria-hidden="true" />
        <span className="au-access-state">{readRestricted ? 'Record only' : 'Unlocked'}</span>
        <button type="button" className="au-access-change" onClick={handleLogout}>Change</button>
      </div>

      {!selectedUser ? (
        <div className="au-user-list">
          {users.length === 0 ? (
            <div className="au-no-users">
              <p>No users available. Please contact an administrator.</p>
            </div>
          ) : (
            users.map((user) => {
              const name = user.full_name || user.username;
              const chip = roleChip(user);
              return (
                <button
                  key={user.id}
                  className="user-card"
                  onClick={() => handleUserSelect(user)}
                >
                  <span className="au-avatar" aria-hidden="true">{initialsOf(name)}</span>
                  <span className="au-user-info">
                    <span className="au-user-name">{name}</span>
                    <span className="au-user-roles">
                      <span>
                        {user.roles?.map(r => r.display_name || r.name).join(', ') || 'User'}
                        {user.ha_linked ? ' · Signs in with Home Assistant' : ''}
                      </span>
                      {chip && <span className="au-role-chip">{chip}</span>}
                    </span>
                  </span>
                  <span className="au-user-chev" aria-hidden="true"><ChevronRightIcon size={20} /></span>
                </button>
              );
            })
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="au-form">
          <div className="au-selected">
            <span className="au-avatar large" aria-hidden="true">
              {initialsOf(selectedUser.full_name || selectedUser.username)}
            </span>
            <span className="au-user-name">{selectedUser.full_name || selectedUser.username}</span>
            <button
              type="button"
              className="au-ghost-btn"
              onClick={() => setSelectedUser(null)}
            >
              Change user
            </button>
          </div>

          {error && <div className="au-error">{error}</div>}

          {usePassword ? (
            <>
              <label className="au-label" htmlFor="password">Password</label>
              <div className="au-input-wrap">
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  autoFocus
                  required
                />
              </div>
              {selectedUser.ha_linked && !selectedUser.has_pin && (
                <small className="au-hint">
                  This profile normally signs in automatically from the Home
                  Assistant sidebar. To use it here, enter its app password —
                  if it was never given one, an administrator can set one (or
                  a PIN) under Configuration → Users.
                </small>
              )}
            </>
          ) : (
            <>
              <label className="au-label" htmlFor="pin">PIN</label>
              <div className="au-input-wrap">
                <input
                  type="password"
                  id="pin"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Enter your PIN"
                  maxLength={8}
                  pattern="\d*"
                  autoFocus
                  required
                />
              </div>
            </>
          )}

          <button type="submit" className="au-primary" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          {selectedUser.has_pin && (
            <button
              type="button"
              className="au-toggle"
              onClick={() => {
                setUsePassword(!usePassword);
                setPassword('');
                setPin('');
                setError('');
              }}
            >
              {usePassword ? 'Use PIN instead' : 'Use password instead'}
            </button>
          )}
        </form>
      )}

      <div className="au-footer">
        <button type="button" className="au-account-btn" onClick={handleLogout}>
          <BackArrowIcon size={16} /> Change account
        </button>
        <div className="au-footnote">Session locks after inactivity</div>
      </div>
    </AuthShell>
  );
}
