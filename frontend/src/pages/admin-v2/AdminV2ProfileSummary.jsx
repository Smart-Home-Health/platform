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
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, Area, ComposedChart } from 'recharts';
import AdminV2Layout from './AdminV2Layout';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import config from '../../config';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useChartColors } from '../../hooks/useChartColors';
import './AdminV2.css';

const getSeverityColor = (severity) => {
  if (severity >= 7) return '#ef4444';
  if (severity >= 4) return '#f59e0b';
  return '#22c55e';
};

const statusVariant = (status) => (
  { active: 'success', chronic: 'warning', resolved: 'muted', in_remission: 'info', ruled_out: 'danger' }[status] || 'muted'
);
const mriVariant = (mriSafe) => (
  { safe: 'success', conditional: 'warning', unsafe: 'danger' }[mriSafe] || 'muted'
);

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '');

// Loading/empty placeholder text.
const Muted = ({ children }) => <p className="text-sm text-muted-foreground">{children}</p>;

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

function SummaryPrintView({ patient, diagnoses, symptoms, medications, implants, providers }) {
  return (
    <div className="summary-print-root bg-white font-sans text-black">
      <div className="border-b-2 border-black pb-2">
        <div className="text-[20pt] font-bold leading-tight">{patient.first_name} {patient.last_name}</div>
        <div className="flex justify-between text-[10pt] text-black/70">
          <span>Patient Health Summary</span>
          <span>Printed {new Date().toLocaleString()}</span>
        </div>
      </div>

      <PrintSection title="Active Diagnoses">
        <PrintTable
          columns={['Diagnosis', 'ICD-10', 'Status', 'Severity', 'Provider']}
          empty="No active diagnoses recorded."
          rows={diagnoses.map(d => [
            `${d.is_primary_diagnosis ? '★ ' : ''}${d.name}`,
            d.icd10_code, d.status, d.severity, d.diagnosing_provider_name,
          ])}
        />
      </PrintSection>

      <PrintSection title="Current Medications">
        <PrintTable
          columns={['Medication', 'Dose', 'Qty', 'Instructions', 'Prescriber']}
          empty="No active medications."
          rows={medications.map(m => [
            m.name, m.concentration,
            m.quantity ? `${m.quantity} ${m.quantity_unit || ''}` : '',
            `${m.instructions || ''}${m.as_needed ? ' (PRN)' : ''}`,
            m.prescriber_name,
          ])}
        />
      </PrintSection>

      <PrintSection title="Implants & Medical Devices">
        <PrintTable
          columns={['Device', 'Category', 'Make / Model', 'MRI', 'Placed', 'Managed By']}
          empty="No implants or medical devices recorded."
          rows={implants.map(im => [
            `${im.is_life_sustaining ? '❤ ' : ''}${im.name}`,
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
            s.symptom_type, s.severity != null ? `${s.severity}/10` : '',
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
            p.business?.name, p.phone || p.business?.phone, p.is_primary ? '✓' : '',
          ])}
        />
      </PrintSection>
    </div>
  );
}

const PrinterIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 6 2 18 2 18 9" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </svg>
);

