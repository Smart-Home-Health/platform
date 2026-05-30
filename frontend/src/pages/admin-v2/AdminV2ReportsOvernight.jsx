import React, { useState, useEffect, useRef, useCallback } from 'react';
import Chart from 'chart.js/auto';
import annotationPlugin from 'chartjs-plugin-annotation';
import config, { apiFetch } from '../../config';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import AdminV2Layout from './AdminV2Layout';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CheckIcon,
  XIcon,
  ClockIcon,
  AlertIcon,
} from '../../components/Icons';
import './AdminV2.css';

Chart.register(annotationPlugin);

const HOUR_LABELS = [
  '12a','1a','2a','3a','4a','5a','6a','7a','8a','9a','10a','11a',
  '12p','1p','2p','3p','4p','5p','6p','7p','8p','9p','10p','11p',
];

function formatDateLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
}

function StatusIcon({ status }) {
  if (status === 'on_time' || status === 'completed') {
    return <span className="overnight-status-icon on-time"><CheckIcon size={14} /></span>;
  }
  if (status === 'late') {
    return <span className="overnight-status-icon late"><ClockIcon size={14} /></span>;
  }
  if (status === 'skipped') {
    return <span className="overnight-status-icon skipped" title="Skipped">⊘</span>;
  }
  return <span className="overnight-status-icon missed"><XIcon size={14} /></span>;
}

