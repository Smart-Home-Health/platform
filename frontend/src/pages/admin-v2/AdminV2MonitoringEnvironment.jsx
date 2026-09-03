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
// Monitoring → Environment (GH #49): environmental series over days, with the
// patient's clinical events beneath them, and the observational correlation
// grid under that.
//
// Built on the same stack as the day timeline — one chart per metric sharing a
// time window, event lanes inset by the same gutter (monitoringChart.js), so a
// moment lands on the same x everywhere. That also retires the old two-metric
// cap, which existed only because eight metrics were being squeezed onto one
// chart's two y-axes.
//
// Informational only. The correlation copy comes from the backend and makes no
// causal or care-advice claim, and nothing here should start making one.
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import annotationPlugin from 'chartjs-plugin-annotation';
import zoomPlugin from 'chartjs-plugin-zoom';
import config, { apiFetch } from '../../config';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import { InfoIcon, ClockIcon } from '../../components/Icons';
import {
  PLOT_GUTTER, PLOT_RPAD, niceScale, thresholdLine, stackedChartOptions,
} from './monitoringChart';
import { pivotCards, cellStateOf, stillCollecting } from './envPatterns';
import './monitoring-environment.css';

Chart.register(annotationPlugin, zoomPlugin);

/* Series colours from the vc-derived ramp the reports and the timeline use,
 * so a metric reads as a category rather than a state. `dashed` marks a
 * derived metric — a pressure delta is computed, not measured, and the line
 * style says so without a legend. */
const METRICS = {
  barometric_pressure: { label: 'Pressure', unit: 'hPa', color: '#7f9fd4', signed: false },
  pressure_delta_6h: { label: 'Δ Pressure 6h', unit: 'hPa', color: '#9b8cf0', signed: true, dashed: true },
  pressure_delta_24h: { label: 'Δ Pressure 24h', unit: 'hPa', color: '#d98cc4', signed: true, dashed: true },
  relative_humidity: { label: 'Humidity', unit: '%', color: '#4dc3b3', signed: false },
  temperature: { label: 'Temperature', unit: '°C', color: '#f0a52e', signed: false },
  pm25: { label: 'PM2.5', unit: 'µg/m³', color: '#a8c94a', signed: false },
  aqi: { label: 'AQI', unit: '', color: '#4da7bd', signed: false },
  pollen: { label: 'Pollen', unit: 'grains/m³', color: '#3fbf6a', signed: false },
};
const METRIC_KEYS = Object.keys(METRICS);

/* Clinical events drawn beneath the series. Alerts keep the alert red because
 * that is the role; the rest take the categorical ramp. */
const STREAMS = {
  spo2_alarms: { label: 'SpO2', color: '#f0563c' },
  oxygen_use: { label: 'Oxygen', color: '#f0a52e' },
  respiratory_care: { label: 'Care', color: '#4dc3b3' },
  symptoms: { label: 'Symptoms', color: '#9b8cf0' },
};
const STREAM_KEYS = Object.keys(STREAMS);

const RANGES = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
];

/* The four the strip leads with. Pressure carries its 6h delta as the change
 * line beneath it, which is the reading a carer actually watches. */
const NOW_METRICS = ['barometric_pressure', 'relative_humidity', 'pm25', 'temperature'];

/* Verbatim from the pre-rebuild page. This is a clinical safety statement,
 * not body copy — the second half in particular ("not a basis for care
 * decisions") is the part a shorter version tends to drop. */
const DISCLAIMER = (
  <>
    <strong>Informational only.</strong> This view shows when clinical events and
    environmental conditions happened near each other in time. It cannot show
    that one thing made another happen, and it is not a basis for care
    decisions — follow the care plan for any intervention.
  </>
);

