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
// Recorded vitals at the panel's two sizes.
//
// Narrow answers "what is the latest of each?" — one card per vital, newest
// value and how long ago. Wide answers "how has one of them moved?" — metric
// and range tabs over a chart and the readings behind it.
//
// Tapping a narrow card expands to that metric, the same move the medication
// panel makes. Sizing comes from useModalDock(), never window.innerWidth.
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import config, { apiFetch } from '../../config';
import { useModalDock } from '../../contexts/ModalDockContext';
import { CHART_CHROME } from '../../contexts/DashboardThemeContext';
import { niceYDomain } from '../../utils/chartAxis';
import {
  HeartIcon, FlameIcon, MinimalistVentIcon, BodyIcon, PulseOxIcon,
  VitalsIcon, DropletIcon, ChevronRightIcon,
} from '../Icons';
import {
  METRICS, RANGES, metricFor, orderTypes, latestByType, formatReading,
  relativeAge, since, toSeries,
} from './vitalMetrics';
import './history-panel.css';

const ICONS = {
  heart: HeartIcon, flame: FlameIcon, vent: MinimalistVentIcon, body: BodyIcon,
  oximeter: PulseOxIcon, vitals: VitalsIcon, droplet: DropletIcon,
};
const Glyph = ({ name, size = 18 }) => {
  const C = ICONS[name] || VitalsIcon;
  return <C size={size} />;
};

const TONE_COLOR = {
  live: '#4da7bd',
  complete: '#3fbf6a',
  idle: '#9aa8b8',
  due: '#f0a52e',
};

const stampOf = (r) => new Date(r.timestamp || r.datetime).getTime();

const when = (ts) =>
  new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });

