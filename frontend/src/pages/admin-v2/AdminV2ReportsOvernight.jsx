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
// Overnight: one night, read at a glance — what the night did (the strip), what
// it looked like (two traces), what went wrong (episodes) and what was owed
// (the checklist).
//
// Colour roles are the report ones: amber is the configured alarm and anything
// to do with adherence, red is a reading that breached the alarm. Derivations
// live in reports/overnight.js so the header figures and the handoff text can
// be tested without a canvas.
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Chart from 'chart.js/auto';
import annotationPlugin from 'chartjs-plugin-annotation';
import config, { apiFetch } from '../../config';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import AdminV2Layout from './AdminV2Layout';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeftIcon, ChevronRightIcon, ChevronDownIcon, ConfigIcon, ClockIcon,
  FileTextIcon, MedicationIcon, CareTasksIcon, LinkIcon,
  ExpandPanelIcon, CollapsePanelIcon,
} from '../../components/Icons';
import BottomSheet from '../capture/components/BottomSheet';
import { useChartColors } from '../../hooks/useChartColors';
import { alarmsFor } from './reports/dayOverDay';
import {
  DEFAULT_START_HOUR, DEFAULT_END_HOUR, STATUS_TONE,
  windowLabel, windowHours, nightLabel, formatMinutes, formatTime,
  coverage, careRollup, scheduledSpan, episodes, statTiles, buildHandoff,
  toCsv, csvFileName,
} from './reports/overnight';
import './reports/reports-overnight.css';

Chart.register(annotationPlugin);

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const EPISODE_PREVIEW = 2;

// Why an episode's end had to be worked out afterwards. "Recovered" and "the
// sensor stopped reporting" are different statements about the same number, so
// the marker says which one it is rather than just flagging it as an estimate.
const END_INFERRED_HINT = {
  inferred_recovery: 'Ended when the readings had held steady — worked out from the sensor record',
  inferred_monitoring_ended: 'Ended when the sensor stopped reporting, so the episode may have continued unseen',
  inferred_no_data: 'No sensor readings for this episode, so no length could be established',
};

const toDateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const hourLabel = (h) => {
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${period}`;
};

const AdminV2ReportsOvernight = () => {
  const { selectedPatient } = useAdminPatient();
  const navigate = useNavigate();

  const now = new Date();
  const [reportDate, setReportDate] = useState(() => {
    // Before noon you are still reading last night.
    const d = now.getHours() < 12 ? new Date(now.getTime() - 86400000) : now;
    return toDateStr(d);
  });
  const [startHour, setStartHour] = useState(DEFAULT_START_HOUR);
  const [endHour, setEndHour] = useState(DEFAULT_END_HOUR);

  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [markers, setMarkers] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [showAllEpisodes, setShowAllEpisodes] = useState(false);
  const [openGroup, setOpenGroup] = useState(null); // 'medications' | 'care_tasks'
  const [shared, setShared] = useState(null);

  const rootRef = useRef(null);
  const spo2Ref = useRef(null);
  const hrRef = useRef(null);
  const charts = useRef([]);
  const chrome = useChartColors();

  const todayStr = toDateStr(now);
  const alarms = useMemo(() => alarmsFor('spo2', settings), [settings]);

  const shiftDate = useCallback((days) => {
    setReportDate(prev => {
      const d = new Date(`${prev}T12:00:00`);
      d.setDate(d.getDate() + days);
      const next = toDateStr(d);
      return next > todayStr ? prev : next;
    });
  }, [todayStr]);

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
      .then(d => { if (live) setData(d); })
      .catch(e => { if (live) { setError(e.message); setData(null); } })
      .finally(() => { if (live) setLoading(false); });

    return () => { live = false; };
  }, [selectedPatient, reportDate, startHour, endHour]);

  // Memoized because the chart effect keys on it: a fresh [] each render would
  // tear down and rebuild both charts every time anything else moved.
  const points = useMemo(() => data?.vitals_chart || [], [data]);
  const eps = useMemo(() => episodes(data), [data]);
  const tiles = useMemo(() => statTiles(data, alarms), [data, alarms]);
  const cov = useMemo(() => coverage(data), [data]);
  const care = useMemo(() => careRollup(data?.care_checklist), [data]);
  const span = useMemo(() => scheduledSpan(data?.care_checklist), [data]);

  // ---- charts: SpO2 and heart rate stacked, sharing one x range ----
  useEffect(() => {
    charts.current.forEach(c => c.destroy());
    charts.current = [];
    if (!points.length || !spo2Ref.current || !hrRef.current) return undefined;

    const rootStyle = rootRef.current ? getComputedStyle(rootRef.current) : null;
    const token = (name, fallback) => rootStyle?.getPropertyValue(name).trim() || fallback;
    const alarmColor = token('--rpt-alarm', '#f0a52e');
    const breachColor = token('--rpt-breach', '#f0563c');
    const spo2Color = token('--rpt-accent', '#4da7bd');
    const hrColor = token('--rpt-ok', '#3fbf6a');
    const tooltipBg = token('--rpt-raised', chrome.cutout);
    const gridSoft = `${chrome.grid}80`;

    const xMin = points[0].ts;
    const xMax = points[points.length - 1].ts;

    const annotations = {};
    if (markers) {
      // The episodes as bands, and the point each one bottomed out at. Red is
      // right here: an alert episode is the clinical concern the palette keeps
      // it for.
      eps.forEach((e, i) => {
        annotations[`band${i}`] = {
          type: 'box',
          xMin: e.startMs / 1000,
          xMax: (e.endMs ?? xMax * 1000) / 1000,
          backgroundColor: `${breachColor}1f`,
          borderColor: `${breachColor}4d`,
          borderWidth: 1,
        };
        if (e.nadir != null) {
          annotations[`nadir${i}`] = {
            type: 'point',
            xValue: e.startMs / 1000,
            yValue: e.nadir,
            radius: 4,
            backgroundColor: breachColor,
            borderColor: breachColor,
          };
        }
      });
    }
    if (alarms.low != null) {
      annotations.alarm = {
        type: 'line',
        yMin: alarms.low,
        yMax: alarms.low,
        borderColor: alarmColor,
        borderWidth: 1,
        borderDash: [6, 4],
        label: {
          display: true,
          content: `Alarm ${alarms.low}%`,
          position: 'end',
          color: alarmColor,
          backgroundColor: 'transparent',
          font: { size: 10, family: 'IBM Plex Mono, monospace', weight: '700' },
          yAdjust: 10,
        },
      };
    }

    const timeAxis = (showLabels) => ({
      type: 'linear',
      min: xMin,
      max: xMax,
      grid: { color: gridSoft },
      border: { color: chrome.grid },
      ticks: {
        display: showLabels,
        maxTicksLimit: 8,
        maxRotation: 0,
        color: chrome.axis,
        font: { size: 10, family: 'IBM Plex Mono, monospace' },
        callback: (val) => {
          const d = new Date(val * 1000);
          return d.getMinutes() < 15 || d.getMinutes() > 45 ? hourLabel(d.getHours()) : '';
        },
      },
    });

    const common = (annotationSet) => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        annotation: { annotations: annotationSet },
        tooltip: {
          backgroundColor: tooltipBg,
          borderColor: chrome.grid,
          borderWidth: 1,
          titleColor: chrome.foreground,
          bodyColor: chrome.foreground,
          padding: 10,
          titleFont: { size: 11, family: 'IBM Plex Mono, monospace', weight: '700' },
          bodyFont: { size: 11, family: 'IBM Plex Mono, monospace' },
          callbacks: { title: (items) => (items.length ? formatTime(items[0].parsed.x * 1000) : '') },
        },
      },
    });

    // The floor takes in the episode nadirs as well as the plotted line: the
    // series is downsampled to a point every five minutes, so the reading an
    // episode bottomed out at is often not in it — and its marker would sit
    // below the axis.
    const spo2Values = points.map(p => p.spo2);
    const nadirs = eps.map(e => e.nadir).filter(n => n != null);
    const spo2Floor = Math.min(alarms.low ?? 100, ...spo2Values, ...nadirs);

    const spo2 = new Chart(spo2Ref.current.getContext('2d'), {
      type: 'line',
      data: {
        datasets: [{
          label: 'SpO2',
          data: points.map(p => ({ x: p.ts, y: p.spo2 })),
          borderColor: spo2Color,
          backgroundColor: spo2Color,
          borderWidth: 1.5,
          pointRadius: 0,
          pointHoverRadius: 3,
          tension: 0.25,
        }],
      },
      options: {
        ...common(annotations),
        scales: {
          x: timeAxis(false),
          y: {
            min: Math.max(0, Math.floor(spo2Floor - 5)),
            max: 100,
            title: {
              display: true, text: 'SpO2 %', color: spo2Color,
              font: { size: 10, family: 'IBM Plex Mono, monospace' },
            },
            grid: { color: gridSoft },
            border: { color: chrome.grid },
            ticks: { color: chrome.axis, font: { size: 10, family: 'IBM Plex Mono, monospace' } },
          },
        },
      },
    });

    const hr = new Chart(hrRef.current.getContext('2d'), {
      type: 'line',
      data: {
        datasets: [{
          label: 'Heart rate',
          data: points.map(p => ({ x: p.ts, y: p.hr })),
          borderColor: hrColor,
          backgroundColor: hrColor,
          borderWidth: 1.5,
          pointRadius: 0,
          pointHoverRadius: 3,
          tension: 0.25,
        }],
      },
      options: {
        ...common({}),
        scales: {
          x: timeAxis(true),
          y: {
            title: {
              display: true, text: 'HR bpm', color: hrColor,
              font: { size: 10, family: 'IBM Plex Mono, monospace' },
            },
            grid: { color: gridSoft },
            border: { color: chrome.grid },
            ticks: { color: chrome.axis, font: { size: 10, family: 'IBM Plex Mono, monospace' } },
          },
        },
      },
    });

    charts.current = [spo2, hr];
    return () => {
      charts.current.forEach(c => c.destroy());
      charts.current = [];
    };
  }, [points, eps, markers, alarms, chrome, fullscreen]);

  const exportCsv = useCallback(() => {
    if (!data) return;
    const blob = new Blob([toCsv(data)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = csvFileName(data.date);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [data]);

  // Share sheet where the device has one (a phone at the bedside), clipboard
  // everywhere else — either way the text is the same handoff.
  const shareHandoff = useCallback(async () => {
    if (!data) return;
    const patientName = selectedPatient
      ? [selectedPatient.first_name, selectedPatient.last_name].filter(Boolean).join(' ')
      : null;
    const text = buildHandoff(data, { patientName, startHour, endHour });
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Overnight handoff', text });
        setShared('Shared');
        return;
      }
      await navigator.clipboard.writeText(text);
      setShared('Copied to clipboard');
    } catch {
      // A cancelled share is not a failure worth shouting about.
      setShared(null);
    }
  }, [data, selectedPatient, startHour, endHour]);

  const vs = data?.vitals_summary || {};
  const symptoms = data?.symptoms || [];
  const visibleEpisodes = showAllEpisodes ? eps : eps.slice(0, EPISODE_PREVIEW);

  const groups = [
    { key: 'medications', label: 'Medications', Icon: MedicationIcon, items: data?.care_checklist?.medications || [], roll: care.meds },
    { key: 'care_tasks', label: 'Care tasks', Icon: CareTasksIcon, items: data?.care_checklist?.care_tasks || [], roll: care.tasks },
  ].filter(g => g.items.length > 0);

  const body = () => {
    if (!selectedPatient) {
      return <div className="rpt-empty">Select a patient to see the overnight report</div>;
    }
    if (error) return <div className="rpt-error">{error}</div>;
    if (loading && !data) return <div className="rpt-empty">Loading…</div>;
    if (!data) return null;

    return (
      <>
        <div className="rpt-stats" style={{ '--rpt-stat-count': tiles.length }}>
          {tiles.map(t => (
            <div key={t.key} data-stat={t.key} className={`rpt-stat${t.tone ? ` ${t.tone}` : ''}`}>
              <span className="rpt-stat-label">{t.label}</span>
              <span className="rpt-stat-value">
                {t.value}{t.unit && <span className="rpt-stat-unit">{t.unit}</span>}
              </span>
              <span className="rpt-stat-note">{t.note}</span>
            </div>
          ))}
          {cov && (
            <div className="rpt-stats-foot">
              Sensor coverage <strong>{formatMinutes(cov.minutes)}</strong> of {formatMinutes(cov.windowMinutes)}
              {cov.pct !== null && <> · <strong>{cov.pct}%</strong></>}
            </div>
          )}
        </div>

        {points.length > 0 ? (
          <section className={`rpt-card${fullscreen ? ' full' : ''}`}>
            <div className="rpt-card-head">
              <span className="rpt-card-title">Overnight vitals</span>
              <button
                type="button"
                className="rpt-toggle"
                onClick={() => setMarkers(v => !v)}
                aria-pressed={markers}
                aria-label="Event markers"
              >
                Markers
                <span className={`rpt-switch${markers ? ' on' : ''}`}><span /></span>
              </button>
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
            <div className="ovn-plots">
              <div className="rpt-plot ovn-plot"><canvas ref={spo2Ref} /></div>
              <div className="rpt-plot ovn-plot hr"><canvas ref={hrRef} /></div>
            </div>
            {/* The trace is one reading every five minutes, so a brief desat can
                fall between two of its points — the nadir in the strip comes
                from every sample and is the number to trust. */}
            <div className="ovn-caption">Line plots one reading every 5 minutes</div>
            <div className="ovn-averages">
              {vs.spo2 && <span className="spo2">SpO2 avg <b>{vs.spo2.avg}%</b> · {vs.spo2.min}–{vs.spo2.max}%</span>}
              {vs.heart_rate && <span className="hr">HR avg <b>{vs.heart_rate.avg}</b> · {vs.heart_rate.min}–{vs.heart_rate.max} bpm</span>}
            </div>
          </section>
        ) : (
          <div className="rpt-empty">No pulse-ox readings in this window</div>
        )}

        {eps.length > 0 && (
          <section className="rpt-card">
            <div className="rpt-card-head">
              {/* The strip's tile is the count; this card is the detail, so it
                  does not repeat the same words back. */}
              <span className="rpt-card-title">Episodes</span>
              <span className="rpt-card-note">{eps.length}</span>
            </div>
            <div className="ovn-card-sub">
              {formatMinutes(data.alerts.total_duration_minutes)} across {eps.length}
              {eps.length === 1 ? ' episode' : ' episodes'} · longest {formatMinutes(data.alerts.longest_duration_minutes)}
              {/* Episodes that never got an end time have no duration, so the
                  figures above cover only the rest. Say so rather than let the
                  total read as the whole night. */}
              {data.alerts.unclosed > 0 && (
                <> · {data.alerts.unclosed} still open, not counted in the time</>
              )}
              {/* These do count toward the figures, but their end was worked
                  out from the sensor record afterwards rather than watched
                  happening, so the times are close rather than exact. */}
              {data.alerts.inferred > 0 && (
                <> · {data.alerts.inferred} ended by inference</>
              )}
            </div>
            <div className="rpt-table-wrap">
              <table className="rpt-table">
                <thead>
                  <tr><th>Started</th><th>Nadir</th><th>HR</th><th>Duration</th><th>O2</th></tr>
                </thead>
                <tbody>
                  {visibleEpisodes.map((e, i) => (
                    <tr key={`${e.start_time}-${i}`}>
                      <td>{formatTime(e.start_time)}</td>
                      <td className={alarms.low != null && e.nadir != null && e.nadir < alarms.low ? 'rpt-breach' : undefined}>
                        {e.nadir != null ? `${e.nadir}%` : '—'}
                      </td>
                      <td>{e.bpm_min != null ? `${e.bpm_min}–${e.bpm_max}` : '—'}</td>
                      {/* An inferred end is an estimate; mark it as one rather
                          than let it sit next to measured durations unqualified. */}
                      <td title={e.end_inferred ? END_INFERRED_HINT[e.end_source] : undefined}>
                        {e.end_inferred ? '≈' : ''}{formatMinutes(e.duration_minutes)}
                      </td>
                      <td className="rpt-muted">{e.oxygen_used ? `${e.oxygen_highest || ''}L` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {eps.length > EPISODE_PREVIEW && (
              <button type="button" className="ovn-more" onClick={() => setShowAllEpisodes(v => !v)}>
                {showAllEpisodes ? 'Show fewer' : `Show all ${eps.length}`}
              </button>
            )}
          </section>
        )}

        {groups.length > 0 && (
          <section className="rpt-card">
            <div className="rpt-card-head">
              <span className="rpt-card-title">Care checklist</span>
              <span className={`rpt-card-note${care.done < care.total ? ' rpt-warn' : ' rpt-ok'}`}>
                {care.done} of {care.total} completed
              </span>
            </div>
            {groups.map(g => {
              const open = openGroup === g.key;
              return (
                <div key={g.key} className="ovn-group">
                  <button
                    type="button"
                    className="ovn-group-head"
                    onClick={() => setOpenGroup(open ? null : g.key)}
                    aria-expanded={open}
                  >
                    <span className={`ovn-group-icon${g.roll.done === g.roll.total ? ' done' : ''}`}>
                      <g.Icon size={16} />
                    </span>
                    <span className="ovn-group-name">{g.label}</span>
                    <span className="ovn-group-count">
                      {g.roll.done} / {g.roll.total} completed
                      {g.roll.missed > 0 && <> · <span className="miss">{g.roll.missed} missed</span></>}
                    </span>
                    <ChevronDownIcon size={15} className="rpt-chevron" style={open ? { transform: 'rotate(180deg)' } : undefined} />
                  </button>
                  {open && (
                    <div className="ovn-items">
                      {g.items.map((item, i) => (
                        <div key={`${item.name}-${item.scheduled_time}-${i}`} className="ovn-item">
                          <span className="ovn-item-time">{item.scheduled_time}</span>
                          <span className="ovn-item-name">{item.name}</span>
                          <span className={`ovn-item-status ${STATUS_TONE[item.status] || 'muted'}`}>
                            {item.status === 'completed' || item.status === 'on_time'
                              ? (item.administered_at || item.completed_at || 'done')
                              : item.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {span && <div className="ovn-foot">Scheduled at {span}</div>}
          </section>
        )}

        {symptoms.length > 0 && (
          <section className="rpt-card">
            <div className="rpt-card-head">
              <span className="rpt-card-title">Symptoms logged</span>
              <span className="rpt-card-note">{symptoms.length}</span>
            </div>
            {symptoms.map((s, i) => (
              <div key={i} className="ovn-symptom">
                <span className="ovn-symptom-type">{s.symptom_type}</span>
                <span className="ovn-symptom-sev">{s.severity}/10</span>
                {s.description && <span className="ovn-symptom-desc">{s.description}</span>}
              </div>
            ))}
          </section>
        )}

        <div className="rpt-actions">
          <button
            type="button"
            className="rpt-btn"
            onClick={() => navigate(`/care/monitoring/timeline?date=${reportDate}`)}
          >
            <ClockIcon size={15} />
            View timeline
          </button>
          <button type="button" className="rpt-btn" onClick={exportCsv} disabled={!points.length}>
            <FileTextIcon size={15} />
            Export CSV
          </button>
          <button type="button" className="rpt-btn primary" onClick={shareHandoff}>
            <LinkIcon size={15} />
            Share handoff
          </button>
        </div>
        {shared && <div className="ovn-shared">{shared}</div>}
      </>
    );
  };

  return (
    <AdminV2Layout>
      <div className="rpt ovn" ref={rootRef}>
        <div className="ovn-head">
          <button type="button" className="ovn-nav" onClick={() => shiftDate(-1)} aria-label="Previous night">
            <ChevronLeftIcon size={16} />
          </button>
          <span className="ovn-date">{nightLabel(reportDate, startHour, endHour)}</span>
          <button
            type="button"
            className="ovn-nav"
            onClick={() => shiftDate(1)}
            disabled={reportDate >= todayStr}
            aria-label="Next night"
          >
            <ChevronRightIcon size={16} />
          </button>
          <span className="ovn-head-spacer" />
          <button
            type="button"
            className="rpt-control icon"
            onClick={() => setSheetOpen(true)}
            aria-label="Report settings"
            title="Report settings"
          >
            <ConfigIcon size={17} />
            {(startHour !== DEFAULT_START_HOUR || endHour !== DEFAULT_END_HOUR) && (
              <span className="rpt-dot-flag" />
            )}
          </button>
        </div>

        <div className="rpt-window">
          {windowLabel(startHour, endHour)} · <strong>{windowHours(startHour, endHour)}</strong>-hour window
        </div>

        {body()}

        <BottomSheet
          open={sheetOpen}
          onOpenChange={(next) => { if (!next) setSheetOpen(false); }}
          onSwipeDown={() => setSheetOpen(false)}
          title="Report settings"
        >
          <div className="rpt-sheet">
            <div className="rpt-field">
              <span className="rpt-field-label">Night of</span>
              <label className="rpt-control">
                <span className="rpt-sr">Night of</span>
                <input
                  type="date"
                  value={reportDate}
                  max={todayStr}
                  onChange={e => e.target.value && setReportDate(e.target.value)}
                />
              </label>
            </div>

            <div className="rpt-field">
              <span className="rpt-field-label">Window</span>
              <div className="rpt-range">
                <label className="rpt-control">
                  <span className="rpt-sr">Window start</span>
                  <select value={String(startHour)} onChange={e => setStartHour(Number(e.target.value))}>
                    {HOURS.map(h => <option key={h} value={String(h)}>{hourLabel(h)}</option>)}
                  </select>
                </label>
                <span className="rpt-range-sep">to</span>
                <label className="rpt-control">
                  <span className="rpt-sr">Window end</span>
                  <select value={String(endHour)} onChange={e => setEndHour(Number(e.target.value))}>
                    {HOURS.map(h => <option key={h} value={String(h)}>{hourLabel(h)}</option>)}
                  </select>
                </label>
              </div>
            </div>

            <div className="vc-sheet-actions">
              <button
                type="button"
                className="vc-btn secondary"
                onClick={() => { setStartHour(DEFAULT_START_HOUR); setEndHour(DEFAULT_END_HOUR); }}
                disabled={startHour === DEFAULT_START_HOUR && endHour === DEFAULT_END_HOUR}
              >
                Reset window
              </button>
              <button type="button" className="vc-btn primary" onClick={() => setSheetOpen(false)}>Done</button>
            </div>
          </div>
        </BottomSheet>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2ReportsOvernight;
