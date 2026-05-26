import React, { useState, useEffect } from 'react';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import { API_BASE_URL } from '../../config';
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
      <div style={{ textAlign: 'center', padding: '3rem', color: '#8b949e' }}>
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
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#8b949e', marginBottom: '0.35rem' }}>Medication</label>
            <select
              className="admin-v2-input"
              value={selectedMedId || ''}
              onChange={e => setSelectedMedId(Number(e.target.value))}
              disabled={medsLoading}
            >
              {medications.map(m => (
                <option key={m.id} value={m.id}>{m.name} {m.concentration} ({m.dose_count} doses)</option>
              ))}
            </select>
          </div>
        </div>

        {/* Window presets */}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {WINDOW_PRESETS.map((p, i) => (
            <button
              key={i}
              className={`admin-v2-btn admin-v2-btn-sm ${activePreset === i && !showCustom ? 'admin-v2-btn-primary' : 'admin-v2-btn-ghost'}`}
              onClick={() => {
                setActivePreset(i);
                setShowCustom(false);
                setPreStart(p.preStart);
                setPreEnd(p.preEnd);
                setPostStart(p.postStart);
                setPostEnd(p.postEnd);
              }}
              title={p.desc}
            >
              {p.label}
            </button>
          ))}
          <button
            className={`admin-v2-btn admin-v2-btn-sm ${showCustom ? 'admin-v2-btn-primary' : 'admin-v2-btn-ghost'}`}
            onClick={() => setShowCustom(v => !v)}
          >
            Custom
          </button>
        </div>

        {showCustom && (
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#8b949e' }}>Before start (min)</label>
              <input type="number" className="admin-v2-input" style={{ width: 90 }}
                     value={preStart} onChange={e => setPreStart(Number(e.target.value))} min={5} max={10080} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#8b949e' }}>Before end (min)</label>
              <input type="number" className="admin-v2-input" style={{ width: 90 }}
                     value={preEnd} onChange={e => setPreEnd(Number(e.target.value))} min={0} max={60} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#8b949e' }}>After start (min)</label>
              <input type="number" className="admin-v2-input" style={{ width: 90 }}
                     value={postStart} onChange={e => setPostStart(Number(e.target.value))} min={0} max={1440} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: '#8b949e' }}>After end (min)</label>
              <input type="number" className="admin-v2-input" style={{ width: 90 }}
                     value={postEnd} onChange={e => setPostEnd(Number(e.target.value))} min={30} max={10080} />
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="admin-v2-alert admin-v2-alert-danger" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {loading && <div className="admin-v2-loading">Analyzing dose events...</div>}

      {results && !loading && (
        <>
          {/* Summary */}
          <div style={{ fontSize: '0.85rem', color: '#8b949e', marginBottom: '1rem' }}>
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
            <div style={{ textAlign: 'center', padding: '2rem', color: '#8b949e' }}>
              Not enough data to analyze. Need at least 3 dose events with matching vital readings in the selected time windows.
            </div>
          ) : (
            Object.entries(grouped).map(([source, metrics]) => (
              <div key={source} style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: SOURCE_COLORS[source] || '#8b949e',
                    display: 'inline-block',
                  }} />
                  <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#e6edf3' }}>
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
    : '#8b949e';

  return (
    <div className="admin-v2-card" style={{ borderTop: `3px solid ${m.significant ? sourceColor : 'transparent'}` }}>
      <div className="admin-v2-card-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
        <div>
          <h3 style={{ fontSize: '0.95rem', margin: 0, color: '#e6edf3' }}>{m.display_name}</h3>
          {m.units && <span style={{ fontSize: '0.75rem', color: '#8b949e' }}>{m.units}</span>}
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
          <span style={{ fontSize: '0.8rem', color: '#8b949e', marginLeft: '0.35rem' }}>
            ({m.pct_change > 0 ? '+' : ''}{m.pct_change}%)
          </span>
        </div>

        {/* Pre → Post */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: '0.5rem 0.75rem',
          fontSize: '0.85rem',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#8b949e', fontSize: '0.7rem', marginBottom: 2 }}>Before</div>
            <div style={{ color: '#e6edf3', fontWeight: 600 }}>{m.pre_mean}</div>
          </div>
          <div style={{ color: '#484f58', fontSize: '1.2rem' }}>→</div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ color: '#8b949e', fontSize: '0.7rem', marginBottom: 2 }}>After</div>
            <div style={{ color: '#e6edf3', fontWeight: 600 }}>{m.post_mean}</div>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.78rem', color: '#8b949e' }}>
          <span>p = {m.p_value < 0.001 ? '<0.001' : m.p_value.toFixed(3)}</span>
          <span>{m.n_events} paired events</span>
        </div>
      </div>
    </div>
  );
}
