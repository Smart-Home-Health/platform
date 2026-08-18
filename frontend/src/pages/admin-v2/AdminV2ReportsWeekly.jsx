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
// Weekly summary: the seven days as one page you can take to an appointment.
//
// The vitals are full-width charts, one per vital, rather than sparklines in a
// table cell — a week of daily points is unreadable at thumbnail size, and the
// page is allowed to scroll. Each chart draws the day's range as a band behind
// its average, because a week of 97% averages hides the night that dipped.
//
// Derivations live in reports/weekly.js so the figures and the shareable
// summary can be tested without a canvas.
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Chart from 'chart.js/auto';
import annotationPlugin from 'chartjs-plugin-annotation';
import { useNavigate } from 'react-router-dom';
import config, { apiFetch } from '../../config';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import AdminV2Layout from './AdminV2Layout';
import {
  ChevronLeftIcon, ChevronRightIcon, CheckCircleIcon, PrintIcon, LinkIcon,
  BarChartIcon, EquipmentIcon,
} from '../../components/Icons';
import { useChartColors } from '../../hooks/useChartColors';
import { alarmsFor } from './reports/dayOverDay';
import {
  VITALS, weekLabel, shiftWeek, toDateStr, weekDays, dayLabel, weekdayLabel,
  alignSeries, vitalRows, careGroups, careTotals, peakDay, equipmentRollup,
  headlineTiles, formatNumber, buildSummary,
} from './reports/weekly';
import './reports/reports-weekly.css';

Chart.register(annotationPlugin);

