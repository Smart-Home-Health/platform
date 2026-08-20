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
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field, FormRow } from '@/components/ui/field';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
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
      <Card>
        <CardContent className="flex flex-col gap-4 p-4 sm:p-4">
          <FormRow>
            <Field label="Username" htmlFor="ue-username" hint="A username cannot be changed">
              <Input id="ue-username" value={user?.username || ''} disabled />
            </Field>
            <Field label="Full name" required htmlFor="ue-fullname">
              <Input
                id="ue-fullname"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder="Enter full name"
                required
              />
            </Field>
          </FormRow>

          <FormRow>
            <Field label="Email" htmlFor="ue-email" hint="Optional — used to identify the account only">
              <Input
                id="ue-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="Enter email address"
              />
            </Field>
            <Field
              label="Status"
              hint={user?.is_system_admin
                ? 'A system administrator cannot be deactivated'
                : 'An inactive user keeps their record but cannot sign in'}
            >
              <Select
                value={form.is_active ? 'active' : 'inactive'}
                onValueChange={(v) => setForm({ ...form, is_active: v === 'active' })}
                disabled={user?.is_system_admin}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </FormRow>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-3">
          <Button onClick={save} disabled={saving || !form.full_name.trim()}>
            {saving ? 'Saving…' : 'Save details'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => navigate(`/care/configuration/users/${userId}`)}
          >
            Cancel
          </Button>
        </CardFooter>
      </Card>
    </UserSection>
  );
}
