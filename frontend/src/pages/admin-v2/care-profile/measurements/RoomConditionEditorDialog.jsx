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
// Editor for one room condition. Caution is worth noticing, critical is worth
// acting on; clearing every field drops the override and the metric goes back
// to its default bounds.
import { useEffect, useState } from 'react';
import config, { apiFetch } from '../../../../config';
import EntityModal, { EmField, EmRow } from '../../../../components/vc/EntityModal';
import { numOrNull, rangeErrorText } from './rangeApi';

const FIELDS = ['critical_min', 'caution_min', 'caution_max', 'critical_max'];
const text = (v) => (v === null || v === undefined ? '' : String(v));

export default function RoomConditionEditorDialog({
  patientId, metric, open, onOpenChange, onSaved,
}) {
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!metric || !open) return;
    setValues(Object.fromEntries(FIELDS.map((f) => [f, text(metric.row[f])])));
    setError('');
  }, [metric, open]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = { metric: metric.key, note: metric.row.note ?? null };
      FIELDS.forEach((f) => {
        payload[f] = metric.hasFloor || !f.endsWith('_min') ? numOrNull(values[f]) : null;
      });
      const res = await apiFetch(`${config.apiUrl}/api/environment/ranges`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: Number(patientId), ranges: [payload] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(rangeErrorText(body.detail, 'Could not save these bounds.'));
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!metric) return null;

  const bound = (name, label) => (
    <EmField
      label={`${label}${metric.unit ? ` (${metric.unit})` : ''}`}
      htmlFor={`env-${metric.key}-${name}`}
    >
      <input
        id={`env-${metric.key}-${name}`}
        className="em-input"
        type="number"
        step="any"
        inputMode="decimal"
        value={values[name] ?? ''}
        onChange={(e) => setValues((prev) => ({ ...prev, [name]: e.target.value }))}
      />
    </EmField>
  );

  return (
    <EntityModal open={open} onOpenChange={onOpenChange} title={metric.label}>
      <form onSubmit={save} className="em-form">
        <p className="em-hint">
          When to flag the room on this profile&rsquo;s timeline. Leave a field blank
          for no bound; clear them all to go back to the default bounds.
        </p>

        {error && <div className="em-error" role="alert">{error}</div>}

        {metric.hasFloor ? (
          <>
            <EmRow>
              {bound('critical_min', 'Critical low')}
              {bound('caution_min', 'Caution low')}
            </EmRow>
            <EmRow>
              {bound('caution_max', 'Caution high')}
              {bound('critical_max', 'Critical high')}
            </EmRow>
          </>
        ) : (
          <>
            <EmRow>
              {bound('caution_max', 'Caution above')}
              {bound('critical_max', 'Critical above')}
            </EmRow>
            <p className="em-hint">
              {metric.label} only has ceilings — a floor here would flag every clean reading.
            </p>
          </>
        )}

        <div className="em-footer">
          <button type="button" className="em-cancel" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="submit" className="em-submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save bounds'}
          </button>
        </div>
      </form>
    </EntityModal>
  );
}