const AdminV2ReportsWeekly = () => {
  const { selectedPatient } = useAdminPatient();
  const navigate = useNavigate();

  const today = toDateStr(new Date());
  const [endDate, setEndDate] = useState(today);
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [shared, setShared] = useState(null);
  // The band is the point of these charts — a week of averages hides the dips —
  // but on a patient whose lows are mostly sensor dropouts it swamps the line,
  // so it can be turned off rather than being all or nothing.
  const [showRange, setShowRange] = useState(true);

  const rootRef = useRef(null);
  const vitalRefs = useRef({});
  const nutritionRef = useRef(null);
  const alertsRef = useRef(null);
  const charts = useRef([]);
  const chrome = useChartColors();

  const alarms = useMemo(() => alarmsFor('spo2', settings), [settings]);

  useEffect(() => {
    let live = true;
    apiFetch(`${config.apiUrl}/api/settings`)
      .then(r => (r.ok ? r.json() : null))
      .then(s => { if (live && s) setSettings(s); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!selectedPatient) return undefined;
    let live = true;
    setLoading(true);
    setError(null);
    setShared(null);

    const params = new URLSearchParams({ patient_id: selectedPatient.id, end_date: endDate });
    apiFetch(`${config.apiUrl}/api/reports/weekly-summary?${params}`)
      .then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || `Server error ${res.status}`);
        }
        return res.json();
      })
      .then(d => { if (live) setData(d); })
      .catch(e => { if (live) { setError(e.message); setData(null); } })
      .finally(() => { if (live) setLoading(false); });

    return () => { live = false; };
  }, [selectedPatient, endDate]);

  const rows = useMemo(() => vitalRows(data, alarms), [data, alarms]);
  const tiles = useMemo(() => headlineTiles(data), [data]);
  const groups = useMemo(() => careGroups(data?.compliance), [data]);
  const totals = useMemo(() => careTotals(data?.compliance), [data]);
  const equipment = useMemo(() => equipmentRollup(data?.equipment_due), [data]);
  const nutritionSeries = useMemo(
    () => alignSeries(data?.period, data?.nutrition?.daily, 'calories'),
    [data],
  );
  const alertSeries = useMemo(
    () => alignSeries(data?.period, data?.alerts?.daily_counts, 'count'),
    [data],
  );
  const peak = useMemo(() => peakDay(data?.alerts?.daily_counts), [data]);
  const days = useMemo(() => weekDays(data?.period), [data]);

  // ---- charts ----
  useEffect(() => {
    charts.current.forEach(c => c.destroy());
    charts.current = [];
    if (!data) return undefined;

    const rootStyle = rootRef.current ? getComputedStyle(rootRef.current) : null;
    const token = (name, fallback) => rootStyle?.getPropertyValue(name).trim() || fallback;
    const alarmColor = token('--rpt-alarm', '#f0a52e');
    const breachColor = token('--rpt-breach', '#f0563c');
    const tooltipBg = token('--rpt-raised', chrome.cutout);
    const gridSoft = `${chrome.grid}80`;
    const labels = days.map(dayLabel);

    const base = (extraPlugins = {}) => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: tooltipBg,
          borderColor: chrome.grid,
          borderWidth: 1,
          titleColor: chrome.foreground,
          bodyColor: chrome.foreground,
          padding: 10,
          titleFont: { size: 11, family: 'IBM Plex Mono, monospace', weight: '700' },
          bodyFont: { size: 11, family: 'IBM Plex Mono, monospace' },
        },
        ...extraPlugins,
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: chrome.grid },
          ticks: { color: chrome.axis, font: { size: 9.5, family: 'IBM Plex Mono, monospace' }, maxRotation: 0 },
        },
        y: {
          grid: { color: gridSoft },
          border: { color: chrome.grid },
          ticks: { color: chrome.axis, font: { size: 9.5, family: 'IBM Plex Mono, monospace' }, maxTicksLimit: 5 },
        },
      },
    });

    rows.forEach(v => {
      const canvas = vitalRefs.current[v.key];
      if (!canvas) return;
      const hasBand = showRange
        && v.series.some(p => p.low !== null && p.high !== null && p.high !== p.low);
      const annotations = {};
      if (v.alarmLow !== null) {
        annotations.alarm = {
          type: 'line',
          yMin: v.alarmLow,
          yMax: v.alarmLow,
          borderColor: alarmColor,
          borderWidth: 1,
          borderDash: [5, 4],
          label: {
            display: true,
            content: `Alarm ${v.alarmLow}${v.unit}`,
            position: 'start',
            color: alarmColor,
            backgroundColor: 'transparent',
            font: { size: 9, family: 'IBM Plex Mono, monospace', weight: '700' },
            yAdjust: 8,
          },
        };
      }
      // The day it bottomed out, marked where a reader is already looking.
      if (v.worstDay && v.breached) {
        annotations.worst = {
          type: 'point',
          xValue: days.indexOf(v.worstDay.date),
          yValue: v.worstDay.low,
          radius: 4,
          backgroundColor: breachColor,
          borderColor: breachColor,
        };
      }

      const datasets = [];
      if (hasBand) {
        // Band first, drawn as the gap between the day's high and low.
        datasets.push(
          {
            label: 'High',
            data: v.series.map(p => p.high),
            borderColor: 'transparent',
            backgroundColor: `${v.color}24`,
            pointRadius: 0,
            fill: '+1',
            spanGaps: true,
            tension: 0.25,
          },
          {
            label: 'Low',
            data: v.series.map(p => p.low),
            borderColor: 'transparent',
            backgroundColor: 'transparent',
            pointRadius: 0,
            fill: false,
            spanGaps: true,
            tension: 0.25,
          },
        );
      }
      datasets.push({
        label: `${v.label} avg`,
        data: v.series.map(p => p.value),
        borderColor: v.color,
        backgroundColor: v.color,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 5,
        fill: false,
        spanGaps: true,
        tension: 0.25,
      });

      charts.current.push(new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { labels, datasets },
        options: {
          ...base({ annotation: { annotations } }),
          plugins: {
            ...base({ annotation: { annotations } }).plugins,
            tooltip: {
              ...base().plugins.tooltip,
              callbacks: {
                label: (item) => {
                  const point = v.series[item.dataIndex];
                  if (item.dataset.label === 'Low') return null;
                  if (item.dataset.label === 'High') {
                    return point.low === null ? null : `Range ${point.low}–${point.high}${v.unit}`;
                  }
                  return `Avg ${item.parsed.y}${v.unit}`;
                },
              },
            },
          },
        },
      }));
    });

    if (nutritionRef.current && nutritionSeries.some(p => p.value)) {
      const target = data.nutrition?.goals?.calories_target;
      charts.current.push(new Chart(nutritionRef.current.getContext('2d'), {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Calories',
            data: nutritionSeries.map(p => p.value),
            backgroundColor: token('--rpt-accent', '#4da7bd'),
            borderRadius: 4,
            maxBarThickness: 42,
          }],
        },
        options: base(target ? {
          annotation: {
            annotations: {
              goal: {
                type: 'line',
                yMin: target,
                yMax: target,
                borderColor: alarmColor,
                borderWidth: 1,
                borderDash: [5, 4],
                label: {
                  display: true,
                  content: `Goal ${formatNumber(target)}`,
                  position: 'end',
                  color: alarmColor,
                  backgroundColor: 'transparent',
                  font: { size: 9, family: 'IBM Plex Mono, monospace', weight: '700' },
                  yAdjust: -8,
                },
              },
            },
          },
        } : {}),
      }));
    }

    if (alertsRef.current && alertSeries.some(p => p.value)) {
      charts.current.push(new Chart(alertsRef.current.getContext('2d'), {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Triggers',
            data: alertSeries.map(p => p.value ?? 0),
            backgroundColor: alarmColor,
            borderRadius: 4,
            maxBarThickness: 42,
          }],
        },
        options: base(),
      }));
    }

    return () => {
      charts.current.forEach(c => c.destroy());
      charts.current = [];
    };
  }, [data, rows, days, nutritionSeries, alertSeries, chrome, showRange]);

  const shareSummary = useCallback(async () => {
    if (!data) return;
    const patientName = selectedPatient
      ? [selectedPatient.first_name, selectedPatient.last_name].filter(Boolean).join(' ')
      : null;
    const text = buildSummary(data, { patientName, alarms });
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Weekly summary', text });
        setShared('Shared');
        return;
      }
      await navigator.clipboard.writeText(text);
      setShared('Copied to clipboard');
    } catch {
      setShared(null);
    }
  }, [data, selectedPatient, alarms]);

  const atCurrentWeek = endDate >= today;
  const symptoms = data?.symptoms || {};

  const body = () => {
    if (!selectedPatient) return <div className="rpt-empty">Select a patient to see the weekly summary</div>;
    if (error) return <div className="rpt-error">{error}</div>;
    if (loading && !data) return <div className="rpt-empty">Loading…</div>;
    if (!data) return null;

    return (
      <>
        <div className="rpt-stats" style={{ '--rpt-stat-count': tiles.length }}>
          {tiles.map(t => (
            <div key={t.key} data-stat={t.key} className={`rpt-stat${t.tone ? ` ${t.tone}` : ''}`}>
              <span className="rpt-stat-label">{t.label}</span>
              <span className="rpt-stat-value">{t.value}</span>
              <span className="rpt-stat-note">{t.note}</span>
            </div>
          ))}
        </div>

        {rows.length > 0 && (
          <div className="wk-rangebar">
            <button
              type="button"
              className="rpt-toggle"
              onClick={() => setShowRange(v => !v)}
              aria-pressed={showRange}
              aria-label="Daily range"
            >
              Daily range
              <span className={`rpt-switch${showRange ? ' on' : ''}`}><span /></span>
            </button>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="rpt-empty">No vitals recorded this week</div>
        ) : rows.map(v => (
          <section key={v.key} className="rpt-card" style={{ '--wk-series': v.color }}>
            <div className="wk-vital-head">
              <span className="wk-vital-name">{v.label}</span>
              <span className="wk-vital-avg">{v.avg}<span>{v.unit}</span></span>
              <span className="wk-vital-range">
                Range <b className={v.breached ? 'breach' : undefined}>{v.min}</b>–<b>{v.max}</b>{v.unit}
              </span>
            </div>
            <div className="wk-vital-plot">
              <canvas ref={el => { vitalRefs.current[v.key] = el; }} />
            </div>
            <div className="wk-vital-foot">
              {v.days} of 7 days recorded
              <button
                type="button"
                className="wk-link"
                onClick={() => navigate(`/care/reports/day-over-day?vital=${v.key}`)}
              >
                Compare days
                <ChevronRightIcon size={13} />
              </button>
            </div>
          </section>
        ))}

        {groups.length > 0 && (
          <section className="rpt-card">
            <div className="rpt-card-head">
              <span className="rpt-card-title">Care completion</span>
              <span className={`rpt-card-note${totals.pct !== null && totals.pct < 90 ? ' rpt-warn' : ' rpt-ok'}`}>
                {totals.pct === null ? '—' : `${totals.pct}% completed`}
              </span>
            </div>
            {/* Medications and care tasks are separate bars: only medications
                record a late/on-time split, and folding a completed task into
                "on time" would invent a punctuality nothing measured. */}
            {groups.map(g => (
              <div key={g.label} className="wk-group">
                <div className="wk-group-head">
                  {g.label}
                  <span className="wk-group-count">{g.done} of {g.total}</span>
                </div>
                <div className="wk-bar">
                  {g.segments.map(s => (
                    <div
                      key={s.key}
                      className={`wk-seg ${s.tone}`}
                      style={{ width: `${(s.count / g.total) * 100}%` }}
                      title={`${s.label}: ${s.count}`}
                    >
                      {(s.count / g.total) > 0.08 ? s.count : ''}
                    </div>
                  ))}
                </div>
                <div className="wk-legend">
                  {g.segments.map(s => (
                    <span key={s.key}><i className={s.tone} />{s.label} <b>{s.count}</b></span>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        <section className="rpt-card">
          <div className="rpt-card-head">
            <span className="rpt-card-title">Nutrition</span>
            <span className="rpt-card-note">
              {data.nutrition?.avg_calories
                ? `${formatNumber(data.nutrition.avg_calories)} cal/day avg`
                : 'Nothing logged'}
            </span>
          </div>
          {nutritionSeries.some(p => p.value) ? (
            <div className="wk-plot"><canvas ref={nutritionRef} /></div>
          ) : (
            <div className="rpt-empty">No meals logged this week</div>
          )}
        </section>

        <section className="rpt-card">
          <div className="rpt-card-head">
            <span className="rpt-card-title">Alert activity</span>
            <span className={`rpt-card-note${data.alerts?.total ? ' rpt-warn' : ' rpt-ok'}`}>
              {data.alerts?.total || 0} triggers
            </span>
          </div>
          {alertSeries.some(p => p.value) ? (
            <>
              <div className="wk-plot"><canvas ref={alertsRef} /></div>
              {peak && (
                <div className="wk-note">
                  <BarChartIcon size={13} />
                  Busiest {weekdayLabel(peak.date)} {dayLabel(peak.date)} · {peak.count} triggers
                </div>
              )}
            </>
          ) : (
            <div className="rpt-empty">No alerts this week</div>
          )}
        </section>

        <section className="rpt-card">
          <div className="rpt-card-head">
            <span className="rpt-card-title">Equipment</span>
            <span className={`rpt-card-note${equipment.overdue ? ' rpt-warn' : ' rpt-ok'}`}>
              {equipment.total ? `${equipment.total} due` : 'Nothing due'}
            </span>
          </div>
          {equipment.items.length ? equipment.items.map((e, i) => (
            <div key={`${e.name}-${i}`} className="wk-row">
              <EquipmentIcon size={15} className="rpt-muted" />
              <span className="wk-row-name">{e.name}</span>
              <span className={`wk-row-due${e.days_overdue > 0 ? ' overdue' : ''}`}>
                {e.days_overdue > 0 ? `${e.days_overdue}d overdue` : `Due ${dayLabel(e.due_date)}`}
              </span>
            </div>
          )) : (
            <div className="wk-clear"><CheckCircleIcon size={16} /> Nothing due this week</div>
          )}
        </section>

        {(symptoms.new?.length > 0 || symptoms.unresolved_count > 0) && (
          <section className="rpt-card">
            <div className="rpt-card-head">
              <span className="rpt-card-title">Symptoms</span>
              <span className="rpt-card-note">
                {symptoms.new?.length || 0} new · {symptoms.unresolved_count || 0} unresolved
              </span>
            </div>
            {(symptoms.new || []).map((s, i) => (
              <div key={i} className="wk-row">
                <span className="wk-row-name">{s.symptom_type}</span>
                <span className="wk-row-due">
                  {s.severity != null ? `${s.severity}/10` : ''}
                  {s.is_resolved ? ' · resolved' : ''}
                </span>
              </div>
            ))}
          </section>
        )}

        <div className="rpt-actions">
          <button type="button" className="rpt-btn" onClick={() => window.print()}>
            <PrintIcon size={15} />
            Print summary
          </button>
          <button type="button" className="rpt-btn primary" onClick={shareSummary}>
            <LinkIcon size={15} />
            Share summary
          </button>
        </div>
        {shared && <div className="wk-shared">{shared}</div>}
      </>
    );
  };

  return (
    <AdminV2Layout>
      <div className="rpt wk" ref={rootRef}>
        <div className="wk-head">
          <button type="button" className="wk-nav" onClick={() => setEndDate(shiftWeek(endDate, -1))} aria-label="Previous week">
            <ChevronLeftIcon size={16} />
          </button>
          <span className="wk-period">{data?.period ? weekLabel(data.period) : '—'}</span>
          <button
            type="button"
            className="wk-nav"
            onClick={() => setEndDate(shiftWeek(endDate, 1))}
            disabled={atCurrentWeek}
            aria-label="Next week"
          >
            <ChevronRightIcon size={16} />
          </button>
        </div>

        <div className="rpt-window">
          7-day overview · <strong>{VITALS.length ? `${rows.length}` : '0'}</strong> vitals recorded
        </div>

        {body()}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2ReportsWeekly;
