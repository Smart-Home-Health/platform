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
// Which readings an encounter needs before it counts as complete. The flag
// lives on each measurement's vital-level row; this is the one place to see
// them side by side.
import { useEffect, useState } from 'react';
import EntityModal from '../../../../components/vc/EntityModal';
import { rowPayload, saveRanges } from './rangeApi';
import '../care-profile.css';

export default function CompletionRulesDialog({
  patientId, rows, open, onOpenChange, onSaved,
}) {
  const [required, setRequired] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setRequired(Object.fromEntries(rows.map((r) => [r.key, r.required])));
    setError('');
  }, [rows, open]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      // Only the measurements whose flag actually moved.
      const changed = rows.filter((r) => Boolean(required[r.key]) !== r.required);
      if (changed.length) {
        await saveRanges(patientId, changed.map((r) =>
          rowPayload(r.parent, { required: Boolean(required[r.key]) })));
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const count = Object.values(required).filter(Boolean).length;

  return (
    <EntityModal open={open} onOpenChange={onOpenChange} title="Completion rules">
      <form onSubmit={save} className="em-form">
        <p className="em-hint">
          A capture encounter is complete once every required reading is in. Anything
          unticked can still be recorded — it just is not waited for.
        </p>

        {error && <div className="em-error" role="alert">{error}</div>}

        <div className="cp-rows boxed">
          {rows.map((r) => (
            <label key={r.key} className="em-check-row cp-rule-row">
              <input
                type="checkbox"
                className="em-check"
                checked={Boolean(required[r.key])}
                onChange={(e) => setRequired((prev) => ({ ...prev, [r.key]: e.target.checked }))}
              />
              <span className="em-check-label">
                {r.label}
                <span className="cp-row-blurb">{r.summary}</span>
              </span>
            </label>
          ))}
        </div>

        <p className="em-hint">
          {count === 0
            ? 'No readings required — an encounter can be saved with any of them.'
            : `${count} ${count === 1 ? 'reading' : 'readings'} required per encounter.`}
        </p>

        <div className="em-footer">
          <button type="button" className="em-cancel" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="submit" className="em-submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save rules'}
          </button>
        </div>
      </form>
    </EntityModal>
  );
}
