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
// Add an access role. Moved out of the old Roles page unchanged in behaviour.
import { useState } from 'react';
import config, { apiFetch } from '../../../config';
import EntityModal, { EmField, EmRow } from '../../../components/vc/EntityModal';
import { PermissionSelector } from '../components/PermissionSelector';

const emptyForm = {
  name: '', display_name: '', description: '', is_active: true, permission_ids: [],
};

export default function CreateRoleDialog({ open, onOpenChange, onCreated, permissions = [] }) {
  const [formData, setFormData] = useState(emptyForm);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const permissionsByCategory = permissions.reduce((acc, perm) => {
    (acc[perm.category] = acc[perm.category] || []).push(perm);
    return acc;
  }, {});

  const close = () => { onOpenChange(false); setFormData(emptyForm); setError(null); };

  const togglePermission = (permissionId) => {
    setFormData((prev) => ({
      ...prev,
      permission_ids: prev.permission_ids.includes(permissionId)
        ? prev.permission_ids.filter((id) => id !== permissionId)
        : [...prev.permission_ids, permissionId],
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`${config.apiUrl}/api/users/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body.detail === 'string' ? body.detail
          : 'Could not create this role.');
      }
      close();
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <EntityModal open={open} onOpenChange={(o) => { if (!o) close(); }} title="Add role" wide>
      <form onSubmit={submit} className="em-form">
        {error && <div className="em-error" role="alert">{error}</div>}

        <EmRow>
          <EmField label="Role name (code)" required htmlFor="role-name"
                   hint="Lowercase with underscores, used internally">
            <input
              id="role-name"
              className="em-input"
              value={formData.name}
              onChange={(e) => setFormData({
                ...formData, name: e.target.value.toLowerCase().replace(/\s+/g, '_'),
              })}
              required placeholder="e.g. nurse_aide"
            />
          </EmField>
          <EmField label="Display name" required htmlFor="role-display">
            <input
              id="role-display"
              className="em-input"
              value={formData.display_name}
              onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
              required placeholder="e.g. Nurse Aide"
            />
          </EmField>
        </EmRow>

        <EmField label="Description" htmlFor="role-desc">
          <input
            id="role-desc"
            className="em-input"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Brief description of this role"
          />
        </EmField>

        <EmField label="Permissions">
          <PermissionSelector
            permissionsByCategory={permissionsByCategory}
            selectedIds={formData.permission_ids}
            onToggle={togglePermission}
          />
        </EmField>

        <div className="em-footer">
          <button type="button" className="em-cancel" onClick={close}>Cancel</button>
          <button type="submit" className="em-submit" disabled={saving}>
            {saving ? 'Creating…' : 'Create role'}
          </button>
        </div>
      </form>
    </EntityModal>
  );
}
