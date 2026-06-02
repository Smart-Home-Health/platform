import React, { useState, useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import config, { apiFetch } from '../../config';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import AdminV2Layout from './AdminV2Layout';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  AlertIcon,
} from '../../components/Icons';
import './AdminV2.css';

const VITAL_LABELS = {
  spo2: { label: 'SpO2', unit: '%', color: '#58a6ff' },
  heart_rate: { label: 'Heart Rate', unit: 'bpm', color: '#f78166' },
  respiratory_rate: { label: 'Resp Rate', unit: '/min', color: '#a371f7' },
  temperature: { label: 'Temp', unit: '°F', color: '#d29922' },
  weight: { label: 'Weight', unit: 'lbs', color: '#3fb950' },
};

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatShortDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function Sparkline({ data, color, min, max }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !data?.length) return;
    if (chartRef.current) chartRef.current.destroy();

    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels: data.map(d => d.date),
        datasets: [{
          data: data.map(d => d.avg),
          borderColor: color,
          backgroundColor: color + '22',
          borderWidth: 2,
          pointRadius: data.length <= 7 ? 3 : 0,
          pointBackgroundColor: color,
          fill: true,
          tension: 0.3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false },
          y: { display: false },
        },
        animation: false,
      },
    });

    return () => { if (chartRef.current) chartRef.current.destroy(); };
  }, [data, color]);

  return (
    <div className="weekly-sparkline-card">
      <div className="weekly-sparkline-chart"><canvas ref={canvasRef} /></div>
      <div className="weekly-sparkline-stats">
        <span className="weekly-sparkline-val">{min ?? '--'}</span>
        <span className="weekly-sparkline-sep">/</span>
        <span className="weekly-sparkline-val">{max ?? '--'}</span>
      </div>
    </div>
  );
}

