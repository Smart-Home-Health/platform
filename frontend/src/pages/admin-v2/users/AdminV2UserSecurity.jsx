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
// User → Security. Everything about how this user proves who they are: their
// PIN, their password, whether they must choose a new one, and the Home
// Assistant identity that signs them in without either.
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import EntityModal, { EmField } from '../../../components/vc/EntityModal';
import { ChevronRightIcon, HomeIcon, KeyIcon, LockIcon, RefreshIcon } from '../../../components/Icons';
import { unlinkHaIdentity } from '../../../services/haIdentity';
import useUserRecord, { forceFirstLogin, resetUserPassword, updateUser } from './useUserRecord';
import UserSection from './UserSection';
import { displayName, formatDate } from './userDetail';

const Row = ({ icon, title, status, blurb, onClick, disabledNote }) => {
  const body = (
    <>
      <span className="cp-tile" data-tone={status.tone === 'muted' ? undefined : status.tone} aria-hidden>
        {icon}
      </span>
      <span className="cp-row-body">
        <span className="cp-row-title cp-row-title-plain">{title}</span>
        <span className="cp-row-status">
          <span className="cp-status" data-tone={status.tone}>{status.label}</span>
        </span>
        <span className="cp-row-blurb">{blurb}</span>
      </span>
      {onClick
        ? <span className="cp-chevron" aria-hidden><ChevronRightIcon size={18} /></span>
        : <span className="ud-row-note">{disabledNote}</span>}
    </>
  );
  return onClick
    ? (
      <button type="button" className="cp-row cp-row-button cp-row-compact" onClick={onClick}>
        {body}
      </button>
    )
    : <div className="cp-row cp-row-compact cp-row-static">{body}</div>;
};

