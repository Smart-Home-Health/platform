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
// User → Access. Two grants, saved together: the roles that decide what the
// user may do, and the care profiles they may do it to.
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckIcon } from '../../../components/Icons';
import useUserRecord, { saveUserAccess } from './useUserRecord';
import UserSection from './UserSection';
import { accessCounts } from './userDetail';

// A grant is a row you can turn on, not a checkbox in a scroll box: the same
// compact row the care-profile sections use, so nothing is clipped mid-list.
const GrantRow = ({ selected, title, blurb, onToggle, disabled }) => (
  <button
    type="button"
    className="cp-row cp-row-button cp-row-compact"
    aria-pressed={selected}
    disabled={disabled}
    onClick={onToggle}
  >
    <span className="ud-check" data-on={selected || undefined} aria-hidden>
      {selected && <CheckIcon size={14} />}
    </span>
    <span className="cp-row-body">
      <span className="cp-row-title cp-row-title-plain">{title}</span>
      {/* The box already says "off"; a "not granted" on every row would just be
        * noise down the list. */}
      <span className="cp-row-status">
        {selected && <span className="cp-status" data-tone="success">Granted</span>}
      </span>
      {blurb && <span className="cp-row-blurb">{blurb}</span>}
    </span>
  </button>
);

export default function AdminV2UserAccess() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const {
    user, roles, patients, patientIds, loading, error, setError, reload,
  } = useUserRecord(userId, { access: true });

  const [selectedRoles, setSelectedRoles] = useState([]);
  const [selectedProfiles, setSelectedProfiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (user) setSelectedRoles((user.roles || []).map((r) => r.id));
  }, [user]);
  useEffect(() => { setSelectedProfiles(patientIds); }, [patientIds]);

  const toggle = (setter) => (id) => setter((prev) => (
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
  ));

  // The system_admin role reaches every profile on its own, so a per-profile
  // list would be a promise this app does not keep.
  const grantsEverything = selectedRoles.some(
    (id) => roles.find((r) => r.id === id)?.name === 'system_admin',
  ) || user?.is_system_admin;

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await saveUserAccess(userId, {
        roleIds: selectedRoles,
        currentRoleIds: (user.roles || []).map((r) => r.id),
        // An admin's existing grants are left exactly as they are rather than
        // cleared, so demoting them later does not silently strip their list.
        patientIds: grantsEverything ? patientIds : selectedProfiles,
      });
      await reload();
      setNotice('Access saved.');
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
      tab="access"
      title="Roles and access"
      description="Roles decide what this user may do. Care profiles decide who they may do it to."
      loading={loading}
      error={error}
      notice={notice}
    >
      <div className="cfg-listgroup">
        <div className="cfg-listgroup-head">
          <h2 className="cp-eyebrow">Roles</h2>
          <p className="cfg-fine">{accessCounts(user, patientIds)}</p>
        </div>
        <section className="cfg-card cp-rows">
          {roles.length === 0 && (
            <p className="cfg-empty">No roles have been created yet.</p>
          )}
          {roles.map((role) => (
            <GrantRow
              key={role.id}
              selected={selectedRoles.includes(role.id)}
              title={role.display_name}
              blurb={role.description}
              disabled={role.name === 'system_admin' && user?.is_system_admin}
              onToggle={() => toggle(setSelectedRoles)(role.id)}
            />
          ))}
        </section>
      </div>

      <div className="cfg-listgroup">
        <h2 className="cp-eyebrow">Care profiles</h2>
        <section className="cfg-card cp-rows">
          {grantsEverything ? (
            <p className="cfg-empty">
              A system administrator reaches every care profile, so there is nothing to
              choose here. Any assignments already recorded are left untouched.
            </p>
          ) : (
            <>
              {patients.length === 0 && (
                <p className="cfg-empty">No care profiles have been added yet.</p>
              )}
              {patients.map((p) => (
                <GrantRow
                  key={p.id}
                  selected={selectedProfiles.includes(p.id)}
                  title={[p.first_name, p.last_name].filter(Boolean).join(' ')}
                  blurb={p.medical_record_number ? `MRN ${p.medical_record_number}` : null}
                  onToggle={() => toggle(setSelectedProfiles)(p.id)}
                />
              ))}
            </>
          )}
        </section>
      </div>

      <div className="ud-actions">
        <button type="button" className="em-submit" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save access'}
        </button>
        <button
          type="button"
          className="em-cancel"
          onClick={() => navigate(`/care/configuration/users/${userId}`)}
        >
          Cancel
        </button>
      </div>
    </UserSection>
  );
}
