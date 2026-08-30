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
import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import config from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import AdminV2Layout from './AdminV2Layout';
import { ChevronLeftIcon } from '../../components/Icons';
import { EmField, EmSelect } from '../../components/vc/EntityModal';
import ConfirmSheet from '../../components/vc/ConfirmSheet';
import { CfgSection, CfgGroup, CfgFields, CfgBadge } from './settings/CfgSection';
import { PermissionSelector } from './components/PermissionSelector';
import '../../components/vc/entity-card.css';
import './AdminV2.css';
import './settings/settings-page.css';

const emptyForm = {
  name: '', display_name: '', description: '', is_active: true, permission_ids: [],
};

export default function AdminV2RoleDetail() {
  const { roleId } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();

  const [role, setRole] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [formData, setFormData] = useState(emptyForm);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingPerms, setSavingPerms] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const hasPermission = (permission) => {
    if (!currentUser) return false;
    if (currentUser.is_system_admin) return true;
    return currentUser.permissions?.includes(permission) || false;
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [rRes, permsRes] = await Promise.all([
        fetch(`${config.apiUrl}/api/users/roles/${roleId}`, { credentials: 'include' }),
        fetch(`${config.apiUrl}/api/users/permissions`, { credentials: 'include' }),
      ]);
      if (!rRes.ok) { setError('Failed to load role'); return; }
      const r = await rRes.json();
      if (permsRes.ok) setPermissions(await permsRes.json());
      setRole(r);
      setFormData({
        name: r.name,
        display_name: r.display_name,
        description: r.description || '',
        is_active: r.is_active,
        permission_ids: r.permissions?.map(p => p.id) || [],
      });
    } catch (err) {
      setError('Error connecting to server');
      console.error('Error loading role:', err);
    } finally {
      setLoading(false);
    }
  }, [roleId]);

  useEffect(() => { if (currentUser) load(); }, [currentUser, load]);

  const flash = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 2500); };

  const handlePermissionToggle = (permissionId) => {
    setFormData(prev => ({
      ...prev,
      permission_ids: prev.permission_ids.includes(permissionId)
        ? prev.permission_ids.filter(id => id !== permissionId)
        : [...prev.permission_ids, permissionId],
    }));
  };

  const permissionsByCategory = permissions.reduce((acc, perm) => {
    (acc[perm.category] = acc[perm.category] || []).push(perm);
    return acc;
  }, {});

  const putRole = async (body) => {
    const res = await fetch(`${config.apiUrl}/api/users/roles/${roleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || 'Request failed');
    }
    return res.json();
  };

  const saveDetails = async () => {
    setSavingDetails(true);
    setError('');
    try {
      await putRole({
        display_name: formData.display_name,
        description: formData.description,
        is_active: formData.is_active,
      });
      await load();
      flash('Details saved');
    } catch (err) {
      setError(err.message || 'Failed to save details');
    } finally {
      setSavingDetails(false);
    }
  };

  const savePermissions = async () => {
    setSavingPerms(true);
    setError('');
    try {
      await putRole({ permission_ids: formData.permission_ids });
      await load();
      flash('Permissions saved');
    } catch (err) {
      setError(err.message || 'Failed to save permissions');
    } finally {
      setSavingPerms(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError('');
    try {
      const res = await fetch(`${config.apiUrl}/api/users/roles/${roleId}`, {
        method: 'DELETE', credentials: 'include',
      });
      if (res.ok) {
        navigate('/care/configuration/users/roles');
      } else {
        setError((await res.json()).detail || 'Failed to delete role');
        setShowDelete(false);
      }
    } catch {
      setError('Error connecting to server');
      setShowDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-page"><p className="cfg-loading">Loading role…</p></div>
      </AdminV2Layout>
    );
  }

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <div className="cfg">
          <div className="cfg-crumb">
            <button
              type="button"
              className="cfg-back"
              onClick={() => navigate('/care/configuration/users/roles')}
            >
              <ChevronLeftIcon size={14} /> Roles
            </button>
            <div className="cfg-crumb-tags">
              {role?.is_system_role && <CfgBadge>System role</CfgBadge>}
              {typeof role?.user_count === 'number' && (
                <CfgBadge>{role.user_count} {role.user_count === 1 ? 'user' : 'users'}</CfgBadge>
              )}
              <CfgBadge tone={role?.is_active ? 'ok' : undefined}>
                {role?.is_active ? 'Active' : 'Inactive'}
              </CfgBadge>
            </div>
          </div>

          {error && <p className="em-error" role="alert">{error}</p>}
          {success && <p className="em-success" role="status">{success}</p>}

          <CfgSection
            title={role ? role.display_name : 'Role'}
            subtitle={`${role?.name ?? ''} · Basic details`}
            actions={
              <>
                {role && !role.is_system_role && hasPermission('roles.delete') && (
                  <button type="button" className="em-danger" onClick={() => setShowDelete(true)}>
                    Delete role
                  </button>
                )}
                <button type="button" className="em-submit" onClick={saveDetails} disabled={savingDetails}>
                  {savingDetails ? 'Saving…' : 'Save details'}
                </button>
              </>
            }
          >
            <CfgGroup>
              <CfgFields narrow>
                <EmField label="Role Name (code)" htmlFor="rd-name" hint="Role code cannot be changed">
                  <input id="rd-name" className="em-input" value={formData.name} disabled />
                </EmField>
                <EmField label="Display Name" required htmlFor="rd-display">
                  <input
                    id="rd-display"
                    className="em-input"
                    value={formData.display_name}
                    onChange={e => setFormData({ ...formData, display_name: e.target.value })}
                    required
                  />
                </EmField>
              </CfgFields>

              {/* Wrapped so it shares the same 58rem measure as the rows
                  above and below rather than spanning the whole card. */}
              <CfgFields>
                <EmField label="Description" htmlFor="rd-desc">
                  <input
                    id="rd-desc"
                    className="em-input"
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Brief description of this role"
                  />
                </EmField>
              </CfgFields>

              <CfgFields narrow>
                <EmField
                  label="Status"
                  htmlFor="rd-status"
                  hint={role?.is_system_role ? 'System roles cannot be deactivated' : undefined}
                >
                  <EmSelect
                    id="rd-status"
                    value={formData.is_active ? 'active' : 'inactive'}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'active' })}
                    disabled={role?.is_system_role}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </EmSelect>
                </EmField>
              </CfgFields>
            </CfgGroup>
          </CfgSection>

          <CfgSection
            title="Permissions"
            subtitle="Choose what users with this role are allowed to do."
            actions={
              <button type="button" className="em-submit" onClick={savePermissions} disabled={savingPerms}>
                {savingPerms ? 'Saving…' : 'Save permissions'}
              </button>
            }
          >
            <CfgGroup>
              <PermissionSelector
                permissionsByCategory={permissionsByCategory}
                selectedIds={formData.permission_ids}
                onToggle={handlePermissionToggle}
              />
            </CfgGroup>
          </CfgSection>
        </div>

        <ConfirmSheet
          open={showDelete}
          onOpenChange={(o) => { if (!o) setShowDelete(false); }}
          title="Delete Role"
          confirmLabel="Delete Role"
          tone="destructive"
          busy={deleting}
          onConfirm={handleDelete}
        >
          Delete the role <strong>{role?.display_name}</strong>? This removes it from every
          user who has it assigned and cannot be undone.
        </ConfirmSheet>
      </div>
    </AdminV2Layout>
  );
}
