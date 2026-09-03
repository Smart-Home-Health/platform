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
// Care profile → Measurements → Advanced · hard limits.
//
// Expected ranges question a reading; hard limits reject it. They ship as
// device/physics defaults and are kept off the main measurements flow so the
// day-to-day job never runs into them.
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import CareProfileSection from '../CareProfileSection';
import useCareProfile from '../useCareProfile';
import { buildMeasurementRows } from './measurementRows';
import { numOrNull, rowPayload, saveRanges } from './rangeApi';
import '../care-profile.css';

const text = (v) => (v === null || v === undefined ? '' : String(v));
const keyOf = (r) => `${r.vital_key}|${r.field_key || ''}`;

export default function AdminV2CareProfileHardLimits() {
  const { patientId } = useParams();
  const { patient, measurements, loading, error, setError, reload } =
    useCareProfile(patientId, { measurements: true });

  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  // Rows that can actually carry a limit: the components of a multi-field
  // vital, the vital itself otherwise.
  const boundRows = useMemo(() => {
    const rows = buildMeasurementRows(measurements?.ranges);
    return rows.flatMap((row) => (row.components.length ? row.components : [row.parent])
      .map((r) => ({ ...r, group: row.label, unit: row.unit })));
  }, [measurements]);

  useEffect(() => { setEdits({}); }, [measurements]);

  const valueOf = (r, field) => {
    const edited = edits[keyOf(r)]?.[field];
    return edited !== undefined ? edited : text(r[field]);
  };

  const setValue = (r, field, value) => {
    setEdits((prev) => ({ ...prev, [keyOf(r)]: { ...prev[keyOf(r)], [field]: value } }));
  };

  const dirty = Object.keys(edits).length > 0;

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const changed = boundRows.filter((r) => edits[keyOf(r)]);
      await saveRanges(patientId, changed.map((r) => rowPayload(r, {
        implausible_min: numOrNull(valueOf(r, 'implausible_min')),
        implausible_max: numOrNull(valueOf(r, 'implausible_max')),
      })));
      await reload();
      setNotice('Hard limits saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <CareProfileSection
      patientId={patientId}
      patient={patient}
      title="Hard limits"
      description="Safety bounds and validation rules."
      loading={loading}
      error={error}
      notice={notice}
    >
      <p className="cfg-note">
        A reading outside these bounds is rejected on capture — it is treated as a typo
        or a bad device read, not as a clinical finding. The defaults are device and
        physics limits; clear a field to go back to the default.
      </p>

      <form onSubmit={save}>
        <section className="cfg-card">
          {boundRows.map((r) => (
            <div key={keyOf(r)} className="cp-limit-row">
              <div className="cp-limit-name">
                <span className="cp-row-title cp-row-title-plain">
                  {r.field_key ? `${r.group} — ${r.label}` : r.group}
                </span>
                <span className="cp-row-blurb">
                  {r.source === 'patient' ? 'Set for this profile' : 'Default limits'}
                  {r.unit ? ` · ${r.unit}` : ''}
                </span>
              </div>
              <div className="cp-limit-fields">
                <input
                  className="em-input"
                  type="number"
                  step="any"
                  inputMode="decimal"
                  aria-label={`${r.group}${r.field_key ? ` ${r.label}` : ''} lowest plausible value`}
                  value={valueOf(r, 'implausible_min')}
                  onChange={(e) => setValue(r, 'implausible_min', e.target.value)}
                />
                <input
                  className="em-input"
                  type="number"
                  step="any"
                  inputMode="decimal"
                  aria-label={`${r.group}${r.field_key ? ` ${r.label}` : ''} highest plausible value`}
                  value={valueOf(r, 'implausible_max')}
                  onChange={(e) => setValue(r, 'implausible_max', e.target.value)}
                />
              </div>
            </div>
          ))}
          <footer className="cfg-foot spread">
            <span className="cfg-fine">
              {dirty ? 'Unsaved changes' : 'Lowest and highest plausible value'}
            </span>
            <button type="submit" className="em-submit" disabled={saving || !dirty}>
              {saving ? 'Saving…' : 'Save hard limits'}
            </button>
          </footer>
        </section>
      </form>
    </CareProfileSection>
  );
}
