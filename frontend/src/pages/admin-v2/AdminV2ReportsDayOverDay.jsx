/*
 * Smart Home Health Hub
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
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Chart from 'chart.js/auto';
import zoomPlugin from 'chartjs-plugin-zoom';
import config, { apiFetch } from '../../config';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  XIcon,
} from '../../components/Icons';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

Chart.register(zoomPlugin);

const VITAL_TYPES = [
  { value: 'spo2', label: 'SpO2', unit: '%' },
  { value: 'heart_rate', label: 'Heart Rate', unit: 'bpm' },
  { value: 'respiratory_rate', label: 'Respiratory Rate', unit: '/min' },
  { value: 'blood_pressure', label: 'Blood Pressure (MAP)', unit: 'mmHg' },
  { value: 'temperature', label: 'Temperature', unit: '°F' },
  { value: 'weight', label: 'Weight', unit: 'lbs' },
];

const DATE_COLORS = [
  '#e91e63',
  '#3f51b5',
  '#4CAF50',
  '#FF9800',
  '#9C27B0',
  '#00BCD4',
  '#FF5722',
];

const SOURCE_LABELS = {
  pulse_ox: 'Pulse Ox',
  vent: 'Ventilator',
  manual: 'Manual',
  none: 'No Data',
};

const HOUR_LABELS = [
  '12a','1a','2a','3a','4a','5a','6a','7a','8a','9a','10a','11a',
  '12p','1p','2p','3p','4p','5p','6p','7p','8p','9p','10p','11p',
];

function formatDateLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

function toDateStr(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const AdminV2ReportsDayOverDay = ({ patientId }) => {
  // Source of truth: each entry remembers the color slot it was assigned at
  // selection time, so a date keeps its color regardless of sort order or
  // later selections. `selectedDates` (sorted) is derived for queries/display.
  const [selection, setSelection] = useState([]); // [{ date, color }]
  const [vitalType, setVitalType] = useState('spo2');
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [startHour, setStartHour] = useState(0);
  const [endHour, setEndHour] = useState(23);
  const [aggregation, setAggregation] = useState('hour');

  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());

  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const fetchTimer = useRef(null);

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // Sorted date strings for the API query and chip ordering.
  const selectedDates = useMemo(
    () => selection.map(s => s.date).sort(),
    [selection],
  );
  // date -> color slot index (stable across selections).
  const colorByDate = useMemo(
    () => Object.fromEntries(selection.map(s => [s.date, s.color])),
    [selection],
  );

  const toggleDate = useCallback((dateStr) => {
    setSelection(prev => {
      if (prev.some(s => s.date === dateStr)) {
        return prev.filter(s => s.date !== dateStr);
      }
      if (prev.length >= 7) return prev;
      // Reuse the lowest free color slot so the next pick takes red if red
      // was just freed; otherwise grow to the next color.
      const used = new Set(prev.map(s => s.color));
      let color = 0;
      while (used.has(color)) color++;
      return [...prev, { date: dateStr, color }];
    });
  }, []);

  const removeDate = useCallback((dateStr) => {
    setSelection(prev => prev.filter(s => s.date !== dateStr));
  }, []);

  const colorFor = useCallback(
    (dateStr) => DATE_COLORS[(colorByDate[dateStr] ?? 0) % DATE_COLORS.length],
    [colorByDate],
  );

  const prevMonth = useCallback(() => {
    setCalMonth(prev => {
      if (prev === 0) {
        setCalYear(y => y - 1);
        return 11;
      }
      return prev - 1;
    });
  }, []);

  const nextMonth = useCallback(() => {
    const maxYear = now.getFullYear();
    const maxMonth = now.getMonth();
    setCalMonth(prev => {
      const newMonth = prev === 11 ? 0 : prev + 1;
      const newYear = prev === 11 ? calYear + 1 : calYear;
      if (newYear > maxYear || (newYear === maxYear && newMonth > maxMonth)) {
        return prev;
      }
      if (prev === 11) setCalYear(y => y + 1);
      return newMonth;
    });
  }, [calYear, now]);

  // Fetch data when dates or vital type change
  useEffect(() => {
    if (fetchTimer.current) clearTimeout(fetchTimer.current);

    if (selectedDates.length === 0) {
      setReportData(null);
      return;
    }

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

  // Build chart
  useEffect(() => {
    if (!reportData || !chartRef.current) return;

    if (chartInstance.current) {
      chartInstance.current.destroy();
      chartInstance.current = null;
    }

    const days = reportData.days || [];
    if (days.length === 0) return;

    const agg = reportData.aggregation || 'hour';
    const datasets = days.map((day, idx) => {
      const color = DATE_COLORS[(colorByDate[day.date] ?? idx) % DATE_COLORS.length];
      const hourly = day.hourly || [];
      const points = hourly
        .filter(h => h.avg !== null && h.avg !== undefined && h.hour >= startHour && h.hour < endHour + 1)
        .map(h => ({ x: h.hour, y: h.avg }));
      const isSparse = points.length <= 4;
      const isRaw = agg === 'none';

      return {
        label: formatDateLabel(day.date),
        data: points,
        borderColor: color,
        backgroundColor: color + '33',
        borderWidth: isRaw ? 1 : 2,
        pointRadius: isSparse ? 5 : 0,
        pointHoverRadius: 5,
        pointHitRadius: 8,
        pointBackgroundColor: color,
        fill: false,
        tension: isSparse ? 0 : 0.3,
        spanGaps: true,
      };
    });

    // Compute y-axis range
    let allVals = [];
    datasets.forEach(ds => ds.data.forEach(p => allVals.push(p.y)));

    let yMin, yMax;
    if (allVals.length === 0) {
      yMin = 0;
      yMax = 100;
    } else {
      const dataMin = Math.min(...allVals);
      const dataMax = Math.max(...allVals);
      const padding = Math.max((dataMax - dataMin) * 0.1, 1);

      if (reportData.vital_type === 'spo2') {
        yMin = Math.max(0, Math.min(dataMin - padding, 85));
        yMax = 100;
      } else {
        yMin = Math.max(0, dataMin - padding);
        yMax = dataMax + padding;
      }
    }

    // Canvas can't resolve CSS variables (or color-mix), so read the theme
    // colors off the DOM and pass real hex strings to Chart.js. Keeps the
    // chart legible in both dark and light themes.
    const themeStyle = getComputedStyle(document.documentElement);
    const cssVar = (name, fallback) =>
      themeStyle.getPropertyValue(name).trim() || fallback;
    const colorFg = cssVar('--foreground', '#e6edf3');
    const colorMuted = cssVar('--muted-foreground', '#8b949e');
    const colorBorder = cssVar('--border', '#30363d');
    const colorGrid = colorBorder + '80'; // ~50% opacity for subtle gridlines

    const ctx = chartRef.current.getContext('2d');
    chartInstance.current = new Chart(ctx, {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        scales: {
          x: {
            type: 'linear',
            min: startHour,
            max: endHour,
            title: { display: true, text: 'Hour of Day', font: { size: 12 }, color: colorMuted },
            grid: { color: colorGrid },
            ticks: {
              stepSize: agg === 'hour' ? 1 : agg === '15min' ? 0.5 : undefined,
              autoSkip: true,
              maxTicksLimit: 24,
              color: colorMuted,
              font: { size: 11 },
              maxRotation: 0,
              callback: (val) => {
                const h = Math.floor(val);
                const m = Math.round((val - h) * 60);
                if (m === 0) return HOUR_LABELS[h] || '';
                const period = h >= 12 ? 'p' : 'a';
                const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
                return `${h12}:${String(m).padStart(2, '0')}${period}`;
              },
            },
          },
          y: {
            type: 'linear',
            min: yMin,
            max: yMax,
            title: {
              display: true,
              text: `${VITAL_TYPES.find(v => v.value === reportData.vital_type)?.label || ''} (${reportData.unit || ''})`,
              font: { size: 12 },
              color: colorMuted,
            },
            grid: { color: colorGrid },
            ticks: { color: colorMuted, font: { size: 11 } },
          },
        },
        plugins: {
          legend: {
            position: 'top',
            labels: { usePointStyle: true, padding: 15, font: { size: 12 }, color: colorFg },
          },
          tooltip: {
            callbacks: {
              title: (items) => {
                if (items.length > 0) {
                  const h = items[0].parsed.x;
                  return HOUR_LABELS[h] ? HOUR_LABELS[h].replace('a', ' AM').replace('p', ' PM') : `Hour ${h}`;
                }
                return '';
              },
              label: (item) => {
                const dayData = days[item.datasetIndex];
                const src = dayData ? SOURCE_LABELS[dayData.source] || dayData.source : '';
                return `${item.dataset.label}: ${item.parsed.y} ${reportData.unit || ''}  (${src})`;
              },
            },
          },
          zoom: {
            pan: { enabled: true, mode: 'x' },
            zoom: {
              wheel: { enabled: true },
              pinch: { enabled: true },
              mode: 'x',
            },
            limits: {
              x: { min: startHour, max: endHour, minRange: 1 },
            },
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
  }, [reportData, startHour, endHour, colorByDate]);

  // Calendar grid
  const numDays = daysInMonth(calYear, calMonth);
  const startDay = firstDayOfMonth(calYear, calMonth);
  const calendarCells = [];
  for (let i = 0; i < startDay; i++) {
    calendarCells.push(null);
  }
  for (let d = 1; d <= numDays; d++) {
    calendarCells.push(d);
  }

  const monthLabel = new Date(calYear, calMonth, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const sourceByDate = {};
  if (reportData?.days) {
    reportData.days.forEach(d => { sourceByDate[d.date] = d.source; });
  }

  return (
    <div className="dod-report">
      <div className="dod-controls">
        <div className="dod-vital-select tw">
          <label className="dod-label">Vital Type</label>
          <Select value={vitalType} onValueChange={setVitalType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {VITAL_TYPES.map(vt => (
                <SelectItem key={vt.value} value={vt.value}>{vt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="dod-vital-select tw">
          <label className="dod-label">Aggregation</label>
          <Select value={aggregation} onValueChange={setAggregation}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hour">Hourly</SelectItem>
              <SelectItem value="15min">15 min</SelectItem>
              <SelectItem value="5min">5 min</SelectItem>
              <SelectItem value="none">Raw</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="dod-hour-range tw">
          <label className="dod-label">Hour Range</label>
          <div className="dod-hour-selects">
            <Select
              value={String(startHour)}
              onValueChange={(v) => {
                const n = Number(v);
                setStartHour(n);
                if (n > endHour) setEndHour(n);
              }}
            >
              <SelectTrigger className="w-[90px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {HOUR_LABELS.map((lbl, i) => (
                  <SelectItem key={i} value={String(i)}>{lbl}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="dod-hour-sep">to</span>
            <Select
              value={String(endHour)}
              onValueChange={(v) => {
                const n = Number(v);
                setEndHour(n);
                if (n < startHour) setStartHour(n);
              }}
            >
              <SelectTrigger className="w-[90px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {HOUR_LABELS.map((lbl, i) => (
                  <SelectItem key={i} value={String(i)}>{lbl}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(startHour !== 0 || endHour !== 23) && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setStartHour(0); setEndHour(23); }}
              >
                Reset
              </Button>
            )}
          </div>
        </div>

        <div className="dod-calendar">
          <div className="dod-calendar-header">
            <button className="dod-cal-nav" onClick={prevMonth}><ChevronLeftIcon size={16} /></button>
            <span className="dod-cal-month">{monthLabel}</span>
            <button className="dod-cal-nav" onClick={nextMonth}><ChevronRightIcon size={16} /></button>
          </div>
          <div className="dod-calendar-weekdays">
            {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
              <span key={d} className="dod-weekday">{d}</span>
            ))}
          </div>
          <div className="dod-calendar-grid">
            {calendarCells.map((day, i) => {
              if (day === null) {
                return <span key={`empty-${i}`} className="dod-cal-cell dod-cal-empty" />;
              }
              const ds = toDateStr(calYear, calMonth, day);
              const isFuture = ds > todayStr;
              const isSelected = colorByDate[ds] !== undefined;
              const bgColor = isSelected ? colorFor(ds) : undefined;

              return (
                <button
                  key={ds}
                  className={`dod-cal-cell${isSelected ? ' selected' : ''}${isFuture ? ' disabled' : ''}${ds === todayStr ? ' today' : ''}`}
                  style={isSelected ? { backgroundColor: bgColor, borderColor: bgColor, color: '#fff' } : undefined}
                  disabled={isFuture}
                  onClick={() => toggleDate(ds)}
                >
                  {day}
                </button>
              );
            })}
          </div>
          {selectedDates.length >= 7 && (
            <p className="dod-cal-limit">Maximum 7 dates selected</p>
          )}
        </div>
      </div>

      {selectedDates.length > 0 && (
        <div className="dod-chips">
          {selectedDates.map((ds) => {
            const color = colorFor(ds);
            const src = sourceByDate[ds];
            return (
              <span key={ds} className="dod-chip" style={{ borderColor: color }}>
                <span className="dod-chip-dot" style={{ backgroundColor: color }} />
                <span className="dod-chip-label">{formatDateLabel(ds)}</span>
                {src && src !== 'none' && (
                  <span className="dod-chip-source">{SOURCE_LABELS[src] || src}</span>
                )}
                <button className="dod-chip-remove" onClick={() => removeDate(ds)}>
                  <XIcon size={12} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      <div className="dod-chart-area">
        {loading && (
          <div className="dod-loading">Loading...</div>
        )}
        {error && (
          <div className="tw"><Alert variant="destructive">{error}</Alert></div>
        )}
        {!loading && !error && selectedDates.length === 0 && (
          <div className="dod-empty">
            Select dates from the calendar and a vital type to compare day-over-day trends.
          </div>
        )}
        {!loading && !error && selectedDates.length > 0 && reportData && (
          <div className="dod-chart-container">
            <canvas ref={chartRef} />
          </div>
        )}
        {!loading && !error && selectedDates.length > 0 && !reportData && (
          <div className="dod-empty">No data available for the selected dates.</div>
        )}
      </div>
    </div>
  );
};

export default AdminV2ReportsDayOverDay;
