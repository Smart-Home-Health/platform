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
// Configuration → Directory → one user. A hub, not a form: who they are, what
// their roles reach, how they sign in, and what the account log recorded —
// each row a way into the screen that changes it. Same bones as the care
// profile hub, because it is the same kind of page.
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AdminV2Layout from '../AdminV2Layout';
import {
  ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, HistoryIcon, LockIcon, ProfileIcon,
  ShieldIcon,
} from '../../../components/Icons';
import ConfirmSheet from '../../../components/vc/ConfirmSheet';
import { CfgBadge } from '../settings/CfgSection';
import useUserRecord, { deleteUser, updateUser } from './useUserRecord';
import UserTabs from './UserTabs';
import AvatarEditor from '../components/AvatarEditor';
import {
  displayName, formatDate, identityLine, lastSeen, profileNamesFor,
} from './userDetail';
import {
  accessSection, accountSection, activitySection, securitySection, userStats,
} from './userSections';
import '../../../components/vc/entity-card.css';
import '../AdminV2.css';
import '../care-profile/care-profile.css';
import './users.css';

const SectionRow = ({ section }) => (
  <Link className="cp-row cp-row-compact cp-row-stacked" to={section.to}>
    <span className="cp-tile" data-tone={section.status.tone === 'muted' ? undefined : section.status.tone} aria-hidden>
      {section.icon}
    </span>
    <span className="cp-row-body cp-row-body-stacked">
      <span className="cp-row-title cp-row-title-plain">{section.title}</span>
      <span className="cp-row-status">
        <span className="cp-status" data-tone={section.status.tone}>{section.status.label}</span>
      </span>
      <span className="cp-row-summary">
        <span className="cp-facts">
          {section.facts.map((fact) => <span className="cp-fact" key={fact}>{fact}</span>)}
        </span>
        <span className="cp-action">{section.action}</span>
      </span>
    </span>
    <span className="cp-chevron" aria-hidden><ChevronRightIcon size={18} /></span>
  </Link>
);