const AdminV2ReportsOvernight = () => {
  const { selectedPatient } = useAdminPatient();
  const now = new Date();
  const [reportDate, setReportDate] = useState(() => {
    const d = now.getHours() < 12 ? new Date(now.getTime() - 86400000) : now;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [startHour, setStartHour] = useState(20);
  const [endHour, setEndHour] = useState(8);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  const prevDate = useCallback(() => {
    const d = new Date(reportDate + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    setReportDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }, [reportDate]);

  const nextDate = useCallback(() => {
    const d = new Date(reportDate + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    const today = new Date();
    if (d > today) return;
    setReportDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }, [reportDate]);

  useEffect(() => {
    if (!selectedPatient) return;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      patient_id: selectedPatient.id,
      report_date: reportDate,
      start_hour: startHour,
      end_hour: endHour,
    });

    apiFetch(`${config.apiUrl}/api/reports/overnight?${params}`)
      .then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || `Server error ${res.status}`);
        }
        return res.json();
      })
      .then(setData)
      .catch(e => { setError(e.message); setData(null); })
      .finally(() => setLoading(false));
  }, [selectedPatient, reportDate, startHour, endHour]);

  // Build chart
  useEffect(() => {
    if (!data?.vitals_chart?.length || !chartRef.current) return;
    if (chartInstance.current) {
      chartInstance.current.destroy();
      chartInstance.current = null;
    }

    const points = data.vitals_chart;
    const windowStart = points[0].ts;
    const windowEnd = points[points.length - 1].ts;

    const alertAnnotations = {};
    (data.alerts?.items || []).forEach((a, i) => {
      const aStart = new Date(a.start_time).getTime() / 1000;
      const aEnd = a.end_time ? new Date(a.end_time).getTime() / 1000 : windowEnd;
      alertAnnotations[`alert${i}`] = {
        type: 'box',
        xMin: aStart,
        xMax: aEnd,
        backgroundColor: 'rgba(248, 81, 73, 0.12)',
        borderColor: 'rgba(248, 81, 73, 0.3)',
        borderWidth: 1,
      };
    });

    const ctx = chartRef.current.getContext('2d');
    chartInstance.current = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'SpO2 (%)',
            data: points.map(p => ({ x: p.ts, y: p.spo2 })),
            borderColor: '#58a6ff',
            backgroundColor: '#58a6ff33',
            borderWidth: 1.5,
            pointRadius: 0,
            pointHoverRadius: 3,
            yAxisID: 'y',
            tension: 0.3,
          },
          {
            label: 'Heart Rate (bpm)',
            data: points.map(p => ({ x: p.ts, y: p.hr })),
            borderColor: '#f78166',
            backgroundColor: '#f7816633',
            borderWidth: 1.5,
            pointRadius: 0,
            pointHoverRadius: 3,
            yAxisID: 'y1',
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            type: 'linear',
            min: windowStart,
            max: windowEnd,
            grid: { color: 'rgba(255,255,255,0.06)' },
            ticks: {
              color: '#8b949e',
              font: { size: 11 },
              maxTicksLimit: 12,
              callback: (val) => {
                const d = new Date(val * 1000);
                const h = d.getHours();
                const m = d.getMinutes();
                if (m !== 0) return '';
                return HOUR_LABELS[h] || '';
              },
            },
          },
          y: {
            type: 'linear',
            position: 'left',
            min: Math.max(0, (data.vitals_summary?.spo2?.min || 90) - 5),
            max: 100,
            title: { display: true, text: 'SpO2 %', color: '#58a6ff', font: { size: 11 } },
            grid: { color: 'rgba(255,255,255,0.06)' },
            ticks: { color: '#58a6ff', font: { size: 10 } },
          },
          y1: {
            type: 'linear',
            position: 'right',
            title: { display: true, text: 'HR bpm', color: '#f78166', font: { size: 11 } },
            grid: { drawOnChartArea: false },
            ticks: { color: '#f78166', font: { size: 10 } },
          },
        },
        plugins: {
          legend: {
            labels: { usePointStyle: true, padding: 12, font: { size: 11 }, color: '#e6edf3' },
          },
          annotation: { annotations: alertAnnotations },
          tooltip: {
            callbacks: {
              title: (items) => {
                if (!items.length) return '';
                const d = new Date(items[0].parsed.x * 1000);
                return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
              },
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
  }, [data]);

  const renderContent = () => {
    if (!selectedPatient) {
      return <div className="admin-v2-monitoring-empty"><p>Select a patient from the sidebar to view the overnight report.</p></div>;
    }
    if (loading) return <div className="overnight-loading">Loading overnight summary...</div>;
    if (error) return <div className="overnight-error">{error}</div>;
    if (!data) return null;

    const vs = data.vitals_summary || {};
    const alerts = data.alerts || {};
    const oxygen = data.oxygen || {};
    const meds = data.care_checklist?.medications || [];
    const tasks = data.care_checklist?.care_tasks || [];
    const symptoms = data.symptoms || [];

    return (
      <>
        {/* Summary cards */}
        <div className="overnight-cards">
          <div className={`overnight-card ${alerts.total > 0 ? 'danger' : 'ok'}`}>
            <div className="overnight-card-value">{alerts.total}</div>
            <div className="overnight-card-label">Alerts</div>
            {alerts.total > 0 && (
              <div className="overnight-card-detail">{alerts.total_duration_minutes} min total</div>
            )}
          </div>
          <div className={`overnight-card ${vs.spo2?.min != null && vs.spo2.min < 90 ? 'danger' : 'ok'}`}>
            <div className="overnight-card-value">{vs.spo2?.min ?? '--'}<span className="overnight-card-unit">%</span></div>
            <div className="overnight-card-label">Lowest SpO2</div>
            {vs.spo2?.time_below_90_minutes > 0 && (
              <div className="overnight-card-detail">{vs.spo2.time_below_90_minutes} min &lt;90%</div>
            )}
          </div>
          <div className="overnight-card">
            <div className="overnight-card-value">
              {oxygen.total_minutes > 0 ? `${oxygen.total_minutes}` : '0'}<span className="overnight-card-unit">min</span>
            </div>
            <div className="overnight-card-label">Oxygen Time</div>
            {oxygen.highest_flow > 0 && (
              <div className="overnight-card-detail">Peak {oxygen.highest_flow}L</div>
            )}
          </div>
          <div className={`overnight-card ${data.compliance_pct != null && data.compliance_pct < 80 ? 'warning' : 'ok'}`}>
            <div className="overnight-card-value">{data.compliance_pct != null ? `${data.compliance_pct}` : '--'}<span className="overnight-card-unit">%</span></div>
            <div className="overnight-card-label">Compliance</div>
            <div className="overnight-card-detail">{meds.length + tasks.length} items</div>
          </div>
        </div>

        {/* Vitals chart */}
        {data.vitals_chart?.length > 0 && (
          <div className="overnight-section">
            <h3 className="overnight-section-title">Vitals</h3>
            <div className="overnight-chart-container">
              <canvas ref={chartRef} />
            </div>
            <div className="overnight-vitals-stats">
              {vs.spo2 && (
                <span className="overnight-stat">SpO2: {vs.spo2.min}–{vs.spo2.max}% (avg {vs.spo2.avg}%)</span>
              )}
              {vs.heart_rate && (
                <span className="overnight-stat">HR: {vs.heart_rate.min}–{vs.heart_rate.max} bpm (avg {vs.heart_rate.avg})</span>
              )}
            </div>
          </div>
        )}

        {/* Alerts table */}
        {alerts.items?.length > 0 && (
          <div className="overnight-section">
            <h3 className="overnight-section-title">Alert Details</h3>
            <div className="overnight-alerts-table">
              <div className="overnight-alert-header">
                <span>Time</span><span>Duration</span><span>SpO2 Range</span><span>HR Range</span><span>O2</span>
              </div>
              {alerts.items.map((a, i) => (
                <div key={i} className="overnight-alert-row">
                  <span>{new Date(a.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                  <span>{a.duration_minutes} min</span>
                  <span>{a.spo2_min}–{a.spo2_max}%</span>
                  <span>{a.bpm_min}–{a.bpm_max}</span>
                  <span>{a.oxygen_used ? `${a.oxygen_highest || ''}L` : '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Care checklist */}
        {(meds.length > 0 || tasks.length > 0) && (
          <div className="overnight-section">
            <h3 className="overnight-section-title">Care Checklist</h3>
            <div className="overnight-checklist-grid">
              {meds.length > 0 && (
                <div className="overnight-checklist-col">
                  <h4 className="overnight-checklist-heading">Medications</h4>
                  {meds.map((m, i) => (
                    <div key={i} className={`overnight-checklist-item ${m.status}`}>
                      <StatusIcon status={m.status} />
                      <span className="overnight-checklist-name">{m.name}</span>
                      <span className="overnight-checklist-time">{m.scheduled_time}</span>
                      {m.status === 'skipped' && (
                        <span className="overnight-checklist-actual">skipped</span>
                      )}
                      {m.status !== 'missed' && m.status !== 'skipped' && m.administered_at && (
                        <span className="overnight-checklist-actual">given {m.administered_at}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {tasks.length > 0 && (
                <div className="overnight-checklist-col">
                  <h4 className="overnight-checklist-heading">Care Tasks</h4>
                  {tasks.map((t, i) => (
                    <div key={i} className={`overnight-checklist-item ${t.status}`}>
                      <StatusIcon status={t.status} />
                      <span className="overnight-checklist-name">{t.name}</span>
                      <span className="overnight-checklist-time">{t.scheduled_time}</span>
                      {t.status === 'skipped' && (
                        <span className="overnight-checklist-actual">skipped</span>
                      )}
                      {t.status === 'completed' && t.completed_at && (
                        <span className="overnight-checklist-actual">done {t.completed_at}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Symptoms */}
        {symptoms.length > 0 && (
          <div className="overnight-section">
            <h3 className="overnight-section-title">Symptoms Logged</h3>
            {symptoms.map((s, i) => (
              <div key={i} className="overnight-symptom">
                <span className="overnight-symptom-type">{s.symptom_type}</span>
                <span className="overnight-symptom-severity">Severity {s.severity}/10</span>
                {s.description && <span className="overnight-symptom-desc">{s.description}</span>}
              </div>
            ))}
          </div>
        )}
      </>
    );
  };

  return (
    <AdminV2Layout>
      <div className="admin-v2-monitoring">
        <div className="admin-v2-monitoring-header">
          <h1 className="admin-v2-page-title">Overnight Summary</h1>
          {selectedPatient && (
            <p className="admin-v2-page-subtitle">
              Night of {formatDateLabel(reportDate)} for {selectedPatient.first_name} {selectedPatient.last_name}
            </p>
          )}
        </div>

        {selectedPatient && (
          <div className="overnight-controls">
            <div className="overnight-date-nav">
              <button className="dod-cal-nav" onClick={prevDate}><ChevronLeftIcon size={16} /></button>
              <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} className="overnight-date-input" />
              <button className="dod-cal-nav" onClick={nextDate}><ChevronRightIcon size={16} /></button>
            </div>
            <div className="overnight-hour-range">
              <label className="dod-label">Window</label>
              <div className="dod-hour-selects">
                <select value={startHour} onChange={e => setStartHour(Number(e.target.value))} className="dod-select dod-select-hour">
                  {HOUR_LABELS.map((lbl, i) => <option key={i} value={i}>{lbl}</option>)}
                </select>
                <span className="dod-hour-sep">to</span>
                <select value={endHour} onChange={e => setEndHour(Number(e.target.value))} className="dod-select dod-select-hour">
                  {HOUR_LABELS.map((lbl, i) => <option key={i} value={i}>{lbl}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        <div className="admin-v2-monitoring-content">
          {renderContent()}
        </div>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2ReportsOvernight;
