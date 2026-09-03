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
// Editor for one measurement's expected range. Blood pressure gets a pair of
// rows (systolic / diastolic) because that is where its bounds live; every
// other vital is a single pair of numbers.
import { useEffect, useState } from 'react';
import EntityModal, { EmField, EmRow } from '../../../../components/vc/EntityModal';
import { numOrNull, rowPayload, saveRanges } from './rangeApi';
import '../care-profile.css';

const text = (v) => (v === null || v === undefined ? '' : String(v));

export default function MeasurementEditorDialog({ patientId, row, open, onOpenChange, onSaved }) {
  const [bounds, setBounds] = useState({});
  const [required, setRequired] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Editable rows: the components for blood pressure, the vital itself
  // otherwise. Re-seeded whenever a different measurement is opened.
  const editable = row ? (row.components.length ? row.components : [row.parent]) : [];

  useEffect(() => {
    if (!row || !open) return;
    const rows = row.components.length ? row.components : [row.parent];
    const next = {};
    rows.forEach((r) => {
      next[r.field_key || ''] = {
        min: text(r.expected_min),
        max: text(r.expected_max),
      };
    });
    setBounds(next);
    setRequired(Boolean(row.required));
    setNote(row.parent.note || '');
    setError('');
  }, [row, open]);

  const setBound = (fieldKey, which, value) => {
    setBounds((prev) => ({ ...prev, [fieldKey]: { ...prev[fieldKey], [which]: value } }));
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const edited = (fieldKey) => bounds[fieldKey || ''] || { min: '', max: '' };
      const payload = [];

      if (row.components.length) {
        // The parent row carries the required flag; the components carry bounds.
        payload.push(rowPayload(row.parent, { required, note: note.trim() || null }));
        row.components.forEach((c) => {
          payload.push(rowPayload(c, {
            expected_min: numOrNull(edited(c.field_key).min),
            expected_max: numOrNull(edited(c.field_key).max),
            required: false,
          }));
        });
      } else {
        payload.push(rowPayload(row.parent, {
          expected_min: numOrNull(edited('').min),
          expected_max: numOrNull(edited('').max),
          required,
          note: note.trim() || null,
        }));
      }

      await saveRanges(patientId, payload);
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!row) return null;

  return (
    <EntityModal open={open} onOpenChange={onOpenChange} title={row.label}>
      <form onSubmit={save} className="em-form">
        <p className="em-hint">
          Readings outside the expected range are flagged on capture and asked about
          before they are saved. Leave a field blank for no bound.
        </p>

        {error && <div className="em-error" role="alert">{error}</div>}

        {editable.map((r) => {
          const fieldKey = r.field_key || '';
          const id = `meas-${row.key}-${fieldKey || 'value'}`;
          const value = bounds[fieldKey] || { min: '', max: '' };
          return (
            <div key={id} className="cp-bounds">
              {row.components.length > 0 && (
                <h4 className="cp-eyebrow">{r.label || fieldKey}</h4>
              )}
              <EmRow>
                <EmField label={`Expected min${row.unit ? ` (${row.unit})` : ''}`} htmlFor={`${id}-min`}>
                  <input
                    id={`${id}-min`}
                    className="em-input"
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={value.min}
                    onChange={(e) => setBound(fieldKey, 'min', e.target.value)}
                  />
                </EmField>
                <EmField label={`Expected max${row.unit ? ` (${row.unit})` : ''}`} htmlFor={`${id}-max`}>
                  <input
                    id={`${id}-max`}
                    className="em-input"
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={value.max}
                    onChange={(e) => setBound(fieldKey, 'max', e.target.value)}
                  />
                </EmField>
              </EmRow>
            </div>
          );
        })}

        <label className="em-check-row">
          <input
            type="checkbox"
            className="em-check"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
          />
          <span className="em-check-label">Required to complete an encounter</span>
        </label>

        <EmField label="Note" optional htmlFor={`meas-${row.key}-note`}>
          <textarea
            id={`meas-${row.key}-note`}
            className="em-input"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why these bounds — who asked for them, when they were reviewed…"
          />
        </EmField>

        <div className="em-footer">
          <button type="button" className="em-cancel" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="submit" className="em-submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save measurement'}
          </button>
        </div>
      </form>
    </EntityModal>
  );
}
