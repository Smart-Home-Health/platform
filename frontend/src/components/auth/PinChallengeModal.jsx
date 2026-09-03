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
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import ModalBase from '../ModalBase';
import Keypad from '../vc/Keypad';
import PersonAvatar from '../vc/PersonAvatar';
import { BackArrowIcon } from '../Icons';
import { useAuth } from '../../contexts/AuthContext';
import './pin-challenge.css';

export const PIN_MIN = 4;
export const PIN_MAX = 8;

/**
 * Global PIN re-auth challenge. Two steps:
 *   1. User picker — full list of active users on the account.
 *   2. PIN entry (or password if the user hasn't full-auth'd in 24h).
 *
 * Posts to /api/auth/user/select via AuthContext.selectUser, so on success
 * AuthContext is updated with the new user and downstream actions log under
 * that user_id.
 *
 * Portaled rather than rendered in place, so transform/perspective ancestors
 * (e.g. the flipping DynamicVitalsCard) can't trap its position: fixed overlay.
 *
 * When the live dashboard is mounted it portals into the board's own slot
 * instead of <body>. Two things follow from that: it inherits the board's dark
 * `--dash-*` tokens (on <body> it fell back to a stale navy), and it picks up
 * the measured panel geometry, so it docks into the cards column. This prompt
 * gates *actions*, never the reading of vitals — it must not cover the board.
 */
export default function PinChallengeModal({ open, onSuccess, onCancel }) {
  const { getAccountUsers, selectUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selected, setSelected] = useState(null);   // user object once picked
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [requirePassword, setRequirePassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Reload + reset every time the modal opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSelected(null);
    setPin('');
    setPassword('');
    setRequirePassword(false);
    setError(null);
    setLoadingUsers(true);
    (async () => {
      try {
        const list = await getAccountUsers();
        if (!cancelled) setUsers(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load users');
      } finally {
        if (!cancelled) setLoadingUsers(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, getAccountUsers]);

  const handlePickUser = (u) => {
    setSelected(u);
    setRequirePassword(!!u.requires_full_password || !u.has_pin);
    setPin('');
    setPassword('');
    setError(null);
  };

  const pinReady = pin.length >= PIN_MIN;
  const canSubmit = !submitting && (requirePassword ? !!password : pinReady);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!selected || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await selectUser(
        selected.id,
        requirePassword ? null : pin,
        requirePassword ? password : null
      );
      if (result.success) {
        onSuccess();
        return;
      }
      if (result.requiresPassword) {
        setRequirePassword(true);
        setError('Password required (PIN unavailable until full login refreshed)');
      } else {
        setError(result.error || 'Authentication failed');
      }
    } catch (err) {
      // selectUser throws on a non-2xx (a wrong PIN is a 401): show it, and
      // clear the PIN so the next attempt starts clean.
      setError(err?.message || 'Authentication failed');
      setPin('');
    } finally {
      setSubmitting(false);
    }
  };

  const pinMode = !!selected && !requirePassword;
  const typeDigit = (d) => setPin((p) => (p.length < PIN_MAX ? p + d : p));
  const eraseDigit = () => setPin((p) => p.slice(0, -1));

  // There is no text field in PIN mode (the pad + masked slots are the
  // input), so a hardware keyboard is wired here: digits, Backspace, Enter.
  useEffect(() => {
    if (!open || !pinMode) return undefined;
    const onKeyDown = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); typeDigit(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); eraseDigit(); }
      else if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // handleSubmit closes over pin/selected/submitting via state; re-bind on change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pinMode, pin, selected, submitting, requirePassword, password]);

  if (!open) return null;

  const boardSlot = typeof document !== 'undefined'
    ? document.getElementById('ld-auth-slot')
    : null;

  return createPortal(
    <ModalBase isOpen={true} onClose={onCancel} title="Verify Caregiver" dock={!!boardSlot}>
      <div className="pc-body">
        {error && <div role="alert" className="pc-error">{error}</div>}

        {!selected ? (
          <>
            <p className="pc-intro">
              Confirm who is at the device. Saves and actions will be logged under
              this user until the next 5-minute idle window.
            </p>
            {loadingUsers ? (
              <div className="pc-loading">Loading…</div>
            ) : users.length === 0 ? (
              <div className="pc-loading">No active users available.</div>
            ) : (
              <div className="pc-users">
                {users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className="pc-user"
                    onClick={() => handlePickUser(u)}
                  >
                    <PersonAvatar kind="user" id={u.id} seed={u.avatar_seed}
                                  photo={u.avatar_photo} size={32} decorative />
                    <span className="pc-user-name">{u.full_name || u.username}</span>
                    {u.requires_full_password && (
                      <span className="pc-user-note">Password</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <form onSubmit={handleSubmit} className="pc-form">
            <div className="pc-chosen">
              <PersonAvatar kind="user" id={selected.id} seed={selected.avatar_seed}
                            photo={selected.avatar_photo} size={40} decorative />
              <span className="pc-chosen-text">
                <span className="pc-chosen-label">Signing in as</span>
                <span className="pc-chosen-name">{selected.full_name || selected.username}</span>
              </span>
            </div>

            {requirePassword ? (
              <div>
                <label className="pc-label" htmlFor="pc-password">Password</label>
                <input
                  id="pc-password"
                  type="password"
                  className="pc-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  required
                />
              </div>
            ) : (
              <div className="pc-pin">
                <span className="pc-label" id="pc-pin-label">PIN</span>
                {/* Masked slots: a dot per entered digit, the caret on the next,
                    a hairline after the fourth for the minimum. The value is
                    never in the DOM; the live region reads the count. */}
                <div
                  className="pc-pin-slots"
                  role="status"
                  aria-live="polite"
                  aria-labelledby="pc-pin-label"
                  aria-label={`PIN: ${pin.length} of ${PIN_MAX} digits entered`}
                  data-testid="pc-pin-slots"
                >
                  {Array.from({ length: PIN_MAX }, (_, i) => {
                    const filled = i < pin.length;
                    const active = i === pin.length;
                    return (
                      <span
                        key={i}
                        className={`pc-pin-slot${filled ? ' filled' : ''}${active ? ' active' : ''}${i === PIN_MIN - 1 ? ' min' : ''}`}
                        aria-hidden="true"
                      >
                        {filled ? '\u25CF' : ''}
                        {active && <span className="vc-caret" />}
                      </span>
                    );
                  })}
                </div>
                <span className="pc-pin-hint">{PIN_MIN}–{PIN_MAX} digits</span>
                <Keypad
                  value={pin}
                  onKey={typeDigit}
                  onBackspace={eraseDigit}
                  canAccept={() => pin.length < PIN_MAX}
                  className="pc-keypad"
                />
              </div>
            )}

            <div className="pc-actions">
              <button
                type="button"
                className="pc-btn ghost"
                onClick={() => { setSelected(null); setError(null); }}
              ><BackArrowIcon size={13} />Change user</button>
              <div className="pc-actions-right">
                <button type="button" className="pc-btn ghost" onClick={onCancel}>Cancel</button>
                <button
                  type="submit"
                  className="pc-btn primary"
                  disabled={!canSubmit}
                >{submitting ? 'Verifying…' : 'Verify'}</button>
              </div>
            </div>
          </form>
        )}
      </div>
    </ModalBase>,
    boardSlot || document.body
  );
}
