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
// Day over day: the same hours, compared across up to seven days.
//
// Layout follows the report mockup — controls, the days you picked, one chart,
// the numbers under it — but the colours are ours. Day series carry identity
// only, so the palette deliberately excludes amber and red: on this page amber
// is the configured alarm line and red is a day that breached it.
//
// Derivations (per-day average, low, coverage, the y range and the CSV) live in
// reports/dayOverDay.js so they can be tested without a canvas.
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Chart from 'chart.js/auto';
import zoomPlugin from 'chartjs-plugin-zoom';
import annotationPlugin from 'chartjs-plugin-annotation';
import config, { apiFetch } from '../../config';
import {
  ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon, XIcon, PlusIcon,
  FilterIcon, CalendarIcon, ClockIcon, VitalsChartIcon,
  FileTextIcon, ClipboardListIcon, BarChartIcon,
  ExpandPanelIcon, CollapsePanelIcon,
} from '../../components/Icons';
import BottomSheet from '../capture/components/BottomSheet';
import { useChartColors } from '../../hooks/useChartColors';
import {
  MAX_DAYS, VITAL_TYPES, AGGREGATIONS, SOURCE_LABELS, seriesColor,
  alarmsFor, formatDayLabel, formatHourLabel, hourWindowLabel,
  summarizeDays, yDomain, breaches, toCsv, csvFileName,
} from './reports/dayOverDay';
import './reports/reports-dod.css';

Chart.register(zoomPlugin, annotationPlugin);

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const daysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const firstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();
const toDateStr = (year, month, day) =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/* Marks where the tooltip is reading from. Chart.js has no crosshair of its
 * own, and without one a three-day comparison is a guess about which hour the
 * numbers belong to. */
const crosshair = {
  id: 'dodCrosshair',
  afterDatasetsDraw(chart) {
    const active = chart.tooltip?.getActiveElements?.() || [];
    if (!active.length) return;
    const x = active[0].element.x;
    const { top, bottom } = chart.chartArea;
    const ctx = chart.ctx;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = chart.options.plugins.dodCrosshairColor || 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.restore();
  },
};