const fmtNum = (v, digits = 1) => (v == null || Number.isNaN(v) ? null : v.toFixed(digits));
const fmtDay = (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmtStamp = (ms) => new Date(ms).toLocaleString('en-US', {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

const AdminV2MonitoringEnvironment = () => {
  const { selectedPatient } = useAdminPatient();

  const [rangeDays, setRangeDays] = useState(30);
  const [catalog, setCatalog] = useState({});
  const [activeMetrics, setActiveMetrics] = useState(['barometric_pressure', 'pressure_delta_6h']);
  const [series, setSeries] = useState({});
  const [events, setEvents] = useState(null);
  const [visibleStreams, setVisibleStreams] = useState(
    Object.fromEntries(STREAM_KEYS.map((k) => [k, true])),
  );
  const [seriesError, setSeriesError] = useState(null);

  const [correlations, setCorrelations] = useState(null);
  const [correlationsLoading, setCorrelationsLoading] = useState(false);
  const [correlationsError, setCorrelationsError] = useState(null);

  const [view, setView] = useState(null);
  const [cursor, setCursor] = useState(null);
  const stackRef = useRef(null);
  const pointers = useRef(new Set());

  const activeStr = activeMetrics.join(',');

  /* ---------------- data ---------------- */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`${config.apiUrl}/api/environment/metrics`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        // The API returns a list; key it so lookups are by metric name.
        const keyed = Object.fromEntries(
          (Array.isArray(body) ? body : []).map((m) => [m.name, m]));
        if (!cancelled) setCatalog(keyed);
      } catch {
        if (!cancelled) setCatalog({});
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Recomputed only on range change: a `Date.now()` that moved every render
  // would restart the window under the reader mid-drag.
  const bounds = useMemo(() => {
    const end = Date.now();
    return { start: end - rangeDays * 24 * 3600 * 1000, end };
  }, [rangeDays]);

  useEffect(() => {
    setView({ min: bounds.start, max: bounds.end });
    setCursor(null);
  }, [bounds.start, bounds.end]);

  useEffect(() => {
    if (!selectedPatient) return undefined;
    let cancelled = false;
    // Debounced: toggling several metrics in a row should fetch once.
    const timer = setTimeout(async () => {
      const from = new Date(bounds.start).toISOString();
      const to = new Date(bounds.end).toISOString();
      setSeriesError(null);
      try {
        const keys = [...new Set([...activeStr.split(',').filter(Boolean), ...NOW_METRICS])];
        const next = {};
        await Promise.all(keys.map(async (key) => {
          const params = new URLSearchParams({
            metric: key, scope: 'outdoor', bucket: '1h', limit: '2500', from, to,
          });
          const res = await apiFetch(
            `${config.apiUrl}/api/environment/observations?${params}`);
          if (!res.ok) throw new Error(`observations HTTP ${res.status}`);
          // Newest-first from the API; charts want ascending.
          next[key] = (await res.json()).slice().reverse()
            .map((r) => ({ x: new Date(r.ts).getTime(), y: r.avg }));
        }));

        const evRes = await apiFetch(`${config.apiUrl}/api/analysis/patients/`
          + `${selectedPatient.id}/clinical-events?${new URLSearchParams({ from, to })}`);
        if (!evRes.ok) throw new Error(`clinical-events HTTP ${evRes.status}`);
        const evBody = await evRes.json();

        if (!cancelled) { setSeries(next); setEvents(evBody); }
      } catch (err) {
        if (!cancelled) setSeriesError(err.message);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [selectedPatient, bounds.start, bounds.end, activeStr]);

  useEffect(() => {
    if (!selectedPatient) return undefined;
    let cancelled = false;
    (async () => {
      setCorrelationsLoading(true);
      setCorrelationsError(null);
      try {
        const params = new URLSearchParams({ days: String(Math.max(rangeDays, 7)) });
        const res = await apiFetch(`${config.apiUrl}/api/analysis/patients/`
          + `${selectedPatient.id}/env-correlations?${params}`);
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
  }, [selectedPatient, rangeDays]);

  /* ---------------- derived ---------------- */

  const shown = activeMetrics.filter((k) => METRICS[k]);

  // The catalog is the source of truth for what a metric is called and what it
  // is measured in; ours are only a fallback for a metric it has not heard of.
  const labelOf = useCallback((key) => catalog[key]?.label || METRICS[key]?.label || key,
    [catalog]);
  const unitOf = useCallback((key) => catalog[key]?.unit ?? METRICS[key]?.unit ?? '',
    [catalog]);
  const isDerived = useCallback((key) => catalog[key]?.derived ?? METRICS[key]?.dashed ?? false,
    [catalog]);

  const latest = useMemo(() => {
    const out = {};
    NOW_METRICS.forEach((key) => {
      const points = series[key] || [];
      out[key] = points.length ? points[points.length - 1] : null;
    });
    const delta = series.pressure_delta_6h || [];
    out.delta6h = delta.length ? delta[delta.length - 1] : null;
    return out;
  }, [series]);

  const laneItems = useMemo(() => {
    const out = {};
    STREAM_KEYS.forEach((key) => {
      out[key] = ((events?.events || {})[key] || [])
        .map((ev, i) => ({
          id: `${key}-${i}`,
          ts: new Date(ev.ts).getTime(),
          label: ev.label || STREAMS[key].label,
        }))
        .filter((it) => Number.isFinite(it.ts));
    });
    return out;
  }, [events]);

  const eventTotal = STREAM_KEYS
    .filter((k) => visibleStreams[k])
    .reduce((n, k) => n + (laneItems[k]?.length || 0), 0);

  const grid = useMemo(() => pivotCards(correlations?.cards), [correlations]);
  const collecting = useMemo(() => stillCollecting(correlations?.cards), [correlations]);

  /* ---------------- interaction ---------------- */

  const tsFromClientX = useCallback((clientX) => {
    const el = stackRef.current;
    if (!el || !view) return null;
    const rect = el.getBoundingClientRect();
    const width = rect.width - PLOT_GUTTER - PLOT_RPAD;
    if (width <= 0) return null;
    const frac = Math.min(1, Math.max(0, (clientX - rect.left - PLOT_GUTTER) / width));
    return Math.round(view.min + frac * (view.max - view.min));
  }, [view]);

  const onPointerDown = (e) => {
    pointers.current.add(e.pointerId);
    if (pointers.current.size > 1) return;
    const ts = tsFromClientX(e.clientX);
    if (ts != null) setCursor(ts);
  };
  const onPointerMove = (e) => {
    if (pointers.current.size !== 1 || !pointers.current.has(e.pointerId)) return;
    if (e.pointerType === 'mouse' && e.buttons === 0) return;
    const ts = tsFromClientX(e.clientX);
    if (ts != null) setCursor(ts);
  };
  const endPointer = (e) => { pointers.current.delete(e.pointerId); };

  const toggleMetric = (key) => {
    setActiveMetrics((prev) => {
      if (!prev.includes(key)) return [...prev, key];
      // Never leave the stack empty — an empty chart card reads as broken.
      if (prev.length === 1) return prev;
      return prev.filter((k) => k !== key);
    });
  };

  const cursorFrac = cursor != null && view && view.max > view.min
    ? (cursor - view.min) / (view.max - view.min) : null;

  /* ---------------- render ---------------- */

  if (!selectedPatient) {
    return <div className="env"><p className="env-empty">Select a patient to see their environment.</p></div>;
  }

  return (
    <div className="env">
      <section className="env-card">
        <div className="env-card-head">
          <h3>Outdoor conditions</h3>
          <span className="env-label">
            {latest.barometric_pressure
              ? `updated ${fmtStamp(latest.barometric_pressure.x)}`
              : 'no readings'}
          </span>
        </div>
        <div className="env-now">
          {NOW_METRICS.map((key) => (
            <NowCell
              key={key}
              metricKey={key}
              point={latest[key]}
              delta={key === 'barometric_pressure' ? latest.delta6h : null}
            />
          ))}
        </div>
      </section>

      {seriesError && <p className="env-error">{seriesError}</p>}

      <div className="env-controls">
        <div className="env-range" role="group" aria-label="Range">
          {RANGES.map((r) => (
            <button
              key={r.label} type="button"
              className={rangeDays === r.days ? 'on' : ''}
              aria-pressed={rangeDays === r.days}
              onClick={() => setRangeDays(r.days)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <select
          className="env-roompick"
          disabled
          title="Room sensors not set up yet"
          aria-label="Scope"
          value="outdoor"
          onChange={() => {}}
        >
          <option value="outdoor">Outdoor</option>
        </select>
        <span className="env-spacer" />
        <span className="env-label">{eventTotal} events</span>
      </div>

      <div className="env-controls">
        {METRIC_KEYS.filter((k) => catalog[k] || series[k]).map((key) => {
          const cfg = METRICS[key];
          const on = activeMetrics.includes(key);
          const empty = on && (series[key] || []).length === 0;
          return (
            <button
              key={key} type="button" className="env-chip"
              style={{ '--sig': cfg.color }}
              aria-pressed={on}
              onClick={() => toggleMetric(key)}
            >
              <span className={`env-chip-dot${isDerived(key) ? ' dashed' : ''}`} />
              {labelOf(key)}
              {empty && <span className="env-chip-note">no data</span>}
            </button>
          );
        })}
      </div>

      <section className="env-card">
        <div className="env-card-head">
          <h3>Series &amp; events</h3>
          <span className="env-label">{fmtDay(bounds.start)} – {fmtDay(bounds.end)}</span>
        </div>
        <div
          className="env-stack"
          ref={stackRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onPointerLeave={endPointer}
        >
          {shown.map((key, i) => (
            <MetricChart
              key={key}
              metricKey={key}
              label={labelOf(key)}
              unit={unitOf(key)}
              derived={isDerived(key)}
              points={series[key] || []}
              view={view}
              bounds={bounds}
              cursor={cursor}
              showAxis={i === shown.length - 1}
              onViewChange={setView}
            />
          ))}

          <div className="env-lanes">
            <div className="env-lanes-title">Clinical events</div>
            {STREAM_KEYS.filter((k) => visibleStreams[k]).map((key) => (
              <EventLane
                key={key} laneKey={key} items={laneItems[key] || []}
                view={view} onPick={setCursor}
              />
            ))}
          </div>

          {cursorFrac != null && cursorFrac >= 0 && cursorFrac <= 1 && (
            <div className="env-plotbox">
              <div className="env-scrub" style={{ left: `${cursorFrac * 100}%` }}>
                <span className="env-scrub-pill">{fmtStamp(cursor)}</span>
              </div>
            </div>
          )}
        </div>
        <div className="env-controls" style={{ padding: '0.5rem 0.9rem 0.7rem' }}>
          {STREAM_KEYS.map((key) => (
            <button
              key={key} type="button" className="env-chip"
              style={{ '--sig': STREAMS[key].color }}
              aria-pressed={visibleStreams[key]}
              onClick={() => setVisibleStreams((p) => ({ ...p, [key]: !p[key] }))}
            >
              <span className="env-chip-dot" />
              {STREAMS[key].label}
              <span className="env-chip-note">{laneItems[key]?.length ?? 0}</span>
            </button>
          ))}
        </div>
      </section>

      <p className="env-hint">Drag to inspect · pinch or scroll to zoom</p>

      <section className="env-card">
        <div className="env-card-head">
          <h3>Personal patterns</h3>
          <span className="env-label">{rangeDays}-day observational analysis</span>
        </div>

        {correlationsError && <p className="env-note">{correlationsError}</p>}
        {correlationsLoading && !correlations && <p className="env-empty">Running the analysis…</p>}

        {correlations && grid.rows.length === 0 && (
          <p className="env-empty">No trigger and outcome pairs to analyse yet.</p>
        )}

        {grid.rows.length > 0 && (
          <div className="env-grid-wrap">
            <table className="env-grid">
              <thead>
                <tr>
                  <th>Trigger</th>
                  {grid.outcomes.map((o) => <th key={o.key}>{o.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {grid.rows.map((row) => (
                  <tr key={row.key}>
                    <td className="env-grid-trigger">
                      <b>{row.label}</b>
                      {row.estimated && <span>estimated metric</span>}
                    </td>
                    {grid.outcomes.map((o) => (
                      <PatternCell key={o.key} label={o.label} card={row.cells[o.key]} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {collecting > 0 && (
          <div className="env-foot">
            <ClockIcon size={14} />
            {collecting} {collecting === 1 ? 'analysis is' : 'analyses are'} still collecting data.
          </div>
        )}
        <div className="env-foot">
          <InfoIcon size={14} />
          <span>{DISCLAIMER}</span>
        </div>
      </section>
    </div>
  );
};

/* One current reading. Tone comes from the reading itself only where a public
 * band exists for it; otherwise the value is shown plainly rather than
 * coloured against a threshold nobody set. */
const NowCell = ({ metricKey, point, delta }) => {
  const cfg = METRICS[metricKey];
  const value = point ? fmtNum(point.y, metricKey === 'pm25' ? 0 : 1) : null;

  let tone = '';
  let band = null;
  if (metricKey === 'pm25' && point?.y != null) {
    // US AQI breakpoints for PM2.5 — a published scale, not a patient bound.
    // Per-patient thresholds live on the room metrics, which this outdoor
    // strip is not showing.
    if (point.y > 35) { tone = 'env-tone-critical'; band = 'unhealthy'; }
    else if (point.y > 12) { tone = 'env-tone-caution'; band = 'moderate'; }
    else { tone = 'env-tone-ok'; band = 'good'; }
  }

  return (
    <div className={`env-now-cell ${tone}`}>
      <span className="env-now-name">{cfg.label}</span>
      <span className="env-now-value">
        {value ?? '—'}
        {value != null && cfg.unit && <small>{cfg.unit}</small>}
      </span>
      {band && <span className="env-now-sub">{band}</span>}
      {delta?.y != null && (
        <span className={`env-now-sub ${delta.y < 0 ? 'falling' : 'rising'}`}>
          {delta.y > 0 ? '+' : ''}{fmtNum(delta.y, 1)} / 6h
        </span>
      )}
      {!point && <span className="env-now-sub">no readings</span>}
    </div>
  );
};

/* One metric, one scale, sharing the stack's window. */
const MetricChart = ({
  metricKey, label, unit, derived, points, view, bounds, cursor, showAxis, onViewChange,
}) => {
  const cfg = METRICS[metricKey];
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;

  // Fixed for the whole range rather than refitted per window, so panning
  // moves across a stable scale instead of rescaling under the reader.
  const yRange = useMemo(() => {
    if (!points.length) return niceScale(0, 1, 1, null, { clampMin: !cfg.signed });
    const ys = points.map((p) => p.y).filter((y) => y != null);
    if (!ys.length) return niceScale(0, 1, 1, null, { clampMin: !cfg.signed });
    return niceScale(Math.min(...ys), Math.max(...ys), 1, null, { clampMin: !cfg.signed });
  }, [points, cfg.signed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const annotations = {};
    // A delta metric's zero is the line that matters — above it pressure is
    // rising, below it falling — so it is drawn rather than left to the grid.
    if (cfg.signed) annotations.zero = thresholdLine(0, 'NO CHANGE');

    const chart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        datasets: [{
          label,
          data: points,
          parsing: false,
          borderColor: cfg.color,
          borderWidth: 1.4,
          borderDash: derived ? [5, 4] : [],
          pointRadius: 0,
          pointHitRadius: 0,
          tension: 0.15,
          spanGaps: false,
        }],
      },
      options: stackedChartOptions({
        view,
        bounds,
        yRange,
        showAxis,
        annotations,
        timeFormats: { hour: 'ha', day: 'MMM d' },
        minRangeMs: 6 * 3600 * 1000,
        onViewChange: (next) => onViewChangeRef.current(next),
      }),
    });
    chartRef.current = chart;
    return () => { chart.destroy(); chartRef.current = null; };
    // View is applied imperatively below so a zoom does not rebuild the chart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, bounds, showAxis, cfg, yRange, label, derived]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !view) return;
    if (chart.scales.x.min === view.min && chart.scales.x.max === view.max) return;
    chart.zoomScale('x', { min: view.min, max: view.max }, 'none');
  }, [view]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const anns = chart.options.plugins.annotation.annotations;
    delete anns.cursor;
    if (cursor != null && points.length) {
      let best = null;
      let gap = Infinity;
      points.forEach((p) => {
        const d = Math.abs(p.x - cursor);
        if (d < gap) { gap = d; best = p; }
      });
      // An hour either side; beyond that the dot would sit on nothing.
      if (best && best.y != null && gap <= 3600 * 1000) {
        anns.cursor = {
          type: 'point', xValue: best.x, yValue: best.y,
          radius: 3.5, backgroundColor: cfg.color,
          borderColor: 'rgba(255,255,255,0.15)', borderWidth: 1,
        };
      }
    }
    chart.update('none');
  }, [cursor, points, cfg]);

  return (
    <div className={`env-chart${showAxis ? ' tall' : ''}`}>
      <span className="env-chart-title" style={{ color: cfg.color }}>
        {label}
        {unit && <small>{unit}</small>}
      </span>
      <canvas ref={canvasRef} aria-label={`${label} over time`} />
    </div>
  );
};

const EventLane = ({ laneKey, items, view, onPick }) => {
  const lane = STREAMS[laneKey];
  const span = view ? view.max - view.min : 0;
  const inWindow = span > 0
    ? items.filter((it) => it.ts >= view.min && it.ts <= view.max) : [];

  return (
    <div className="env-lane" style={{ '--lane': lane.color }}>
      <span className="env-lane-name">{lane.label}</span>
      <div className="env-lane-track">
        {inWindow.length === 0 && <span className="env-lane-empty">—</span>}
        {inWindow.map((it) => (
          <button
            key={it.id} type="button" className="env-lane-mark"
            style={{ left: `${((it.ts - view.min) / span) * 100}%` }}
            title={`${fmtStamp(it.ts)} — ${it.label}`}
            aria-label={`${fmtStamp(it.ts)} ${it.label}`}
            onClick={() => onPick(it.ts)}
          />
        ))}
      </div>
    </div>
  );
};

/* One trigger against one outcome. A cell either has a ratio, is still
 * gathering, or was never analysed — and those read differently on purpose. */
/* `data-label` carries the column name onto the cell itself. On a phone the
 * grid reflows into one card per trigger, where the header row is gone and the
 * cell has to say which outcome it is. */
const PatternCell = ({ card, label }) => {
  const state = cellStateOf(card);

  if (state.kind === 'absent') {
    return (
      <td className="env-cell" data-label={label}>
        <span className="env-cell-none">—</span>
      </td>
    );
  }

  if (state.kind === 'collecting') {
    const p = state.progress;
    return (
      <td className="env-cell" data-label={label}>
        <div className="env-collecting" title={state.message}>
          <span>
            {p ? `Collecting ${p.have}/${p.need}${p.unit}` : 'Not started'}
          </span>
          <span className="env-bar">
            <i style={{ width: `${p ? Math.min(100, (p.have / p.need) * 100) : 0}%` }} />
          </span>
          <span className="sr-only">{state.message}</span>
        </div>
      </td>
    );
  }

  const counted = card.outcome?.matched_sources;
  const detail = [
    `95% CI ${state.ciLow.toFixed(1)}–${state.ciHigh.toFixed(1)}`,
    `${card.exposed_events} in ${card.exposed_hours}h exposed`,
    `${card.baseline_events} in ${card.baseline_hours}h baseline`,
    counted?.length ? `counted: ${counted.join(', ')}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <td className={`env-cell ${state.kind === 'pattern' ? 'pattern' : ''}`}
        data-label={label} title={detail}>
      <span className="env-cell-ratio">{state.ratio.toFixed(1)}×</span>
      <span className="env-cell-verdict">
        {state.kind === 'pattern' ? 'Pattern observed' : 'No clear difference'}
      </span>
      <span className="sr-only">{detail}. {card.message}</span>
    </td>
  );
};

export default AdminV2MonitoringEnvironment;
