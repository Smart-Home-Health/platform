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
// SpO₂ and heart-rate alert thresholds for the live board. Four integers,
// saved one key at a time through the settings service (each carries its
// own data type and description server-side).
import { useState, useEffect } from 'react';
import { getSettings, setSetting } from '../../services/settings';
import { EmField, EmRow } from '../vc/EntityModal';
import { THRESHOLD_FIELDS as FIELDS, validateThresholds } from './thresholds';
import '../schedule/schedule-panel.css';
import './settings-panel.css';

export default function ThresholdSettings() {
  const [form, setForm] = useState({ min_spo2: 90, max_spo2: 100, min_bpm: 55, max_bpm: 155 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await getSettings();
        const next = {};
        for (const [key, value] of Object.entries(settings || {})) {
          if (key.includes('spo2') || key.includes('bpm')) next[key] = value;
        }
        if (!cancelled) setForm((prev) => ({ ...prev, ...next }));
      } catch {
        if (!cancelled) setError('Could not load the thresholds.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaved(false);
    const problem = validateThresholds(form);
    if (problem) { setError(problem); return; }
    setError(null);
    setSaving(true);
    try {
      await Promise.all(FIELDS.map(({ key, description }) =>
        setSetting(key, parseInt(form[key], 10), 'int', description)));
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Could not save the thresholds.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="ld-dose-empty">Loading thresholds…</div>;

  const num = (key, id, label, min, max) => (
    <EmField label={label} htmlFor={id}>
      <input
        id={id}
        className="em-input"
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
      />
    </EmField>
  );

  return (
    <form className="st-form" onSubmit={submit} noValidate>
      {error && <div className="em-error">{error}</div>}
      {saved && <div className="em-success">Thresholds saved.</div>}

      <section className="st-section">
        <h3 className="st-section-title">SpO₂ (%)</h3>
        <EmRow>
          {num('min_spo2', 'st-min-spo2', 'Alert below', 80, 99)}
          {num('max_spo2', 'st-max-spo2', 'Alert above', 90, 100)}
        </EmRow>
      </section>

      <section className="st-section">
        <h3 className="st-section-title">Heart rate (bpm)</h3>
        <EmRow>
          {num('min_bpm', 'st-min-bpm', 'Alert below', 40, 100)}
          {num('max_bpm', 'st-max-bpm', 'Alert above', 100, 220)}
        </EmRow>
      </section>

      <div className="st-actions">
        <button type="submit" className="ld-dose-btn primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save thresholds'}
        </button>
      </div>
    </form>
  );
}
