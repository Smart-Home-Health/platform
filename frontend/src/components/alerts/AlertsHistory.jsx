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
// A day of pulse oximetry, at the panel's two sizes.
//
// Narrow gets the full reading of the day: the scalars, the shape of the two
// traces, when the sensor was actually on, where the dips were. Wide keeps the
// arrangement it always had — rollup then distribution, at the analyzer's own
// thirteen-bucket resolution — moved onto vc tokens.
//
// Sizing comes from useModalDock(), never from window.innerWidth: a 380px
// panel on a 1920px screen is narrow, and the viewport cannot tell you that.
import { useState, useEffect, useMemo, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer } from 'recharts';
import * as Select from '@radix-ui/react-select';
import config, { apiFetch } from '../../config';
import { useModalDock } from '../../contexts/ModalDockContext';
import { CHART_CHROME } from '../../contexts/DashboardThemeContext';
import { ChevronLeftIcon, ChevronRightIcon, CalendarIcon, CheckIcon, AlertIcon, ClockIcon, InfoIcon } from '../Icons';
import {
  findEpisodes, coverageBuckets, downsample, collapseDistribution,
  atAGlance, formatDuration, formatHours, WATCH_SPO2,
} from './pulseOxDay';
import './alerts-history.css';

const SPO2_COLOR = 'var(--vc-series-spo2)';
const BPM_COLOR = 'var(--vc-series-hr)';

// The analyzer's full bucket set, in clinical order, for the wide view. Tone
// follows the project rule: red is reserved for the sub-90 buckets.
const FULL_BANDS = [
  ['high_90s_97_plus', 'High 90s (97%+)', 'complete'],
  ['mid_90s_94_96', 'Mid 90s (94-96%)', 'live'],
  ['low_90s_90_93', 'Low 90s (90-93%)', 'due'],
  ['high_eighties_85_89', 'High 80s (85-89%)', 'alert'],
  ['low_eighties_80_84', 'Low 80s (80-84%)', 'alert'],
  ['seventies_70_79', '70s (70-79%)', 'alert'],
  ['sixties_60_69', '60s (60-69%)', 'alert'],
  ['fifties_50_59', '50s (50-59%)', 'alert'],
  ['forties_40_49', '40s (40-49%)', 'alert'],
  ['thirties_30_39', '30s (30-39%)', 'alert'],
  ['twenties_20_29', '20s (20-29%)', 'alert'],
  ['below_twenty', 'Below 20%', 'alert'],
  ['zero_errors', 'Sensor errors', 'idle'],
];

const GLANCE_ICON = {
  ok: <CheckIcon size={10} />,
  alert: <AlertIcon size={10} />,
  due: <ClockIcon size={10} />,
  info: <InfoIcon size={10} />,
};

const clockTime = (msValue) =>
  new Date(msValue).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

