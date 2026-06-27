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
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import annotationPlugin from 'chartjs-plugin-annotation';
import zoomPlugin from 'chartjs-plugin-zoom';
import config from '../../config';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CalendarIcon,
} from '../../components/Icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/alert';
import { useChartColors } from '../../hooks/useChartColors';

Chart.register(annotationPlugin, zoomPlugin);

const EVENT_TYPES = {
  medications: { label: 'Medications', color: '#2196F3', borderDash: [] },
  care_tasks: { label: 'Care Tasks', color: '#4CAF50', borderDash: [] },
  nutrition_intake: { label: 'Nutrition In', color: '#FF9800', borderDash: [] },
  nutrition_output: { label: 'Nutrition Out', color: '#9C27B0', borderDash: [] },
  vitals: { label: 'Vitals', color: '#009688', borderDash: [4, 4] },
  alerts: { label: 'Alerts', color: '#F44336', borderDash: [] },
};

// Zoom presets in minutes
const ZOOM_PRESETS = [
  { label: '24h', minutes: 1440 },
  { label: '6h', minutes: 360 },
  { label: '1h', minutes: 60 },
  { label: '30m', minutes: 30 },
  { label: '15m', minutes: 15 },
];

const AdminV2MonitoringTimeline = () => {
  const chart = useChartColors();
  const { selectedPatient } = useAdminPatient();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [timelineData, setTimelineData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activePreset, setActivePreset] = useState('24h');
  const [showSpo2, setShowSpo2] = useState(true);
  const [showBpm, setShowBpm] = useState(true);
  const [visibleLayers, setVisibleLayers] = useState({
    medications: true,
    care_tasks: true,
    nutrition_intake: true,
    nutrition_output: true,
    vitals: true,
    alerts: true,
  });

  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const chartContainerRef = useRef(null);

  const formatDateForApi = (date) => date.toISOString().split('T')[0];
  const isToday = (date) => date.toDateString() === new Date().toDateString();

  const goToPreviousDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d);
  };
  const goToNextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d);
  };
  const goToToday = () => setSelectedDate(new Date());

  const formatDisplayDate = (date) => {
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Fetch timeline data
  const fetchTimeline = useCallback(async () => {
    if (!selectedPatient) return;
    setLoading(true);
    setError(null);
    try {
      const dateParam = formatDateForApi(selectedDate);
      const response = await fetch(
        `${config.apiUrl}/api/monitoring/timeline?patient_id=${selectedPatient.id}&target_date=${dateParam}`,
        { credentials: 'include' }
      );
      if (!response.ok) throw new Error('Failed to fetch timeline data');
      const data = await response.json();
      setTimelineData(data);
    } catch (err) {
      console.error('Timeline fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedPatient, selectedDate]);

  useEffect(() => { fetchTimeline(); }, [fetchTimeline]);

  // Build event marker label
  const getMarkerLabel = (type, item) => {
    switch (type) {
      case 'medications': return `${item.name} ${item.dose}`;
      case 'care_tasks': return item.name;
      case 'nutrition_intake': return `${item.item_name} (${item.amount}${item.amount_unit})`;
      case 'nutrition_output': {
        const parts = [item.output_type];
        if (item.is_diaper) {
          if (item.diaper_wetness) parts.push(item.diaper_wetness);
          if (item.diaper_soiled) parts.push('soiled');
        }
        if (item.consistency) parts.push(item.consistency);
        return parts.join(' / ');
      }
      case 'vitals': return `${item.vital_type}: ${item.value}${item.unit || ''}`;
      default: return '';
    }
  };

  // Apply a zoom preset centered on current view or current time
  const applyZoomPreset = useCallback((minutes) => {
    const chart = chartInstance.current;
    if (!chart || !timelineData) return;

    const dateStr = timelineData.date;
    const dayStart = new Date(`${dateStr}T00:00:00`).getTime();
    const dayEnd = new Date(`${dateStr}T23:59:59`).getTime();

    if (minutes >= 1440) {
      // Full day - reset zoom
      chart.resetZoom();
      setActivePreset('24h');
      return;
    }

    const rangeMs = minutes * 60 * 1000;

    // Center on current view center, or current time if today
    let center;
    const currentMin = chart.scales.x.min;
    const currentMax = chart.scales.x.max;
    if (isToday(selectedDate)) {
      center = Date.now();
    } else {
      center = (currentMin + currentMax) / 2;
    }

    let newMin = center - rangeMs / 2;
    let newMax = center + rangeMs / 2;

    // Clamp to day boundaries
    if (newMin < dayStart) {
      newMin = dayStart;
      newMax = dayStart + rangeMs;
    }
    if (newMax > dayEnd) {
      newMax = dayEnd;
      newMin = Math.max(dayStart, dayEnd - rangeMs);
    }

    chart.zoomScale('x', { min: newMin, max: newMax }, 'default');
    chart.update('none');

    // Find matching preset label
    const preset = ZOOM_PRESETS.find(p => p.minutes === minutes);
    setActivePreset(preset ? preset.label : null);
  }, [timelineData, selectedDate]);

  const handleResetZoom = useCallback(() => {
    if (chartInstance.current) {
      chartInstance.current.resetZoom();
      setActivePreset('24h');
    }
  }, []);

  // Build and render chart
  useEffect(() => {
    if (!timelineData || !chartRef.current) return;

    if (chartInstance.current) {
      chartInstance.current.destroy();
      chartInstance.current = null;
    }

    const dateStr = timelineData.date;
    const dayStart = new Date(`${dateStr}T00:00:00`);
    const dayEnd = new Date(`${dateStr}T23:59:59`);

    // SpO2 and BPM datasets — filter out -1 (invalid/disconnected reads)
    const spo2Data = timelineData.pulse_ox
      .filter(p => p.spo2 != null && p.spo2 !== -1)
      .map(p => ({ x: new Date(p.ts), y: p.spo2 }));
    const bpmData = timelineData.pulse_ox
      .filter(p => p.bpm != null && p.bpm !== -1)
      .map(p => ({ x: new Date(p.ts), y: p.bpm }));

    // Build annotation lines for events
    const annotations = {};

    const addEventAnnotations = (type, items) => {
      if (!visibleLayers[type]) return;
      const cfg = EVENT_TYPES[type];
      items.forEach((item, i) => {
        const ts = new Date(item.ts);
        const label = getMarkerLabel(type, item);
        annotations[`${type}_${i}`] = {
          type: 'line',
          xMin: ts,
          xMax: ts,
          borderColor: cfg.color,
          borderWidth: 2,
          borderDash: cfg.borderDash,
          label: {
            display: true,
            content: label.length > 30 ? label.substring(0, 28) + '...' : label,
            position: 'start',
            backgroundColor: cfg.color,
            color: '#fff',
            font: { size: 10, weight: 'bold' },
            padding: { top: 2, bottom: 2, left: 4, right: 4 },
            borderRadius: 3,
            rotation: -90,
            yAdjust: -10,
          },
        };
      });
    };

    addEventAnnotations('medications', timelineData.medications);
    addEventAnnotations('care_tasks', timelineData.care_tasks);
    addEventAnnotations('nutrition_intake', timelineData.nutrition_intake);
    addEventAnnotations('nutrition_output', timelineData.nutrition_output);
    addEventAnnotations('vitals', timelineData.vitals);

    // Alert periods as box annotations
    if (visibleLayers.alerts) {
      timelineData.alerts.forEach((alert, i) => {
        if (alert.start) {
          const start = new Date(alert.start);
          const end = alert.end ? new Date(alert.end) : new Date(start.getTime() + 60000);
          annotations[`alert_box_${i}`] = {
            type: 'box',
            xMin: start,
            xMax: end,
            backgroundColor: 'rgba(244, 67, 54, 0.15)',
            borderColor: 'rgba(244, 67, 54, 0.4)',
            borderWidth: 1,
            label: {
              display: true,
              content: `Alert${alert.spo2_alarm ? ' SpO2' : ''}${alert.hr_alarm ? ' HR' : ''}`,
              position: 'start',
              backgroundColor: 'rgba(244, 67, 54, 0.8)',
              color: '#fff',
              font: { size: 9 },
              padding: 2,
            },
          };
        }
      });
    }

    // Compute static y-axis ranges from all data with small padding
    const spo2Min = spo2Data.length > 0 ? Math.min(...spo2Data.map(p => p.y)) : 90;
    const spo2Max = spo2Data.length > 0 ? Math.max(...spo2Data.map(p => p.y)) : 100;
    const bpmMin = bpmData.length > 0 ? Math.min(...bpmData.map(p => p.y)) : 60;
    const bpmMax = bpmData.length > 0 ? Math.max(...bpmData.map(p => p.y)) : 120;

    const spo2Padding = Math.max(Math.round((spo2Max - spo2Min) * 0.05), 1);
    const bpmPadding = Math.max(Math.round((bpmMax - bpmMin) * 0.05), 2);

    const ctx = chartRef.current.getContext('2d');
    chartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [
          ...(showSpo2 ? [{
            label: 'SpO2 (%)',
            data: spo2Data,
            borderColor: '#e91e63',
            backgroundColor: 'rgba(233, 30, 99, 0.1)',
            borderWidth: 1.5,
            pointRadius: 0,
            pointHitRadius: 5,
            fill: false,
            yAxisID: 'ySpO2',
            tension: 0.2,
          }] : []),
          ...(showBpm ? [{
            label: 'BPM',
            data: bpmData,
            borderColor: '#3f51b5',
            backgroundColor: 'rgba(63, 81, 181, 0.1)',
            borderWidth: 1.5,
            pointRadius: 0,
            pointHitRadius: 5,
            fill: false,
            yAxisID: 'yBPM',
            tension: 0.2,
          }] : []),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        scales: {
          x: {
            type: 'time',
            min: dayStart,
            max: dayEnd,
            time: {
              displayFormats: {
                minute: 'h:mm a',
                hour: 'ha',
              },
              tooltipFormat: 'h:mm:ss a',
            },
            title: { display: true, text: 'Time', font: { size: 12 }, color: chart.axis },
            grid: { color: chart.grid },
            ticks: { maxRotation: 0, font: { size: 11 }, color: chart.axis, autoSkip: true, maxTicksLimit: 24 },
          },
          ySpO2: {
            type: 'linear',
            display: showSpo2,
            position: 'left',
            min: Math.max(0, spo2Min - spo2Padding),
            max: Math.min(100, spo2Max + spo2Padding),
            title: { display: true, text: 'SpO2 (%)', color: '#e91e63', font: { size: 12 } },
            ticks: { color: '#e91e63' },
            grid: { color: 'rgba(233, 30, 99, 0.08)' },
          },
          yBPM: {
            type: 'linear',
            display: showBpm,
            position: 'right',
            min: Math.max(0, bpmMin - bpmPadding),
            max: bpmMax + bpmPadding,
            title: { display: true, text: 'BPM', color: '#3f51b5', font: { size: 12 } },
            ticks: { color: '#3f51b5' },
            grid: { drawOnChartArea: false },
          },
        },
        plugins: {
          legend: {
            position: 'top',
            labels: { usePointStyle: true, padding: 15, font: { size: 12 }, color: chart.foreground },
          },
          tooltip: {
            callbacks: {
              title: (items) => {
                if (items[0]) {
                  const d = new Date(items[0].parsed.x);
                  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
                }
                return '';
              },
            },
          },
          annotation: { annotations },
          zoom: {
            pan: {
              enabled: true,
              mode: 'x',
              modifierKey: null,
            },
            zoom: {
              wheel: { enabled: true, modifierKey: null },
              pinch: { enabled: true },
              mode: 'x',
              onZoom: () => setActivePreset(null),
            },
            limits: {
              x: { min: dayStart.getTime(), max: dayEnd.getTime(), minRange: 5 * 60 * 1000 },
            },
          },
        },
      },
    });

    setActivePreset('24h');

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
    };
  }, [timelineData, visibleLayers, selectedDate, showSpo2, showBpm, chart.grid, chart.axis, chart.foreground]);

  const toggleLayer = (key) => {
    setVisibleLayers(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Event counts for summary
  const getEventCount = (type) => {
    if (!timelineData) return 0;
    return (timelineData[type] || []).length;
  };

  if (!selectedPatient) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>
        Select a patient from the sidebar to view the timeline.
      </div>
    );
  }

  return (
    <div style={{ padding: '0' }}>
      {/* Date Navigation - matches /care/schedule */}
      <div className="admin-v2-schedule-nav tw">
        <Button variant="secondary" size="icon" onClick={goToPreviousDay} title="Previous Day">
          <ChevronLeftIcon size={20} />
        </Button>

        <div className="admin-v2-schedule-date">
          <CalendarIcon size={18} />
          <span>{formatDisplayDate(selectedDate)}</span>
          {isToday(selectedDate) && (
            <span className="admin-v2-today-badge">Today</span>
          )}
        </div>

        <Button variant="secondary" size="icon" onClick={goToNextDay} title="Next Day">
          <ChevronRightIcon size={20} />
        </Button>

        {!isToday(selectedDate) && (
          <Button variant="secondary" size="sm" className="ml-4" onClick={goToToday}>
            Go to Today
          </Button>
        )}

        <Input
          type="date"
          value={formatDateForApi(selectedDate)}
          onChange={(e) => setSelectedDate(new Date(e.target.value + 'T12:00:00'))}
          className="w-auto"
        />
      </div>

      {/* Event Layer Toggles + Zoom Controls */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: '1rem',
        padding: '0.75rem 1rem', background: 'var(--card)', borderRadius: 8, border: '1px solid var(--border)',
        alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {/* Dataset toggles */}
          <button
            onClick={() => setShowSpo2(prev => !prev)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 600,
              border: '2px solid #e91e63',
              background: showSpo2 ? '#e91e63' : 'transparent',
              color: showSpo2 ? '#fff' : '#e91e63',
              cursor: 'pointer', transition: 'all 0.15s',
              opacity: showSpo2 ? 1 : 0.6,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: showSpo2 ? '#fff' : '#e91e63', display: 'inline-block' }} />
            SpO2
          </button>
          <button
            onClick={() => setShowBpm(prev => !prev)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 600,
              border: '2px solid #3f51b5',
              background: showBpm ? '#3f51b5' : 'transparent',
              color: showBpm ? '#fff' : '#3f51b5',
              cursor: 'pointer', transition: 'all 0.15s',
              opacity: showBpm ? 1 : 0.6,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: showBpm ? '#fff' : '#3f51b5', display: 'inline-block' }} />
            BPM
          </button>

          <span style={{ width: 1, height: 20, background: 'var(--border)', display: 'inline-block' }} />

          {/* Event marker toggles */}
          {Object.entries(EVENT_TYPES).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => toggleLayer(key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 600,
                border: `2px solid ${cfg.color}`,
                background: visibleLayers[key] ? cfg.color : 'transparent',
                color: visibleLayers[key] ? '#fff' : cfg.color,
                cursor: 'pointer', transition: 'all 0.15s',
                opacity: visibleLayers[key] ? 1 : 0.6,
              }}
            >
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: visibleLayers[key] ? '#fff' : cfg.color,
                display: 'inline-block'
              }} />
              {cfg.label}
              {timelineData && <span style={{ opacity: 0.8, marginLeft: 2 }}>({getEventCount(key)})</span>}
            </button>
          ))}
        </div>

        {/* Zoom presets */}
        <div className="tw" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--muted-foreground)', marginRight: 4 }}>Zoom:</span>
          {ZOOM_PRESETS.map(p => (
            <Button
              key={p.label}
              size="sm"
              variant={activePreset === p.label ? 'default' : 'secondary'}
              onClick={() => applyZoomPreset(p.minutes)}
            >
              {p.label}
            </Button>
          ))}
          <Button
            size="sm"
            variant="secondary"
            onClick={handleResetZoom}
            title="Reset zoom to full day"
          >
            Reset
          </Button>
        </div>
      </div>

      {/* Zoom hint */}
      <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 8, paddingLeft: 4 }}>
        Scroll to zoom &middot; Click and drag to pan
      </div>

      {/* Chart */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted-foreground)' }}>Loading timeline data...</div>
      ) : error ? (
        <div className="tw" style={{ padding: '0 0 1rem' }}><Alert variant="destructive">{error}</Alert></div>
      ) : !timelineData ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--muted-foreground)' }}>No data available.</div>
      ) : (
        <div
          ref={chartContainerRef}
          style={{
            border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card)',
            padding: '12px 8px',
            height: 440,
            position: 'relative',
          }}
        >
          <canvas ref={chartRef} />
        </div>
      )}

      {/* Event Details Summary */}
      {timelineData && !loading && (
        <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          {visibleLayers.medications && timelineData.medications.length > 0 && (
            <EventSummaryCard title="Medications" color={EVENT_TYPES.medications.color} items={timelineData.medications.map(m => ({
              time: new Date(m.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
              text: `${m.name} - ${m.dose}`,
              subtext: m.status !== 'on-time' ? m.status : null,
            }))} />
          )}
          {visibleLayers.care_tasks && timelineData.care_tasks.length > 0 && (
            <EventSummaryCard title="Care Tasks" color={EVENT_TYPES.care_tasks.color} items={timelineData.care_tasks.map(t => ({
              time: new Date(t.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
              text: t.name,
              subtext: t.category || null,
            }))} />
          )}
          {visibleLayers.nutrition_intake && timelineData.nutrition_intake.length > 0 && (
            <EventSummaryCard title="Nutrition In" color={EVENT_TYPES.nutrition_intake.color} items={timelineData.nutrition_intake.map(n => ({
              time: new Date(n.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
              text: `${n.item_name} - ${n.amount}${n.amount_unit}`,
              subtext: n.calories ? `${n.calories} cal` : null,
            }))} />
          )}
          {visibleLayers.nutrition_output && timelineData.nutrition_output.length > 0 && (
            <EventSummaryCard title="Nutrition Out" color={EVENT_TYPES.nutrition_output.color} items={timelineData.nutrition_output.map(o => ({
              time: new Date(o.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
              text: getMarkerLabel('nutrition_output', o),
              subtext: o.notes || null,
            }))} />
          )}
          {visibleLayers.vitals && timelineData.vitals.length > 0 && (
            <EventSummaryCard title="Vitals" color={EVENT_TYPES.vitals.color} items={timelineData.vitals.map(v => ({
              time: new Date(v.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
              text: `${v.vital_type}${v.vital_group ? ` (${v.vital_group})` : ''}: ${v.value}${v.unit || ''}`,
              subtext: v.notes || null,
            }))} />
          )}
          {visibleLayers.alerts && timelineData.alerts.length > 0 && (
            <EventSummaryCard title="Alerts" color={EVENT_TYPES.alerts.color} items={timelineData.alerts.map(a => ({
              time: new Date(a.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
              text: `${a.spo2_alarm ? 'SpO2 Alarm' : ''}${a.hr_alarm ? 'HR Alarm' : ''}${!a.spo2_alarm && !a.hr_alarm ? 'Alert' : ''}`,
              subtext: a.acknowledged ? 'Acknowledged' : 'Unacknowledged',
            }))} />
          )}
        </div>
      )}
    </div>
  );
};

// Compact card showing event list - dark theme
const EventSummaryCard = ({ title, color, items }) => (
  <div style={{
    border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden',
    background: 'var(--card)',
  }}>
    <div style={{
      padding: '8px 12px', background: color, color: '#fff',
      fontSize: 13, fontWeight: 700,
    }}>
      {title} ({items.length})
    </div>
    <div style={{ maxHeight: 200, overflowY: 'auto' }}>
      {items.map((item, i) => (
        <div key={i} style={{
          padding: '6px 12px', fontSize: 12, borderBottom: '1px solid var(--secondary)',
          display: 'flex', gap: 8, alignItems: 'baseline',
        }}>
          <span style={{ color: 'var(--muted-foreground)', whiteSpace: 'nowrap', fontWeight: 600, minWidth: 60 }}>{item.time}</span>
          <span style={{ color: 'var(--foreground)' }}>
            {item.text}
            {item.subtext && <span style={{ color: 'var(--muted-foreground)', marginLeft: 4, fontSize: 11 }}>({item.subtext})</span>}
          </span>
        </div>
      ))}
    </div>
  </div>
);

export default AdminV2MonitoringTimeline;
