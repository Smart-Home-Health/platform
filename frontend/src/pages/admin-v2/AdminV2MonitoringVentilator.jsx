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
// One ventilator day.
//
// A day carries ~44 parameters and the device has no opinion about which
// matter, so the page is built around two answers to that: the care team's
// pins lead, and everything else is one line per parameter rather than a
// card. The previous version gave breath rate and a raw vendor counter the
// same 250px card, which put the numbers anyone actually reads five screens
// apart.
//
// On trust: see ventParameters.js. We flag where a number came from, never
// whether it is right — there is no verification step in this pipeline and
// the UI must not imply one.
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import config, { apiFetch } from '../../config';
import EntityModal from '../../components/vc/EntityModal';
import {
  CalendarIcon, ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon, StarIcon,
} from '../../components/Icons';
import { rowsFrom, matchesQuery, formatValue, bandPosition } from './ventParameters';
import './monitoring-ventilator.css';

/* Group accents from the vc ramp, so a group reads as a category rather than
 * a state. Unlisted groups fall back to the neutral dot. */
const GROUP_ACCENT = {
  Ventilation: '#4da7bd',
  Oxygen: '#3fbf6a',
  Cough: '#9b8cf0',
  Suction: '#4dc3b3',
  Nebulizer: '#d98cc4',
  System: '#7f9fd4',
  Config: '#a8c94a',
  Other: '#6b7987',
};

/* Series colours for the pinned trend — the vc-derived ramp the reports use. */
const SERIES_RAMP = ['#4da7bd', '#3fbf6a', '#9b8cf0', '#4dc3b3', '#7f9fd4', '#d98cc4', '#a8c94a'];

const CHROME = {
  grid: 'rgba(255, 255, 255, 0.06)',
  axis: '#6b7987',
  band: 'rgba(77, 167, 189, 0.16)',
  line: '#4da7bd',
};

const VENDOR = 'vocsn';

const fmtDay = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
};
const fmtClock = (iso) => (iso
  ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  : null);