export default function AdminV2UserDetail() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const {
    currentUser, user, patients, patientIds, activity, loading, error, setError, reload,
  } = useUserRecord(userId, { activity: 2 });

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [showDelete, setShowDelete] = useState(false);

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 3000); };

  const can = (permission) => {
    if (!currentUser) return false;
    if (currentUser.is_system_admin) return true;
    return currentUser.permissions?.includes(permission) || false;
  };

  const toggleActive = async () => {
    setBusy(true);
    setError('');
    try {
      const wasActive = user.is_active;
      await updateUser(userId, { full_name: user.full_name, is_active: !wasActive });
      await reload();
      flash(wasActive ? 'User deactivated.' : 'User activated.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    setBusy(true);
    setError('');
    try {
      await deleteUser(userId);
      navigate('/care/configuration/users');
    } catch (e) {
      setError(e.message);
      setShowDelete(false);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-page"><p className="cfg-loading">Loading user…</p></div>
      </AdminV2Layout>
    );
  }

  const base = `/care/configuration/users/${userId}`;
  const profileNames = profileNamesFor(patients, patientIds);
  const isSelf = currentUser?.id === user?.id;

  const sections = [
    {
      id: 'account',
      to: `${base}/edit`,
      icon: <ProfileIcon size={18} />,
      title: 'Account details',
      action: 'Manage details',
      ...accountSection(user),
    },
    {
      id: 'access',
      to: `${base}/access`,
      icon: <ShieldIcon size={18} />,
      title: 'Roles and access',
      action: 'Manage access',
      ...accessSection(user, profileNames, patientIds),
    },
    {
      id: 'security',
      to: `${base}/security`,
      icon: <LockIcon size={18} />,
      title: 'Security',
      action: 'Manage security',
      ...securitySection(user),
    },
    {
      id: 'activity',
      to: `${base}/activity`,
      icon: <HistoryIcon size={18} />,
      title: 'Activity',
      action: 'View full activity',
      ...activitySection(activity),
    },
  ];

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <div className="cfg">
          <div className="cfg-crumb">
            <Link to="/care/configuration/users" className="cfg-back">
              <ChevronLeftIcon size={14} /> Users
            </Link>
            <div className="cfg-crumb-tags">
              {user?.force_password_reset && <CfgBadge tone="warn">First login pending</CfgBadge>}
              <CfgBadge tone={user?.is_active ? 'ok' : undefined}>
                {user?.is_active ? 'Active' : 'Inactive'}
              </CfgBadge>
            </div>
          </div>

          {error && <p className="em-error" role="alert">{error}</p>}
          {notice && <p className="em-success" role="status">{notice}</p>}

          {/* Who this user is */}
          <section className="cfg-card ud-identity-card">
            <div className="cp-identity">
              <AvatarEditor kind="user" person={user} name={displayName(user)}
                            onError={setError} onNotice={flash} />
              <div className="ud-identity-name">
                <h1 className="cp-name">{displayName(user)}</h1>
                <p className="cp-subtitle">@{user?.username}</p>
              </div>
              <Link className="cfg-ghost" to={`${base}/edit`}>Edit details</Link>
            </div>

            {/* Roles and reach get the whole card width — squeezed into the
              * column beside the button they wrap after three words. */}
            <p className="cp-subtitle ud-identity-line">{identityLine(user, profileNames)}</p>

            <div className="cp-meta ud-divide">
              <div>
                <span className="cp-meta-label">Last sign-in</span>
                <span className="cp-meta-value">{lastSeen(user)}</span>
              </div>
              <div>
                <span className="cp-meta-label">Account created</span>
                <span className="cp-meta-value">{formatDate(user?.created_at) || '—'}</span>
              </div>
            </div>
          </section>

          <UserTabs userId={userId} current="overview" />

          <section className="cfg-card">
            <div className="cp-stats ud-stats">
              {userStats(user, patientIds).map((stat) => (
                <div className="cp-stat" key={stat.label}>
                  <span className="cp-stat-value">{stat.value}</span>
                  <span className="cp-stat-label">{stat.label}</span>
                </div>
              ))}
            </div>
            <div className="cp-rows ud-border-top">
              {sections.map((section) => <SectionRow key={section.id} section={section} />)}
            </div>
          </section>

          {/* Danger zone */}
          {(can('users.update') || can('users.delete')) && !isSelf && (
            <section className="cfg-card">
              <details className="cp-advanced ud-danger">
                <summary>
                  <span className="cp-eyebrow">Danger zone</span>
                  <span className="cp-advanced-marker" aria-hidden><ChevronDownIcon size={16} /></span>
                </summary>
                <div className="ud-danger-body">
                  <p className="cfg-fine">
                    {user?.is_system_admin
                      ? 'A system administrator cannot be deactivated or deleted here.'
                      : 'Deactivating keeps the account and everything recorded against it, but '
                        + 'stops this user signing in. Deleting removes the account for good.'}
                  </p>
                  {!user?.is_system_admin && (
                    <div className="ud-actions">
                      {can('users.update') && (
                        <button
                          type="button"
                          className={user?.is_active ? 'em-danger' : 'em-cancel'}
                          onClick={toggleActive}
                          disabled={busy}
                        >
                          {user?.is_active ? 'Deactivate user' : 'Activate user'}
                        </button>
                      )}
                      {can('users.delete') && (
                        <button
                          type="button"
                          className="em-danger"
                          onClick={() => setShowDelete(true)}
                          disabled={busy}
                        >
                          Delete user
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </details>
            </section>
          )}
        </div>

        <ConfirmSheet
          open={showDelete}
          onOpenChange={(o) => { if (!o) setShowDelete(false); }}
          title="Delete user"
          confirmLabel={busy ? 'Deleting…' : 'Delete user'}
          tone="destructive"
          busy={busy}
          onConfirm={confirmDelete}
        >
          Delete <strong>{displayName(user)}</strong> (@{user?.username})?
          This cannot be undone.
        </ConfirmSheet>
      </div>
    </AdminV2Layout>
  );
}
