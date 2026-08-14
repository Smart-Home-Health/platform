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
// Home Assistant user directory. As the HA add-on this lists EVERY HA user
// (Supervisor API) so admins can link or import household members before
// they ever open the panel; outside the add-on it falls back to identities
// seen on ingress. Import creates a passwordless app profile pre-linked to
// the HA login. System-admin only (the backend 403s; the card hides itself).
import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import {
  Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { ToggleList } from './ToggleList';
import { isIngress, apiFetch, API_BASE_URL } from '../../../config';
import {
  getHaDirectory, importHaUser, linkHaIdentity, unlinkHaIdentity, forgetHaIdentity,
} from '../../../services/haIdentity';

const rowLabel = (item) =>
  item.name || item.username || `HA user ${item.ha_user_id.slice(0, 8)}…`;

const lastSeen = (iso) => {
  try { return new Date(iso).toLocaleDateString(); } catch { return ''; }
};

const slugify = (name) =>
  (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// "Nancy De La Cruz" -> first "Nancy", last "De La Cruz" (both editable after).
const splitName = (name) => {
  const parts = (name || '').trim().split(/\s+/);
  return { first: parts[0] || '', last: parts.slice(1).join(' ') };
};

export default function HAIdentitiesCard({
  users = [], roles = [], patients = [], onUsersChanged, onPatientsChanged,
}) {
  const [data, setData] = useState(null); // {available, users} | null (loading / not permitted)
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [pendingLink, setPendingLink] = useState({}); // ha_user_id -> selected app user id

  // Import dialog
  const [importTarget, setImportTarget] = useState(null); // directory row | null
  const [importForm, setImportForm] = useState({ username: '', full_name: '', role_ids: [], patient_ids: [] });
  const [importError, setImportError] = useState(null);
  const [importing, setImporting] = useState(false);

  // Add-as-patient dialog
  const [patientTarget, setPatientTarget] = useState(null); // directory row | null
  const [patientForm, setPatientForm] = useState({ first_name: '', last_name: '' });
  const [patientError, setPatientError] = useState(null);
  const [savingPatient, setSavingPatient] = useState(false);

  const load = async () => {
    try {
      setData(await getHaDirectory());
      setError(null);
    } catch (err) {
      if (err.status === 403 || err.status === 401) {
        // Not a system admin: this card simply isn't for them.
        setData(null);
      } else {
        setError(err.message);
        setData((prev) => prev ?? { available: false, users: [] });
      }
    }
  };

  useEffect(() => { load(); }, []);

  if (!data) return null; // loading, or not permitted
  const items = data.users;
  if (items.length === 0 && !isIngress() && !error) return null;

  const unmapped = items.filter((i) => i.status !== 'linked').length;

  const act = async (haUserId, fn) => {
    setBusyId(haUserId);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const openImport = (item) => {
    setImportError(null);
    setImportForm({
      username: item.username || slugify(item.name),
      full_name: item.name || item.username || '',
      role_ids: [],
      patient_ids: [],
    });
    setImportTarget(item);
  };

  const importIsAdmin = () => importForm.role_ids.some((rid) => {
    const role = roles.find((r) => r.id === rid);
    return role && role.name === 'system_admin';
  });

  const handleImport = async (e) => {
    e.preventDefault();
    setImportError(null);
    setImporting(true);
    try {
      const created = await importHaUser({
        ha_user_id: importTarget.ha_user_id,
        username: importForm.username,
        full_name: importForm.full_name,
        role_ids: importForm.role_ids,
      });
      if (importForm.patient_ids.length > 0 && !importIsAdmin()) {
        await apiFetch(`${API_BASE_URL}/api/users/${created.id}/patients`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patient_ids: importForm.patient_ids }),
        });
      }
      setImportTarget(null);
      await load();
      onUsersChanged?.();
    } catch (err) {
      setImportError(err.message);
    } finally {
      setImporting(false);
    }
  };

  const openAddPatient = (item) => {
    setPatientError(null);
    const { first, last } = splitName(item.name || item.username);
    setPatientForm({ first_name: first, last_name: last });
    setPatientTarget(item);
  };

  const handleAddPatient = async (e) => {
    e.preventDefault();
    setPatientError(null);
    setSavingPatient(true);
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/patients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patientForm),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body.detail === 'string' ? body.detail : 'Failed to create patient');
      }
      setPatientTarget(null);
      onPatientsChanged?.();
    } catch (err) {
      setPatientError(err.message);
    } finally {
      setSavingPatient(false);
    }
  };

  const statusBadge = (item) => {
    if (item.status === 'linked') {
      return <Badge variant="secondary">Signs in as {item.mapped_user.full_name}</Badge>;
    }
    if (item.status === 'seen') {
      return <Badge variant="outline">Opened the app · last seen {lastSeen(item.last_seen)}</Badge>;
    }
    return <Badge variant="outline">Never opened the app</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Home Assistant users</CardTitle>
          {unmapped > 0 && <Badge variant="default">{unmapped} not linked</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          {data.available
            ? 'Everyone with a Home Assistant login. Link them to an existing profile, ' +
              'create a profile for them (they sign in automatically — no password), ' +
              'or add them as a patient.'
            : 'Anyone who opens the app from the Home Assistant sidebar shows up here. ' +
              'Link them to a profile and they\'ll be signed in automatically.'}
        </p>
        {!data.available && items.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Showing only Home Assistant users who have opened the app — running as
            the Home Assistant add-on lists everyone automatically.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <Alert variant="destructive">{error}</Alert>}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No Home Assistant users found yet. Have them open the app from the HA
            sidebar once and they'll appear here.
          </p>
        ) : (
          items.map((item) => (
            <div
              key={item.ha_user_id}
              className="flex flex-col gap-2 rounded-md border border-border p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{rowLabel(item)}</span>
                {item.username && <span className="text-xs text-muted-foreground">@{item.username}</span>}
                {item.ha_is_owner ? <Badge variant="outline">HA owner</Badge>
                  : item.ha_is_admin ? <Badge variant="outline">HA admin</Badge> : null}
                {!item.in_directory && <Badge variant="outline">Not in Home Assistant</Badge>}
                {statusBadge(item)}
              </div>
              {item.status === 'linked' ? (
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary" size="sm"
                    disabled={busyId === item.ha_user_id}
                    onClick={() => act(item.ha_user_id, () => unlinkHaIdentity(item.ha_user_id))}
                  >
                    Unlink
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={pendingLink[item.ha_user_id] || ''}
                    onValueChange={(v) => setPendingLink((prev) => ({ ...prev, [item.ha_user_id]: v }))}
                  >
                    <SelectTrigger className="w-44"><SelectValue placeholder="Link to profile…" /></SelectTrigger>
                    <SelectContent>
                      {users.filter((u) => u.is_active).map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>{u.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    disabled={!pendingLink[item.ha_user_id] || busyId === item.ha_user_id}
                    onClick={() => act(item.ha_user_id, () =>
                      linkHaIdentity(item.ha_user_id, parseInt(pendingLink[item.ha_user_id], 10)))}
                  >
                    Link
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => openImport(item)}>
                    Create profile
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => openAddPatient(item)}>
                    Add as patient
                  </Button>
                  {!item.in_directory && item.status === 'seen' && (
                    <Button
                      variant="ghost" size="sm"
                      disabled={busyId === item.ha_user_id}
                      onClick={() => act(item.ha_user_id, () => forgetHaIdentity(item.ha_user_id))}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>

      {/* Import: create a passwordless, pre-linked app profile */}
      <Dialog open={!!importTarget} onOpenChange={(o) => { if (!o) setImportTarget(null); }}>
        <DialogContent className="sm:max-w-[520px]" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Create profile for {importTarget ? rowLabel(importTarget) : ''}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleImport} className="flex flex-col gap-4">
            {importError && <Alert variant="destructive">{importError}</Alert>}
            <p className="text-sm text-muted-foreground">
              No password needed — opening the app from the Home Assistant sidebar
              signs them in. A password or PIN can be added later for shared devices.
            </p>
            <Field label="Full Name" required htmlFor="ha-import-fullname">
              <Input
                id="ha-import-fullname"
                value={importForm.full_name}
                onChange={(e) => setImportForm({ ...importForm, full_name: e.target.value })}
                required
              />
            </Field>
            <Field label="Username" required htmlFor="ha-import-username">
              <Input
                id="ha-import-username"
                value={importForm.username}
                onChange={(e) => setImportForm({ ...importForm, username: e.target.value })}
                required minLength={3}
              />
            </Field>
            <Field label="Roles">
              <ToggleList
                items={roles}
                selectedIds={importForm.role_ids}
                onToggle={(rid) => setImportForm((prev) => ({
                  ...prev,
                  role_ids: prev.role_ids.includes(rid)
                    ? prev.role_ids.filter((id) => id !== rid)
                    : [...prev.role_ids, rid],
                }))}
                getId={(r) => r.id}
                renderLabel={(r) => r.display_name}
                empty="No roles available"
              />
            </Field>
            <Field label="Patient Assignments">
              {importIsAdmin() ? (
                <div className="rounded-md border border-border bg-background/40 p-3 text-sm text-muted-foreground">
                  System admins have access to all patients automatically.
                </div>
              ) : (
                <ToggleList
                  items={patients}
                  selectedIds={importForm.patient_ids}
                  onToggle={(pid) => setImportForm((prev) => ({
                    ...prev,
                    patient_ids: prev.patient_ids.includes(pid)
                      ? prev.patient_ids.filter((id) => id !== pid)
                      : [...prev.patient_ids, pid],
                  }))}
                  getId={(p) => p.id}
                  renderLabel={(p) => `${p.first_name} ${p.last_name}`}
                  empty="No patients configured yet."
                />
              )}
            </Field>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setImportTarget(null)}>Cancel</Button>
              <Button type="submit" disabled={importing}>
                {importing ? 'Creating…' : 'Create profile'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add the HA user as a patient (name prefilled, both fields editable) */}
      <Dialog open={!!patientTarget} onOpenChange={(o) => { if (!o) setPatientTarget(null); }}>
        <DialogContent className="sm:max-w-[440px]" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Add {patientTarget ? rowLabel(patientTarget) : ''} as a patient</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddPatient} className="flex flex-col gap-4">
            {patientError && <Alert variant="destructive">{patientError}</Alert>}
            <Field label="First Name" required htmlFor="ha-patient-first">
              <Input
                id="ha-patient-first"
                value={patientForm.first_name}
                onChange={(e) => setPatientForm({ ...patientForm, first_name: e.target.value })}
                required
              />
            </Field>
            <Field label="Last Name" required htmlFor="ha-patient-last">
              <Input
                id="ha-patient-last"
                value={patientForm.last_name}
                onChange={(e) => setPatientForm({ ...patientForm, last_name: e.target.value })}
                required
              />
            </Field>
            <p className="text-sm text-muted-foreground">
              Date of birth and other details can be filled in afterward on the Patients page.
            </p>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setPatientTarget(null)}>Cancel</Button>
              <Button type="submit" disabled={savingPatient}>
                {savingPatient ? 'Adding…' : 'Add patient'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