const AdminV2MonitoringVentilator = ({ patientId }) => {
  const [days, setDays] = useState([]);
  const [hasIntegration, setHasIntegration] = useState(true);
  const [daysLoading, setDaysLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const [dayData, setDayData] = useState(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [error, setError] = useState(null);

  const [pins, setPins] = useState([]);
  const [pinsSource, setPinsSource] = useState('default');
  const [pinSeries, setPinSeries] = useState({});

  const [query, setQuery] = useState('');
  const [group, setGroup] = useState(null);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [openGroups, setOpenGroups] = useState(null);
  const [detail, setDetail] = useState(null);

  /* ---------------- data ---------------- */

  useEffect(() => {
    if (!patientId) return undefined;
    let cancelled = false;
    setDaysLoading(true);
    (async () => {
      try {
        const res = await apiFetch(
          `${config.apiUrl}/api/integrations/patient/${patientId}/vent/days`);
        if (!res.ok) throw new Error('Could not load ventilator days.');
        const body = await res.json();
        if (cancelled) return;
        setHasIntegration(body.has_integration !== false);
        setDays(body.days || []);
        setSelectedDate(body.days?.[0]?.date ?? null);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setDaysLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [patientId]);

  useEffect(() => {
    if (!patientId || !selectedDate) return undefined;
    let cancelled = false;
    setDayLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await apiFetch(
          `${config.apiUrl}/api/integrations/patient/${patientId}/vent/day/${selectedDate}`);
        if (!res.ok) throw new Error('Could not load this day.');
        const body = await res.json();
        if (!cancelled) { setDayData(body); setOpenGroups(null); }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setDayLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [patientId, selectedDate]);

  useEffect(() => {
    if (!patientId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(
          `${config.apiUrl}/api/integrations/patient/${patientId}/vent/pins?vendor=${VENDOR}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        if (!cancelled) {
          setPins(body.parameter_keys || []);
          setPinsSource(body.source || 'default');
        }
      } catch {
        if (!cancelled) { setPins([]); setPinsSource('default'); }
      }
    })();
    return () => { cancelled = true; };
  }, [patientId]);

  /* ---------------- derived ---------------- */

  const rows = useMemo(() => rowsFrom(dayData), [dayData]);
  const byKey = useMemo(
    () => Object.fromEntries(rows.map((r) => [r.param.parameter_key, r])), [rows]);

  const pinnedRows = useMemo(
    () => pins.map((key) => byKey[key]).filter(Boolean), [pins, byKey]);
  // Pins that exist for the patient but produced nothing today: worth showing
  // as absent rather than dropping, or a silent gap reads as a normal day.
  const pinsMissingToday = useMemo(
    () => pins.filter((key) => !byKey[key]), [pins, byKey]);

  const reviewCount = rows.filter((r) => r.review).length;

  const groupCounts = useMemo(() => {
    const counts = new Map();
    rows.forEach((r) => counts.set(r.group, (counts.get(r.group) || 0) + 1));
    return [...counts.entries()].map(([name, count]) => ({ name, count }));
  }, [rows]);

  const visibleRows = useMemo(() => rows.filter((r) => (
    (!group || r.group === group)
    && (!reviewOnly || r.review)
    && matchesQuery(r, query)
  )), [rows, group, reviewOnly, query]);

  const visibleGroups = useMemo(() => {
    const out = [];
    visibleRows.forEach((r) => {
      let entry = out.find((g) => g.name === r.group);
      if (!entry) { entry = { name: r.group, rows: [] }; out.push(entry); }
      entry.rows.push(r);
    });
    return out;
  }, [visibleRows]);

  // Only the first group starts open; a filtered or searched list opens all,
  // because a hit hidden inside a collapsed group looks like no hit at all.
  const filtering = Boolean(query.trim() || group || reviewOnly);
  const isOpen = useCallback((name, index) => {
    if (filtering) return true;
    if (openGroups === null) return index === 0;
    return openGroups.includes(name);
  }, [filtering, openGroups]);

  const toggleGroup = (name) => {
    setOpenGroups((prev) => {
      const base = prev ?? (visibleGroups[0] ? [visibleGroups[0].name] : []);
      return base.includes(name) ? base.filter((g) => g !== name) : [...base, name];
    });
  };

  /* ---------------- pinned series ---------------- */

  const pinKeysStr = pinnedRows.map((r) => r.param.parameter_key).join(',');
  useEffect(() => {
    if (!patientId || !selectedDate || !pinKeysStr) { setPinSeries({}); return undefined; }
    let cancelled = false;
    const keys = pinKeysStr.split(',');
    (async () => {
      const next = {};
      await Promise.all(keys.map(async (key) => {
        try {
          const res = await apiFetch(`${config.apiUrl}/api/integrations/patient/`
            + `${patientId}/vent/day/${selectedDate}/parameter/${key}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const body = await res.json();
          next[key] = body.points || [];
        } catch {
          next[key] = [];
        }
      }));
      if (!cancelled) setPinSeries(next);
    })();
    return () => { cancelled = true; };
  }, [patientId, selectedDate, pinKeysStr]);

  /* ---------------- pinning ---------------- */

  const savePins = useCallback(async (keys) => {
    setPins(keys);
    setPinsSource('patient');
    try {
      await apiFetch(`${config.apiUrl}/api/integrations/patient/${patientId}/vent/pins`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor: VENDOR, parameter_keys: keys }),
      });
    } catch {
      // The star is optimistic; a failed save leaves the page usable and the
      // next load re-reads the server's answer.
    }
  }, [patientId]);

  const togglePin = (key) => {
    savePins(pins.includes(key) ? pins.filter((k) => k !== key) : [...pins, key]);
  };

  /* ---------------- day nav ---------------- */

  const dayIndex = days.findIndex((d) => d.date === selectedDate);
  const goto = (delta) => {
    const next = days[dayIndex + delta];
    if (next) setSelectedDate(next.date);
  };

  /* ---------------- render ---------------- */

  if (daysLoading) return <div className="vnt"><p className="vnt-empty">Loading ventilator data…</p></div>;

  if (!hasIntegration) {
    return (
      <div className="vnt">
        <p className="vnt-setup">
          This patient has no ventilator integration yet. Add one under
          Configuration &rsaquo; Integrations to start importing device data.
        </p>
      </div>
    );
  }

  if (days.length === 0) {
    return (
      <div className="vnt">
        <p className="vnt-setup">
          No ventilator samples have been parsed yet. Upload a device export from
          the integration&rsquo;s Logs panel.
        </p>
      </div>
    );
  }

  const summary = dayData?.summary;
  const covering = summary && (fmtClock(summary.first_at) && fmtClock(summary.last_at)
    ? `${fmtClock(summary.first_at)} – ${fmtClock(summary.last_at)}`
    : null);

  return (
    <div className="vnt">
      <div className="vnt-daybar">
        <button
          type="button" className="vnt-navbtn" aria-label="Older day"
          disabled={dayIndex >= days.length - 1} onClick={() => goto(1)}
        >
          <ChevronLeftIcon size={18} />
        </button>
        <span className="vnt-datepill">
          {selectedDate ? fmtDay(selectedDate) : '—'}
          <CalendarIcon size={16} />
          <select
            aria-label="Pick a day"
            value={selectedDate ?? ''}
            onChange={(e) => setSelectedDate(e.target.value)}
          >
            {days.map((d) => (
              <option key={d.date} value={d.date}>
                {fmtDay(d.date)} — {d.sample_count.toLocaleString()} samples
              </option>
            ))}
          </select>
        </span>
        <button
          type="button" className="vnt-navbtn" aria-label="Newer day"
          disabled={dayIndex <= 0} onClick={() => goto(-1)}
        >
          <ChevronRightIcon size={18} />
        </button>
        <button
          type="button" className="vnt-navbtn"
          disabled={dayIndex === 0} onClick={() => setSelectedDate(days[0].date)}
        >
          Newest
        </button>
        <span className="vnt-count">{dayIndex + 1} of {days.length}</span>
      </div>

      {error && <p className="vnt-error">{error}</p>}

      {summary && (
        <div className="vnt-stats">
          <div className="vnt-stat">
            <span className="vnt-stat-head">Samples</span>
            <span className="vnt-stat-value">{summary.total_samples.toLocaleString()}</span>
          </div>
          <div className="vnt-stat">
            <span className="vnt-stat-head">Parameters</span>
            <span className="vnt-stat-value">{summary.parameter_count}</span>
          </div>
          <div className="vnt-stat">
            <span className="vnt-stat-head">Covering</span>
            <span className="vnt-stat-value" style={{ fontSize: '1rem' }}>{covering || '—'}</span>
            <span className="vnt-stat-note">first to last sample</span>
          </div>
          <button
            type="button"
            className={`vnt-stat ${reviewCount ? 'flagged' : 'clean'}`}
            aria-pressed={reviewOnly}
            onClick={() => setReviewOnly((v) => !v)}
          >
            <span className="vnt-stat-head">Needs review</span>
            <span className="vnt-stat-value">{reviewCount}</span>
            <span className="vnt-stat-note">
              {reviewCount ? (reviewOnly ? 'showing only these' : 'tap to filter') : 'all described'}
            </span>
          </button>
        </div>
      )}

      {pinnedRows.length > 0 && (
        <section className="vnt-card">
          <div className="vnt-card-head">
            <h3>Pinned</h3>
            <span className="vnt-label">
              {pinsSource === 'default' ? 'default set' : `${pins.length} chosen`}
            </span>
          </div>
          <div className="vnt-pins">
            {pinnedRows.map((row) => (
              <PinnedCell key={row.param.parameter_key} row={row} />
            ))}
            {pinsMissingToday.map((key) => (
              <div className="vnt-pin vnt-pin-missing" key={key}>
                <span className="vnt-pin-name">#{key}</span>
                <span className="vnt-pin-value">—</span>
                <span className="vnt-pin-sub">no samples today</span>
              </div>
            ))}
          </div>
          <PinnedTrend rows={pinnedRows} series={pinSeries} />
        </section>
      )}

      <div className="vnt-controls">
        <input
          className="vnt-search"
          type="search"
          placeholder="Search parameter or vendor ID"
          aria-label="Search parameters"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button" className="vnt-chip"
          aria-pressed={group === null} onClick={() => setGroup(null)}
        >
          All
          <span className="vnt-chip-count">{rows.length}</span>
        </button>
        {groupCounts.map((g) => (
          <button
            key={g.name} type="button" className="vnt-chip"
            aria-pressed={group === g.name}
            onClick={() => setGroup(group === g.name ? null : g.name)}
          >
            <span className="vnt-dot" style={{ '--grp': GROUP_ACCENT[g.name] }} />
            {g.name}
            <span className="vnt-chip-count">{g.count}</span>
          </button>
        ))}
      </div>

      {dayLoading && !dayData && <p className="vnt-empty">Loading the day…</p>}

      {dayData && (
        <section className="vnt-card">
          {visibleGroups.length === 0 ? (
            <p className="vnt-empty">No parameters match.</p>
          ) : visibleGroups.map((g, i) => (
            <div className="vnt-group" key={g.name}>
              <button
                type="button" className="vnt-group-head"
                aria-expanded={isOpen(g.name, i)}
                onClick={() => toggleGroup(g.name)}
              >
                <span className="vnt-dot" style={{ '--grp': GROUP_ACCENT[g.name] }} />
                {g.name}
                <span className="vnt-group-meta">
                  {g.rows.length} {g.rows.length === 1 ? 'parameter' : 'parameters'}
                </span>
                <ChevronDownIcon
                  size={15}
                  style={{ transform: isOpen(g.name, i) ? 'rotate(180deg)' : 'none' }}
                />
              </button>
              {isOpen(g.name, i) && g.rows.map((row) => (
                <ParameterRow
                  key={row.param.parameter_key}
                  row={row}
                  pinned={pins.includes(row.param.parameter_key)}
                  onPin={() => togglePin(row.param.parameter_key)}
                  onOpen={() => setDetail(row)}
                />
              ))}
            </div>
          ))}
          <p className="vnt-note">
            Values are the average of the device&rsquo;s per-window medians for the day;
            the range beside each is the lowest and highest of those medians, not the
            day&rsquo;s extremes.
          </p>
        </section>
      )}

      {detail && (
        <ParameterDetail
          row={detail}
          patientId={patientId}
          date={selectedDate}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
};

/* One pinned parameter, big enough to read across a room. */
const PinnedCell = ({ row }) => {
  const { param, headline, review } = row;
  const value = formatValue(headline?.value, param.precision);
  return (
    <div className={`vnt-pin${review ? ' review' : ''}`}>
      <span className="vnt-pin-name" title={param.display_label}>{param.display_label}</span>
      <span className="vnt-pin-value">
        {value ?? '—'}
        {value != null && param.display_units && <small>{param.display_units}</small>}
      </span>
      <span className="vnt-pin-sub">
        {headline ? `${headline.n} samples` : 'no data'}
        {headline?.basis === 'raw' && ' · raw'}
      </span>
    </div>
  );
};

/* One parameter, one line. */
const ParameterRow = ({ row, pinned, onPin, onOpen }) => {
  const { param, headline, flags, review } = row;
  const value = formatValue(headline?.value, param.precision);
  const lo = formatValue(headline?.lo, param.precision);
  const hi = formatValue(headline?.hi, param.precision);
  const pos = bandPosition(headline?.value, headline?.lo, headline?.hi);

  return (
    <div className={`vnt-row${review ? ' review' : ''}`}>
        <button
          type="button"
          className="vnt-pinbtn"
          aria-pressed={pinned}
          aria-label={`${pinned ? 'Unpin' : 'Pin'} ${param.display_label}`}
          onClick={onPin}
        >
          <StarIcon size={15} filled={pinned} />
        </button>
        <button type="button" className="vnt-row-name" onClick={onOpen}>
          <span className="vnt-row-label">{param.display_label}</span>
          <span className="vnt-row-key">#{param.parameter_key}</span>
        </button>
        <span className="vnt-row-value">
          {value ?? '—'}
          {value != null && param.display_units && <small>{param.display_units}</small>}
        </span>
        <span className="vnt-row-range">{lo != null && hi != null ? `${lo}–${hi}` : ''}</span>
        <span className="vnt-row-n">{headline?.n ?? param.total_samples}</span>
        <span className="vnt-row-chev"><ChevronRightIcon size={14} /></span>
        {pos != null && (
          <span className="vnt-pos">
            <span className="vnt-pos-mark" style={{ left: `${pos * 100}%` }} />
            <span className="sr-only">
              sits {Math.round(pos * 100)}% through its range for the day
            </span>
          </span>
        )}
        {flags.length > 0 && (
          <span className="vnt-flags">
            {flags.map((f) => (
              <span key={f.key} className={`vnt-flag ${f.tone}`} title={f.hint}>{f.label}</span>
            ))}
          </span>
        )}
    </div>
  );
};

/* The pinned parameters on one time axis. Only pinned series are fetched, so
 * this is a handful of requests rather than one per parameter on the page. */
const PinnedTrend = ({ rows, series }) => {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  const datasets = useMemo(() => rows.map((row, i) => {
    const key = row.param.parameter_key;
    const points = (series[key] || [])
      .filter((p) => p.p50 != null)
      .map((p) => ({ x: new Date(p.ts).getTime(), y: p.p50 }));
    return { key, label: row.param.display_label, points, axis: i === 0 ? 'y' : `y${i}` };
  }).filter((d) => d.points.length > 0), [rows, series]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || datasets.length === 0) return undefined;
    // Each parameter keeps its own hidden scale — minute volume in litres and
    // breath rate per minute on one axis would flatten both to a line.
    const scales = { x: {
      type: 'time',
      time: { displayFormats: { minute: 'h:mm', hour: 'ha' } },
      grid: { color: CHROME.grid, drawTicks: false },
      border: { display: false },
      ticks: { color: CHROME.axis, maxRotation: 0, autoSkip: true, maxTicksLimit: 6,
        font: { size: 10, family: "'IBM Plex Mono', monospace" } },
    } };
    datasets.forEach((d) => {
      scales[d.axis] = { display: false, grid: { display: false } };
    });

    const chart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        datasets: datasets.map((d, i) => ({
          label: d.label,
          data: d.points,
          parsing: false,
          yAxisID: d.axis,
          borderColor: SERIES_RAMP[i % SERIES_RAMP.length],
          borderWidth: 1.4,
          pointRadius: 0,
          tension: 0.15,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { right: 8, top: 6 } },
        scales,
        plugins: {
          legend: {
            display: true, position: 'bottom',
            labels: { usePointStyle: true, boxWidth: 6, color: CHROME.axis,
              font: { size: 10, family: "'IBM Plex Mono', monospace" } },
          },
          tooltip: { enabled: true },
        },
      },
    });
    chartRef.current = chart;
    return () => { chart.destroy(); chartRef.current = null; };
  }, [datasets]);

  if (datasets.length === 0) return null;
  return (
    <div className="vnt-plot">
      <canvas ref={canvasRef} aria-label="Pinned parameters over the day" />
    </div>
  );
};


