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
import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import config, { apiFetch } from '../../config';
import {
  CalendarIcon,
  PrintIcon,
  VitalsIcon,
  NutritionIcon,
  UrineIcon,
  BowelIcon,
  PillIcon,
  VirusIcon,
  UsersIcon,
  PhoneIcon,
  ChevronRightIcon,
  BodyIcon,
  InfoIcon,
} from '../../components/Icons';
import './AdminV2.css';
import './clinical-summary.css';

const WINDOW_DAYS = 30;

const fmtLabel = (s) => (s ? String(s).replace(/_/g, ' ') : '');
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '');
const fmtShortDate = (d, withYear = false) =>
  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });
const fmtDayTime = (d) => {
  const dt = new Date(d);
  return `${fmtShortDate(dt)} · ${dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
};

const severityTone = (sev) => {
  if (sev >= 7) return 'cs-tone-alert';
  if (sev >= 4) return 'cs-tone-due';
  return 'cs-tone-ok';
};
const diagnosisSeverityTone = (sev) => (
  { severe: 'cs-tone-alert', critical: 'cs-tone-alert', moderate: 'cs-tone-due', mild: 'cs-tone-ok' }[sev] || 'cs-tone-dim'
);
const diagnosisStatusTone = (status) => (
  { resolved: 'cs-tone-ok', active: 'cs-tone-live', chronic: 'cs-tone-due', in_remission: 'cs-tone-live', ruled_out: 'cs-tone-idle' }[status] || 'cs-tone-dim'
);

/* Sparkline: avg trend as a single line, with dashed expected-range
 * thresholds (upper = alert, lower = due). Decorative — the AVG cell and
 * row labels carry the accessible meaning. */
function Spark({ series, lo, hi }) {
  const W = 300;
  const H = 52;
  const domain = [...series];
  if (lo != null) domain.push(lo);
  if (hi != null) domain.push(hi);
  let dLo = Math.min(...domain);
  let dHi = Math.max(...domain);
  if (dHi === dLo) { dHi += 1; dLo -= 1; }
  const pad = (dHi - dLo) * 0.12;
  dLo -= pad;
  dHi += pad;
  const x = (i) => (i / (series.length - 1)) * W;
  const y = (v) => H - ((v - dLo) / (dHi - dLo)) * H;
  // A lone reading still deserves a visible mark — draw it as a short dash.
  const points = series.length === 1
    ? `${W / 2 - 10},${y(series[0]).toFixed(1)} ${W / 2 + 10},${y(series[0]).toFixed(1)}`
    : series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg className="cs-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      {hi != null && <line className="cs-spark-threshold cs-spark-hi" x1="0" x2={W} y1={y(hi)} y2={y(hi)} />}
      {lo != null && <line className="cs-spark-threshold cs-spark-lo" x1="0" x2={W} y1={y(lo)} y2={y(lo)} />}
      <polyline className="cs-spark-line" points={points} />
    </svg>
  );
}

function Section({ num, title, loading, children }) {
  return (
    <section className="cs-section">
      <div className="cs-section-head">
        <span className="cs-section-num">{num}.</span>
        <span>{title}</span>
      </div>
      {loading ? <div className="cs-loading">Loading…</div> : children}
    </section>
  );
}

function EmptyRow({ icon, label, tone = 'cs-tone-due' }) {
  return (
    <div className="cs-row">
      {icon && <span className="cs-row-icon" aria-hidden="true">{icon}</span>}
      <div className="cs-row-main">
        <div className={`cs-row-title ${tone}`}>{label}</div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------
 * Print document — light, black-on-white, table-based. Hidden on screen;
 * the only thing that prints (see `.summary-print-root` rule in tailwind.css).
 * ---------------------------------------------------------------------- */
function PrintSection({ title, children }) {
  return (
    <section className="mt-5 break-inside-avoid">
      <h2 className="mb-1 border-b border-black pb-0.5 text-[13pt] font-bold">{title}</h2>
      {children}
    </section>
  );
}

function PrintTable({ columns, rows, empty }) {
  if (!rows || rows.length === 0) {
    return <p className="text-[10pt] italic text-black/60">{empty}</p>;
  }
  return (
    <table className="w-full border-collapse text-[10pt]">
      <thead>
        <tr>
          {columns.map(c => (
            <th key={c} className="border-b-2 border-black pb-0.5 pr-3 text-left font-semibold">{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((cells, i) => (
          <tr key={i}>
            {cells.map((cell, j) => (
              <td key={j} className="border-b border-black/20 py-1 pr-3 align-top">{cell || '—'}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SummaryPrintView({ patient, rangeLabel, diagnoses, symptoms, medWindow, activeMedsByName, implants, providers }) {
  return (
    <div className="summary-print-root bg-white font-sans text-black">
      <div className="border-b-2 border-black pb-2">
        <div className="text-[20pt] font-bold leading-tight">{patient.first_name} {patient.last_name}</div>
        <div className="flex justify-between text-[10pt] text-black/70">
          <span>30-Day Clinical Summary — {rangeLabel}</span>
          <span>Printed {new Date().toLocaleString()}</span>
        </div>
      </div>

      <PrintSection title="Active Diagnoses">
        <PrintTable
          columns={['Diagnosis', 'ICD-10', 'Status', 'Severity', 'Provider']}
          empty="No active diagnoses recorded."
          rows={diagnoses.map(d => [
            `${d.is_primary_diagnosis ? '(primary) ' : ''}${d.name}`,
            d.icd10_code, fmtLabel(d.status), fmtLabel(d.severity), d.diagnosing_provider_name,
          ])}
        />
      </PrintSection>

      <PrintSection title="Medications (Last 30 Days)">
        <PrintTable
          columns={['Medication', 'Dose', 'Doses Given', 'Last Given', 'Directions', 'Prescriber']}
          empty="No medications active or administered in the last 30 days."
          rows={medWindow.map(m => {
            const active = activeMedsByName.get(m.name);
            return [
              m.name, m.concentration, String(m.doses),
              m.last ? fmtDayTime(m.last) : '',
              `${active?.instructions || ''}${m.prn ? ' (PRN)' : ''}${m.active ? '' : ' (no longer active)'}`.trim(),
              active?.prescriber_name,
            ];
          })}
        />
      </PrintSection>

      <PrintSection title="Implants & Medical Devices">
        <PrintTable
          columns={['Device', 'Category', 'Make / Model', 'MRI', 'Placed', 'Managed By']}
          empty="No implants or medical devices recorded."
          rows={implants.map(im => [
            `${im.is_life_sustaining ? '(life-sustaining) ' : ''}${im.name}`,
            im.category, `${im.manufacturer || ''} ${im.model || ''}`.trim(),
            im.mri_safe, fmtDate(im.implant_date), im.managing_provider_name,
          ])}
        />
      </PrintSection>

      <PrintSection title="Symptoms (Last 30 Days)">
        <PrintTable
          columns={['Symptom', 'Severity', 'Location', 'Status', 'Date']}
          empty="No symptoms recorded."
          rows={symptoms.map(s => [
            fmtLabel(s.symptom_type), s.severity != null ? `${s.severity}/10` : '',
            s.location, s.is_resolved ? 'resolved' : 'active',
            s.timestamp ? fmtDate(s.timestamp) : '',
          ])}
        />
      </PrintSection>

      <PrintSection title="Care Team">
        <PrintTable
          columns={['Name', 'Title', 'Specialty', 'Type', 'Business', 'Phone', 'Primary']}
          empty="No providers assigned."
          rows={providers.map(p => [
            `${p.first_name} ${p.last_name}`, p.title, p.specialty, p.provider_type,
            p.business?.name, p.phone || p.business?.phone, p.is_primary ? 'Yes' : '',
          ])}
        />
      </PrintSection>
    </div>
  );
}

const AdminV2ProfileSummary = () => {
  const [searchParams] = useSearchParams();
  const { selectedPatient, setPatientId } = useAdminPatient();

  // Sync URL ?patient= id to active patient (e.g. from dashboard View Details)
  useEffect(() => {
    const patientId = searchParams.get('patient');
    if (patientId) {
      setPatientId(patientId);
    }
  }, [searchParams, setPatientId]);

  // The reporting window is fixed at mount so every section agrees on it.
  const [generatedAt] = useState(() => new Date());
  const windowStart = useMemo(() => {
    const d = new Date(generatedAt);
    d.setDate(d.getDate() - (WINDOW_DAYS - 1));
    d.setHours(0, 0, 0, 0);
    return d;
  }, [generatedAt]);
  const rangeLabel = `${fmtShortDate(windowStart)} — ${fmtShortDate(generatedAt, true)}`;

  const [diagnoses, setDiagnoses] = useState([]);
  const [symptoms, setSymptoms] = useState([]);
  const [medications, setMedications] = useState([]);       // currently active meds
  const [medHistory, setMedHistory] = useState([]);         // administrations in the window
  const [providers, setProviders] = useState([]);
  const [implants, setImplants] = useState([]);
  const [vitalsSummary, setVitalsSummary] = useState(null);
  const [pulseOxSummary, setPulseOxSummary] = useState(null);
  const [ventBreathRate, setVentBreathRate] = useState(null);
  const [nutritionSummary, setNutritionSummary] = useState([]);
  const [nutritionOutput, setNutritionOutput] = useState([]);
  const [vitalRanges, setVitalRanges] = useState([]);

  const [loadingVitals, setLoadingVitals] = useState(false);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingMeds, setLoadingMeds] = useState(false);
  const [loadingDiagnoses, setLoadingDiagnoses] = useState(false);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [loadingImplants, setLoadingImplants] = useState(false);

  useEffect(() => {
    if (!selectedPatient) return;
    const pid = selectedPatient.id;
    const tzOffsetMinutes = -new Date().getTimezoneOffset();
    const get = async (path, fallback = null) => {
      try {
        const response = await apiFetch(`${config.apiUrl}${path}`, { credentials: 'include' });
        if (response.ok) return await response.json();
      } catch (error) {
        console.error(`Error fetching ${path}:`, error);
      }
      return fallback;
    };
    const toYMD = (d) => d.toISOString().slice(0, 10);

    (async () => {
      setLoadingVitals(true);
      const [vitals, pulseOx, vent, ranges] = await Promise.all([
        get(`/api/vitals/patient/${pid}/summary?days=${WINDOW_DAYS}`),
        get(`/api/vitals/patient/${pid}/pulse-ox-summary?days=${WINDOW_DAYS}`),
        get(`/api/integrations/patient/${pid}/vent/breath-rate-hourly?days=${WINDOW_DAYS}`, { has_data: false, points: [] }),
        get(`/api/vitals/ranges?patient_id=${pid}`),
      ]);
      setVitalsSummary(vitals);
      setPulseOxSummary(pulseOx);
      setVentBreathRate(vent);
      setVitalRanges(ranges?.ranges || []);
      setLoadingVitals(false);
    })();

    (async () => {
      setLoadingEvents(true);
      const [sym, nutri, output] = await Promise.all([
        get(`/api/symptoms/patient/${pid}?limit=200&include_resolved=true`, []),
        get(`/api/nutrition/patient/${pid}/summary?days=${WINDOW_DAYS}&tz_offset_minutes=${tzOffsetMinutes}`, []),
        get(`/api/nutrition/outputs/patient/${pid}/history?days=${WINDOW_DAYS}&tz_offset_minutes=${tzOffsetMinutes}`, []),
      ]);
      setSymptoms(sym || []);
      setNutritionSummary(nutri || []);
      setNutritionOutput(output || []);
      setLoadingEvents(false);
    })();

    (async () => {
      setLoadingMeds(true);
      const start = new Date();
      start.setDate(start.getDate() - (WINDOW_DAYS - 1));
      const [active, history] = await Promise.all([
        get(`/api/admin/medications/active?patient_id=${pid}`, []),
        get(`/api/medications/history?patient_id=${pid}&start_date=${toYMD(start)}&end_date=${toYMD(new Date())}&limit=2000`),
      ]);
      setMedications(active || []);
      setMedHistory(history?.history || []);
      setLoadingMeds(false);
    })();

    (async () => {
      setLoadingDiagnoses(true);
      setDiagnoses(await get(`/api/diagnoses/patient/${pid}?active_only=true`, []) || []);
      setLoadingDiagnoses(false);
    })();
    (async () => {
      setLoadingProviders(true);
      setProviders(await get(`/api/providers/patient/${pid}?active_only=true`, []) || []);
      setLoadingProviders(false);
    })();
    (async () => {
      setLoadingImplants(true);
      setImplants(await get(`/api/implants/patient/${pid}?include_inactive=false`, []) || []);
      setLoadingImplants(false);
    })();
  }, [selectedPatient]);

  const rangeFor = (vitalKey, fieldKey = '') =>
    vitalRanges.find(r => r.vital_key === vitalKey && (r.field_key || '') === fieldKey);

  // Vital trend rows: pulse ox (hourly) for SpO2/HR; vent hourly for RR when
  // available, else manual daily; manual daily for MAP + temperature.
  const vitalRows = useMemo(() => {
    const pox = (key) => (pulseOxSummary?.[key] || []).map(p => p.avg).filter(v => v != null);
    const daily = (key) => (vitalsSummary?.[key] || []).map(p => p.avg).filter(v => v != null);
    const ventSeries = (ventBreathRate?.points || []).map(p => p.avg).filter(v => v != null);
    const useVent = Boolean(ventBreathRate?.has_data && ventSeries.length);
    return [
      { key: 'spo2', label: 'SpO2 (%)', source: 'Pulse ox, hourly', series: pox('spo2'), range: rangeFor('spo2'), fmt: v => `${Math.round(v)}%` },
      { key: 'heart_rate', label: 'Heart Rate (BPM)', source: 'Pulse ox, hourly', series: pox('heart_rate'), range: rangeFor('heart_rate'), fmt: v => `${Math.round(v)}` },
      { key: 'respiratory_rate', label: 'Respiratory Rate', source: useVent ? 'Vent, hourly' : 'Manual', series: useVent ? ventSeries : daily('respiratory_rate'), range: rangeFor('respiratory_rate'), fmt: v => `${Math.round(v)}` },
      { key: 'map', label: 'Mean Arterial Pressure', source: 'Manual', series: daily('blood_pressure'), range: rangeFor('blood_pressure', 'map'), fmt: v => `${Math.round(v)}` },
      { key: 'temperature', label: 'Temperature (°F)', source: 'Manual', series: daily('temperature'), range: rangeFor('temperature'), fmt: v => v.toFixed(1) },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulseOxSummary, vitalsSummary, ventBreathRate, vitalRanges]);

  // 30-day events
  const symptoms30 = useMemo(
    () => symptoms.filter(s => s.timestamp && new Date(s.timestamp) >= windowStart),
    [symptoms, windowStart]
  );
  const symptomPeaks = useMemo(() => {
    const peaks = new Map();
    for (const s of symptoms30) {
      const key = s.symptom_type;
      if (!peaks.has(key) || (s.severity ?? 0) > peaks.get(key)) peaks.set(key, s.severity ?? 0);
    }
    return [...peaks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
  }, [symptoms30]);
  const activeSymptomCount = symptoms30.filter(s => !s.is_resolved).length;

  const nutriDays = nutritionSummary.filter(d => (d.calories || 0) > 0 || (d.water_ml || 0) > 0);
  const avgCalories = (() => {
    const vals = nutriDays.map(d => d.calories).filter(v => v > 0);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  })();
  const urineTotal = nutritionOutput.reduce((a, d) => a + (d.urine_count || 0), 0);
  const urineMlTotal = nutritionOutput.reduce((a, d) => a + (d.urine_ml || 0), 0);
  const urineDays = nutritionOutput.filter(d => (d.urine_count || 0) > 0 || (d.urine_ml || 0) > 0).length;
  const bowelTotal = nutritionOutput.reduce((a, d) => a + (d.bowel_count || 0), 0);
  const bowelDays = nutritionOutput.filter(d => (d.bowel_count || 0) > 0).length;

  // Full 30-day medication list: everything currently active plus everything
  // actually administered in the window (even if since discontinued).
  const activeMedsByName = useMemo(() => new Map(medications.map(m => [m.name, m])), [medications]);
  const medWindow = useMemo(() => {
    const byName = new Map();
    for (const m of medications) {
      byName.set(m.name, {
        name: m.name, concentration: m.concentration, prn: Boolean(m.as_needed),
        active: true, doses: 0, last: m.last_administered || null,
      });
    }
    for (const h of medHistory) {
      if (h.status === 'skipped' || !h.administered_at) continue;
      const entry = byName.get(h.medication_name) || {
        name: h.medication_name, concentration: h.concentration, prn: false,
        active: false, doses: 0, last: null,
      };
      entry.doses += 1;
      if (!entry.last || h.administered_at > entry.last) entry.last = h.administered_at;
      byName.set(h.medication_name, entry);
    }
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [medications, medHistory]);

  // Care team grouped by specialty, primary provider's group first.
  const teamGroups = useMemo(() => {
    const groups = new Map();
    for (const p of providers) {
      const key = p.specialty || fmtLabel(p.provider_type) || 'General';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
    for (const list of groups.values()) list.sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0));
    return [...groups.entries()].sort((a, b) =>
      (b[1].some(p => p.is_primary) ? 1 : 0) - (a[1].some(p => p.is_primary) ? 1 : 0) || a[0].localeCompare(b[0])
    );
  }, [providers]);

  if (!selectedPatient) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-page">
          <div className="admin-v2-empty-state">
            <p>Please select a patient from the sidebar to view their summary.</p>
          </div>
        </div>
      </AdminV2Layout>
    );
  }

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <div className="clin-summary">
          <div className="cs-header">
            <div>
              <h1 className="cs-title">{WINDOW_DAYS}-Day Clinical Summary</h1>
              <div className="cs-range">
                <CalendarIcon size={16} />
                <span>{rangeLabel}</span>
              </div>
              <div className="cs-generated">Generated {fmtDayTime(generatedAt)}</div>
              <div className="cs-purpose">Appointment + admission handoff</div>
            </div>
            <button type="button" className="cs-print-btn" onClick={() => window.print()}>
              <PrintIcon size={16} /> Print / Share
            </button>
          </div>

          <Section num={1} title={`${WINDOW_DAYS}-Day Vital Trends`} loading={loadingVitals}>
            {vitalRows.map(row => {
              const hasData = row.series.length > 0;
              const avg = hasData ? row.series.reduce((a, b) => a + b, 0) / row.series.length : null;
              return (
                <div key={row.key} className="cs-vital-row">
                  <div className="cs-row-main">
                    <div className="cs-row-title">{row.label}</div>
                    <div className={`cs-row-sub${hasData ? ' accent' : ''}`}>{row.source}</div>
                  </div>
                  <div className="cs-spark-track">
                    {hasData ? (
                      <Spark series={row.series} lo={row.range?.expected_min} hi={row.range?.expected_max} />
                    ) : (
                      <>
                        <span className="cs-nodata-line" aria-hidden="true" />
                        <span className="cs-nodata">No data</span>
                      </>
                    )}
                  </div>
                  <div className="cs-vital-avg">
                    <span className="cs-avg-label">Avg</span>
                    <span className={`cs-avg-value${hasData ? '' : ' none'}`}>{hasData ? row.fmt(avg) : '—'}</span>
                  </div>
                </div>
              );
            })}
          </Section>

          <Section num={2} title={`${WINDOW_DAYS}-Day Events`} loading={loadingEvents}>
            <div className="cs-row">
              <span className="cs-row-icon" aria-hidden="true"><VitalsIcon size={18} /></span>
              <div className="cs-row-main">
                <div className="cs-row-title">Symptoms</div>
                <div className="cs-row-sub">
                  {symptoms30.length === 0 ? '0 recorded' : (
                    <span className="cs-frag">
                      <span>{symptoms30.length} recorded</span>
                      {symptomPeaks.map(([type, sev]) => (
                        <React.Fragment key={type}>
                          <span className="cs-sep">|</span>
                          <span>{fmtLabel(type)} <span className={severityTone(sev)}>{sev}/10</span></span>
                        </React.Fragment>
                      ))}
                    </span>
                  )}
                </div>
              </div>
              <span className={`cs-status ${symptoms30.length === 0 ? 'cs-tone-dim' : activeSymptomCount > 0 ? 'cs-tone-due' : 'cs-tone-ok'}`}>
                {symptoms30.length === 0 ? '—' : activeSymptomCount > 0 ? `${activeSymptomCount} active` : 'Resolved'}
              </span>
            </div>
            <div className="cs-row">
              <span className="cs-row-icon" aria-hidden="true"><NutritionIcon size={18} /></span>
              <div className="cs-row-main">
                <div className="cs-row-title">Nutrition</div>
                <div className={`cs-row-sub${nutriDays.length === 0 ? ' cs-tone-due' : ''}`}>
                  {nutriDays.length === 0 ? 'No data' : `${nutriDays.length} days logged`}
                </div>
              </div>
              <span className={`cs-status ${avgCalories == null ? 'cs-tone-dim' : 'cs-tone-live'}`}>
                {avgCalories == null ? '—' : `Avg ${avgCalories.toLocaleString()} cal/day`}
              </span>
            </div>
            <div className="cs-row">
              <span className="cs-row-icon" aria-hidden="true"><UrineIcon size={18} /></span>
              <div className="cs-row-main">
                <div className="cs-row-title">Urine Output</div>
                <div className={`cs-row-sub${urineTotal === 0 ? ' cs-tone-due' : ''}`}>{urineTotal} recorded</div>
              </div>
              <span className={`cs-status ${urineDays === 0 ? 'cs-tone-dim' : 'cs-tone-live'}`}>
                {urineDays === 0 ? '—' : urineMlTotal > 0 ? `Avg ${Math.round(urineMlTotal / urineDays)} mL/day` : `${urineDays} days logged`}
              </span>
            </div>
            <div className="cs-row">
              <span className="cs-row-icon" aria-hidden="true"><BowelIcon size={18} /></span>
              <div className="cs-row-main">
                <div className="cs-row-title">Bowel Movements</div>
                <div className={`cs-row-sub${bowelTotal === 0 ? ' cs-tone-due' : ''}`}>{bowelTotal} recorded</div>
              </div>
              <span className={`cs-status ${bowelDays === 0 ? 'cs-tone-dim' : 'cs-tone-live'}`}>
                {bowelDays === 0 ? '—' : `Avg ${(bowelTotal / Math.min(WINDOW_DAYS, Math.max(bowelDays, 1))).toFixed(1)}/day`}
              </span>
            </div>
          </Section>

          <Section num={3} title={`Medications · ${WINDOW_DAYS} Days`} loading={loadingMeds}>
            {medWindow.length === 0 ? (
              <EmptyRow icon={<PillIcon size={18} />} label="None recorded" />
            ) : medWindow.map(m => (
              <div key={m.name} className="cs-row">
                <span className="cs-row-icon" aria-hidden="true"><PillIcon size={18} /></span>
                <div className="cs-row-body">
                  <div className="cs-row-head">
                    <div className="cs-row-title">{m.name}</div>
                    <span className={`cs-status ${m.doses > 0 ? 'cs-tone-live' : 'cs-tone-dim'}`}>
                      {m.doses} {m.doses === 1 ? 'dose' : 'doses'}
                    </span>
                    {m.prn && <span className="cs-pill cs-tone-due">PRN</span>}
                    {!m.active && <span className="cs-pill cs-tone-idle">Ended</span>}
                  </div>
                  <div className="cs-row-sub">
                    <span className="cs-frag">
                      {m.concentration && <span>{m.concentration}</span>}
                      <span>
                        {m.concentration && <span className="cs-sep">| </span>}
                        {m.last ? `Last given ${fmtDayTime(m.last)}` : `Not given in ${WINDOW_DAYS} days`}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </Section>

          <Section num={4} title="Diagnoses" loading={loadingDiagnoses}>
            {diagnoses.length === 0 ? (
              <EmptyRow icon={<VirusIcon size={18} />} label="None recorded" />
            ) : diagnoses.map(d => (
              <div key={d.id} className="cs-row">
                <span className="cs-row-icon" aria-hidden="true"><VirusIcon size={18} /></span>
                <div className="cs-row-main">
                  <div className="cs-row-title">{d.name}</div>
                  {(d.icd10_code || d.diagnosing_provider_name) && (
                    <div className="cs-row-sub">
                      <span className="cs-frag">
                        {d.icd10_code && <span>{d.icd10_code}</span>}
                        {d.icd10_code && d.diagnosing_provider_name && <span className="cs-sep">|</span>}
                        {d.diagnosing_provider_name && <span>{d.diagnosing_provider_name}</span>}
                      </span>
                    </div>
                  )}
                </div>
                {d.is_primary_diagnosis && <span className="cs-pill cs-tone-live">Primary</span>}
                {d.severity && <span className={`cs-status ${diagnosisSeverityTone(d.severity)}`}>{fmtLabel(d.severity)}</span>}
                <span className={`cs-status ${diagnosisStatusTone(d.status)}`}>{fmtLabel(d.status)}</span>
              </div>
            ))}
          </Section>

          <Section num={5} title="Care Team by Specialty" loading={loadingProviders}>
            {providers.length === 0 ? (
              <EmptyRow icon={<UsersIcon size={18} />} label="None assigned" />
            ) : teamGroups.map(([specialty, list]) => list.map((p, i) => {
              const phone = p.phone || p.business?.phone;
              return (
                <div key={p.id} className="cs-row">
                  {i === 0
                    ? <span className="cs-row-icon" aria-hidden="true"><UsersIcon size={18} /></span>
                    : <span className="cs-row-spacer" aria-hidden="true" />}
                  <div className="cs-row-main">
                    {i === 0 && <div className="cs-row-sub accent above">{specialty}</div>}
                    <div className="cs-row-title">{[p.title, p.first_name, p.last_name].filter(Boolean).join(' ')}</div>
                  </div>
                  {p.is_primary && <span className="cs-status cs-tone-live">Primary</span>}
                  {phone && (
                    <a className="cs-icon-btn" href={`tel:${phone}`} aria-label={`Call ${p.first_name} ${p.last_name}`}>
                      <PhoneIcon size={16} />
                    </a>
                  )}
                  <Link className="cs-chevron-link" to="/care/profile/providers" aria-label={`View ${p.first_name} ${p.last_name} in Providers`}>
                    <ChevronRightIcon size={18} />
                  </Link>
                </div>
              );
            }))}
          </Section>

          <Section num={6} title="Devices / Implants" loading={loadingImplants}>
            {implants.length === 0 ? (
              <EmptyRow icon={<BodyIcon size={18} />} label="None recorded" />
            ) : implants.map(im => (
              <div key={im.id} className="cs-row">
                <span className="cs-row-icon" aria-hidden="true"><BodyIcon size={18} /></span>
                <div className="cs-row-main">
                  <div className="cs-row-title">{im.name}</div>
                  <div className="cs-row-sub">
                    <span className="cs-frag">
                      {im.category && <span>{fmtLabel(im.category)}</span>}
                      {im.category && (im.manufacturer || im.model) && <span className="cs-sep">|</span>}
                      {(im.manufacturer || im.model) && <span>{`${im.manufacturer || ''} ${im.model || ''}`.trim()}</span>}
                    </span>
                  </div>
                </div>
                {im.mri_safe && <span className={`cs-status ${im.mri_safe === 'safe' ? 'cs-tone-ok' : im.mri_safe === 'unsafe' ? 'cs-tone-alert' : 'cs-tone-due'}`}>MRI {im.mri_safe}</span>}
                {im.is_life_sustaining && <span className="cs-pill cs-tone-alert">Life-sustaining</span>}
              </div>
            ))}
          </Section>

          <div className="cs-footnote">
            <InfoIcon size={16} />
            <span>Full report includes expanded charts, medication directions + provider contact details.</span>
          </div>
        </div>

        {/* Dedicated print document — hidden on screen, the only thing that prints. */}
        <SummaryPrintView
          patient={selectedPatient}
          rangeLabel={rangeLabel}
          diagnoses={diagnoses}
          symptoms={symptoms30}
          medWindow={medWindow}
          activeMedsByName={activeMedsByName}
          implants={implants}
          providers={providers}
        />
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2ProfileSummary;
