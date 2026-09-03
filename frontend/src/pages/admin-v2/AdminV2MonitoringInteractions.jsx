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
import { useState, useEffect } from 'react';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import { API_BASE_URL } from '../../config';
import { ChevronRightIcon } from '../../components/Icons';
import SegmentedControl from '../../components/vc/SegmentedControl';
import { EmField, EmSelect } from '../../components/vc/EntityModal';
import { CfgFields } from './settings/CfgSection';
import '../../components/vc/entity-card.css';
import './settings/settings-page.css';
import './monitoring-interactions.css';
import './AdminV2.css';

const WINDOW_PRESETS = [
  { label: 'Immediate', desc: '1hr before → 2hr after', preStart: 60, preEnd: 5, postStart: 15, postEnd: 120 },
  { label: 'Short-term', desc: '2hr before → 8hr after', preStart: 120, preEnd: 5, postStart: 15, postEnd: 480 },
  { label: '24 hours', desc: '2hr before → 24hr after', preStart: 120, preEnd: 5, postStart: 60, postEnd: 1440 },
  { label: 'Multi-day', desc: '4hr before → 3 days after', preStart: 240, preEnd: 5, postStart: 120, postEnd: 4320 },
  { label: '5-day', desc: '4hr before → 5 days after', preStart: 240, preEnd: 5, postStart: 240, postEnd: 7200 },
];

const SOURCE_LABELS = {
  pulse_ox: 'Pulse Oximeter',
  vitals: 'Manual Vitals',
  vent: 'Ventilator',
};

const SOURCE_COLORS = {
  pulse_ox: '#3b82f6',
  vitals: '#3fb950',
  vent: '#f0883e',
};

function formatWindow(min) {
  if (min == null) return '';
  if (min < 60) return `${min}m`;
  if (min < 1440) return `${(min / 60).toFixed(min % 60 ? 1 : 0)}h`;
  return `${(min / 1440).toFixed(min % 1440 ? 1 : 0)}d`;
}