/* One parameter's day: the median line inside its 5th–95th percentile band. */
const ParameterDetail = ({ row, patientId, date, onClose }) => {
  const { param, band, flags } = row;
  const [points, setPoints] = useState(null);
  const [loading, setLoading] = useState(true);
  const canvasRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await apiFetch(`${config.apiUrl}/api/integrations/patient/`
          + `${patientId}/vent/day/${date}/parameter/${param.parameter_key}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        if (!cancelled) setPoints(body.points || []);
      } catch {
        if (!cancelled) setPoints([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [patientId, date, param.parameter_key]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !points?.length) return undefined;
    const at = (k) => points.filter((p) => p[k] != null)
      .map((p) => ({ x: new Date(p.ts).getTime(), y: p[k] }));
    const chart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        datasets: [
          // The band is drawn as p5 then p95 filling back to it: Chart.js has
          // no range series, and two lines with fill:'-1' is the shape that
          // does not need one.
          { label: '5th percentile', data: at('p5'), parsing: false,
            borderColor: 'transparent', pointRadius: 0 },
          { label: '95th percentile', data: at('p95'), parsing: false,
            borderColor: 'transparent', pointRadius: 0,
            backgroundColor: CHROME.band, fill: '-1' },
          { label: 'Median', data: at('p50'), parsing: false,
            borderColor: CHROME.line, borderWidth: 1.6, pointRadius: 0, tension: 0.15 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            type: 'time',
            time: { displayFormats: { minute: 'h:mm', hour: 'ha' } },
            grid: { color: CHROME.grid, drawTicks: false },
            border: { display: false },
            ticks: { color: CHROME.axis, maxRotation: 0, autoSkip: true, maxTicksLimit: 6,
              font: { size: 10, family: "'IBM Plex Mono', monospace" } },
          },
          y: {
            grid: { color: CHROME.grid, drawTicks: false },
            border: { display: false },
            ticks: { color: CHROME.axis, maxTicksLimit: 6,
              font: { size: 10, family: "'IBM Plex Mono', monospace" } },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: true },
        },
      },
    });
    return () => chart.destroy();
  }, [points]);

  return (
    <EntityModal open onOpenChange={(v) => { if (!v) onClose(); }} wide
                 title={`${param.display_label} · #${param.parameter_key}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {flags.length > 0 && (
          <div className="vnt-flags" style={{ gridColumn: 'auto', margin: 0 }}>
            {flags.map((f) => (
              <span key={f.key} className={`vnt-flag ${f.tone}`} title={f.hint}>{f.label}</span>
            ))}
          </div>
        )}
        {band && (
          <p className="vnt-note" style={{ padding: 0 }}>
            Device band, 5th to 95th percentile:{' '}
            <b>{formatValue(band.lo, param.precision)} – {formatValue(band.hi, param.precision)}</b>
            {param.display_units ? ` ${param.display_units}` : ''}
            {band.inverted && ' — reported inverted by the device and shown low to high'}
          </p>
        )}
        <div style={{ height: 300, position: 'relative' }}>
          {loading && <p className="vnt-empty">Loading…</p>}
          {!loading && !points?.length && (
            <p className="vnt-empty">No points to plot for this parameter on this day.</p>
          )}
          {!loading && points?.length > 0 && (
            <canvas ref={canvasRef} aria-label={`${param.display_label} over the day`} />
          )}
        </div>
        <p className="vnt-note" style={{ padding: 0 }}>
          Line is the device&rsquo;s median for each sampling window; the shaded band is
          its 5th to 95th percentile over the same window.
        </p>
      </div>
    </EntityModal>
  );
};

export default AdminV2MonitoringVentilator;
