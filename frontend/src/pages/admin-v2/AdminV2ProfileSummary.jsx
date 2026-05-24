import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, Area, ComposedChart } from 'recharts';
import AdminV2Layout from './AdminV2Layout';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import config from '../../config';
import './AdminV2.css';

const getMriSafetyClass = (safety) => {
  switch (safety) {
    case 'safe': return 'mri-safe';
    case 'conditional': return 'mri-conditional';
    case 'unsafe': return 'mri-unsafe';
    default: return 'mri-unknown';
  }
};

const getSeverityColor = (severity) => {
  if (severity >= 7) return '#ef4444';
  if (severity >= 4) return '#f59e0b';
  return '#22c55e';
};

const getStatusBadgeClass = (status) => {
  switch (status) {
    case 'active': return 'status-badge active';
    case 'chronic': return 'status-badge chronic';
    case 'resolved': return 'status-badge resolved';
    case 'in_remission': return 'status-badge remission';
    default: return 'status-badge';
  }
};

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
  const [nutritionSummary, setNutritionSummary] = useState([]);
  const [loadingNutrition, setLoadingNutrition] = useState(false);
  const [nutritionOutput, setNutritionOutput] = useState([]);
  const [loadingNutritionOutput, setLoadingNutritionOutput] = useState(false);
  
  // Fetch all data when patient changes
  useEffect(() => {
    if (!selectedPatient) return;
    
    // Fetch diagnoses
    const fetchDiagnoses = async () => {
      setLoadingDiagnoses(true);
      try {
        const response = await fetch(
          `${config.apiUrl}/api/diagnoses/patient/${selectedPatient.id}?active_only=true`,
          { credentials: 'include' }
        );
        if (response.ok) {
          setDiagnoses(await response.json());
        }
      } catch (error) {
        console.error('Error fetching diagnoses:', error);
      } finally {
        setLoadingDiagnoses(false);
      }
    };
    
    // Fetch symptoms (last 30 days)
    const fetchSymptoms = async () => {
      setLoadingSymptoms(true);
      try {
        const response = await fetch(
          `${config.apiUrl}/api/symptoms/patient/${selectedPatient.id}?limit=50&include_resolved=true`,
          { credentials: 'include' }
        );
        if (response.ok) {
          setSymptoms(await response.json());
        }
      } catch (error) {
        console.error('Error fetching symptoms:', error);
      } finally {
        setLoadingSymptoms(false);
      }
    };
    
    // Fetch medications
    const fetchMedications = async () => {
      setLoadingMedications(true);
      try {
        const response = await fetch(
          `${config.apiUrl}/api/admin/medications/active?patient_id=${selectedPatient.id}`,
          { credentials: 'include' }
        );
        if (response.ok) {
          setMedications(await response.json());
        }
      } catch (error) {
        console.error('Error fetching medications:', error);
      } finally {
        setLoadingMedications(false);
      }
    };
    
    // Fetch providers
    const fetchProviders = async () => {
      setLoadingProviders(true);
      try {
        const response = await fetch(
          `${config.apiUrl}/api/providers/patient/${selectedPatient.id}?active_only=true`,
          { credentials: 'include' }
        );
        if (response.ok) {
          setProviders(await response.json());
        }
      } catch (error) {
        console.error('Error fetching providers:', error);
      } finally {
        setLoadingProviders(false);
      }
    };
    
    // Fetch implants
    const fetchImplants = async () => {
      setLoadingImplants(true);
      try {
        const response = await fetch(
          `${config.apiUrl}/api/implants/patient/${selectedPatient.id}?include_inactive=false`,
          { credentials: 'include' }
        );
        if (response.ok) {
          setImplants(await response.json());
        }
      } catch (error) {
        console.error('Error fetching implants:', error);
      } finally {
        setLoadingImplants(false);
      }
    };
    
    // Fetch vitals summary (30-day aggregation)
    const fetchVitalsSummary = async () => {
      setLoadingVitals(true);
      try {
        const response = await fetch(
          `${config.apiUrl}/api/vitals/patient/${selectedPatient.id}/summary?days=30`,
          { credentials: 'include' }
        );
        if (response.ok) {
          const data = await response.json();
          setVitalsSummary(data);
        }
      } catch (error) {
        console.error('Error fetching vitals summary:', error);
      } finally {
        setLoadingVitals(false);
      }
    };

    // Fetch pulse-ox hourly aggregation for SpO2 / heart rate trends
    const fetchPulseOxSummary = async () => {
      setLoadingPulseOx(true);
      try {
        const response = await fetch(
          `${config.apiUrl}/api/vitals/patient/${selectedPatient.id}/pulse-ox-summary?days=30`,
          { credentials: 'include' }
        );
        if (response.ok) {
          const data = await response.json();
          setPulseOxSummary(data);
        }
      } catch (error) {
        console.error('Error fetching pulse-ox summary:', error);
      } finally {
        setLoadingPulseOx(false);
      }
    };
    
    // Fetch nutrition intake summary (30-day with goals). Pass local tz
    // offset so the backend buckets by the caller's day, matching the
    // Overview's behavior (otherwise late-evening logs slide a day off).
    const fetchNutritionSummary = async () => {
      setLoadingNutrition(true);
      try {
        const tzOffsetMinutes = -new Date().getTimezoneOffset();
        const response = await fetch(
          `${config.apiUrl}/api/nutrition/patient/${selectedPatient.id}/summary?days=30&tz_offset_minutes=${tzOffsetMinutes}`,
          { credentials: 'include' }
        );
        if (response.ok) {
          const data = await response.json();
          setNutritionSummary(data);
        }
      } catch (error) {
        console.error('Error fetching nutrition summary:', error);
      } finally {
        setLoadingNutrition(false);
      }
    };
    
    // Fetch nutrition output history (30-day with goals). Same TZ shaping
    // as the intake summary so days align with the Overview / Schedule view.
    const fetchNutritionOutput = async () => {
      setLoadingNutritionOutput(true);
      try {
        const tzOffsetMinutes = -new Date().getTimezoneOffset();
        const response = await fetch(
          `${config.apiUrl}/api/nutrition/outputs/patient/${selectedPatient.id}/history?days=30&tz_offset_minutes=${tzOffsetMinutes}`,
          { credentials: 'include' }
        );
        if (response.ok) {
          const data = await response.json();
          setNutritionOutput(data);
        }
      } catch (error) {
        console.error('Error fetching nutrition output:', error);
      } finally {
        setLoadingNutritionOutput(false);
      }
    };
    
    // Fetch all data in parallel
    fetchDiagnoses();
    fetchSymptoms();
    fetchMedications();
    fetchProviders();
    fetchImplants();
    fetchVitalsSummary();
    fetchPulseOxSummary();
    fetchNutritionSummary();
    fetchNutritionOutput();
  }, [selectedPatient]);

  // Helper to format vitals data for chart display
  const formatVitalChartData = (vitalType) => {
    if (!vitalsSummary || !vitalsSummary[vitalType]) return [];
    return vitalsSummary[vitalType].map(d => ({
      date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      min: d.min,
      avg: d.avg,
      max: d.max
    }));
  };

  // Helper to format hourly pulse-ox data for SpO2 and BPM charts
  const formatPulseOxChartData = (key) => {
    if (!pulseOxSummary || !pulseOxSummary[key]) return [];
    return pulseOxSummary[key].map(d => {
      const dt = new Date(d.date);
      return {
        date: dt.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
        }),
        min: d.min,
        avg: d.avg,
        max: d.max,
      };
    });
  };

  // Helper to format nutrition data as % deviation from goal
  const formatNutritionChartData = () => {
    return nutritionSummary.map(d => {
      // Calculate % deviation: ((actual - target) / target) * 100
      let caloriesDeviation = null;
      let fluidsDeviation = null;

      if (d.calories_target && d.calories_target > 0) {
        caloriesDeviation = Math.round(((d.calories - d.calories_target) / d.calories_target) * 100);
      }
      // Backend may emit total_fluid_ml_target or water_ml_target; goal API
      // gives both. Prefer the broader total-fluid target since the chart
      // sums liquid + hydration intakes.
      const fluidTarget = d.total_fluid_target || d.water_target;
      if (fluidTarget && fluidTarget > 0) {
        fluidsDeviation = Math.round(((d.water_ml - fluidTarget) / fluidTarget) * 100);
      }

      return {
        date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        calories: caloriesDeviation,
        fluids: fluidsDeviation
      };
    });
  };

  // Symmetric Y domain so the 0 (goal) line sits exactly in the middle.
  // Floor at ±50% so a perfect-streak chart still shows axis context, and
  // grow in 25% steps when real data pushes past 50%.
  const nutritionChartDomain = () => {
    const data = formatNutritionChartData();
    const vals = data.flatMap(d => [d.calories, d.fluids]).filter(v => v != null);
    if (!vals.length) return [-50, 50];
    const maxAbs = Math.max(50, ...vals.map(Math.abs));
    const bound = Math.ceil(maxAbs / 25) * 25;
    return [-bound, bound];
  };

  // Helper to format output chart data
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
        <div className="admin-v2-content">
          <div className="admin-v2-header">
            <h1>Patient Summary</h1>
            <p className="subtitle">Please select a patient from the sidebar to view their summary</p>
          </div>
        </div>
      </AdminV2Layout>
    );
  }

  return (
    <AdminV2Layout>
      <div className="admin-v2-content">
        <div className="admin-v2-header">
          <div className="header-title-row">
            <div>
              <h1>Patient Summary</h1>
              <p className="subtitle">Overview of patient health status, medications, and care team</p>
            </div>
            <button className="print-button no-print" onClick={handlePrint}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              Print Summary
            </button>
          </div>
        </div>

        <div className="profile-summary-grid">
          {/* Active Diagnoses */}
          <div className="profile-section diagnoses-section">
            <h2>Active Diagnoses</h2>
            <div className="profile-list">
              {loadingDiagnoses ? (
                <div className="loading-state">Loading diagnoses...</div>
              ) : diagnoses.length === 0 ? (
                <div className="empty-state">No active diagnoses recorded</div>
              ) : (
                diagnoses.map(dx => (
                  <div key={dx.id} className={`profile-list-item diagnosis-item ${dx.is_primary_diagnosis ? 'primary' : ''}`}>
                    <div className="diagnosis-header">
                      <span className="diagnosis-name">
                        {dx.is_primary_diagnosis && <span className="primary-badge">Primary</span>}
                        {dx.name}
                      </span>
                      <span className={getStatusBadgeClass(dx.status)}>{dx.status}</span>
                    </div>
                    <div className="diagnosis-details">
                      <span className="icd-code">{dx.icd10_code}</span>
                      <span className="severity-badge" data-severity={dx.severity}>{dx.severity}</span>
                      {dx.diagnosing_provider_name && (
                        <span className="provider-name">{dx.diagnosing_provider_name}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Symptoms */}
          <div className="profile-section symptoms-section">
            <h2>Symptoms (Last 30 Days)</h2>
            <div className="profile-list">
              {loadingSymptoms ? (
                <div className="loading-state">Loading symptoms...</div>
              ) : symptoms.length === 0 ? (
                <div className="empty-state">No symptoms recorded</div>
              ) : (
                symptoms.map(symptom => (
                  <div key={symptom.id} className="profile-list-item symptom-item">
                    <div className="symptom-header">
                      <span className="symptom-type">{symptom.symptom_type}</span>
                      <span className={`symptom-status ${symptom.is_resolved ? 'resolved' : 'active'}`}>
                        {symptom.is_resolved ? 'resolved' : 'active'}
                      </span>
                    </div>
                    <div className="symptom-details">
                      <span 
                        className="severity-indicator" 
                        style={{ backgroundColor: getSeverityColor(symptom.severity) }}
                      >
                        {symptom.severity}/10
                      </span>
                      {symptom.location && <span className="symptom-location">{symptom.location}</span>}
                      <span className="symptom-date">
                        {symptom.timestamp ? new Date(symptom.timestamp).toLocaleDateString() : ''}
                      </span>
                      {symptom.duration && <span className="symptom-duration">{symptom.duration}</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Current Medications */}
          <div className="profile-section medications-section">
            <h2>Current Medications</h2>
            <div className="profile-list">
              {loadingMedications ? (
                <div className="loading-state">Loading medications...</div>
              ) : medications.length === 0 ? (
                <div className="empty-state">No active medications</div>
              ) : (
                medications.map(med => (
                  <div key={med.id} className="profile-list-item medication-item">
                    <div className="medication-row">
                      <span className="medication-name">{med.name}</span>
                      {med.concentration && <span className="medication-dose-badge">{med.concentration}</span>}
                      {med.quantity && <span className="medication-qty-badge">{med.quantity} {med.quantity_unit || ''}</span>}
                      {med.prescriber_name && <span className="medication-prescriber">{med.prescriber_name}</span>}
                    </div>
                    <div className="medication-row">
                      {med.instructions && <span className="medication-instructions">{med.instructions}</span>}
                      {med.as_needed && <span className="medication-prn-badge">PRN</span>}
                      {med.last_administered && (
                        <span className="medication-last-given">
                          Last: {new Date(med.last_administered).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Implants */}
          <div className="profile-section implants-section">
            <h2>Implants & Medical Devices</h2>
            <div className="profile-list">
              {loadingImplants ? (
                <div className="loading-state">Loading implants...</div>
              ) : implants.length === 0 ? (
                <div className="empty-state">No implants or medical devices recorded</div>
              ) : (
                implants.map(implant => (
                  <div key={implant.id} className={`profile-list-item implant-item ${implant.is_life_sustaining ? 'life-sustaining' : ''}`}>
                    <div className="implant-header">
                      <span className="implant-name">{implant.name}</span>
                      {implant.is_life_sustaining && <span className="life-sustaining-badge">Life Sustaining</span>}
                    </div>
                    <div className="implant-details">
                      {implant.category && <span className="implant-category">{implant.category}</span>}
                      <span className="implant-model">{implant.manufacturer} {implant.model}</span>
                      {implant.mri_safe && (
                        <span className={`mri-badge ${getMriSafetyClass(implant.mri_safe)}`}>MRI: {implant.mri_safe}</span>
                      )}
                    </div>
                    <div className="implant-meta">
                      {implant.implant_date && (
                        <span className="implant-date">Placed: {new Date(implant.implant_date).toLocaleDateString()}</span>
                      )}
                      {implant.managing_provider_name && (
                        <span className="implant-provider">{implant.managing_provider_name}</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Vitals Charts */}
          <div className="profile-section vitals-section full-width">
            <h2>Vitals Trends (30 Days)</h2>
            {loadingVitals ? (
              <div className="loading-state">Loading vitals data...</div>
            ) : !vitalsSummary ? (
              <div className="empty-state">No vitals data available</div>
            ) : (
              <div className="vitals-charts-grid">
                {/* SpO2 Chart (from pulse oximeter, hourly) */}
                <div className="vital-chart-container">
                  <h3>SpO2 (%) <span className="chart-subtitle">— pulse ox, hourly</span></h3>
                  {loadingPulseOx ? (
                    <div className="loading-state">Loading…</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={180}>
                      <ComposedChart data={formatPulseOxChartData('spo2')} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} interval="preserveStartEnd" minTickGap={40} />
                        <YAxis domain={[80, 100]} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                        <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} />
                        <ReferenceLine y={92} stroke="#ef4444" strokeDasharray="3 3" />
                        <Area type="monotone" dataKey="max" stroke="none" fill="#3b82f6" fillOpacity={0.15} />
                        <Area type="monotone" dataKey="min" stroke="none" fill="#1f2937" fillOpacity={1} />
                        <Line type="monotone" dataKey="avg" stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Heart Rate Chart (from pulse oximeter, hourly) */}
                <div className="vital-chart-container">
                  <h3>Heart Rate (BPM) <span className="chart-subtitle">— pulse ox, hourly</span></h3>
                  {loadingPulseOx ? (
                    <div className="loading-state">Loading…</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={180}>
                      <ComposedChart data={formatPulseOxChartData('heart_rate')} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} interval="preserveStartEnd" minTickGap={40} />
                        <YAxis domain={[40, 140]} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                        <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} />
                        <Area type="monotone" dataKey="max" stroke="none" fill="#ef4444" fillOpacity={0.15} />
                        <Area type="monotone" dataKey="min" stroke="none" fill="#1f2937" fillOpacity={1} />
                        <Line type="monotone" dataKey="avg" stroke="#ef4444" strokeWidth={2} dot={false} connectNulls />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Respiratory Rate Chart */}
                <div className="vital-chart-container">
                  <h3>Respiratory Rate</h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <ComposedChart data={formatVitalChartData('respiratory_rate')} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} interval={6} />
                      <YAxis domain={[10, 30]} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} />
                      <Area type="monotone" dataKey="max" stroke="none" fill="#22c55e" fillOpacity={0.15} />
                      <Area type="monotone" dataKey="min" stroke="none" fill="#1f2937" fillOpacity={1} />
                      <Line type="monotone" dataKey="avg" stroke="#22c55e" strokeWidth={2} dot={false} connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Temperature Chart */}
                <div className="vital-chart-container">
                  <h3>Temperature (°F)</h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <ComposedChart data={formatVitalChartData('temperature')} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} interval={6} />
                      <YAxis domain={[96, 102]} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} />
                      <ReferenceLine y={100.4} stroke="#ef4444" strokeDasharray="3 3" />
                      <Area type="monotone" dataKey="max" stroke="none" fill="#f59e0b" fillOpacity={0.15} />
                      <Area type="monotone" dataKey="min" stroke="none" fill="#1f2937" fillOpacity={1} />
                      <Line type="monotone" dataKey="avg" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Blood Pressure (MAP) Chart */}
                <div className="vital-chart-container span-2">
                  <h3>Mean Arterial Pressure (mmHg)</h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <ComposedChart data={formatVitalChartData('blood_pressure')} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} interval={6} />
                      <YAxis domain={[60, 110]} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} />
                      <ReferenceLine y={70} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: 'Low', fill: '#f59e0b', fontSize: 10 }} />
                      <ReferenceLine y={100} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: 'High', fill: '#f59e0b', fontSize: 10 }} />
                      <Area type="monotone" dataKey="max" stroke="none" fill="#8b5cf6" fillOpacity={0.15} />
                      <Area type="monotone" dataKey="min" stroke="none" fill="#1f2937" fillOpacity={1} />
                      <Line type="monotone" dataKey="avg" stroke="#8b5cf6" strokeWidth={2} dot={false} connectNulls name="MAP" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {/* Nutrition Intake Chart */}
          <div className="profile-section nutrition-section full-width">
            <h2>Nutrition Intake (% from Goal - 30 Days)</h2>
            {loadingNutrition ? (
              <div className="loading-placeholder">Loading nutrition data...</div>
            ) : nutritionSummary.length === 0 ? (
              <div className="empty-state">No nutrition data available</div>
            ) : (
              <div className="nutrition-chart-container">
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={formatNutritionChartData()} margin={{ top: 10, right: 30, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} interval={4} />
                    <YAxis
                      domain={nutritionChartDomain()}
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      tickFormatter={(value) => `${value > 0 ? '+' : ''}${value}%`}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                      formatter={(value, name) => {
                        if (value === null) return ['No target set', name];
                        return [`${value > 0 ? '+' : ''}${value}%`, name];
                      }}
                    />
                    <Legend />
                    {/* Subtle ±25% bands as soft "near-goal" markers; the
                        bold y=0 line is the goal itself. */}
                    <ReferenceLine y={25} stroke="#374151" strokeDasharray="2 4" />
                    <ReferenceLine y={-25} stroke="#374151" strokeDasharray="2 4" />
                    <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={2} label={{ value: 'Goal', fill: '#9ca3af', fontSize: 10, position: 'right' }} />
                    <Line type="monotone" dataKey="calories" stroke="#f59e0b" strokeWidth={2} dot={false} name="Calories" connectNulls />
                    <Line type="monotone" dataKey="fluids" stroke="#3b82f6" strokeWidth={2} dot={false} name="Fluids" connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Nutrition Output Chart */}
          <div className="profile-section nutrition-output-section full-width">
            <h2>Nutrition Output (30 Days)</h2>
            {loadingNutritionOutput ? (
              <div className="loading-placeholder">Loading output data...</div>
            ) : nutritionOutput.length === 0 ? (
              <div className="empty-state">No output data available</div>
            ) : (
              <div className="nutrition-output-grid">
                <div className="output-chart-container">
                  <h3>Urine Output <span className="chart-subtitle">— count (left) · volume mL (right)</span></h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={formatOutputChartData()} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} interval={6} />
                      {/* Primary axis: count of voids per day. Most caregivers
                          watch frequency first; volume is the supporting metric. */}
                      <YAxis
                        yAxisId="count"
                        orientation="left"
                        allowDecimals={false}
                        tick={{ fontSize: 10, fill: '#a855f7' }}
                      />
                      {/* Secondary axis: total volume per day. */}
                      <YAxis
                        yAxisId="ml"
                        orientation="right"
                        tick={{ fontSize: 10, fill: '#06b6d4' }}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                        formatter={(value, name) => {
                          if (name === 'Volume (ml)') return [`${value} mL`, name];
                          return [value, name];
                        }}
                      />
                      <Legend />
                      {/* Min-volume target sits on the mL axis */}
                      {nutritionOutput[0]?.urine_target && (
                        <ReferenceLine
                          yAxisId="ml"
                          y={nutritionOutput[0].urine_target}
                          stroke="#22c55e"
                          strokeDasharray="3 3"
                          label={{ value: 'Min mL', fill: '#22c55e', fontSize: 10 }}
                        />
                      )}
                      <Line
                        yAxisId="count"
                        type="monotone"
                        dataKey="urineCount"
                        stroke="#a855f7"
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                        name="Voids"
                      />
                      <Line
                        yAxisId="ml"
                        type="monotone"
                        dataKey="urine"
                        stroke="#06b6d4"
                        strokeWidth={2}
                        strokeDasharray="4 2"
                        dot={false}
                        connectNulls
                        name="Volume (ml)"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="output-chart-container">
                  <h3>Bowel Movements (count)</h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={formatOutputChartData()} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} interval={6} />
                      <YAxis domain={[0, 5]} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                        formatter={(value, name) => {
                          if (name === 'bowel') return [value, 'Bowel Movements'];
                          return [value, name];
                        }}
                      />
                      <Line type="stepAfter" dataKey="bowel" stroke="#a855f7" strokeWidth={2} dot={false} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {/* Care Team / Providers - Table Format */}
          <div className="profile-section providers-section full-width">
            <h2>Care Team</h2>
            {loadingProviders ? (
              <div className="loading-state">Loading care team...</div>
            ) : providers.length === 0 ? (
              <div className="empty-state">No providers assigned</div>
            ) : (
              <div className="providers-table-wrapper">
                <table className="providers-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Title</th>
                      <th>Specialty</th>
                      <th>Type</th>
                      <th>Business</th>
                      <th>Phone</th>
                      <th>Primary</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providers.map(provider => (
                      <tr key={provider.id} className={provider.is_primary ? 'primary-row' : ''}>
                        <td className="provider-name-cell">
                          {provider.first_name} {provider.last_name}
                        </td>
                        <td>{provider.title}</td>
                        <td>{provider.specialty}</td>
                        <td>
                          <span className={`type-badge ${provider.provider_type}`}>
                            {provider.provider_type}
                          </span>
                        </td>
                        <td>{provider.business?.name || '—'}</td>
                        <td>{provider.phone || provider.business?.phone || '—'}</td>
                        <td>{provider.is_primary ? <span className="primary-check">✓</span> : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2ProfileSummary;
