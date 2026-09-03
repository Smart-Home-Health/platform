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
// What the live board shows: the min/max/avg line under each tile, the two
// sub-chart vitals, and whether perfusion reads as % or PI. Saved as one
// batch through the settings service.
import { useState, useEffect } from 'react';
import { getSettings, updateSettings } from '../../services/settings';
import config, { apiFetch } from '../../config';
import { EmField, EmRow, EmSelect } from '../vc/EntityModal';
import '../schedule/schedule-panel.css';
import './settings-panel.css';

const VITAL_LABELS = {
  blood_pressure: 'Blood pressure',
  temperature: 'Temperature',
  bathroom: 'Bathroom',
  weight: 'Weight',
  calories: 'Calories',
  water: 'Water intake',
  nutrition: 'Nutrition (calories & water)',
};
const vitalLabel = (v) => VITAL_LABELS[v] || v.charAt(0).toUpperCase() + v.slice(1);

// Settings arrive as strings; these are the booleans the form owns.
const asBool = (v) => (v === 'True' || v === 'true' ? true : v === 'False' || v === 'false' ? false : v);

export default function DashboardSettings() {
  const [form, setForm] = useState({
    show_statistics: true,
    perfusion_as_percent: false,
    dashboard_chart_1_vital: '',
    dashboard_chart_2_vital: '',
  });
  const [vitals, setVitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [settings, typesRes, nutritionRes] = await Promise.all([
          getSettings(),
          apiFetch(`${config.apiUrl}/api/vitals/types`),
          apiFetch(`${config.apiUrl}/api/nutrition/has-data`),
        ]);
        const types = typesRes.ok ? await typesRes.json() : [];
        const all = [...new Set(['blood_pressure', 'temperature', ...types])];
        if (nutritionRes.ok && (await nutritionRes.json())?.has_data) all.push('nutrition');
        if (cancelled) return;
        setVitals(all);
        const next = {};
        for (const [key, value] of Object.entries(settings || {})) {
          if (key.startsWith('show_') || key.includes('chart_') || key.includes('dashboard_') || key.includes('perfusion_')) {
            next[key] = asBool(value);
          }
        }
        setForm((prev) => ({ ...prev, ...next }));
        setError(null);
      } catch {
        if (!cancelled) setError('Could not load the dashboard settings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  // Each vital can drive only one sub-chart.
  const optionsFor = (chart) => {
    const other = form[chart === 1 ? 'dashboard_chart_2_vital' : 'dashboard_chart_1_vital'];
    return vitals.filter((v) => v !== other);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await updateSettings({
        show_statistics: form.show_statistics,
        perfusion_as_percent: form.perfusion_as_percent,
        dashboard_chart_1_vital: form.dashboard_chart_1_vital,
        dashboard_chart_2_vital: form.dashboard_chart_2_vital,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError('Could not save the dashboard settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="ld-dose-empty">Loading settings…</div>;

  return (
    <form className="st-form" onSubmit={submit} noValidate>
      {error && <div className="em-error">{error}</div>}
      {saved && <div className="em-success">Dashboard settings saved.</div>}

      <section className="st-section">
        <h3 className="st-section-title">Vital tiles</h3>
        <label className="em-check-row">
          <input
            type="checkbox"
            className="em-check"
            checked={!!form.show_statistics}
            onChange={(e) => set('show_statistics', e.target.checked)}
          />
          <span className="em-check-label">Show min / max / avg under each value</span>
        </label>
        <p className="st-section-hint">The line under each tile summarises the selected chart range.</p>
      </section>

      <section className="st-section">
        <h3 className="st-section-title">Sub-charts</h3>
        <p className="st-section-hint">Two vitals chart under the live traces; each can be used once.</p>
        <EmRow>
          <EmField label="Chart 1" htmlFor="st-chart-1">
            <EmSelect id="st-chart-1" value={form.dashboard_chart_1_vital} onChange={(e) => set('dashboard_chart_1_vital', e.target.value)}>
              <option value="">Choose a vital…</option>
              {optionsFor(1).map((v) => <option key={v} value={v}>{vitalLabel(v)}</option>)}
            </EmSelect>
          </EmField>
          <EmField label="Chart 2" htmlFor="st-chart-2">
            <EmSelect id="st-chart-2" value={form.dashboard_chart_2_vital} onChange={(e) => set('dashboard_chart_2_vital', e.target.value)}>
              <option value="">Choose a vital…</option>
              {optionsFor(2).map((v) => <option key={v} value={v}>{vitalLabel(v)}</option>)}
            </EmSelect>
          </EmField>
        </EmRow>
      </section>

      <section className="st-section">
        <h3 className="st-section-title">Perfusion</h3>
        <label className="em-check-row">
          <input
            type="checkbox"
            className="em-check"
            checked={!!form.perfusion_as_percent}
            onChange={(e) => set('perfusion_as_percent', e.target.checked)}
          />
          <span className="em-check-label">Show perfusion as a percentage</span>
        </label>
        <p className="st-section-hint">Unchecked shows PI (perfusion index).</p>
      </section>

      <div className="st-actions">
        <button type="submit" className="ld-dose-btn primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save dashboard'}
        </button>
      </div>
    </form>
  );
}