const AdminV2ProfileSummary = () => {
  const [searchParams] = useSearchParams();
  const { selectedPatient, setPatientId } = useAdminPatient();
  const chart = useChartColors();

  // Sync URL ?patient= id to active patient (e.g. from dashboard View Details)
  useEffect(() => {
    const patientId = searchParams.get('patient');
    if (patientId) {
      setPatientId(patientId);
    }
  }, [searchParams, setPatientId]);

  // State for fetched data
  const [diagnoses, setDiagnoses] = useState([]);
  const [symptoms, setSymptoms] = useState([]);
  const [medications, setMedications] = useState([]);
  const [providers, setProviders] = useState([]);
  const [implants, setImplants] = useState([]);

  // Loading states
  const [loadingDiagnoses, setLoadingDiagnoses] = useState(false);
  const [loadingSymptoms, setLoadingSymptoms] = useState(false);
  const [loadingMedications, setLoadingMedications] = useState(false);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [loadingImplants, setLoadingImplants] = useState(false);
  const [vitalsSummary, setVitalsSummary] = useState(null);
  const [loadingVitals, setLoadingVitals] = useState(false);
  const [pulseOxSummary, setPulseOxSummary] = useState(null);
  const [loadingPulseOx, setLoadingPulseOx] = useState(false);
  const [ventBreathRate, setVentBreathRate] = useState(null);   // {has_data, points}
  const [loadingVentBreath, setLoadingVentBreath] = useState(false);
  const [nutritionSummary, setNutritionSummary] = useState([]);
  const [loadingNutrition, setLoadingNutrition] = useState(false);
  const [nutritionOutput, setNutritionOutput] = useState([]);
  const [loadingNutritionOutput, setLoadingNutritionOutput] = useState(false);

  // Fetch all data when patient changes
  useEffect(() => {
    if (!selectedPatient) return;

    const fetchDiagnoses = async () => {
      setLoadingDiagnoses(true);
      try {
        const response = await fetch(`${config.apiUrl}/api/diagnoses/patient/${selectedPatient.id}?active_only=true`, { credentials: 'include' });
        if (response.ok) setDiagnoses(await response.json());
      } catch (error) {
        console.error('Error fetching diagnoses:', error);
      } finally {
        setLoadingDiagnoses(false);
      }
    };

    const fetchSymptoms = async () => {
      setLoadingSymptoms(true);
      try {
        const response = await fetch(`${config.apiUrl}/api/symptoms/patient/${selectedPatient.id}?limit=50&include_resolved=true`, { credentials: 'include' });
        if (response.ok) setSymptoms(await response.json());
      } catch (error) {
        console.error('Error fetching symptoms:', error);
      } finally {
        setLoadingSymptoms(false);
      }
    };

    const fetchMedications = async () => {
      setLoadingMedications(true);
      try {
        const response = await fetch(`${config.apiUrl}/api/admin/medications/active?patient_id=${selectedPatient.id}`, { credentials: 'include' });
        if (response.ok) setMedications(await response.json());
      } catch (error) {
        console.error('Error fetching medications:', error);
      } finally {
        setLoadingMedications(false);
      }
    };

    const fetchProviders = async () => {
      setLoadingProviders(true);
      try {
        const response = await fetch(`${config.apiUrl}/api/providers/patient/${selectedPatient.id}?active_only=true`, { credentials: 'include' });
        if (response.ok) setProviders(await response.json());
      } catch (error) {
        console.error('Error fetching providers:', error);
      } finally {
        setLoadingProviders(false);
      }
    };

    const fetchImplants = async () => {
      setLoadingImplants(true);
      try {
        const response = await fetch(`${config.apiUrl}/api/implants/patient/${selectedPatient.id}?include_inactive=false`, { credentials: 'include' });
        if (response.ok) setImplants(await response.json());
      } catch (error) {
        console.error('Error fetching implants:', error);
      } finally {
        setLoadingImplants(false);
      }
    };

    const fetchVitalsSummary = async () => {
      setLoadingVitals(true);
      try {
        const response = await fetch(`${config.apiUrl}/api/vitals/patient/${selectedPatient.id}/summary?days=30`, { credentials: 'include' });
        if (response.ok) setVitalsSummary(await response.json());
      } catch (error) {
        console.error('Error fetching vitals summary:', error);
      } finally {
        setLoadingVitals(false);
      }
    };

    const fetchPulseOxSummary = async () => {
      setLoadingPulseOx(true);
      try {
        const response = await fetch(`${config.apiUrl}/api/vitals/patient/${selectedPatient.id}/pulse-ox-summary?days=30`, { credentials: 'include' });
        if (response.ok) setPulseOxSummary(await response.json());
      } catch (error) {
        console.error('Error fetching pulse-ox summary:', error);
      } finally {
        setLoadingPulseOx(false);
      }
    };

    const fetchVentBreathRate = async () => {
      setLoadingVentBreath(true);
      try {
        const response = await fetch(`${config.apiUrl}/api/integrations/patient/${selectedPatient.id}/vent/breath-rate-hourly?days=30`, { credentials: 'include' });
        if (response.ok) {
          setVentBreathRate(await response.json());
        } else {
          setVentBreathRate({ has_data: false, points: [] });
        }
      } catch (error) {
        console.error('Error fetching vent breath rate:', error);
        setVentBreathRate({ has_data: false, points: [] });
      } finally {
        setLoadingVentBreath(false);
      }
    };

    const fetchNutritionSummary = async () => {
      setLoadingNutrition(true);
      try {
        const tzOffsetMinutes = -new Date().getTimezoneOffset();
        const response = await fetch(`${config.apiUrl}/api/nutrition/patient/${selectedPatient.id}/summary?days=30&tz_offset_minutes=${tzOffsetMinutes}`, { credentials: 'include' });
        if (response.ok) setNutritionSummary(await response.json());
      } catch (error) {
        console.error('Error fetching nutrition summary:', error);
      } finally {
        setLoadingNutrition(false);
      }
    };

    const fetchNutritionOutput = async () => {
      setLoadingNutritionOutput(true);
      try {
        const tzOffsetMinutes = -new Date().getTimezoneOffset();
        const response = await fetch(`${config.apiUrl}/api/nutrition/outputs/patient/${selectedPatient.id}/history?days=30&tz_offset_minutes=${tzOffsetMinutes}`, { credentials: 'include' });
        if (response.ok) setNutritionOutput(await response.json());
      } catch (error) {
        console.error('Error fetching nutrition output:', error);
      } finally {
        setLoadingNutritionOutput(false);
      }
    };

    fetchDiagnoses();
    fetchSymptoms();
    fetchMedications();
    fetchProviders();
    fetchImplants();
    fetchVitalsSummary();
    fetchPulseOxSummary();
    fetchVentBreathRate();
    fetchNutritionSummary();
    fetchNutritionOutput();
  }, [selectedPatient]);

  // Helper to format vitals data for chart display
  const formatVitalChartData = (vitalType) => {
    if (!vitalsSummary || !vitalsSummary[vitalType]) return [];
    return vitalsSummary[vitalType].map(d => ({
      date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      min: d.min, avg: d.avg, max: d.max
    }));
  };

  const formatVentBreathChartData = () => {
    if (!ventBreathRate || !ventBreathRate.points) return [];
    return ventBreathRate.points.map(d => {
      const dt = new Date(d.date);
      return {
        date: dt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric' }),
        min: d.min != null ? Math.round(d.min) : null,
        avg: d.avg != null ? Math.round(d.avg * 10) / 10 : null,
        max: d.max != null ? Math.round(d.max) : null,
      };
    });
  };

  const formatPulseOxChartData = (key) => {
    if (!pulseOxSummary || !pulseOxSummary[key]) return [];
    return pulseOxSummary[key].map(d => {
      const dt = new Date(d.date);
      return {
        date: dt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric' }),
        min: d.min, avg: d.avg, max: d.max,
      };
    });
  };

  const formatNutritionChartData = () => {
    return nutritionSummary.map(d => {
      let caloriesDeviation = null;
      let fluidsDeviation = null;
      if (d.calories_target && d.calories_target > 0) {
        caloriesDeviation = Math.round(((d.calories - d.calories_target) / d.calories_target) * 100);
      }
      const fluidTarget = d.total_fluid_target || d.water_target;
      if (fluidTarget && fluidTarget > 0) {
        fluidsDeviation = Math.round(((d.water_ml - fluidTarget) / fluidTarget) * 100);
      }
      return {
        date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        calories: caloriesDeviation, fluids: fluidsDeviation
      };
    });
  };

  const nutritionChartDomain = () => {
    const data = formatNutritionChartData();
    const vals = data.flatMap(d => [d.calories, d.fluids]).filter(v => v != null);
    if (!vals.length) return [-50, 50];
    const maxAbs = Math.max(50, ...vals.map(Math.abs));
    const bound = Math.ceil(maxAbs / 25) * 25;
    return [-bound, bound];
  };

  const formatOutputChartData = () => {
    return nutritionOutput.map(d => ({
      date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      urine: d.urine_ml || 0,
      urineCount: d.urine_count || 0,
      bowel: d.bowel_count || 0,
      urineTarget: d.urine_target,
      bowelTarget: d.bowel_target
    }));
  };

  const handlePrint = () => {
    window.print();
  };

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

  const tooltipStyle = { backgroundColor: chart.cutout, border: `1px solid ${chart.grid}`, borderRadius: '8px', color: chart.foreground };

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <div className="tw flex flex-col gap-4">
          <div className="flex justify-end">
            <Button variant="secondary" onClick={handlePrint}>
              <PrinterIcon /> Print Summary
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Active Diagnoses */}
            <Card>
              <CardHeader className="py-3"><CardTitle className="text-sm">Active Diagnoses</CardTitle></CardHeader>
              <CardContent className="py-3">
                {loadingDiagnoses ? <Muted>Loading diagnoses…</Muted> : diagnoses.length === 0 ? <Muted>No active diagnoses recorded</Muted> : (
                  <ul className="flex flex-col gap-2">
                    {diagnoses.map(dx => (
                      <li key={dx.id} className="rounded-md border border-border p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                            {dx.is_primary_diagnosis && <Badge variant="info">Primary</Badge>}
                            {dx.name}
                          </span>
                          <Badge variant={statusVariant(dx.status)}>{dx.status}</Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          {dx.icd10_code && <span>{dx.icd10_code}</span>}
                          {dx.severity && <span>{dx.severity}</span>}
                          {dx.diagnosing_provider_name && <span>{dx.diagnosing_provider_name}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Recent Symptoms */}
            <Card>
              <CardHeader className="py-3"><CardTitle className="text-sm">Symptoms (Last 30 Days)</CardTitle></CardHeader>
              <CardContent className="py-3">
                {loadingSymptoms ? <Muted>Loading symptoms…</Muted> : symptoms.length === 0 ? <Muted>No symptoms recorded</Muted> : (
                  <ul className="flex flex-col gap-2">
                    {symptoms.map(symptom => (
                      <li key={symptom.id} className="rounded-md border border-border p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-foreground">{symptom.symptom_type}</span>
                          <Badge variant={symptom.is_resolved ? 'muted' : 'success'}>{symptom.is_resolved ? 'resolved' : 'active'}</Badge>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="rounded px-1.5 py-0.5 font-medium text-white" style={{ backgroundColor: getSeverityColor(symptom.severity) }}>
                            {symptom.severity}/10
                          </span>
                          {symptom.location && <span>{symptom.location}</span>}
                          {symptom.timestamp && <span>{fmtDate(symptom.timestamp)}</span>}
                          {symptom.duration && <span>{symptom.duration}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Current Medications */}
            <Card>
              <CardHeader className="py-3"><CardTitle className="text-sm">Current Medications</CardTitle></CardHeader>
              <CardContent className="py-3">
                {loadingMedications ? <Muted>Loading medications…</Muted> : medications.length === 0 ? <Muted>No active medications</Muted> : (
                  <ul className="flex flex-col gap-2">
                    {medications.map(med => (
                      <li key={med.id} className="rounded-md border border-border p-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{med.name}</span>
                          {med.concentration && <Badge variant="secondary">{med.concentration}</Badge>}
                          {med.quantity && <Badge variant="secondary">{med.quantity} {med.quantity_unit || ''}</Badge>}
                          {med.as_needed && <Badge variant="warning">PRN</Badge>}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          {med.instructions && <span>{med.instructions}</span>}
                          {med.prescriber_name && <span>· {med.prescriber_name}</span>}
                          {med.last_administered && <span>· Last: {new Date(med.last_administered).toLocaleString()}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Implants */}
            <Card>
              <CardHeader className="py-3"><CardTitle className="text-sm">Implants &amp; Medical Devices</CardTitle></CardHeader>
              <CardContent className="py-3">
                {loadingImplants ? <Muted>Loading implants…</Muted> : implants.length === 0 ? <Muted>No implants or medical devices recorded</Muted> : (
                  <ul className="flex flex-col gap-2">
                    {implants.map(implant => (
                      <li key={implant.id} className="rounded-md border border-border p-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-foreground">{implant.name}</span>
                          {implant.is_life_sustaining && <Badge variant="danger">Life Sustaining</Badge>}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {implant.category && <span>{implant.category}</span>}
                          {(implant.manufacturer || implant.model) && <span>{implant.manufacturer} {implant.model}</span>}
                          {implant.mri_safe && <Badge variant={mriVariant(implant.mri_safe)}>MRI: {implant.mri_safe}</Badge>}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          {implant.implant_date && <span>Placed: {fmtDate(implant.implant_date)}</span>}
                          {implant.managing_provider_name && <span>· {implant.managing_provider_name}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Vitals Charts */}
            <Card className="lg:col-span-2">
              <CardHeader className="py-3"><CardTitle className="text-sm">Vitals Trends (30 Days)</CardTitle></CardHeader>
              <CardContent className="py-3">
                {loadingVitals ? <Muted>Loading vitals data…</Muted> : !vitalsSummary ? <Muted>No vitals data available</Muted> : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="min-w-0">
                      <h3 className="mb-1 text-sm font-medium text-foreground">SpO2 (%) <span className="text-xs text-muted-foreground">— pulse ox, hourly</span></h3>
                      {loadingPulseOx ? <Muted>Loading…</Muted> : (
                        <ResponsiveContainer width="100%" height={180}>
                          <ComposedChart data={formatPulseOxChartData('spo2')} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: chart.axis }} interval="preserveStartEnd" minTickGap={40} />
                            <YAxis domain={[80, 100]} tick={{ fontSize: 10, fill: chart.axis }} />
                            <Tooltip contentStyle={tooltipStyle} />
                            <ReferenceLine y={92} stroke="#ef4444" strokeDasharray="3 3" />
                            <Area type="monotone" dataKey="max" stroke="none" fill="#3b82f6" fillOpacity={0.15} />
                            <Area type="monotone" dataKey="min" stroke="none" fill={chart.cutout} fillOpacity={1} />
                            <Line type="monotone" dataKey="avg" stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls />
                          </ComposedChart>
                        </ResponsiveContainer>
                      )}
                    </div>

                    <div className="min-w-0">
                      <h3 className="mb-1 text-sm font-medium text-foreground">Heart Rate (BPM) <span className="text-xs text-muted-foreground">— pulse ox, hourly</span></h3>
                      {loadingPulseOx ? <Muted>Loading…</Muted> : (
                        <ResponsiveContainer width="100%" height={180}>
                          <ComposedChart data={formatPulseOxChartData('heart_rate')} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: chart.axis }} interval="preserveStartEnd" minTickGap={40} />
                            <YAxis domain={[40, 140]} tick={{ fontSize: 10, fill: chart.axis }} />
                            <Tooltip contentStyle={tooltipStyle} />
                            <Area type="monotone" dataKey="max" stroke="none" fill="#ef4444" fillOpacity={0.15} />
                            <Area type="monotone" dataKey="min" stroke="none" fill={chart.cutout} fillOpacity={1} />
                            <Line type="monotone" dataKey="avg" stroke="#ef4444" strokeWidth={2} dot={false} connectNulls />
                          </ComposedChart>
                        </ResponsiveContainer>
                      )}
                    </div>

                    {(() => {
                      const useVent = ventBreathRate?.has_data;
                      const data = useVent ? formatVentBreathChartData() : formatVitalChartData('respiratory_rate');
                      return (
                        <div className="min-w-0">
                          <h3 className="mb-1 text-sm font-medium text-foreground">{useVent ? 'Breath Rate (vent, hourly)' : 'Respiratory Rate'}</h3>
                          {(useVent ? loadingVentBreath : loadingVitals) ? <Muted>Loading…</Muted> : (
                            <ResponsiveContainer width="100%" height={180}>
                              <ComposedChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                                <XAxis dataKey="date" tick={{ fontSize: 10, fill: chart.axis }} interval={useVent ? 'preserveStartEnd' : 6} minTickGap={useVent ? 40 : undefined} />
                                <YAxis domain={[0, 40]} tick={{ fontSize: 10, fill: chart.axis }} />
                                <Tooltip contentStyle={tooltipStyle} />
                                <Area type="monotone" dataKey="max" stroke="none" fill="#22c55e" fillOpacity={0.15} />
                                <Area type="monotone" dataKey="min" stroke="none" fill={chart.cutout} fillOpacity={1} />
                                <Line type="monotone" dataKey="avg" stroke="#22c55e" strokeWidth={2} dot={false} connectNulls />
                              </ComposedChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                      );
                    })()}

                    <div className="min-w-0">
                      <h3 className="mb-1 text-sm font-medium text-foreground">Temperature (°F)</h3>
                      <ResponsiveContainer width="100%" height={180}>
                        <ComposedChart data={formatVitalChartData('temperature')} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: chart.axis }} interval={6} />
                          <YAxis domain={[96, 102]} tick={{ fontSize: 10, fill: chart.axis }} />
                          <Tooltip contentStyle={tooltipStyle} />
                          <ReferenceLine y={100.4} stroke="#ef4444" strokeDasharray="3 3" />
                          <Area type="monotone" dataKey="max" stroke="none" fill="#f59e0b" fillOpacity={0.15} />
                          <Area type="monotone" dataKey="min" stroke="none" fill={chart.cutout} fillOpacity={1} />
                          <Line type="monotone" dataKey="avg" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="min-w-0 sm:col-span-2">
                      <h3 className="mb-1 text-sm font-medium text-foreground">Mean Arterial Pressure (mmHg)</h3>
                      <ResponsiveContainer width="100%" height={180}>
                        <ComposedChart data={formatVitalChartData('blood_pressure')} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: chart.axis }} interval={6} />
                          <YAxis domain={[60, 110]} tick={{ fontSize: 10, fill: chart.axis }} />
                          <Tooltip contentStyle={tooltipStyle} />
                          <ReferenceLine y={70} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: 'Low', fill: '#f59e0b', fontSize: 10 }} />
                          <ReferenceLine y={100} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: 'High', fill: '#f59e0b', fontSize: 10 }} />
                          <Area type="monotone" dataKey="max" stroke="none" fill="#8b5cf6" fillOpacity={0.15} />
                          <Area type="monotone" dataKey="min" stroke="none" fill={chart.cutout} fillOpacity={1} />
                          <Line type="monotone" dataKey="avg" stroke="#8b5cf6" strokeWidth={2} dot={false} connectNulls name="MAP" />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Nutrition Intake Chart */}
            <Card className="lg:col-span-2">
              <CardHeader className="py-3"><CardTitle className="text-sm">Nutrition Intake (% from Goal — 30 Days)</CardTitle></CardHeader>
              <CardContent className="py-3">
                {loadingNutrition ? <Muted>Loading nutrition data…</Muted> : nutritionSummary.length === 0 ? <Muted>No nutrition data available</Muted> : (
                  <div className="min-w-0">
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={formatNutritionChartData()} margin={{ top: 10, right: 30, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: chart.axis }} interval={4} />
                        <YAxis domain={nutritionChartDomain()} tick={{ fontSize: 10, fill: chart.axis }} tickFormatter={(value) => `${value > 0 ? '+' : ''}${value}%`} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => (value === null ? ['No target set', name] : [`${value > 0 ? '+' : ''}${value}%`, name])} />
                        <Legend />
                        <ReferenceLine y={25} stroke={chart.grid} strokeDasharray="2 4" />
                        <ReferenceLine y={-25} stroke={chart.grid} strokeDasharray="2 4" />
                        <ReferenceLine y={0} stroke={chart.axis} strokeWidth={2} label={{ value: 'Goal', fill: chart.axis, fontSize: 10, position: 'right' }} />
                        <Line type="monotone" dataKey="calories" stroke="#f59e0b" strokeWidth={2} dot={false} name="Calories" connectNulls />
                        <Line type="monotone" dataKey="fluids" stroke="#3b82f6" strokeWidth={2} dot={false} name="Fluids" connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Nutrition Output Chart */}
            <Card className="lg:col-span-2">
              <CardHeader className="py-3"><CardTitle className="text-sm">Nutrition Output (30 Days)</CardTitle></CardHeader>
              <CardContent className="py-3">
                {loadingNutritionOutput ? <Muted>Loading output data…</Muted> : nutritionOutput.length === 0 ? <Muted>No output data available</Muted> : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="min-w-0">
                      <h3 className="mb-1 text-sm font-medium text-foreground">Urine Output <span className="text-xs text-muted-foreground">— count (left) · volume mL (right)</span></h3>
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={formatOutputChartData()} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: chart.axis }} interval={6} />
                          <YAxis yAxisId="count" orientation="left" allowDecimals={false} tick={{ fontSize: 10, fill: '#a855f7' }} />
                          <YAxis yAxisId="ml" orientation="right" tick={{ fontSize: 10, fill: '#06b6d4' }} />
                          <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => (name === 'Volume (ml)' ? [`${value} mL`, name] : [value, name])} />
                          <Legend />
                          {nutritionOutput[0]?.urine_target && (
                            <ReferenceLine yAxisId="ml" y={nutritionOutput[0].urine_target} stroke="#22c55e" strokeDasharray="3 3" label={{ value: 'Min mL', fill: '#22c55e', fontSize: 10 }} />
                          )}
                          <Line yAxisId="count" type="monotone" dataKey="urineCount" stroke="#a855f7" strokeWidth={2} dot={false} connectNulls name="Voids" />
                          <Line yAxisId="ml" type="monotone" dataKey="urine" stroke="#06b6d4" strokeWidth={2} strokeDasharray="4 2" dot={false} connectNulls name="Volume (ml)" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="min-w-0">
                      <h3 className="mb-1 text-sm font-medium text-foreground">Bowel Movements (count)</h3>
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={formatOutputChartData()} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: chart.axis }} interval={6} />
                          <YAxis domain={[0, 5]} tick={{ fontSize: 10, fill: chart.axis }} />
                          <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => (name === 'bowel' ? [value, 'Bowel Movements'] : [value, name])} />
                          <Line type="stepAfter" dataKey="bowel" stroke="#a855f7" strokeWidth={2} dot={false} connectNulls />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Care Team */}
            <Card className="lg:col-span-2">
              <CardHeader className="py-3"><CardTitle className="text-sm">Care Team</CardTitle></CardHeader>
              <CardContent className="py-3">
                {loadingProviders ? <Muted>Loading care team…</Muted> : providers.length === 0 ? <Muted>No providers assigned</Muted> : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="p-2 font-medium">Name</th>
                          <th className="p-2 font-medium">Title</th>
                          <th className="p-2 font-medium">Specialty</th>
                          <th className="p-2 font-medium">Type</th>
                          <th className="p-2 font-medium">Business</th>
                          <th className="p-2 font-medium">Phone</th>
                          <th className="p-2 font-medium">Primary</th>
                        </tr>
                      </thead>
                      <tbody>
                        {providers.map(provider => (
                          <tr key={provider.id} className="border-b border-border/60">
                            <td className="whitespace-nowrap p-2 font-medium text-foreground">{provider.first_name} {provider.last_name}</td>
                            <td className="p-2 text-muted-foreground">{provider.title}</td>
                            <td className="p-2 text-muted-foreground">{provider.specialty}</td>
                            <td className="p-2"><Badge variant="secondary">{provider.provider_type}</Badge></td>
                            <td className="p-2 text-muted-foreground">{provider.business?.name || '—'}</td>
                            <td className="p-2 text-muted-foreground">{provider.phone || provider.business?.phone || '—'}</td>
                            <td className="p-2 text-[#3fb950]">{provider.is_primary ? '✓' : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Dedicated print document — hidden on screen, the only thing that prints. */}
        <SummaryPrintView
          patient={selectedPatient}
          diagnoses={diagnoses}
          symptoms={symptoms}
          medications={medications}
          implants={implants}
          providers={providers}
        />
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2ProfileSummary;
