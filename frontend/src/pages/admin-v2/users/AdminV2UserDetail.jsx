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
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import useUserRecord, { deleteUser, updateUser } from './useUserRecord';
import UserTabs from './UserTabs';
import AvatarEditor from '../components/AvatarEditor';
import {
  displayName, formatDate, identityLine, lastSeen, profileNamesFor,
} from './userDetail';
import {
  accessSection, accountSection, activitySection, securitySection, userStats,
} from './userSections';
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
        <div className="admin-v2-page"><div className="admin-v2-loading">Loading user…</div></div>
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
        <div className="tw flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              to="/care/configuration/users"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeftIcon size={16} /> Users
            </Link>
            <div className="flex items-center gap-2">
              {user?.force_password_reset && <Badge variant="warning">First login pending</Badge>}
              <Badge variant={user?.is_active ? 'success' : 'muted'}>
                {user?.is_active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>

          {error && <Alert variant="destructive" role="alert">{error}</Alert>}
          {notice && <Alert variant="success" role="status">{notice}</Alert>}

          {/* Who this user is */}
          <Card>
            <CardContent className="flex flex-col gap-3 p-4 sm:p-4">
              <div className="cp-identity">
                <AvatarEditor kind="user" person={user} name={displayName(user)}
                              onError={setError} onNotice={flash} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <h1 className="cp-name">{displayName(user)}</h1>
                  <p className="cp-subtitle">@{user?.username}</p>
                </div>
                <Button variant="secondary" size="sm" asChild>
                  <Link to={`${base}/edit`}>Edit details</Link>
                </Button>
              </div>

              {/* Roles and reach get the whole card width — squeezed into the
                * column beside the button they wrap after three words. */}
              <p className="cp-subtitle ud-identity-line">{identityLine(user, profileNames)}</p>

              <div className="cp-meta border-t border-border pt-3">
                <div>
                  <span className="cp-meta-label">Last sign-in</span>
                  <span className="cp-meta-value">{lastSeen(user)}</span>
                </div>
                <div>
                  <span className="cp-meta-label">Account created</span>
                  <span className="cp-meta-value">{formatDate(user?.created_at) || '—'}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <UserTabs userId={userId} current="overview" />

          <Card>
            <CardContent className="flex flex-col gap-0 p-0">
              <div className="cp-stats ud-stats">
                {userStats(user, patientIds).map((stat) => (
                  <div className="cp-stat" key={stat.label}>
                    <span className="cp-stat-value">{stat.value}</span>
                    <span className="cp-stat-label">{stat.label}</span>
                  </div>
                ))}
              </div>
              <div className="cp-rows border-t border-border">
                {sections.map((section) => <SectionRow key={section.id} section={section} />)}
              </div>
            </CardContent>
          </Card>

          {/* Danger zone */}
          {(can('users.update') || can('users.delete')) && !isSelf && (
            <Card>
              <details className="cp-advanced ud-danger">
                <summary>
                  <span className="cp-eyebrow">Danger zone</span>
                  <span className="cp-advanced-marker" aria-hidden><ChevronDownIcon size={16} /></span>
                </summary>
                <div className="flex flex-col gap-3 border-t border-border p-4 pt-3">
                  <p className="text-sm text-muted-foreground">
                    {user?.is_system_admin
                      ? 'A system administrator cannot be deactivated or deleted here.'
                      : 'Deactivating keeps the account and everything recorded against it, but '
                        + 'stops this user signing in. Deleting removes the account for good.'}
                  </p>
                  {!user?.is_system_admin && (
                    <div className="flex flex-wrap gap-2">
                      {can('users.update') && (
                        <Button
                          variant={user?.is_active ? 'destructive' : 'secondary'}
                          size="sm"
                          onClick={toggleActive}
                          disabled={busy}
                        >
                          {user?.is_active ? 'Deactivate user' : 'Activate user'}
                        </Button>
                      )}
                      {can('users.delete') && (
                        <Button variant="destructive" size="sm" onClick={() => setShowDelete(true)} disabled={busy}>
                          Delete user
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </details>
            </Card>
          )}
        </div>

        <Dialog open={showDelete} onOpenChange={(o) => { if (!o) setShowDelete(false); }}>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle>Delete user</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-foreground">
                Delete <strong>{displayName(user)}</strong> (@{user?.username})?
              </p>
              <p className="text-muted-foreground">This cannot be undone.</p>
            </div>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setShowDelete(false)}>Cancel</Button>
              <Button variant="destructive" onClick={confirmDelete} disabled={busy}>
                {busy ? 'Deleting…' : 'Delete user'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminV2Layout>
  );
}
