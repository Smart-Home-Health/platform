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
import { useEffect, useState } from 'react';
import EntityModal, { EmField, EmSelect } from '../../../components/vc/EntityModal';
import { CfgSection, CfgBadge } from '../settings/CfgSection';
import './ha-identities.css';
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
      // slugify can come up empty (all-non-ASCII names); fall back to a stable
      // handle from the HA user id so the dialog always opens submittable.
      username: item.username || slugify(item.name) || `ha_${item.ha_user_id.slice(0, 8)}`,
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
    setPatientForm({ first_name: first, last_name: last, existing_id: '' });
    setPatientTarget(item);
  };

  const handleAddPatient = async (e) => {
    e.preventDefault();
    setPatientError(null);
    setSavingPatient(true);
    try {
      // ha_user_id records the provenance so this HA login can only be turned
      // into a patient once (the button disappears afterward). Either stamp it
      // onto an existing patient or create a new one carrying it.
      const res = patientForm.existing_id
        ? await apiFetch(`${API_BASE_URL}/api/patients/${patientForm.existing_id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ha_user_id: patientTarget.ha_user_id }),
          })
        : await apiFetch(`${API_BASE_URL}/api/patients`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              first_name: patientForm.first_name,
              last_name: patientForm.last_name,
              ha_user_id: patientTarget.ha_user_id,
            }),
          });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body.detail === 'string' ? body.detail : 'Failed to save patient');
      }
      setPatientTarget(null);
      await load();
      onPatientsChanged?.();
    } catch (err) {
      setPatientError(err.message);
    } finally {
      setSavingPatient(false);
    }
  };

  const statusBadge = (item) => {
    if (item.status === 'linked') {
      return <CfgBadge tone="ok">Signs in as {item.mapped_user.full_name}</CfgBadge>;
    }
    if (item.status === 'seen') {
      return <CfgBadge>Opened the app · last seen {lastSeen(item.last_seen)}</CfgBadge>;
    }
    return <CfgBadge>Never opened the app</CfgBadge>;
  };

  return (
    <CfgSection
      title="Home Assistant users"
      subtitle={data.available
        ? 'Everyone with a Home Assistant login. Link them to an existing profile, '
          + 'create a profile for them (they sign in automatically — no password), '
          + 'or add them as a patient.'
        : 'Anyone who opens the app from the Home Assistant sidebar shows up here. '
          + 'Link them to a profile and they\'ll be signed in automatically.'}
      aside={unmapped > 0 ? <CfgBadge tone="live">{unmapped} not linked</CfgBadge> : undefined}
    >
      <div className="cfg-group">
        {!data.available && items.length > 0 && (
          <p className="cfg-fine">
            Showing only Home Assistant users who have opened the app — running as
            the Home Assistant add-on lists everyone automatically.
          </p>
        )}
        {error && <div className="em-error" role="alert">{error}</div>}
        {items.length === 0 ? (
          <p className="cfg-empty">
            No Home Assistant users found yet. Have them open the app from the HA
            sidebar once and they'll appear here.
          </p>
        ) : (
          <div className="hai-rows">
            {items.map((item) => (
              <div key={item.ha_user_id} className="hai-row">
                <div className="hai-tags">
                  <span className="hai-name">{rowLabel(item)}</span>
                  {item.username && <span className="hai-sub">@{item.username}</span>}
                  {item.ha_is_owner ? <CfgBadge>HA owner</CfgBadge>
                    : item.ha_is_admin ? <CfgBadge>HA admin</CfgBadge> : null}
                  {!item.in_directory && <CfgBadge>Not in Home Assistant</CfgBadge>}
                  {statusBadge(item)}
                  {item.patient && (
                    <CfgBadge tone="ok">
                      Patient: {item.patient.first_name} {item.patient.last_name}
                    </CfgBadge>
                  )}
                </div>
                {item.status === 'linked' ? (
                  <div className="hai-actions">
                    <button
                      type="button" className="cfg-ghost"
                      disabled={busyId === item.ha_user_id}
                      onClick={() => act(item.ha_user_id, () => unlinkHaIdentity(item.ha_user_id))}
                    >
                      Unlink
                    </button>
                  </div>
                ) : (
                  <div className="hai-actions">
                    <EmSelect
                      aria-label={`Link ${rowLabel(item)} to profile`}
                      value={pendingLink[item.ha_user_id] || ''}
                      onChange={(e) => setPendingLink((prev) => ({ ...prev, [item.ha_user_id]: e.target.value }))}
                    >
                      <option value="">Link to profile…</option>
                      {users.filter((u) => u.is_active).map((u) => (
                        <option key={u.id} value={String(u.id)}>{u.full_name}</option>
                      ))}
                    </EmSelect>
                    <button
                      type="button" className="cfg-ghost"
                      disabled={!pendingLink[item.ha_user_id] || busyId === item.ha_user_id}
                      onClick={() => act(item.ha_user_id, () =>
                        linkHaIdentity(item.ha_user_id, parseInt(pendingLink[item.ha_user_id], 10)))}
                    >
                      Link
                    </button>
                    <button type="button" className="cfg-ghost" onClick={() => openImport(item)}>
                      Create profile
                    </button>
                    {!item.patient && (
                      <button type="button" className="cfg-ghost" onClick={() => openAddPatient(item)}>
                        Add as patient
                      </button>
                    )}
                    {!item.in_directory && item.status === 'seen' && (
                      <button
                        type="button" className="cfg-ghost"
                        disabled={busyId === item.ha_user_id}
                        onClick={() => act(item.ha_user_id, () => forgetHaIdentity(item.ha_user_id))}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Import: create a passwordless, pre-linked app profile */}
      <EntityModal
        open={!!importTarget}
        onOpenChange={(o) => { if (!o) setImportTarget(null); }}
        title={`Create profile for ${importTarget ? rowLabel(importTarget) : ''}`}
      >
        <form onSubmit={handleImport} className="em-form">
          {importError && <div className="em-error" role="alert">{importError}</div>}
          <p className="em-hint">
            No password needed — opening the app from the Home Assistant sidebar
            signs them in. A password or PIN can be added later for shared devices.
          </p>
          <EmField label="Full Name" required htmlFor="ha-import-fullname">
            <input
              id="ha-import-fullname"
              className="em-input"
              value={importForm.full_name}
              onChange={(e) => setImportForm({ ...importForm, full_name: e.target.value })}
              required
            />
          </EmField>
          <EmField label="Username" required htmlFor="ha-import-username">
            <input
              id="ha-import-username"
              className="em-input"
              value={importForm.username}
              onChange={(e) => setImportForm({ ...importForm, username: e.target.value })}
              required minLength={3}
            />
          </EmField>
          <EmField label="Roles">
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
          </EmField>
          <EmField label="Patient Assignments">
            {importIsAdmin() ? (
              <p className="cfg-note">
                System admins have access to all patients automatically.
              </p>
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
          </EmField>
          <div className="em-footer">
            <button type="button" className="em-cancel" onClick={() => setImportTarget(null)}>
              Cancel
            </button>
            <button type="submit" className="em-submit" disabled={importing}>
              {importing ? 'Creating…' : 'Create profile'}
            </button>
          </div>
        </form>
      </EntityModal>

      {/* Add the HA user as a patient (name prefilled, both fields editable) */}
      <EntityModal
        open={!!patientTarget}
        onOpenChange={(o) => { if (!o) setPatientTarget(null); }}
        title={`Add ${patientTarget ? rowLabel(patientTarget) : ''} as a patient`}
      >
        <form onSubmit={handleAddPatient} className="em-form">
          {patientError && <div className="em-error" role="alert">{patientError}</div>}
          {patients.length > 0 && (
            <EmField label="Link an existing patient (optional)" htmlFor="ha-patient-existing">
              <EmSelect
                id="ha-patient-existing"
                value={patientForm.existing_id}
                onChange={(e) => setPatientForm({ ...patientForm, existing_id: e.target.value })}
              >
                <option value="">No — create a new patient</option>
                {patients.map((p) => (
                  <option key={p.id} value={String(p.id)}>{p.first_name} {p.last_name}</option>
                ))}
              </EmSelect>
            </EmField>
          )}
          {!patientForm.existing_id && (
            <>
              <EmField label="First Name" required htmlFor="ha-patient-first">
                <input
                  id="ha-patient-first"
                  className="em-input"
                  value={patientForm.first_name}
                  onChange={(e) => setPatientForm({ ...patientForm, first_name: e.target.value })}
                  required
                />
              </EmField>
              <EmField label="Last Name" required htmlFor="ha-patient-last">
                <input
                  id="ha-patient-last"
                  className="em-input"
                  value={patientForm.last_name}
                  onChange={(e) => setPatientForm({ ...patientForm, last_name: e.target.value })}
                  required
                />
              </EmField>
              <p className="em-hint">
                Date of birth and other details can be filled in afterward on the Patients page.
              </p>
            </>
          )}
          <div className="em-footer">
            <button type="button" className="em-cancel" onClick={() => setPatientTarget(null)}>
              Cancel
            </button>
            <button type="submit" className="em-submit" disabled={savingPatient}>
              {savingPatient ? 'Saving…' : (patientForm.existing_id ? 'Link patient' : 'Add patient')}
            </button>
          </div>
        </form>
      </EntityModal>
    </CfgSection>
  );
}
