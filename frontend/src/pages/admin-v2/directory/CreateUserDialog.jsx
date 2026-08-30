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
// Add a user. Moved out of the old Users page unchanged in behaviour.
import { useState } from 'react';
import config, { apiFetch } from '../../../config';
import EntityModal, { EmField, EmRow, EmSelect } from '../../../components/vc/EntityModal';
import { ToggleList } from '../components/ToggleList';

const emptyForm = {
  username: '', full_name: '', email: '', password: '', pin: '',
  is_active: true, role_ids: [], patient_ids: [],
};

export default function CreateUserDialog({
  open, onOpenChange, onCreated, roles = [], patients = [],
}) {
  const [formData, setFormData] = useState(emptyForm);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const close = () => { onOpenChange(false); setFormData(emptyForm); setError(null); };

  const toggle = (key, id) => setFormData((prev) => ({
    ...prev,
    [key]: prev[key].includes(id) ? prev[key].filter((x) => x !== id) : [...prev[key], id],
  }));

  // System admins reach every profile by definition, so per-patient assignment
  // is meaningless for them.
  const isSystemAdmin = formData.role_ids.some((rid) =>
    roles.find((r) => r.id === rid)?.name === 'system_admin');

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`${config.apiUrl}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body.detail === 'string' ? body.detail
          : 'Could not create this user.');
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
    <EntityModal open={open} onOpenChange={(o) => { if (!o) close(); }} title="Add user" wide>
      <form onSubmit={submit} className="em-form">
        {error && <div className="em-error" role="alert">{error}</div>}

        <EmRow>
          <EmField label="Username" required htmlFor="u-username">
            <input
              id="u-username"
              className="em-input"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required minLength={3} placeholder="Enter username"
            />
          </EmField>
          <EmField label="Full name" required htmlFor="u-fullname">
            <input
              id="u-fullname"
              className="em-input"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              required placeholder="Enter full name"
            />
          </EmField>
        </EmRow>

        <EmRow>
          <EmField label="Email" htmlFor="u-email">
            <input
              id="u-email" className="em-input" type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="Enter email address"
            />
          </EmField>
          <EmField label="Password" required htmlFor="u-password">
            <input
              id="u-password" className="em-input" type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required minLength={8} placeholder="Min 8 characters"
            />
          </EmField>
        </EmRow>

        <EmRow>
          <EmField label="PIN (4-8 digits)" htmlFor="u-pin">
            <input
              id="u-pin" className="em-input" type="password"
              value={formData.pin}
              onChange={(e) => setFormData({ ...formData, pin: e.target.value })}
              placeholder="Optional quick-login PIN" maxLength={8} pattern="[0-9]*"
            />
          </EmField>
          <EmField label="Status" htmlFor="u-status">
            <EmSelect
              id="u-status"
              value={formData.is_active ? 'active' : 'inactive'}
              onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'active' })}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </EmSelect>
          </EmField>
        </EmRow>

        <EmField label="Roles">
          <ToggleList
            items={roles}
            selectedIds={formData.role_ids}
            onToggle={(id) => toggle('role_ids', id)}
            getId={(r) => r.id}
            renderLabel={(r) => (
              <>
                {r.display_name}
                {r.description && <small>{r.description}</small>}
              </>
            )}
            empty="No roles available"
          />
        </EmField>

        <EmField label="Care profile access">
          {isSystemAdmin ? (
            <p className="cfg-note">
              System admins have access to every care profile automatically.
            </p>
          ) : (
            <ToggleList
              items={patients}
              selectedIds={formData.patient_ids}
              onToggle={(id) => toggle('patient_ids', id)}
              getId={(p) => p.id}
              renderLabel={(p) => (
                <>
                  {p.first_name} {p.last_name}
                  {p.medical_record_number && <small>MRN: {p.medical_record_number}</small>}
                </>
              )}
              empty="No care profiles configured yet."
            />
          )}
        </EmField>

        <div className="em-footer">
          <button type="button" className="em-cancel" onClick={close}>Cancel</button>
          <button type="submit" className="em-submit" disabled={saving}>
            {saving ? 'Creating…' : 'Create user'}
          </button>
        </div>
      </form>
    </EntityModal>
  );
}