const AdminV2ReportsWeekly = () => {
  const { selectedPatient } = useAdminPatient();
  const [endDate, setEndDate] = useState(() => toDateStr(new Date()));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const complianceRef = useRef(null);
  const complianceChart = useRef(null);
  const nutritionRef = useRef(null);
  const nutritionChart = useRef(null);
  const alertsRef = useRef(null);
  const alertsChart = useRef(null);

  const prevWeek = () => {
    const d = new Date(endDate + 'T12:00:00');
    d.setDate(d.getDate() - 7);
    setEndDate(toDateStr(d));
  };

  const nextWeek = () => {
    const d = new Date(endDate + 'T12:00:00');
    d.setDate(d.getDate() + 7);
    const today = new Date();
    if (d > today) return;
    setEndDate(toDateStr(d));
  };

  useEffect(() => {
    if (!selectedPatient) return;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ patient_id: selectedPatient.id, end_date: endDate });
    apiFetch(`${config.apiUrl}/api/reports/weekly-summary?${params}`)
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
  }, [selectedPatient, endDate]);

  // Compliance donut
  useEffect(() => {
    if (!data?.compliance || !complianceRef.current) return;
    if (complianceChart.current) complianceChart.current.destroy();

    const c = data.compliance;
    const onTime = c.medications.on_time + c.care_tasks.completed;
    const late = c.medications.late;
    const missed = c.medications.missed + c.care_tasks.missed;
    const skipped = (c.medications.skipped || 0) + (c.care_tasks.skipped || 0);

    complianceChart.current = new Chart(complianceRef.current, {
      type: 'doughnut',
      data: {
        labels: ['On Time', 'Late', 'Missed', 'Skipped'],
        datasets: [{
          data: [onTime, late, missed, skipped],
          backgroundColor: ['#3fb950', '#d29922', '#f85149', '#8b949e'],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.label}: ${ctx.raw}`,
            },
          },
        },
        animation: false,
      },
    });

    return () => { if (complianceChart.current) complianceChart.current.destroy(); };
  }, [data]);

  // Nutrition bar chart
  useEffect(() => {
    if (!data?.nutrition?.daily?.length || !nutritionRef.current) return;
    if (nutritionChart.current) nutritionChart.current.destroy();

    const daily = data.nutrition.daily;
    const calTarget = data.nutrition.goals?.calories_target;

    const annotations = {};
    if (calTarget) {
      annotations.calGoal = {
        type: 'line',
        yMin: calTarget,
        yMax: calTarget,
        borderColor: '#f85149',
        borderWidth: 1,
        borderDash: [4, 4],
        label: { display: true, content: `Goal: ${calTarget}`, position: 'start', font: { size: 10 }, color: '#f85149', backgroundColor: 'transparent' },
      };
    }

    nutritionChart.current = new Chart(nutritionRef.current, {
      type: 'bar',
      data: {
        labels: daily.map(d => formatShortDate(d.date)),
        datasets: [{
          label: 'Calories',
          data: daily.map(d => d.calories),
          backgroundColor: '#58a6ff88',
          borderColor: '#58a6ff',
          borderWidth: 1,
          borderRadius: 3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          annotation: { annotations },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#8b949e', font: { size: 10 } } },
          y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#8b949e', font: { size: 10 } } },
        },
        animation: false,
      },
    });

    return () => { if (nutritionChart.current) nutritionChart.current.destroy(); };
  }, [data]);

  // Alerts bar chart
  useEffect(() => {
    if (!data?.alerts?.daily_counts?.length || !alertsRef.current) return;
    if (alertsChart.current) alertsChart.current.destroy();

    const daily = data.alerts.daily_counts;
    alertsChart.current = new Chart(alertsRef.current, {
      type: 'bar',
      data: {
        labels: daily.map(d => formatShortDate(d.date)),
        datasets: [{
          label: 'Alerts',
          data: daily.map(d => d.count),
          backgroundColor: '#f8514988',
          borderColor: '#f85149',
          borderWidth: 1,
          borderRadius: 3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#8b949e', font: { size: 10 } } },
          y: { grid: { color: 'rgba(255,255,255,0.06)' }, ticks: { color: '#8b949e', font: { size: 10 }, stepSize: 1 } },
        },
        animation: false,
      },
    });

    return () => { if (alertsChart.current) alertsChart.current.destroy(); };
  }, [data]);

  const renderContent = () => {
    if (!selectedPatient) {
      return <div className="admin-v2-monitoring-empty"><p>Select a patient from the sidebar to view the weekly summary.</p></div>;
    }
    if (loading) return <div className="overnight-loading">Loading weekly summary...</div>;
    if (error) return <div className="overnight-error">{error}</div>;
    if (!data) return null;

    const c = data.compliance || {};
    const equip = data.equipment_due || [];
    const symptoms = data.symptoms || {};

    return (
      <div className="weekly-report">
        {/* Vitals sparklines */}
        <div className="weekly-section">
          <h3 className="weekly-section-title">Vitals Trends</h3>
          <div className="weekly-sparklines">
            {Object.entries(VITAL_LABELS).map(([key, v]) => {
              const vd = data.vitals?.[key];
              if (!vd?.daily?.length) return null;
              return (
                <div key={key} className="weekly-sparkline-wrapper">
                  <div className="weekly-sparkline-label" style={{ color: v.color }}>{v.label}</div>
                  <Sparkline data={vd.daily} color={v.color} min={vd.min} max={vd.max} />
                  <div className="weekly-sparkline-unit">avg {vd.avg ?? '--'} {v.unit}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Compliance + Nutrition row */}
        <div className="weekly-row">
          <div className="weekly-section weekly-half">
            <h3 className="weekly-section-title">Compliance</h3>
            <div className="weekly-compliance">
              <div className="weekly-donut-container">
                <canvas ref={complianceRef} />
                <div className="weekly-donut-center">
                  <span className="weekly-donut-pct">{c.overall_pct ?? '--'}%</span>
                </div>
              </div>
              <div className="weekly-compliance-legend">
                <div className="weekly-legend-item"><span className="weekly-legend-dot" style={{ background: '#3fb950' }} /> On Time <strong>{(c.medications?.on_time || 0) + (c.care_tasks?.completed || 0)}</strong></div>
                <div className="weekly-legend-item"><span className="weekly-legend-dot" style={{ background: '#d29922' }} /> Late <strong>{c.medications?.late || 0}</strong></div>
                <div className="weekly-legend-item"><span className="weekly-legend-dot" style={{ background: '#f85149' }} /> Missed <strong>{(c.medications?.missed || 0) + (c.care_tasks?.missed || 0)}</strong></div>
                <div className="weekly-legend-item"><span className="weekly-legend-dot" style={{ background: '#8b949e' }} /> Skipped <strong>{(c.medications?.skipped || 0) + (c.care_tasks?.skipped || 0)}</strong></div>
              </div>
            </div>
          </div>

          <div className="weekly-section weekly-half">
            <h3 className="weekly-section-title">Daily Calories</h3>
            <div className="weekly-chart-sm"><canvas ref={nutritionRef} /></div>
            {data.nutrition?.avg_calories && (
              <div className="weekly-avg-text">Avg: {data.nutrition.avg_calories} cal/day</div>
            )}
          </div>
        </div>

        {/* Alerts + Equipment row */}
        <div className="weekly-row">
          <div className="weekly-section weekly-half">
            <h3 className="weekly-section-title">
              Alerts
              <span className="weekly-section-badge">{data.alerts?.total || 0}</span>
            </h3>
            {data.alerts?.daily_counts?.length > 0 ? (
              <div className="weekly-chart-sm"><canvas ref={alertsRef} /></div>
            ) : (
              <div className="weekly-empty-note">No alerts this week</div>
            )}
          </div>

          <div className="weekly-section weekly-half">
            <h3 className="weekly-section-title">Equipment Due</h3>
            {equip.length > 0 ? (
              <div className="weekly-equip-list">
                {equip.map((e, i) => (
                  <div key={i} className={`weekly-equip-item ${e.days_overdue > 0 ? 'overdue' : ''}`}>
                    <span className="weekly-equip-name">{e.name}</span>
                    <span className="weekly-equip-due">
                      {e.days_overdue > 0
                        ? <span className="weekly-overdue-badge">{e.days_overdue}d overdue</span>
                        : `Due ${formatShortDate(e.due_date)}`}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="weekly-empty-note">No equipment due</div>
            )}
          </div>
        </div>

        {/* Symptoms */}
        {(symptoms.unresolved_count > 0 || symptoms.new?.length > 0) && (
          <div className="weekly-section">
            <h3 className="weekly-section-title">
              Symptoms
              {symptoms.unresolved_count > 0 && <span className="weekly-section-badge warning">{symptoms.unresolved_count} active</span>}
            </h3>
            <div className="weekly-symptoms-list">
              {(symptoms.new || []).map((s, i) => (
                <div key={i} className="overnight-symptom">
                  <span className="overnight-symptom-type">{s.symptom_type}</span>
                  <span className="overnight-symptom-severity">Severity {s.severity}/10</span>
                  <span className={`weekly-symptom-status ${s.is_resolved ? 'resolved' : 'active'}`}>
                    {s.is_resolved ? 'Resolved' : 'Active'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Print button */}
        <div className="weekly-print-row">
          <button className="admin-v2-btn" onClick={() => window.print()}>Print Summary</button>
        </div>
      </div>
    );
  };

  const startD = new Date(endDate + 'T12:00:00');
  startD.setDate(startD.getDate() - 6);
  const periodLabel = data?.period
    ? `${formatShortDate(data.period.start)} - ${formatShortDate(data.period.end)}`
    : '';

  return (
    <AdminV2Layout>
      <div className="admin-v2-monitoring">
        <div className="admin-v2-monitoring-header">
          <h1 className="admin-v2-page-title">Weekly Summary</h1>
          {selectedPatient && (
            <p className="admin-v2-page-subtitle">
              {periodLabel} for {selectedPatient.first_name} {selectedPatient.last_name}
            </p>
          )}
        </div>

        {selectedPatient && (
          <div className="overnight-controls">
            <div className="overnight-date-nav">
              <button className="dod-cal-nav" onClick={prevWeek}><ChevronLeftIcon size={16} /></button>
              <span className="weekly-period-label">{periodLabel || 'Select week'}</span>
              <button className="dod-cal-nav" onClick={nextWeek}><ChevronRightIcon size={16} /></button>
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

export default AdminV2ReportsWeekly;