export default function AdminV2UserSecurity() {
  const { userId } = useParams();
  const {
    currentUser, user, haLink, setHaLink, loading, error, setError, reload,
  } = useUserRecord(userId, { haLink: true });

  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [pin, setPin] = useState('');
  const [showReset, setShowReset] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [requireChange, setRequireChange] = useState(false);
  const [dialogError, setDialogError] = useState('');

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 3000); };
  const isSelf = currentUser?.id === user?.id;
  const isAdmin = Boolean(currentUser?.is_system_admin);

  const savePin = async () => {
    if (!/^\d{4,8}$/.test(pin)) { setDialogError('A PIN is 4 to 8 digits.'); return; }
    setBusy(true);
    setDialogError('');
    try {
      await updateUser(userId, { full_name: user.full_name, pin });
      setShowPin(false);
      setPin('');
      await reload();
      flash('PIN saved.');
    } catch (e) {
      setDialogError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const doReset = async () => {
    if (password.length < 8) { setDialogError('A password must be at least 8 characters.'); return; }
    if (password !== confirm) { setDialogError('The two passwords do not match.'); return; }
    setBusy(true);
    setDialogError('');
    try {
      await resetUserPassword(userId, password, requireChange);
      setShowReset(false);
      setPassword('');
      setConfirm('');
      await reload();
      flash('Password reset.');
    } catch (e) {
      setDialogError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const requireFirstLogin = async () => {
    setBusy(true);
    setError('');
    try {
      await forceFirstLogin(userId);
      await reload();
      flash('This user must choose a new password at their next sign-in.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const unlinkHa = async () => {
    setBusy(true);
    setError('');
    try {
      await unlinkHaIdentity(haLink.ha_user_id);
      setHaLink(null);
      flash('Home Assistant sign-in unlinked.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <UserSection
      userId={userId}
      user={user}
      tab="security"
      title="Security"
      description="How this user signs in, and what an administrator can change about it."
      loading={loading}
      error={error}
      notice={notice}
    >
      <section className="cfg-card cp-rows">
          <Row
            icon={<KeyIcon size={18} />}
            title="PIN sign-in"
            status={user?.has_pin
              ? { label: 'Enabled', tone: 'success' }
              : { label: 'Not set', tone: 'muted' }}
            blurb={user?.has_pin
              ? 'A 4–8 digit PIN re-enters the app between full password sign-ins.'
              : 'Without a PIN this user signs in with their password every time.'}
            onClick={() => { setPin(''); setDialogError(''); setShowPin(true); }}
          />

          <Row
            icon={<LockIcon size={18} />}
            title="Password"
            status={user?.last_full_password_login
              ? { label: 'In use', tone: 'success' }
              : { label: 'Never used', tone: 'muted' }}
            blurb={user?.last_full_password_login
              ? `Last full password sign-in ${formatDate(user.last_full_password_login)}.`
              : 'This user has not signed in with their password yet.'}
            onClick={isAdmin && !isSelf
              ? () => {
                setPassword(''); setConfirm(''); setRequireChange(false);
                setDialogError(''); setShowReset(true);
              }
              : undefined}
            disabledNote={isSelf ? 'Change yours in Account settings' : 'Administrators only'}
          />

          <Row
            icon={<RefreshIcon size={18} />}
            title="First-login reset"
            status={user?.force_password_reset
              ? { label: 'Required', tone: 'warning' }
              : { label: 'Not required', tone: 'muted' }}
            blurb={user?.force_password_reset
              ? 'This user must choose a new password before using the app again.'
              : 'This user can sign in with their current password.'}
            onClick={isAdmin && !isSelf && !user?.force_password_reset
              ? requireFirstLogin
              : undefined}
            disabledNote={user?.force_password_reset ? 'Already pending' : 'Administrators only'}
          />

          {isAdmin && (
            <Row
              icon={<HomeIcon size={18} />}
              title="Home Assistant sign-in"
              status={haLink
                ? { label: 'Linked', tone: 'success' }
                : { label: 'Not linked', tone: 'muted' }}
              blurb={haLink
                ? `Signs in automatically as ${haLink.display_name || haLink.username || 'a Home Assistant user'}.`
                : 'Link an identity from Directory → Users to sign in without a prompt.'}
              onClick={haLink ? unlinkHa : undefined}
              disabledNote="Link from Directory"
            />
          )}
      </section>

      <p className="cfg-fine">
        Tap a row to change it. Unlinking a Home Assistant sign-in takes effect immediately;
        a PIN can be replaced but the API has no way to remove one.
      </p>

      <EntityModal
        open={showPin}
        onOpenChange={(o) => { if (!o) setShowPin(false); }}
        title={user?.has_pin ? 'Replace PIN' : 'Set a PIN'}
      >
        <div className="em-form">
          <p className="em-hint">
            A PIN for <strong>{displayName(user)}</strong>. Setting one
            replaces any PIN they already have; the API has no way to take a PIN away again.
          </p>
          {dialogError && <div className="em-error" role="alert">{dialogError}</div>}
          <EmField label="New PIN" htmlFor="us-pin">
            <input
              id="us-pin"
              className="em-input"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="4 to 8 digits"
            />
          </EmField>
          <div className="em-footer">
            <button type="button" className="em-cancel" onClick={() => setShowPin(false)}>Cancel</button>
            <button type="button" className="em-submit" onClick={savePin} disabled={busy}>
              {busy ? 'Saving…' : 'Save PIN'}
            </button>
          </div>
        </div>
      </EntityModal>

      <EntityModal
        open={showReset}
        onOpenChange={(o) => { if (!o) setShowReset(false); }}
        title="Reset password"
      >
        <div className="em-form">
          <p className="em-hint">
            Set a new password for <strong>{displayName(user)}</strong>{' '}
            (@{user?.username}).
          </p>
          {dialogError && <div className="em-error" role="alert">{dialogError}</div>}
          <EmField label="New password" htmlFor="us-new">
            <input
              id="us-new" className="em-input" type="password" autoComplete="new-password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </EmField>
          <EmField label="Confirm password" htmlFor="us-confirm">
            <input
              id="us-confirm" className="em-input" type="password" autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)}
              placeholder="Re-enter the new password"
            />
          </EmField>
          <label className="em-check-row">
            <input
              type="checkbox"
              className="em-check"
              checked={requireChange}
              onChange={(e) => setRequireChange(e.target.checked)}
            />
            <span className="em-check-label">
              Make them choose their own password at the next sign-in
            </span>
          </label>
          <div className="em-footer">
            <button type="button" className="em-cancel" onClick={() => setShowReset(false)}>Cancel</button>
            <button type="button" className="em-submit" onClick={doReset} disabled={busy}>
              {busy ? 'Resetting…' : 'Reset password'}
            </button>
          </div>
        </div>
      </EntityModal>
    </UserSection>
  );
}
