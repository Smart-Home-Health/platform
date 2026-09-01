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
// One group of MQTT sections, each with its direction. Get is Home Assistant
// reading from us, Set is Home Assistant writing back, Both is both ways.
import { useEffect, useState } from 'react';
import EntityModal, { EmSelect } from '../../../../components/vc/EntityModal';
import { MQTT_SECTIONS, permOptionsForSection } from '../../mqttConstants';
import '../care-profile.css';

const labelOf = (id) => MQTT_SECTIONS.find((s) => s.id === id)?.label || id;

export default function PermissionGroupDialog({
  group, sections, open, onOpenChange, onSave, saving, error,
}) {
  const [values, setValues] = useState({});

  useEffect(() => {
    if (!group || !open) return;
    setValues(Object.fromEntries(
      group.sections.map((id) => [id, sections[id] || 'off'])));
  }, [group, sections, open]);

  if (!group) return null;

  const submit = (e) => {
    e.preventDefault();
    onSave({ ...sections, ...values });
  };

  const setAll = (value) => setValues(Object.fromEntries(
    group.sections.map((id) => [
      id,
      // A read-only section cannot be given a write direction.
      permOptionsForSection(id).some((o) => o.value === value) ? value : 'get',
    ])));

  return (
    <EntityModal open={open} onOpenChange={onOpenChange} title={group.label}>
      <form onSubmit={submit} className="em-form">
        <p className="em-hint">
          Get is Home Assistant reading this from the hub. Set is Home Assistant
          writing it back. Off is never published.
        </p>

        {error && <div className="em-error" role="alert">{error}</div>}

        <div className="cp-actions">
          <button type="button" className="cfg-ghost" onClick={() => setAll('get')}>
            All read-only
          </button>
          <button type="button" className="cfg-ghost" onClick={() => setAll('off')}>
            All off
          </button>
        </div>

        <div className="cp-rows boxed">
          {group.sections.map((id) => (
            <div key={id} className="cp-list-row">
              <span className="cp-row-title cp-row-title-plain">{labelOf(id)}</span>
              <EmSelect
                aria-label={`${labelOf(id)} permission`}
                value={values[id] || 'off'}
                onChange={(e) => setValues((prev) => ({ ...prev, [id]: e.target.value }))}
              >
                {permOptionsForSection(id).map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </EmSelect>
            </div>
          ))}
        </div>

        <div className="em-footer">
          <button type="button" className="em-cancel" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="submit" className="em-submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save permissions'}
          </button>
        </div>
      </form>
    </EntityModal>
  );
}
