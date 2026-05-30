import React, { useState, useEffect, useRef, useCallback } from 'react';
import Chart from 'chart.js/auto';
import zoomPlugin from 'chartjs-plugin-zoom';
import config, { apiFetch } from '../../config';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  XIcon,
} from '../../components/Icons';

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
  const [selectedDates, setSelectedDates] = useState([]);
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

  const toggleDate = useCallback((dateStr) => {
    setSelectedDates(prev => {
      if (prev.includes(dateStr)) {
        return prev.filter(d => d !== dateStr);
      }
      if (prev.length >= 7) return prev;
      return [...prev, dateStr].sort();
    });
  }, []);

  const removeDate = useCallback((dateStr) => {
    setSelectedDates(prev => prev.filter(d => d !== dateStr));
  }, []);

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
      const color = DATE_COLORS[idx % DATE_COLORS.length];
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
            title: { display: true, text: 'Hour of Day', font: { size: 12 }, color: '#8b949e' },
            grid: { color: 'rgba(255,255,255,0.06)' },
            ticks: {
              stepSize: agg === 'hour' ? 1 : agg === '15min' ? 0.5 : undefined,
              autoSkip: true,
              maxTicksLimit: 24,
              color: '#8b949e',
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
              color: '#8b949e',
            },
            grid: { color: 'rgba(255,255,255,0.06)' },
            ticks: { color: '#8b949e', font: { size: 11 } },
          },
        },
        plugins: {
          legend: {
            position: 'top',
            labels: { usePointStyle: true, padding: 15, font: { size: 12 }, color: '#e6edf3' },
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
  }, [reportData, startHour, endHour]);

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
        <div className="dod-vital-select">
          <label className="dod-label">Vital Type</label>
          <select
            value={vitalType}
            onChange={e => setVitalType(e.target.value)}
            className="dod-select"
          >
            {VITAL_TYPES.map(vt => (
              <option key={vt.value} value={vt.value}>{vt.label}</option>
            ))}
          </select>
        </div>

        <div className="dod-vital-select">
          <label className="dod-label">Aggregation</label>
          <select
            value={aggregation}
            onChange={e => setAggregation(e.target.value)}
            className="dod-select"
          >
            <option value="hour">Hourly</option>
            <option value="15min">15 min</option>
            <option value="5min">5 min</option>
            <option value="none">Raw</option>
          </select>
        </div>

        <div className="dod-hour-range">
          <label className="dod-label">Hour Range</label>
          <div className="dod-hour-selects">
            <select
              value={startHour}
              onChange={e => {
                const v = Number(e.target.value);
                setStartHour(v);
                if (v > endHour) setEndHour(v);
              }}
              className="dod-select dod-select-hour"
            >
              {HOUR_LABELS.map((lbl, i) => (
                <option key={i} value={i}>{lbl}</option>
              ))}
            </select>
            <span className="dod-hour-sep">to</span>
            <select
              value={endHour}
              onChange={e => {
                const v = Number(e.target.value);
                setEndHour(v);
                if (v < startHour) setStartHour(v);
              }}
              className="dod-select dod-select-hour"
            >
              {HOUR_LABELS.map((lbl, i) => (
                <option key={i} value={i}>{lbl}</option>
              ))}
            </select>
            {(startHour !== 0 || endHour !== 23) && (
              <button
                className="dod-hour-reset"
                onClick={() => { setStartHour(0); setEndHour(23); }}
              >
                Reset
              </button>
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
              const isSelected = selectedDates.includes(ds);
              const colorIdx = isSelected ? selectedDates.indexOf(ds) : -1;
              const bgColor = colorIdx >= 0 ? DATE_COLORS[colorIdx % DATE_COLORS.length] : undefined;

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
          {selectedDates.map((ds, idx) => {
            const color = DATE_COLORS[idx % DATE_COLORS.length];
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
          <div className="dod-error">{error}</div>
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