const AdminV2ReportsDayOverDay = ({ patientId }) => {
  // Source of truth: each entry remembers the colour slot it was assigned at
  // selection time, so a date keeps its colour regardless of sort order or
  // later selections. `selectedDates` (sorted) is derived for queries/display.
  const [selection, setSelection] = useState([]); // [{ date, color }]
  const [vitalType, setVitalType] = useState('spo2');
  const [aggregation, setAggregation] = useState('hour');
  const [startHour, setStartHour] = useState(0);
  const [endHour, setEndHour] = useState(23);

  const [reportData, setReportData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [sheet, setSheet] = useState(null); // 'days' | 'filters' | null
  const [view, setView] = useState('chart'); // 'chart' | 'data'
  const [fullscreen, setFullscreen] = useState(false);

  // Read fresh each render: it seeds the calendar and decides which days are
  // still in the future, so memoizing it would pin the clock at mount.
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const todayStr = toDateStr(now.getFullYear(), now.getMonth(), now.getDate());

  const rootRef = useRef(null);
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const fetchTimer = useRef(null);
  const chrome = useChartColors();

  const selectedDates = useMemo(() => selection.map(s => s.date).sort(), [selection]);
  const colorByDate = useMemo(
    () => Object.fromEntries(selection.map(s => [s.date, s.color])),
    [selection],
  );
  const colorFor = useCallback(ds => seriesColor(colorByDate[ds] ?? 0), [colorByDate]);

  const vital = VITAL_TYPES.find(v => v.value === vitalType) || VITAL_TYPES[0];
  const agg = AGGREGATIONS.find(a => a.value === aggregation) || AGGREGATIONS[0];
  const windowed = useMemo(() => ({ startHour, endHour }), [startHour, endHour]);
  const alarms = useMemo(() => alarmsFor(vitalType, settings), [vitalType, settings]);
  const rows = useMemo(
    () => summarizeDays(reportData?.days, windowed),
    [reportData, windowed],
  );
  const domain = useMemo(
    () => yDomain(rows, { vitalType, alarms }),
    [rows, vitalType, alarms],
  );
  const filtersOn = startHour !== 0 || endHour !== 23;

  const toggleDate = useCallback((dateStr) => {
    setSelection(prev => {
      if (prev.some(s => s.date === dateStr)) return prev.filter(s => s.date !== dateStr);
      if (prev.length >= MAX_DAYS) return prev;
      // Reuse the lowest free colour slot, so removing a day and picking
      // another hands the new one the colour that just came free.
      const used = new Set(prev.map(s => s.color));
      let color = 0;
      while (used.has(color)) color++;
      return [...prev, { date: dateStr, color }];
    });
  }, []);

  const removeDate = useCallback((dateStr) => {
    setSelection(prev => prev.filter(s => s.date !== dateStr));
  }, []);

  const prevMonth = useCallback(() => {
    setCalMonth(prev => {
      if (prev === 0) { setCalYear(y => y - 1); return 11; }
      return prev - 1;
    });
  }, []);

  const atCurrentMonth = calYear === now.getFullYear() && calMonth === now.getMonth();
  const nextMonth = useCallback(() => {
    if (atCurrentMonth) return;
    setCalMonth(prev => {
      if (prev === 11) { setCalYear(y => y + 1); return 0; }
      return prev + 1;
    });
  }, [atCurrentMonth]);

  // The alarm lines come from the same account settings the live monitor
  // alarms on, so the report can't disagree with the board.
  useEffect(() => {
    let live = true;
    apiFetch(`${config.apiUrl}/api/settings`)
      .then(r => (r.ok ? r.json() : null))
      .then(s => { if (live && s) setSettings(s); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (fetchTimer.current) clearTimeout(fetchTimer.current);
    if (selectedDates.length === 0) { setReportData(null); return; }

    fetchTimer.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          patient_id: patientId,
          vital_type: vitalType,
          dates: selectedDates.join(','),
          aggregation,
        });
        const res = await apiFetch(`${config.apiUrl}/api/reports/day-over-day?${params}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || `Server error ${res.status}`);
        }
        setReportData(await res.json());
      } catch (e) {
        setError(e.message);
        setReportData(null);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => { if (fetchTimer.current) clearTimeout(fetchTimer.current); };
  }, [selectedDates, vitalType, patientId, aggregation]);

  // ---- chart ----
  useEffect(() => {
    if (view !== 'chart' || !reportData || !chartRef.current) return;
    if (chartInstance.current) {
      chartInstance.current.destroy();
      chartInstance.current = null;
    }
    if (!rows.length) return;

    // Canvas can't read CSS variables, so the theme colours are resolved off
    // the mounted root — which is where the light/dark token swap happens.
    const rootStyle = rootRef.current ? getComputedStyle(rootRef.current) : null;
    const token = (name, fallback) => rootStyle?.getPropertyValue(name).trim() || fallback;
    const alarmColor = token('--rpt-alarm', '#f0a52e');
    const tooltipBg = token('--rpt-raised', chrome.cutout);
    const gridSoft = `${chrome.grid}80`;

    const isRaw = (reportData.aggregation || 'hour') === 'none';
    const datasets = rows.map(row => {
      const color = colorFor(row.date);
      const sparse = row.points.length <= 4;
      return {
        label: formatDayLabel(row.date),
        data: row.points.map(b => ({ x: b.hour, y: b.avg })),
        borderColor: color,
        backgroundColor: color,
        borderWidth: isRaw ? 1 : 2,
        pointRadius: sparse ? 4 : 0,
        pointHoverRadius: 4,
        pointHitRadius: 8,
        fill: false,
        tension: sparse ? 0 : 0.3,
        spanGaps: true,
      };
    });

    const annotations = {};
    domain.lines.forEach(line => {
      annotations[line.key] = {
        type: 'line',
        yMin: line.value,
        yMax: line.value,
        borderColor: alarmColor,
        borderWidth: 1,
        borderDash: [6, 4],
        label: {
          display: true,
          content: `${line.key === 'low' ? 'Alarm' : 'Alarm high'} ${line.value}${reportData.unit || ''}`,
          position: 'end',
          color: alarmColor,
          backgroundColor: 'transparent',
          font: { size: 10, family: 'IBM Plex Mono, monospace', weight: '700' },
          yAdjust: line.key === 'low' ? 10 : -10,
        },
      };
    });

    const ctx = chartRef.current.getContext('2d');
    chartInstance.current = new Chart(ctx, {
      type: 'line',
      data: { datasets },
      plugins: [crosshair],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            type: 'linear',
            min: startHour,
            max: endHour,
            grid: { color: gridSoft },
            border: { color: chrome.grid },
            ticks: {
              stepSize: aggregation === 'hour' ? 2 : undefined,
              autoSkip: true,
              maxTicksLimit: 12,
              maxRotation: 0,
              color: chrome.axis,
              font: { size: 10, family: 'IBM Plex Mono, monospace' },
              callback: (val) => formatHourLabel(val),
            },
          },
          y: {
            type: 'linear',
            min: domain.min,
            max: domain.max,
            title: {
              display: true,
              text: `${vital.label} (${reportData.unit || vital.unit})`,
              color: chrome.axis,
              font: { size: 10, family: 'IBM Plex Mono, monospace' },
            },
            grid: { color: gridSoft },
            border: { color: chrome.grid },
            ticks: { color: chrome.axis, font: { size: 10, family: 'IBM Plex Mono, monospace' } },
          },
        },
        plugins: {
          dodCrosshairColor: chrome.axis,
          annotation: { annotations },
          legend: { display: false },
          tooltip: {
            usePointStyle: true,
            backgroundColor: tooltipBg,
            borderColor: chrome.grid,
            borderWidth: 1,
            titleColor: chrome.foreground,
            bodyColor: chrome.foreground,
            padding: 10,
            titleFont: { size: 11, family: 'IBM Plex Mono, monospace', weight: '700' },
            bodyFont: { size: 11, family: 'IBM Plex Mono, monospace' },
            callbacks: {
              title: (items) => (items.length ? formatHourLabel(items[0].parsed.x) : ''),
              label: (item) => {
                const row = rows[item.datasetIndex];
                const src = row ? SOURCE_LABELS[row.source] || row.source : '';
                return `${item.dataset.label}  ${item.parsed.y}${reportData.unit || ''}${src ? ` · ${src}` : ''}`;
              },
            },
          },
          zoom: {
            pan: { enabled: true, mode: 'x' },
            zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' },
            limits: { x: { min: startHour, max: endHour, minRange: 1 } },
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
  }, [reportData, rows, domain, colorFor, startHour, endHour, aggregation, vital, chrome, view]);

  const exportCsv = useCallback(() => {
    if (!reportData) return;
    const blob = new Blob([toCsv(reportData, windowed)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = csvFileName(vitalType, selectedDates);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [reportData, windowed, vitalType, selectedDates]);

  // ---- calendar cells ----
  const cells = useMemo(() => {
    const out = [];
    for (let i = 0; i < firstDayOfMonth(calYear, calMonth); i++) out.push(null);
    for (let d = 1; d <= daysInMonth(calYear, calMonth); d++) out.push(d);
    return out;
  }, [calYear, calMonth]);
  const monthLabel = new Date(calYear, calMonth, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const unit = reportData?.unit || vital.unit;
  const fmt = (n) => (n === null || n === undefined ? '—' : `${Math.round(n * 10) / 10}${unit}`);

  return (
    <div className="rpt dod" ref={rootRef}>
      <div className="rpt-controls">
        <label className="rpt-control">
          <VitalsChartIcon size={16} />
          <span className="rpt-sr">Vital</span>
          <select value={vitalType} onChange={e => setVitalType(e.target.value)}>
            {VITAL_TYPES.map(vt => <option key={vt.value} value={vt.value}>{vt.label}</option>)}
          </select>
          <ChevronDownIcon size={14} className="rpt-chevron" />
        </label>

        <label className="rpt-control">
          <ClockIcon size={16} />
          <span className="rpt-sr">Aggregation</span>
          <select value={aggregation} onChange={e => setAggregation(e.target.value)}>
            {AGGREGATIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
          <ChevronDownIcon size={14} className="rpt-chevron" />
        </label>

        {/* Icon-only so the two pickers and this fit one phone row; the dot
            says the hours have been narrowed without spending a word on it. */}
        <button
          type="button"
          className="rpt-control icon"
          onClick={() => setSheet('filters')}
          aria-label={filtersOn ? 'Filters — hours narrowed' : 'Filters'}
          title="Filters"
        >
          <FilterIcon size={17} />
          {filtersOn && <span className="rpt-dot-flag" />}
        </button>
      </div>

      <div className="rpt-window">
        {hourWindowLabel(startHour, endHour)} · <strong>{selectedDates.length}</strong>
        {selectedDates.length === 1 ? ' day selected' : ' days selected'}
      </div>

      <div className="dod-chips">
        {/* Chips stay short so several fit a phone row: dot, day, remove. What
            recorded the day is a column in the table below, not repeated here. */}
        {selectedDates.map(ds => (
          <span key={ds} className="dod-chip" style={{ '--dod-series': colorFor(ds) }}>
            <span className="dod-dot" aria-hidden="true" />
            {formatDayLabel(ds)}
            <button
              type="button"
              className="dod-chip-x"
              onClick={() => removeDate(ds)}
              aria-label={`Remove ${formatDayLabel(ds)}`}
            >
              <XIcon size={12} />
            </button>
          </span>
        ))}
        <button
          type="button"
          className="dod-add"
          onClick={() => setSheet('days')}
          disabled={selectedDates.length >= MAX_DAYS}
        >
          <PlusIcon size={14} />
          {selectedDates.length >= MAX_DAYS ? `${MAX_DAYS} day maximum` : 'Add day'}
        </button>
      </div>

      {error && <div className="rpt-error">{error}</div>}

      {selectedDates.length === 0 ? (
        <div className="rpt-empty">Add a day to compare</div>
      ) : loading && !reportData ? (
        <div className="rpt-empty">Loading…</div>
      ) : !rows.some(r => r.points.length) ? (
        <div className="rpt-empty">No {vital.label} recorded on the selected days</div>
      ) : (
        <>
          <section className={`rpt-card${fullscreen ? ' full' : ''}`}>
            <div className="rpt-card-head">
              <span className="rpt-card-title">
                {vital.label} by {aggregation === 'hour' ? 'hour' : 'time'}
              </span>
              <span className="rpt-card-note">{agg.note}</span>
              <button
                type="button"
                className="rpt-icon-btn"
                onClick={() => setFullscreen(v => !v)}
                aria-label={fullscreen ? 'Exit full screen' : 'Full screen chart'}
                aria-pressed={fullscreen}
              >
                {fullscreen ? <CollapsePanelIcon size={16} /> : <ExpandPanelIcon size={16} />}
              </button>
            </div>
            {view === 'chart' ? (
              <div className="rpt-plot dod-plot"><canvas ref={chartRef} /></div>
            ) : (
              <div className="dod-data-scroll">
                <table className="rpt-table dod-data-table">
                  <thead>
                    <tr>
                      <th>Day</th><th>Time</th><th>Avg</th><th>Min</th><th>Max</th><th>Samples</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.flatMap(row => row.points.map(b => (
                      <tr key={`${row.date}-${b.hour}`}>
                        <td>
                          <span className="dod-day-cell" style={{ '--dod-series': colorFor(row.date) }}>
                            <span className="dod-dot" aria-hidden="true" />
                            <span className="dod-day-name">{formatDayLabel(row.date)}</span>
                          </span>
                        </td>
                        <td>{formatHourLabel(b.hour)}</td>
                        <td>{fmt(b.avg)}</td>
                        <td>{b.min == null ? '—' : fmt(b.min)}</td>
                        <td>{b.max == null ? '—' : fmt(b.max)}</td>
                        <td className="rpt-muted">{b.count ?? '—'}</td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="rpt-table-wrap">
            <table className="rpt-table">
              <thead>
                <tr>
                  <th>Day</th><th>Avg</th><th>Low</th><th>High</th><th>Coverage</th><th>Source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const breach = breaches(row, alarms);
                  return (
                    <tr key={row.date}>
                      <td>
                        <span className="dod-day-cell" style={{ '--dod-series': colorFor(row.date) }}>
                          <span className="dod-dot" aria-hidden="true" />
                          <span className="dod-day-name">{formatDayLabel(row.date)}</span>
                        </span>
                      </td>
                      <td>{fmt(row.avg)}</td>
                      <td className={breach.low ? 'rpt-breach' : undefined}>{fmt(row.low)}</td>
                      <td className={breach.high ? 'rpt-breach' : undefined}>{fmt(row.high)}</td>
                      <td className="rpt-muted">
                        {row.coverage ? `${row.coverage}h` : '—'}
                      </td>
                      <td className="rpt-muted">{SOURCE_LABELS[row.source] || row.source || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="rpt-actions">
            <button type="button" className="rpt-btn" onClick={() => setView(v => (v === 'chart' ? 'data' : 'chart'))}>
              {view === 'chart' ? <ClipboardListIcon size={15} /> : <BarChartIcon size={15} />}
              {view === 'chart' ? 'View data' : 'View chart'}
            </button>
            <button type="button" className="rpt-btn" onClick={exportCsv} disabled={!reportData}>
              <FileTextIcon size={15} />
              Export CSV
            </button>
          </div>
        </>
      )}

      {/* Day picker. The calendar used to sit permanently in the controls; it
          moved behind "Add day" so the chart and its numbers get the page. */}
      <BottomSheet
        open={sheet === 'days'}
        onOpenChange={(next) => { if (!next) setSheet(null); }}
        onSwipeDown={() => setSheet(null)}
        title="Add a day"
      >
        <div className="rpt-sheet">
          <div className="dod-cal">
            <div className="dod-cal-head">
              <button type="button" className="dod-cal-nav" onClick={prevMonth} aria-label="Previous month">
                <ChevronLeftIcon size={16} />
              </button>
              <span className="dod-cal-month">{monthLabel}</span>
              <button
                type="button"
                className="dod-cal-nav"
                onClick={nextMonth}
                disabled={atCurrentMonth}
                aria-label="Next month"
              >
                <ChevronRightIcon size={16} />
              </button>
            </div>
            <div className="dod-cal-grid">
              {WEEKDAYS.map(d => <span key={d} className="dod-cal-weekday">{d}</span>)}
              {cells.map((day, i) => {
                if (day === null) return <span key={`e${i}`} className="dod-cal-cell empty" />;
                const ds = toDateStr(calYear, calMonth, day);
                const on = colorByDate[ds] !== undefined;
                const full = !on && selectedDates.length >= MAX_DAYS;
                return (
                  <button
                    key={ds}
                    type="button"
                    className={`dod-cal-cell${on ? ' on' : ''}${ds === todayStr ? ' today' : ''}`}
                    style={on ? { '--dod-series': colorFor(ds) } : undefined}
                    disabled={ds > todayStr || full}
                    aria-pressed={on}
                    onClick={() => toggleDate(ds)}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            {selectedDates.length >= MAX_DAYS && (
              <p className="dod-cal-note">{MAX_DAYS} days is the maximum — remove one to add another</p>
            )}
          </div>
          <div className="vc-sheet-actions">
            <button type="button" className="vc-btn primary" onClick={() => setSheet(null)}>Done</button>
          </div>
        </div>
      </BottomSheet>

      <BottomSheet
        open={sheet === 'filters'}
        onOpenChange={(next) => { if (!next) setSheet(null); }}
        onSwipeDown={() => setSheet(null)}
        title="Filters"
      >
        <div className="rpt-sheet">
          <div className="rpt-field">
            <span className="rpt-field-label">Vital</span>
            <label className="rpt-control">
              <VitalsChartIcon size={16} />
              <select value={vitalType} onChange={e => setVitalType(e.target.value)}>
                {VITAL_TYPES.map(vt => <option key={vt.value} value={vt.value}>{vt.label}</option>)}
              </select>
              <ChevronDownIcon size={14} className="rpt-chevron" />
            </label>
          </div>

          <div className="rpt-field">
            <span className="rpt-field-label">Aggregation</span>
            <label className="rpt-control">
              <ClockIcon size={16} />
              <select value={aggregation} onChange={e => setAggregation(e.target.value)}>
                {AGGREGATIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
              <ChevronDownIcon size={14} className="rpt-chevron" />
            </label>
          </div>

          <div className="rpt-field">
            <span className="rpt-field-label">Hours</span>
            <div className="rpt-range">
              <label className="rpt-control">
                <CalendarIcon size={15} />
                <span className="rpt-sr">First hour</span>
                <select
                  value={String(startHour)}
                  onChange={e => {
                    const n = Number(e.target.value);
                    setStartHour(n);
                    if (n > endHour) setEndHour(n);
                  }}
                >
                  {HOURS.map(h => <option key={h} value={String(h)}>{formatHourLabel(h)}</option>)}
                </select>
              </label>
              <span className="rpt-range-sep">to</span>
              <label className="rpt-control">
                <span className="rpt-sr">Last hour</span>
                <select
                  value={String(endHour)}
                  onChange={e => {
                    const n = Number(e.target.value);
                    setEndHour(n);
                    if (n < startHour) setStartHour(n);
                  }}
                >
                  {HOURS.map(h => <option key={h} value={String(h)}>{formatHourLabel(h)}</option>)}
                </select>
              </label>
            </div>
          </div>

          <div className="vc-sheet-actions">
            <button
              type="button"
              className="vc-btn secondary"
              onClick={() => { setStartHour(0); setEndHour(23); }}
              disabled={!filtersOn}
            >
              Reset hours
            </button>
            <button type="button" className="vc-btn primary" onClick={() => setSheet(null)}>Done</button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
};

export default AdminV2ReportsDayOverDay;
