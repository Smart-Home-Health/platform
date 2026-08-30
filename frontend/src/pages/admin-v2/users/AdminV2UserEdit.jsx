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
// User → Edit details. The username is the account's identity and the API has
// no rename; everything else on the record is editable here.
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { EmField, EmSelect } from '../../../components/vc/EntityModal';
import { CfgSection, CfgGroup, CfgFields } from '../settings/CfgSection';
import useUserRecord, { updateUser } from './useUserRecord';
import UserSection from './UserSection';

export default function AdminV2UserEdit() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user, loading, error, setError, reload } = useUserRecord(userId);
  const [form, setForm] = useState({ full_name: '', email: '', is_active: true });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (user) {
      setForm({
        full_name: user.full_name || '',
        email: user.email || '',
        is_active: user.is_active,
      });
    }
  }, [user]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await updateUser(userId, {
        full_name: form.full_name,
        email: form.email || null,
        is_active: form.is_active,
      });
      await reload();
      setNotice('Details saved.');
      setTimeout(() => navigate(`/care/configuration/users/${userId}`), 600);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <UserSection
      userId={userId}
      user={user}
      tab="overview"
      title="Account details"
      description="The name this user is shown by, how to reach them, and whether they can sign in."
      loading={loading}
      error={error}
      notice={notice}
    >
      <CfgSection
        title="Details"
        actions={
          <>
            <button
              type="button"
              className="em-cancel"
              onClick={() => navigate(`/care/configuration/users/${userId}`)}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="user-edit-form"
              className="em-submit"
              disabled={saving || !form.full_name.trim()}
            >
              {saving ? 'Saving…' : 'Save details'}
            </button>
          </>
        }
      >
        <CfgGroup>
          <form
            id="user-edit-form"
            className="cfg-form"
            onSubmit={(e) => { e.preventDefault(); save(); }}
          >
            <CfgFields>
              <EmField label="Username" htmlFor="ue-username" hint="A username cannot be changed">
                <input id="ue-username" className="em-input" value={user?.username || ''} disabled />
              </EmField>
              <EmField label="Full name" required htmlFor="ue-fullname">
                <input
                  id="ue-fullname"
                  className="em-input"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  placeholder="Enter full name"
                  required
                />
              </EmField>
            </CfgFields>

            <CfgFields>
              <EmField label="Email" htmlFor="ue-email" hint="Optional — used to identify the account only">
                <input
                  id="ue-email"
                  className="em-input"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="Enter email address"
                />
              </EmField>
              <EmField
                label="Status"
                htmlFor="ue-status"
                hint={user?.is_system_admin
                  ? 'A system administrator cannot be deactivated'
                  : 'An inactive user keeps their record but cannot sign in'}
              >
                <EmSelect
                  id="ue-status"
                  value={form.is_active ? 'active' : 'inactive'}
                  onChange={(e) => setForm({ ...form, is_active: e.target.value === 'active' })}
                  disabled={user?.is_system_admin}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </EmSelect>
              </EmField>
            </CfgFields>
          </form>
        </CfgGroup>
      </CfgSection>
    </UserSection>
  );
}
