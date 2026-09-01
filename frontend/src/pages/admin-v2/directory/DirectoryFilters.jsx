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
// The filter sheet behind the toolbar button. Edits a draft so closing without
// applying leaves the list alone.
import { useEffect, useState } from 'react';
import EntityModal, { EmField, EmSelect } from '../../../components/vc/EntityModal';
import { DEFAULT_FILTERS, STALE_LOGIN_DAYS, TABS } from './directoryTabs';

export default function DirectoryFilters({
  tab, filters, roles = [], open, onOpenChange, onApply,
}) {
  const [draft, setDraft] = useState(filters);

  useEffect(() => { if (open) setDraft(filters); }, [open, filters]);

  const apply = (e) => {
    e.preventDefault();
    onApply(draft);
    onOpenChange(false);
  };

  const noun = TABS[tab].noun[1];

  return (
    <EntityModal open={open} onOpenChange={onOpenChange} title={`Filter ${noun}`}>
      <form onSubmit={apply} className="em-form">
        <p className="em-hint">Narrow the list without losing your search.</p>

        <EmField label="Status" htmlFor="dirf-status">
          <EmSelect
            id="dirf-status"
            value={draft.status}
            onChange={(e) => setDraft({ ...draft, status: e.target.value })}
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </EmSelect>
        </EmField>

        {tab === 'users' && (
          <>
            <EmField label="Role" htmlFor="dirf-role">
              <EmSelect
                id="dirf-role"
                value={String(draft.role)}
                onChange={(e) => setDraft({ ...draft, role: e.target.value })}
              >
                <option value="all">All roles</option>
                {roles.map((role) => (
                  <option key={role.id} value={String(role.id)}>
                    {role.display_name}
                  </option>
                ))}
              </EmSelect>
            </EmField>

            <label className="em-check-row">
              <input
                type="checkbox"
                className="em-check"
                checked={draft.stale}
                onChange={(e) => setDraft({ ...draft, stale: e.target.checked })}
              />
              <span className="em-check-label">
                No sign-in in {STALE_LOGIN_DAYS} days
              </span>
            </label>
          </>
        )}

        <div className="em-footer">
          <button
            type="button"
            className="em-cancel"
            onClick={() => setDraft({ ...DEFAULT_FILTERS, status: 'all' })}
          >
            Reset
          </button>
          <button type="submit" className="em-submit">Apply</button>
        </div>
      </form>
    </EntityModal>
  );
}
