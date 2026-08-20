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
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { Field, FormRow } from '@/components/ui/field';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
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
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="sm:max-w-[640px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {error && <Alert variant="destructive">{error}</Alert>}

          <FormRow>
            <Field label="Username" required htmlFor="u-username">
              <Input
                id="u-username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                required minLength={3} placeholder="Enter username"
              />
            </Field>
            <Field label="Full name" required htmlFor="u-fullname">
              <Input
                id="u-fullname"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                required placeholder="Enter full name"
              />
            </Field>
          </FormRow>

          <FormRow>
            <Field label="Email" htmlFor="u-email">
              <Input
                id="u-email" type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="Enter email address"
              />
            </Field>
            <Field label="Password" required htmlFor="u-password">
              <Input
                id="u-password" type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required minLength={8} placeholder="Min 8 characters"
              />
            </Field>
          </FormRow>

          <FormRow>
            <Field label="PIN (4-8 digits)" htmlFor="u-pin">
              <Input
                id="u-pin" type="password"
                value={formData.pin}
                onChange={(e) => setFormData({ ...formData, pin: e.target.value })}
                placeholder="Optional quick-login PIN" maxLength={8} pattern="[0-9]*"
              />
            </Field>
            <Field label="Status">
              <Select
                value={formData.is_active ? 'active' : 'inactive'}
                onValueChange={(v) => setFormData({ ...formData, is_active: v === 'active' })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </FormRow>

          <Field label="Roles">
            <ToggleList
              items={roles}
              selectedIds={formData.role_ids}
              onToggle={(id) => toggle('role_ids', id)}
              getId={(r) => r.id}
              renderLabel={(r) => (
                <>
                  {r.display_name}
                  {r.description && (
                    <small className="block text-xs text-muted-foreground">{r.description}</small>
                  )}
                </>
              )}
              empty="No roles available"
            />
          </Field>

          <Field label="Care profile access">
            {isSystemAdmin ? (
              <div className="rounded-md border border-border bg-background/40 p-3 text-sm text-muted-foreground">
                System admins have access to every care profile automatically.
              </div>
            ) : (
              <ToggleList
                items={patients}
                selectedIds={formData.patient_ids}
                onToggle={(id) => toggle('patient_ids', id)}
                getId={(p) => p.id}
                renderLabel={(p) => (
                  <>
                    {p.first_name} {p.last_name}
                    {p.medical_record_number && (
                      <small className="block text-xs text-muted-foreground">
                        MRN: {p.medical_record_number}
                      </small>
                    )}
                  </>
                )}
                empty="No care profiles configured yet."
              />
            )}
          </Field>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={close}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create user'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