export default function AdminV2MonitoringInteractions() {
  const { selectedPatient } = useAdminPatient();
  const patientId = selectedPatient?.id;

  const [medications, setMedications] = useState([]);
  const [selectedMedId, setSelectedMedId] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [medsLoading, setMedsLoading] = useState(false);
  const [error, setError] = useState('');
  const [activePreset, setActivePreset] = useState(0);
  const [showCustom, setShowCustom] = useState(false);
  const [preStart, setPreStart] = useState(WINDOW_PRESETS[0].preStart);
  const [preEnd, setPreEnd] = useState(WINDOW_PRESETS[0].preEnd);
  const [postStart, setPostStart] = useState(WINDOW_PRESETS[0].postStart);
  const [postEnd, setPostEnd] = useState(WINDOW_PRESETS[0].postEnd);

  useEffect(() => {
    if (!patientId) return;
    setMedsLoading(true);
    fetch(`${API_BASE_URL}/api/analysis/patients/${patientId}/medications`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject('Failed to load medications'))
      .then(data => {
        setMedications(data);
        if (data.length > 0 && !selectedMedId) setSelectedMedId(data[0].id);
      })
      .catch(e => setError(String(e)))
      .finally(() => setMedsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedMedId is read only to seed a default without clobbering an existing selection; the analysis effect below handles selectedMedId changes, and adding it here would refetch the med list on every selection change
  }, [patientId]);

  useEffect(() => {
    if (!patientId || !selectedMedId) return;
    setLoading(true);
    setError('');
    setResults(null);
    const params = new URLSearchParams({
      pre_start: preStart, pre_end: preEnd,
      post_start: postStart, post_end: postEnd,
    });
    fetch(`${API_BASE_URL}/api/analysis/patients/${patientId}/med-effects/${selectedMedId}?${params}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject('Analysis failed'))
      .then(setResults)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [patientId, selectedMedId, preStart, preEnd, postStart, postEnd]);

  if (!selectedPatient) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--vc-text-secondary)' }}>
        <p>Select a patient to view medication-vital interactions.</p>
      </div>
    );
  }

  const grouped = {};
  if (results?.metrics) {
    for (const m of results.metrics) {
      const src = m.source || 'other';
      if (!grouped[src]) grouped[src] = [];
      grouped[src].push(m);
    }
  }

  return (
    <div style={{ padding: '0.5rem 0' }}>
      {/* Header + controls */}
      <div className="mi-controls">
        <CfgFields>
          <EmField label="Medication" htmlFor="mi-med">
            <EmSelect
              id="mi-med"
              value={selectedMedId != null ? String(selectedMedId) : ''}
              onChange={(e) => setSelectedMedId(e.target.value ? Number(e.target.value) : null)}
              disabled={medsLoading}
            >
              <option value="">Select medication</option>
              {medications.map(m => (
                <option key={m.id} value={String(m.id)}>
                  {m.name} {m.concentration} ({m.dose_count} doses)
                </option>
              ))}
            </EmSelect>
          </EmField>
        </CfgFields>

        {/* Window presets. A radiogroup rather than a row of buttons: the
            choices are mutually exclusive, and arrow-key movement comes free. */}
        <SegmentedControl
          label="Window"
          size="sm"
          value={showCustom ? 'custom' : String(activePreset)}
          onChange={(v) => {
            if (v === 'custom') { setShowCustom(true); return; }
            const i = Number(v);
            const p = WINDOW_PRESETS[i];
            setActivePreset(i);
            setShowCustom(false);
            setPreStart(p.preStart);
            setPreEnd(p.preEnd);
            setPostStart(p.postStart);
            setPostEnd(p.postEnd);
          }}
          options={[
            ...WINDOW_PRESETS.map((p, i) => ({ value: String(i), label: p.label, title: p.desc })),
            { value: 'custom', label: 'Custom', title: 'Set the window bounds by hand' },
          ]}
        />

        {showCustom && (
          <CfgFields>
            <EmField label="Before start (min)" htmlFor="mi-pre-start">
              <input id="mi-pre-start" className="em-input" type="number"
                     value={preStart} onChange={e => setPreStart(Number(e.target.value))} min={5} max={10080} />
            </EmField>
            <EmField label="Before end (min)" htmlFor="mi-pre-end">
              <input id="mi-pre-end" className="em-input" type="number"
                     value={preEnd} onChange={e => setPreEnd(Number(e.target.value))} min={0} max={60} />
            </EmField>
            <EmField label="After start (min)" htmlFor="mi-post-start">
              <input id="mi-post-start" className="em-input" type="number"
                     value={postStart} onChange={e => setPostStart(Number(e.target.value))} min={0} max={1440} />
            </EmField>
            <EmField label="After end (min)" htmlFor="mi-post-end">
              <input id="mi-post-end" className="em-input" type="number"
                     value={postEnd} onChange={e => setPostEnd(Number(e.target.value))} min={30} max={10080} />
            </EmField>
          </CfgFields>
        )}
      </div>

      {error && <div className="em-error ec-page-alert" role="alert">{error}</div>}

      {loading && <div className="admin-v2-loading">Analyzing dose events...</div>}

      {results && !loading && (
        <>
          {/* Summary */}
          <div style={{ fontSize: '0.85rem', color: 'var(--vc-text-secondary)', marginBottom: '1rem' }}>
            {results.total_dose_events} dose events analyzed
            {results.metrics.length > 0 && (
              <> &mdash; {results.metrics.filter(m => m.significant).length} significant correlation{results.metrics.filter(m => m.significant).length !== 1 ? 's' : ''} found</>
            )}
            <div style={{ fontSize: '0.78rem', marginTop: '0.25rem' }}>
              Comparing {formatWindow(results.windows?.pre?.start_min)} &ndash; {formatWindow(results.windows?.pre?.end_min)} before
              {' '}vs {formatWindow(results.windows?.post?.start_min)} &ndash; {formatWindow(results.windows?.post?.end_min)} after each dose
            </div>
          </div>

          {results.warnings?.length > 0 && (
            <div className="admin-v2-alert admin-v2-alert-warning" style={{ marginBottom: '1rem' }}>
              {results.warnings.map((w, i) => <div key={i}>{w}</div>)}
            </div>
          )}

          {results.metrics.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--vc-text-secondary)' }}>
              Not enough data to analyze. Need at least 3 dose events with matching vital readings in the selected time windows.
            </div>
          ) : (
            Object.entries(grouped).map(([source, metrics]) => (
              <div key={source} style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: SOURCE_COLORS[source] || 'var(--vc-text-secondary)',
                    display: 'inline-block',
                  }} />
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--vc-text-primary)' }}>
                    {SOURCE_LABELS[source] || source}
                  </span>
                </div>
                <div className="admin-v2-cards-grid">
                  {metrics.map(m => (
                    <MetricCard key={m.display_name} metric={m} sourceColor={SOURCE_COLORS[source]} />
                  ))}
                </div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}

function MetricCard({ metric, sourceColor }) {
  const m = metric;
  const isUp = m.delta > 0;
  const arrow = isUp ? '↑' : m.delta < 0 ? '↓' : '→';
  const deltaColor = m.significant
    ? (isUp ? '#f0883e' : '#3fb950')
    : 'var(--vc-text-secondary)';

  return (
    <div className="admin-v2-card" style={{ borderTop: `3px solid ${m.significant ? sourceColor : 'transparent'}` }}>
      <div className="admin-v2-card-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
        <div>
          <h3 style={{ fontSize: '0.95rem', margin: 0, color: 'var(--vc-text-primary)' }}>{m.display_name}</h3>
          {m.units && <span style={{ fontSize: '0.75rem', color: 'var(--vc-text-secondary)' }}>{m.units}</span>}
        </div>
        <span className={`admin-v2-badge ${m.significant ? 'admin-v2-badge-success' : 'admin-v2-badge-muted'}`}
              style={{ fontSize: '0.7rem' }}>
          {m.significant ? 'Significant' : 'Not significant'}
        </span>
      </div>
      <div className="admin-v2-card-body" style={{ paddingTop: '0.5rem' }}>
        {/* Delta display */}
        <div style={{ textAlign: 'center', padding: '0.75rem 0' }}>
          <span style={{ fontSize: '1.6rem', fontWeight: 700, color: deltaColor }}>
            {arrow} {Math.abs(m.delta).toFixed(1)}
          </span>
          <span style={{ fontSize: '0.8rem', color: 'var(--vc-text-secondary)', marginLeft: '0.35rem' }}>
            ({m.pct_change > 0 ? '+' : ''}{m.pct_change}%)
          </span>
        </div>

        {/* Pre → Post */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'var(--vc-bg-raised)', borderRadius: 6, padding: '0.5rem 0.75rem',
          fontSize: '0.85rem',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: 'var(--vc-text-secondary)', fontSize: '0.7rem', marginBottom: 2 }}>Before</div>
            <div style={{ color: 'var(--vc-text-primary)', fontWeight: 600 }}>{m.pre_mean}</div>
          </div>
          <span className="mi-arrow" aria-hidden="true"><ChevronRightIcon size={16} /></span>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: 'var(--vc-text-secondary)', fontSize: '0.7rem', marginBottom: 2 }}>After</div>
            <div style={{ color: 'var(--vc-text-primary)', fontWeight: 600 }}>{m.post_mean}</div>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--vc-text-secondary)' }}>
          <span>p = {m.p_value < 0.001 ? '<0.001' : m.p_value.toFixed(3)}</span>
          <span>{m.n_events} paired events</span>
        </div>
      </div>
    </div>
  );
}
