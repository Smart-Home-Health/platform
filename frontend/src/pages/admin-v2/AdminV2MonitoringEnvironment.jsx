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
// Monitoring → Environment (GH #49): multi-day environmental series with
// clinical event markers, plus on-demand personal correlation cards.
// Informational only — copy comes from the backend and makes no causal or
// care-advice claims.
import React, { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import annotationPlugin from 'chartjs-plugin-annotation';
import zoomPlugin from 'chartjs-plugin-zoom';
import config, { apiFetch } from '../../config';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import { useChartColors } from '../../hooks/useChartColors';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { InfoIcon } from '../../components/Icons';

Chart.register(annotationPlugin, zoomPlugin);

// Curated metrics shown as chips (subset of /api/environment/metrics; the
// catalog's `derived` flag drives dashed styling — bucketed rows carry no
// quality field). Max two active, one per y-axis.
const DISPLAY_METRICS = [
  'barometric_pressure', 'pressure_delta_6h', 'pressure_delta_24h',
  'relative_humidity', 'temperature', 'pm25', 'aqi', 'pollen',
];
const METRIC_COLORS = {
  barometric_pressure: '#8d6e63',
  pressure_delta_6h: '#a1887f',
  pressure_delta_24h: '#795548',
  relative_humidity: '#26a69a',
  temperature: '#ef6c00',
  pm25: '#7e57c2',
  aqi: '#5c6bc0',
  pollen: '#9ccc65',
};
const MAX_ACTIVE_METRICS = 2;
// Metrics that legitimately go negative (never clamp their axis to 0)
const SIGNED_METRICS = new Set(['pressure_delta_6h', 'pressure_delta_24h']);

const EVENT_STREAMS = {
  spo2_alarms: { color: '#F44336', style: 'box' },
  oxygen_use: { color: '#FF9800', style: 'box' },
  respiratory_care: { color: '#4CAF50', style: 'line' },
  symptoms: { color: '#9C27B0', style: 'line' },
};

const RANGE_PRESETS = [7, 30, 60, 90];
const WINDOW_PRESETS = [3, 6, 12, 24];
const MAX_LABELED_ANNOTATIONS = 300;

const DISCLAIMER = (
  <>
    <strong>Informational only.</strong> This view shows when clinical events and
    environmental conditions happened near each other in time. It cannot show
    that one thing made another happen, and it is not a basis for care
    decisions — follow the care plan for any intervention.
  </>
);

const AdminV2MonitoringEnvironment = () => {
  const chartColors = useChartColors();
  const { selectedPatient } = useAdminPatient();

  const [rangeDays, setRangeDays] = useState(30);
  const [metricsCatalog, setMetricsCatalog] = useState({});
  const [activeMetrics, setActiveMetrics] = useState(['barometric_pressure', 'pressure_delta_6h']);
  const [envSeries, setEnvSeries] = useState({});
  const [clinicalEvents, setClinicalEvents] = useState(null);
  const [visibleStreams, setVisibleStreams] = useState({
    spo2_alarms: true, oxygen_use: true, respiratory_care: true, symptoms: true,
  });
  const [seriesError, setSeriesError] = useState(null);

  const [correlationWindow, setCorrelationWindow] = useState(null); // null = per-pair defaults
  const [correlations, setCorrelations] = useState(null);
  const [correlationsLoading, setCorrelationsLoading] = useState(false);
  const [correlationsError, setCorrelationsError] = useState(null);

  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  // Catalog + locations once
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch(`${config.apiUrl}/api/environment/metrics`);
        if (res.ok) {
          const list = await res.json();
          setMetricsCatalog(Object.fromEntries(list.map((m) => [m.name, m])));
        }
      } catch (err) {
        console.error('Environment catalog fetch failed:', err);
      }
    })();
  }, []);

  // Env series + clinical events for the selected range (debounced)
  const activeMetricsStr = activeMetrics.join(',');
  useEffect(() => {
    if (!selectedPatient) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const to = new Date();
      const from = new Date(to.getTime() - rangeDays * 24 * 3600 * 1000);
      setSeriesError(null);
      try {
        const keys = activeMetricsStr ? activeMetricsStr.split(',') : [];
        const series = {};
        await Promise.all(keys.map(async (key) => {
          const params = new URLSearchParams({
            metric: key, scope: 'outdoor', bucket: '1h', limit: '2500',
            from: from.toISOString(), to: to.toISOString(),
          });
          const res = await apiFetch(`${config.apiUrl}/api/environment/observations?${params}`);
          if (!res.ok) throw new Error(`observations HTTP ${res.status}`);
          series[key] = (await res.json()).reverse();
        }));

        const evParams = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
        const evRes = await apiFetch(
          `${config.apiUrl}/api/analysis/patients/${selectedPatient.id}/clinical-events?${evParams}`);
        if (!evRes.ok) throw new Error(`clinical-events HTTP ${evRes.status}`);
        const events = await evRes.json();

        if (!cancelled) {
          setEnvSeries(series);
          setClinicalEvents(events);
        }
      } catch (err) {
        console.error('Environment range fetch failed:', err);
        if (!cancelled) setSeriesError(err.message);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [selectedPatient, rangeDays, activeMetricsStr]);

  // Correlations (independent of the chart controls except range)
  useEffect(() => {
    if (!selectedPatient) return undefined;
    let cancelled = false;
    (async () => {
      setCorrelationsLoading(true);
      setCorrelationsError(null);
      try {
        const params = new URLSearchParams({ days: String(Math.max(rangeDays, 7)) });
        if (correlationWindow) params.set('window_hours', String(correlationWindow));
        const res = await apiFetch(
          `${config.apiUrl}/api/analysis/patients/${selectedPatient.id}/env-correlations?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        if (!cancelled) setCorrelations(body);
      } catch (err) {
        if (!cancelled) setCorrelationsError(err.message);
      } finally {
        if (!cancelled) setCorrelationsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedPatient, rangeDays, correlationWindow]);

  const toggleMetric = (key) => {
    setActiveMetrics((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length < MAX_ACTIVE_METRICS) return [...prev, key];
      return [...prev.slice(1), key];
    });
  };

  const toggleStream = (key) => {
    setVisibleStreams((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Build chart
  useEffect(() => {
    if (!chartRef.current) return undefined;
    if (chartInstance.current) {
      chartInstance.current.destroy();
      chartInstance.current = null;
    }

    const datasets = [];
    const scales = {};
    activeMetrics.forEach((key, i) => {
      const rows = envSeries[key] || [];
      const color = METRIC_COLORS[key] || '#888';
      const dashed = Boolean(metricsCatalog[key]?.derived);
      const unit = metricsCatalog[key]?.unit || '';
      const label = metricsCatalog[key]?.label || key;
      const axisId = `y_${key}`;

      const avg = rows.map((r) => ({ x: new Date(r.ts), y: r.avg }));
      const lows = rows.map((r) => ({ x: new Date(r.ts), y: r.min }));
      const highs = rows.map((r) => ({ x: new Date(r.ts), y: r.max }));

      // min/max band: invisible floor line + filled ceiling referencing it
      datasets.push({
        label: `${label} (min)`, data: lows, borderWidth: 0, pointRadius: 0,
        fill: false, yAxisID: axisId, spanGaps: true, hidden: false,
      });
      datasets.push({
        label: `${label} (max)`, data: highs, borderWidth: 0, pointRadius: 0,
        fill: '-1', backgroundColor: `${color}22`, yAxisID: axisId, spanGaps: true,
      });
      datasets.push({
        label: `${label}${unit ? ` (${unit})` : ''}`,
        data: avg,
        borderColor: color,
        backgroundColor: `${color}22`,
        borderWidth: 1.5,
        borderDash: dashed ? [6, 4] : [],
        pointRadius: 0,
        pointHitRadius: 5,
        fill: false,
        spanGaps: true,
        yAxisID: axisId,
        tension: 0.2,
      });

      const values = avg.map((p) => p.y).filter((v) => v != null);
      const lo = values.length ? Math.min(...values) : 0;
      const hi = values.length ? Math.max(...values) : 1;
      const pad = Math.max((hi - lo) * 0.08, 0.5);
      scales[axisId] = {
        type: 'linear',
        position: i === 0 ? 'left' : 'right',
        min: SIGNED_METRICS.has(key) ? lo - pad : Math.max(0, lo - pad),
        max: hi + pad,
        title: { display: true, text: `${label}${unit ? ` (${unit})` : ''}`, color, font: { size: 12 } },
        ticks: { color },
        grid: i === 0 ? { color: chartColors.grid } : { drawOnChartArea: false },
      };
    });

    // Clinical event annotations
    const annotations = {};
    let annotationCount = 0;
    if (clinicalEvents?.events) {
      Object.entries(clinicalEvents.events).forEach(([stream, events]) => {
        annotationCount += visibleStreams[stream] ? events.length : 0;
      });
      const showLabels = annotationCount <= MAX_LABELED_ANNOTATIONS;
      Object.entries(clinicalEvents.events).forEach(([stream, events]) => {
        if (!visibleStreams[stream]) return;
        const cfg = EVENT_STREAMS[stream];
        events.forEach((ev, i) => {
          const start = new Date(ev.ts);
          if (cfg.style === 'box') {
            const end = ev.end_ts ? new Date(ev.end_ts) : new Date(start.getTime() + 30 * 60000);
            annotations[`${stream}_${i}`] = {
              type: 'box', xMin: start, xMax: end,
              backgroundColor: `${cfg.color}26`, borderColor: `${cfg.color}66`, borderWidth: 1,
            };
          } else {
            annotations[`${stream}_${i}`] = {
              type: 'line', xMin: start, xMax: start,
              borderColor: cfg.color, borderWidth: 1.5,
              label: showLabels ? {
                display: true, content: ev.label?.slice(0, 24) || stream,
                position: 'start', backgroundColor: cfg.color, color: '#fff',
                font: { size: 9 }, padding: 2, rotation: -90, yAdjust: -8,
              } : undefined,
            };
          }
        });
      });
    }

    const ctx = chartRef.current.getContext('2d');
    chartInstance.current = new Chart(ctx, {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            type: 'time',
            time: { displayFormats: { hour: 'MMM d ha', day: 'MMM d' }, tooltipFormat: 'MMM d, h:mm a' },
            grid: { color: chartColors.grid },
            ticks: { maxRotation: 0, font: { size: 11 }, color: chartColors.axis, autoSkip: true, maxTicksLimit: 14 },
          },
          ...scales,
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              usePointStyle: true, padding: 15, font: { size: 12 }, color: chartColors.foreground,
              // Hide the band helper datasets from the legend
              filter: (item) => !/\((min|max)\)$/.test(item.text),
            },
          },
          annotation: { annotations },
          zoom: {
            pan: { enabled: true, mode: 'x' },
            zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' },
          },
        },
      },
    });

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
    };
  }, [envSeries, clinicalEvents, activeMetrics, visibleStreams, metricsCatalog,
      chartColors.grid, chartColors.axis, chartColors.foreground]);

  if (!selectedPatient) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>
        Select a patient from the sidebar to view environmental data.
      </div>
    );
  }

  return (
    <div>
      {/* Guardrail banner */}
      <div className="tw" style={{ marginBottom: '1rem' }}>
        <Alert variant="info">
          <span style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ flexShrink: 0, marginTop: 2 }} aria-hidden><InfoIcon size={16} /></span>
            <span>{DISCLAIMER}</span>
          </span>
        </Alert>
      </div>

      {/* Controls */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: '1rem',
        padding: '0.75rem 1rem', background: 'var(--card)', borderRadius: 8,
        border: '1px solid var(--border)', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {DISPLAY_METRICS.filter((k) => metricsCatalog[k]).map((key) => {
            const active = activeMetrics.includes(key);
            const color = METRIC_COLORS[key];
            const dashed = Boolean(metricsCatalog[key]?.derived);
            return (
              <button
                key={key}
                onClick={() => toggleMetric(key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 600,
                  border: `2px ${dashed ? 'dashed' : 'solid'} ${color}`,
                  background: active ? color : 'transparent',
                  color: active ? '#fff' : color,
                  cursor: 'pointer', transition: 'all 0.15s',
                  opacity: active ? 1 : 0.6,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: active ? '#fff' : color, display: 'inline-block' }} />
                {metricsCatalog[key]?.label || key}
              </button>
            );
          })}

          <span style={{ width: 1, height: 20, background: 'var(--border)', display: 'inline-block' }} />

          {clinicalEvents && Object.keys(EVENT_STREAMS).map((stream) => {
            const cfg = EVENT_STREAMS[stream];
            const active = visibleStreams[stream];
            const count = clinicalEvents.events?.[stream]?.length ?? 0;
            return (
              <button
                key={stream}
                onClick={() => toggleStream(stream)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 600,
                  border: `2px solid ${cfg.color}`,
                  background: active ? cfg.color : 'transparent',
                  color: active ? '#fff' : cfg.color,
                  cursor: 'pointer', transition: 'all 0.15s',
                  opacity: active ? 1 : 0.6,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: active ? '#fff' : cfg.color, display: 'inline-block' }} />
                {clinicalEvents.labels?.[stream] || stream} ({count})
              </button>
            );
          })}
        </div>

        <div className="tw" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {/* Location placeholder: room selection ships with room-level
              ingestion (GH #48); until then everything is outdoor scope. */}
          <select
            disabled
            title="Room sensors not set up yet"
            style={{
              padding: '5px 8px', borderRadius: 6, fontSize: 12,
              background: 'var(--secondary)', color: 'var(--muted-foreground)',
              border: '1px solid var(--border)',
            }}
          >
            <option>Outdoor (home)</option>
          </select>
          <span style={{ fontSize: 11, color: 'var(--muted-foreground)', margin: '0 4px' }}>Range:</span>
          {RANGE_PRESETS.map((d) => (
            <Button key={d} size="sm" variant={rangeDays === d ? 'default' : 'secondary'}
                    onClick={() => setRangeDays(d)}>
              {d}d
            </Button>
          ))}
        </div>
      </div>

      {seriesError && (
        <div className="tw" style={{ marginBottom: '1rem' }}>
          <Alert variant="destructive">Failed to load environment data: {seriesError}</Alert>
        </div>
      )}

      {/* Chart */}
      <div style={{
        border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card)',
        padding: '12px 8px', height: 420, position: 'relative', marginBottom: '1.5rem',
      }}>
        <canvas ref={chartRef} />
      </div>

      {/* Correlation cards */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: '0.75rem' }}>
        <h3 style={{ margin: 0, color: 'var(--foreground)', fontSize: '1.05rem' }}>
          Personal patterns
          <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginLeft: 8, fontWeight: 400 }}>
            informational — last {correlations?.range?.days ?? rangeDays} days
          </span>
        </h3>
        <div className="tw" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--muted-foreground)', marginRight: 4 }}>Window:</span>
          {WINDOW_PRESETS.map((w) => (
            <Button key={w} size="sm" variant={correlationWindow === w ? 'default' : 'secondary'}
                    onClick={() => setCorrelationWindow(correlationWindow === w ? null : w)}>
              {w}h
            </Button>
          ))}
        </div>
      </div>

      {correlationsLoading ? (
        <div className="admin-v2-loading">Analyzing environmental patterns...</div>
      ) : correlationsError ? (
        <div className="tw"><Alert variant="destructive">Analysis failed: {correlationsError}</Alert></div>
      ) : correlations ? (
        <div className="admin-v2-cards-grid">
          {correlations.cards.map((card) => (
            <EnvCorrelationCard key={`${card.exposure.key}_${card.outcome.key}`} card={card} />
          ))}
        </div>
      ) : null}
    </div>
  );
};

// One (exposure, outcome) correlation card. All statistical wording comes
// verbatim from the backend (guardrailed there); this component only lays it
// out and never adds causal or advisory phrasing.
const EnvCorrelationCard = ({ card }) => {
  const ok = card.status === 'ok';
  const distinct = ok && (card.ci_low > 1 || card.ci_high < 1);
  const exposureColor = METRIC_COLORS[card.exposure.metric] || '#8d6e63';
  const badge = ok
    ? (distinct ? 'Pattern observed' : 'No clear difference')
    : 'Not enough data yet';

  return (
    <div className="admin-v2-card"
         style={{ borderTop: `3px solid ${distinct ? exposureColor : 'transparent'}` }}>
      <div className="admin-v2-card-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
        <div>
          <h3 style={{ fontSize: '0.9rem', margin: 0, color: 'var(--foreground)' }}>
            {card.outcome.label}
          </h3>
          <span style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)' }}>
            near {card.exposure.label}
            {card.exposure.quality === 'estimated' && ' (estimated)'}
          </span>
        </div>
        <span className={`admin-v2-badge ${distinct ? 'admin-v2-badge-success' : 'admin-v2-badge-muted'}`}
              style={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
          {badge}
        </span>
      </div>
      <div className="admin-v2-card-body" style={{ paddingTop: '0.5rem' }}>
        {ok ? (
          <>
            <div style={{ textAlign: 'center', padding: '0.6rem 0' }}>
              <span style={{
                fontSize: '1.6rem', fontWeight: 700,
                color: distinct ? exposureColor : 'var(--muted-foreground)',
              }}>
                {card.rate_ratio.toFixed(1)}×
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginLeft: 6 }}>
                95% CI {card.ci_low.toFixed(1)}–{card.ci_high.toFixed(1)}
              </span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--foreground)', margin: '0 0 0.5rem' }}>
              {card.message}
            </p>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              background: 'var(--secondary)', borderRadius: 6, padding: '0.45rem 0.75rem',
              fontSize: '0.75rem', color: 'var(--muted-foreground)',
            }}>
              <span>{card.exposed_events} events in {card.exposed_hours}h exposed</span>
              <span>{card.baseline_events} in {card.baseline_hours}h baseline</span>
            </div>
            {card.outcome.matched_sources?.length > 0 && (
              <div style={{ fontSize: '0.7rem', color: 'var(--muted-foreground)', marginTop: '0.4rem' }}>
                Counted tasks: {card.outcome.matched_sources.join(', ')}
              </div>
            )}
          </>
        ) : (
          <p style={{
            fontSize: '0.8rem', color: 'var(--muted-foreground)',
            textAlign: 'center', padding: '1rem 0.25rem', margin: 0,
          }}>
            {card.message}
          </p>
        )}
      </div>
    </div>
  );
};

export default AdminV2MonitoringEnvironment;