const axisTime = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const VitalsHistoryPanel = ({ patientId }) => {
  const { expanded, setExpanded } = useModalDock();
  const [types, setTypes] = useState([]);
  const [selected, setSelected] = useState(null);
  const [range, setRange] = useState('30d');
  const [latest, setLatest] = useState(new Map());
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const get = useCallback(
    (path) => apiFetch(`${config.apiUrl}${path}`, { credentials: 'include' }),
    []
  );

  useEffect(() => {
    if (patientId == null) return;
    let live = true;
    get('/api/vitals/types')
      .then(r => (r.ok ? r.json() : []))
      .then(list => { if (live) setTypes(orderTypes(Array.isArray(list) ? list : [])); })
      .catch(() => { if (live) setTypes([]); });
    return () => { live = false; };
  }, [patientId, get]);

  // The latest of every vital, asked for per type rather than by taking the
  // head of one big list. The endpoint applies `limit` to raw rows *before*
  // folding blood pressure's three into one reading, so a single capped
  // request drops the rarer vitals entirely — a patient with 69 blood
  // pressures showed "No data" for a glucose reading that exists.
  useEffect(() => {
    if (patientId == null || !types.length) return;
    let live = true;
    Promise.all(types.map(type =>
      get(`/api/vitals/patient/${patientId}?vital_type=${encodeURIComponent(type)}&limit=6`)
        .then(r => (r.ok ? r.json() : []))
        .then(rows => (Array.isArray(rows) ? rows : []))
        .catch(() => [])
    ))
      .then(lists => { if (live) setLatest(latestByType(lists.flat())); })
      .catch(() => {});
    return () => { live = false; };
  }, [patientId, types, get]);

  useEffect(() => {
    if (!types.length) return;
    setSelected(s => (s && types.includes(s) ? s : types[0]));
  }, [types]);

  const metric = useMemo(() => (selected ? metricFor(selected) : null), [selected]);
  const days = RANGES.find(r => r.key === range)?.days ?? 30;

  // Only the wide view charts a metric, so the narrow stop does not pay for it.
  useEffect(() => {
    if (!expanded || !selected || patientId == null) return;
    let live = true;
    setLoading(true);
    setError(null);
    get(`/api/vitals/patient/${patientId}?vital_type=${encodeURIComponent(selected)}&start_date=${since(days)}&limit=500`)
      .then(r => { if (!r.ok) throw new Error('failed'); return r.json(); })
      .then(rows => { if (live) setRecords(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (live) { setRecords([]); setError('Failed to load readings'); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [expanded, selected, patientId, days, get]);

  const series = useMemo(() => toSeries(records, metric), [records, metric]);

  // A domain from the readings themselves, rounded outward to a nice step.
  //
  // No target band is drawn with it. `/api/vitals/ranges` looks like the place
  // to get one, but its `expected_min/max` are data-entry plausibility bounds
  // — systolic reads 70-200 — not clinical targets. Drawing them as targets
  // would put a "normal" band around a reading that is anything but.
  // Recharts' default anchors at zero, which for a single blood pressure over
  // 30 days squeezed all three values into the top third of the plot.
  const yDomain = useMemo(() => {
    const keys = metric?.fields ? metric.fields.map(f => f.key) : ['value'];
    const values = series.flatMap(p => keys.map(k => p[k])).filter(v => v != null);
    return niceYDomain(values);
  }, [series, metric]);

  const openMetric = (type) => {
    setSelected(type);
    if (setExpanded) setExpanded(true);
  };

  /* ---- narrow ---- */

  if (!expanded) {
    const unknown = types.filter(t => metricFor(t).unrecognised);
    return (
      <div className="vh-panel">
        {types.length === 0 ? (
          <div className="vh-empty">No recorded vitals</div>
        ) : (
          <div className="vh-latest">
            {types.map(type => {
              const m = metricFor(type);
              const rec = latest.get(type);
              const value = formatReading(rec, m);
              return (
                <button
                  type="button"
                  key={type}
                  className={`vh-card${value == null ? ' empty' : ''}`}
                  onClick={() => openMetric(type)}
                >
                  <span className="vh-card-icon" aria-hidden="true"><Glyph name={m.icon} /></span>
                  <span className="vh-card-label">
                    {m.label}
                    {m.unrecognised && <span className="vh-card-flag">Unknown</span>}
                  </span>
                  <span className="vh-card-go" aria-hidden="true"><ChevronRightIcon size={16} /></span>
                  {value == null ? (
                    <span className="vh-card-value none">No data</span>
                  ) : (
                    <span className="vh-card-value">{value}<span className="vh-card-unit">{m.unit}</span></span>
                  )}
                  <span className="vh-card-when">
                    {rec ? `${relativeAge(stampOf(rec))} · ${when(stampOf(rec))}` : 'Nothing recorded'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {unknown.length > 0 && (
          <div className="vh-warn">
            {unknown.length === 1 ? 'One vital type is' : `${unknown.length} vital types are`} not a
            recognised measurement ({unknown.join(', ')}). Shown so nothing is hidden, but these look
            like malformed entries rather than readings.
          </div>
        )}
      </div>
    );
  }

  /* ---- wide ---- */

  const rows = [...records].sort((a, b) => stampOf(b) - stampOf(a));
  const chartLines = metric?.fields
    ? metric.fields.map(f => ({ key: f.key, label: f.label, tone: f.tone }))
    : [{ key: 'value', label: metric?.label || '', tone: 'live' }];

  return (
    <div className="vh-panel wide">
      <div className="vh-tabs">
        {types.map(type => {
          const m = metricFor(type);
          return (
            <button type="button" key={type} className="vh-tab" data-active={type === selected}
              onClick={() => setSelected(type)}>
              <Glyph name={m.icon} size={14} />
              {m.short}
            </button>
          );
        })}
      </div>

      <div className="vh-bar">
        <div className="vh-ranges">
          {RANGES.map(r => (
            <button type="button" key={r.key} className="vh-range" data-active={r.key === range}
              onClick={() => setRange(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="vh-legend">
          {chartLines.map(l => (
            <span className={`vh-legend-item vh-tone-${l.tone}`} key={l.key}>
              <span className="vh-legend-dot" />{l.label}
            </span>
          ))}
        </div>
      </div>

      <div className="vh-block">
        <div className="vh-block-head">
          <h4 className="vh-block-title">{metric?.label}</h4>
          {metric?.unit && <span className="vh-block-unit">{metric.unit}</span>}
        </div>
        {loading ? (
          <div className="vh-note">Loading readings…</div>
        ) : error ? (
          <div className="vh-note">{error}</div>
        ) : series.length === 0 ? (
          <div className="vh-empty">Nothing recorded in the last {days} day{days === 1 ? '' : 's'}</div>
        ) : (
          <div className="vh-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 12, bottom: 0, left: -14 }}>
                <CartesianGrid stroke={CHART_CHROME.grid} vertical={false} />
                <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} scale="time"
                  tickFormatter={axisTime} stroke={CHART_CHROME.axis}
                  tick={{ fill: CHART_CHROME.textDim, fontSize: 10 }} tickLine={false} minTickGap={40} />
                <YAxis domain={yDomain} stroke={CHART_CHROME.axis}
                  tick={{ fill: CHART_CHROME.textDim, fontSize: 10 }} tickLine={false} width={44} />
                <Tooltip
                  labelFormatter={when}
                  contentStyle={{
                    background: CHART_CHROME.tooltipBg,
                    border: `1px solid ${CHART_CHROME.tooltipBorder}`,
                    borderRadius: 8,
                    fontFamily: 'var(--vc-font-mono)',
                    fontSize: 11,
                  }}
                  labelStyle={{ color: CHART_CHROME.textMuted }}
                  itemStyle={{ color: CHART_CHROME.tooltipText }}
                />
                {chartLines.map(l => (
                  <Line key={l.key} type="monotone" dataKey={l.key} name={l.label}
                    stroke={TONE_COLOR[l.tone]} strokeWidth={1.6}
                    dot={{ r: 2.5, fill: TONE_COLOR[l.tone], strokeWidth: 0 }}
                    connectNulls isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="vh-block">
        <h4 className="vh-block-title">Recent {metric?.label?.toLowerCase()} readings</h4>
        {rows.length === 0 ? (
          <div className="vh-empty">No readings in this range</div>
        ) : (
          <div className="vh-table-wrap">
            <table className="vh-table">
              <thead>
                <tr>
                  <th style={{ width: '30%' }}>Date / time</th>
                  <th style={{ width: '18%' }}>{metric?.fields ? 'BP (sys/dia)' : 'Value'}</th>
                  {metric?.fields && <th style={{ width: '12%' }}>MAP</th>}
                  <th style={{ width: '14%' }}>Source</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id ?? `${r.timestamp}-${i}`}>
                    <td>{when(stampOf(r))}</td>
                    <td className="num">{formatReading(r, metric) ?? '--'} <span className="vh-block-unit">{metric?.unit}</span></td>
                    {metric?.fields && <td className="num">{r.map != null ? `${r.map} ${metric.unit}` : '--'}</td>}
                    <td><span className="vh-src" data-source={r.source || 'manual'}>{(r.source || 'manual').replace('_', ' ')}</span></td>
                    <td className={r.notes ? '' : 'dim'}>{r.notes || 'No note'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default VitalsHistoryPanel;
export { METRICS };