// Parsed as a local date. `new Date('2026-08-18')` is UTC midnight, which
// renders as the previous day for anyone west of Greenwich.
const parseDay = (iso) => {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const shortDay = (iso) => {
  const d = parseDay(iso);
  return d ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '';
};

const longDay = (iso) => {
  const d = parseDay(iso);
  return d ? d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '';
};

const AlertsHistory = ({ patientId }) => {
  const { expanded } = useModalDock();
  const [availableDates, setAvailableDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [readings, setReadings] = useState([]);
  const [alarmSpo2, setAlarmSpo2] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const withPatient = useCallback(
    (path) => `${config.apiUrl}${path}${patientId != null ? `${path.includes('?') ? '&' : '?'}patient_id=${patientId}` : ''}`,
    [patientId]
  );

  // The alarm threshold decides which dips count as alert-level, so it is read
  // from settings rather than assumed.
  useEffect(() => {
    let live = true;
    apiFetch(`${config.apiUrl}/api/settings`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(s => { if (live && s && s.min_spo2 != null) setAlarmSpo2(Number(s.min_spo2)); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    let live = true;
    setAnalysis(null);
    setReadings([]);
    apiFetch(withPatient('/api/monitoring/history/dates'), { credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error('Failed to fetch dates'); return r.json(); })
      .then(data => {
        if (!live) return;
        const dates = data.dates || [];
        setAvailableDates(dates);
        setSelectedDate(dates[0] || '');
      })
      .catch(() => { if (live) setError('Failed to load available dates'); });
    return () => { live = false; };
  }, [withPatient]);

  useEffect(() => {
    if (!selectedDate) return;
    let live = true;
    setLoading(true);
    setError(null);
    // The raw readings back the traces, the coverage strip and the episode
    // list; only the narrow stop draws those, so wide does not pay for them.
    const wants = expanded
      ? [apiFetch(withPatient(`/api/monitoring/history/analyze/${selectedDate}`), { credentials: 'include' })]
      : [
        apiFetch(withPatient(`/api/monitoring/history/analyze/${selectedDate}`), { credentials: 'include' }),
        apiFetch(withPatient(`/api/monitoring/history/raw/${selectedDate}`), { credentials: 'include' }),
      ];
    Promise.all(wants)
      .then(async ([aRes, rRes]) => {
        if (!aRes.ok) throw new Error('Failed to fetch analysis');
        const a = await aRes.json();
        const r = rRes && rRes.ok ? await rRes.json() : null;
        if (!live) return;
        setAnalysis(a);
        setReadings(r?.readings || []);
      })
      .catch(() => { if (live) setError('Failed to load analysis data'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [selectedDate, withPatient, expanded]);

  const series = useMemo(() => downsample(readings, 260), [readings]);
  const episodes = useMemo(
    () => findEpisodes(readings, { watch: WATCH_SPO2, alarm: alarmSpo2 }),
    [readings, alarmSpo2]
  );
  const coverage = useMemo(() => coverageBuckets(readings, 90), [readings]);
  const glance = useMemo(() => atAGlance(analysis, episodes, alarmSpo2), [analysis, episodes, alarmSpo2]);
  const bands = useMemo(() => collapseDistribution(analysis?.spo2_distribution), [analysis]);

  const idx = availableDates.indexOf(selectedDate);
  // availableDates is newest-first, so "older" walks forward through it.
  const goOlder = () => { if (idx >= 0 && idx < availableDates.length - 1) setSelectedDate(availableDates[idx + 1]); };
  const goNewer = () => { if (idx > 0) setSelectedDate(availableDates[idx - 1]); };

  const errorPct = analysis && analysis.total_readings
    ? Math.round((analysis.error_spo2_readings / analysis.total_readings) * 1000) / 10
    : 0;
  const validPct = analysis && analysis.total_readings
    ? Math.round((analysis.valid_spo2_readings / analysis.total_readings) * 100)
    : 0;

  const dateBar = (
    <div className="ah-datebar">
      <button type="button" className="ah-step" onClick={goOlder}
        disabled={idx < 0 || idx >= availableDates.length - 1} aria-label="Previous day">
        <ChevronLeftIcon size={16} />
      </button>
      {/* Radix Select rather than a Popover: the repo already ships Select, and
          picking one of a list of days is exactly what it is for. */}
      {/* Controlled from the first render: `undefined` until the dates land
          would flip Radix from uncontrolled to controlled and warn. */}
      <Select.Root value={selectedDate} onValueChange={setSelectedDate}>
        <Select.Trigger className="ah-date" disabled={!availableDates.length} aria-label="Select date">
          <CalendarIcon size={14} />
          <Select.Value>{selectedDate ? shortDay(selectedDate) : 'No data'}</Select.Value>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className="ah-date-menu" position="popper" sideOffset={6}>
            <Select.Viewport>
              {availableDates.map(d => (
                <Select.Item key={d} value={d} className="ah-date-option" data-active={d === selectedDate}>
                  <Select.ItemText>{longDay(d)}</Select.ItemText>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
      <button type="button" className="ah-step" onClick={goNewer} disabled={idx <= 0} aria-label="Next day">
        <ChevronRightIcon size={16} />
      </button>
    </div>
  );

  const stat = (label, value, unit, sub, tone) => (
    <div className={`ah-stat ah-tone-${tone || 'info'}`} key={label}>
      <span className="ah-stat-label">{label}</span>
      <span className="ah-stat-value">{value}{unit && <small>{unit}</small>}</span>
      {sub && <span className="ah-stat-sub">{sub}</span>}
    </div>
  );

  const rollup = analysis && (
    <div className="ah-rollup">
      {stat('Coverage', formatHours(analysis.time_logged_minutes), '', `${analysis.time_logged_minutes} minutes`, 'live')}
      {stat('Valid readings', analysis.valid_spo2_readings.toLocaleString(), '', `${validPct}% of readings`, 'info')}
      {stat('Average SpO₂', analysis.avg_spo2, '%', `Range ${analysis.min_spo2}-${analysis.max_spo2}%`, 'live')}
      {stat('Average HR', analysis.avg_bpm, ' BPM', `Range ${analysis.min_bpm}-${analysis.max_bpm}`, 'complete')}
      {stat('Sensor errors', errorPct, '%', `${analysis.error_spo2_readings.toLocaleString()} readings`,
        analysis.error_spo2_readings > 0 ? 'due' : 'info')}
    </div>
  );

  const distRow = (key, label, tone, count, percentage) => (
    <div className={`ah-dist-row ah-tone-${tone}`} key={key}>
      <span className="ah-swatch" />
      <span className="ah-dist-label">{label}</span>
      <div className="ah-dist-bar">
        {/* A band that occurred at all keeps a visible sliver; one that did not
            stays empty, so "rare" and "never" do not look alike. */}
        <div className="ah-dist-fill" style={{ width: count > 0 ? `${Math.max(percentage, 1)}%` : 0 }} />
      </div>
      <span className="ah-dist-stat">
        <span className="ah-dist-pct">{percentage}%</span>
        <span className="ah-dist-count">({count.toLocaleString()})</span>
      </span>
    </div>
  );

  const timeTicks = series.length
    ? [series[0].t, series[Math.floor(series.length / 2)].t, series[series.length - 1].t]
    : [];

  const trace = (label, key, color, refLine) => (
    <>
      <span className="ah-chart-label">{label}</span>
      <div className="ah-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 4, right: 6, bottom: 0, left: -18 }}>
            <CartesianGrid stroke={CHART_CHROME.grid} vertical={false} />
            <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} ticks={timeTicks}
              tickFormatter={clockTime} stroke={CHART_CHROME.axis}
              tick={{ fill: CHART_CHROME.textDim, fontSize: 9 }} tickLine={false} />
            {/* Fixed SpO2 scale with even ticks: a percentage the reader
                already has a feel for should not re-scale per day, and letting
                recharts pick gave 88/91/94/100. */}
            <YAxis domain={key === 'spo2' ? [88, 100] : ['dataMin - 10', 'dataMax + 10']}
              ticks={key === 'spo2' ? [88, 92, 96, 100] : undefined}
              stroke={CHART_CHROME.axis} tick={{ fill: CHART_CHROME.textDim, fontSize: 9 }}
              tickLine={false} width={38} />
            {refLine != null && (
              <ReferenceLine y={refLine} stroke="var(--vc-state-due)" strokeDasharray="3 3" />
            )}
            <Line type="monotone" dataKey={key} stroke={color} strokeWidth={1.4} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );

  const body = () => {
    if (loading) return <div className="ah-note">Loading analysis…</div>;
    if (!selectedDate) return <div className="ah-empty">No pulse oximetry data recorded</div>;
    if (!analysis) return <div className="ah-empty">No data for {shortDay(selectedDate)}</div>;

    if (expanded) {
      return (
        <>
          {rollup}
          <div className="ah-block">
            <div className="ah-block-head">
              <h4 className="ah-block-title">SpO&#8322; distribution</h4>
              <span className="ah-tag">{longDay(analysis.date)}</span>
            </div>
            <div className="ah-dist">
              {FULL_BANDS.map(([k, label, tone]) => {
                const d = analysis.spo2_distribution?.[k];
                return distRow(k, label, tone, d?.count || 0, d?.percentage || 0);
              })}
            </div>
          </div>
        </>
      );
    }

    const alertLevel = episodes.filter(e => e.alertLevel).length;
    return (
      <>
        {rollup}

        {series.length > 0 && (
          <div className="ah-block">
            <div className="ah-block-head">
              <h4 className="ah-block-title">Oxygen + heart rate</h4>
              {alarmSpo2 != null && <span className="ah-tag">{alarmSpo2}% alarm</span>}
            </div>
            {trace('SpO₂ (%)', 'spo2', SPO2_COLOR, alarmSpo2)}
            {trace('Heart rate (BPM)', 'bpm', BPM_COLOR, null)}
            {coverage.buckets.length > 0 && (
              <>
                <span className="ah-chart-label">Sensor coverage</span>
                <div className="ah-coverage">
                  {coverage.buckets.map((on, i) => (
                    <span key={i} className={`ah-cov-slot${on ? ' on' : ''}`} />
                  ))}
                </div>
                <div className="ah-cov-axis">
                  <span>{clockTime(coverage.startMs)}</span>
                  <span>{formatHours(analysis.time_logged_minutes)} of data</span>
                  <span>{clockTime(coverage.endMs)}</span>
                </div>
              </>
            )}
          </div>
        )}

        <div className="ah-block">
          <h4 className="ah-block-title">SpO&#8322; distribution</h4>
          <div className="ah-dist">
            {bands.map(b => distRow(b.key, b.label, b.tone, b.count, b.percentage))}
          </div>
        </div>

        <div className="ah-block">
          <h4 className="ah-block-title">At a glance</h4>
          <div className="ah-glance">
            {glance.map((l, i) => (
              <div className={`ah-glance-row ah-tone-${l.tone}`} key={i}>
                <span className="ah-glance-dot">{GLANCE_ICON[l.tone]}</span>
                {l.text}
              </div>
            ))}
          </div>
        </div>

        <div className="ah-block">
          <div className="ah-block-head">
            <h4 className="ah-block-title">Low-oxygen episodes</h4>
            <span className={`ah-tag${alertLevel ? ' ah-tone-alert' : ''}`}>
              {alertLevel ? `${alertLevel} alert-level` : 'No alert-level episodes'}
            </span>
          </div>
          {episodes.length === 0 ? (
            <div className="ah-note">Nothing below {WATCH_SPO2}%</div>
          ) : (
            <div className="ah-eps">
              {episodes.map(e => (
                <div className={`ah-ep ah-tone-${e.alertLevel ? 'alert' : 'due'}`} key={e.startMs}>
                  <span className="ah-ep-time">{clockTime(e.startMs)}</span>
                  <span />
                  <span className="ah-ep-nadir">{e.nadir}%</span>
                  <span className="ah-ep-meta">
                    {formatDuration(e.durationMs)} &middot; {e.readings} reading{e.readings === 1 ? '' : 's'}
                    {e.bpmAtNadir != null && ` · ${e.bpmAtNadir} BPM at nadir`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </>
    );
  };

  return (
    <div className={`ah-panel${expanded ? ' wide' : ''}`}>
      {dateBar}
      {error && <div className="ah-error">{error}</div>}
      {body()}
    </div>
  );
};

export default AlertsHistory;
