import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import AdminV2Layout from './AdminV2Layout';
import './AdminV2.css';

// Generate 30 days of dummy data
const generateDateLabels = () => {
  const labels = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  }
  return labels;
};

const dateLabels = generateDateLabels();

// Dummy vitals data (30 days)
const vitalsData = dateLabels.map((date, i) => ({
  date,
  spo2: 94 + Math.floor(Math.random() * 5),
  heartRate: 70 + Math.floor(Math.random() * 20),
  respRate: 14 + Math.floor(Math.random() * 6),
  temperature: 97.5 + Math.random() * 2,
  systolic: 110 + Math.floor(Math.random() * 20),
  diastolic: 70 + Math.floor(Math.random() * 15),
}));

// Dummy nutrition intake data (% off from goal)
const nutritionIntakeData = dateLabels.map((date) => ({
  date,
  calories: -10 + Math.floor(Math.random() * 30), // -10% to +20%
  protein: -15 + Math.floor(Math.random() * 35),
  fluids: -5 + Math.floor(Math.random() * 20),
}));

// Dummy nutrition output data
const nutritionOutputData = dateLabels.map((date) => ({
  date,
  urine: 800 + Math.floor(Math.random() * 600), // mL
  bowel: Math.floor(Math.random() * 3), // count
}));

// Dummy medications
const medications = [
  { id: 1, name: 'Albuterol', concentration: '90mcg/puff', quantity: 2, unit: 'puffs', instructions: 'Every 4 hours as needed', prescriber: 'Dr. Sarah Chen', lastGiven: '2026-01-23 10:30 AM' },
  { id: 2, name: 'Fluticasone', concentration: '110mcg/puff', quantity: 2, unit: 'puffs', instructions: 'Twice daily', prescriber: 'Dr. Sarah Chen', lastGiven: '2026-01-23 08:00 AM' },
  { id: 3, name: 'Omeprazole', concentration: '20mg', quantity: 1, unit: 'capsule', instructions: 'Once daily before breakfast', prescriber: 'Dr. Michael Roberts', lastGiven: '2026-01-23 07:30 AM' },
  { id: 4, name: 'Baclofen', concentration: '10mg', quantity: 1, unit: 'tablet', instructions: 'Three times daily', prescriber: 'Dr. Jennifer Wu', lastGiven: '2026-01-23 12:00 PM' },
  { id: 5, name: 'Vitamin D3', concentration: '2000IU', quantity: 1, unit: 'softgel', instructions: 'Once daily with food', prescriber: 'Dr. Sarah Chen', lastGiven: '2026-01-22 08:00 AM' },
  { id: 6, name: 'Miralax', concentration: '17g', quantity: 1, unit: 'capful', instructions: 'Once daily in juice', prescriber: 'Dr. Michael Roberts', lastGiven: '2026-01-23 07:00 AM' },
];

// Dummy active diagnoses
const diagnoses = [
  { id: 1, name: 'Chronic Respiratory Failure', icd10: 'J96.10', status: 'active', severity: 'severe', diagnosingProvider: 'Dr. Sarah Chen', onsetDate: '2023-03-15' },
  { id: 2, name: 'Neuromuscular Scoliosis', icd10: 'M41.40', status: 'chronic', severity: 'moderate', diagnosingProvider: 'Dr. Jennifer Wu', onsetDate: '2020-08-22' },
  { id: 3, name: 'Gastroesophageal Reflux Disease', icd10: 'K21.0', status: 'active', severity: 'mild', diagnosingProvider: 'Dr. Michael Roberts', onsetDate: '2022-01-10' },
  { id: 4, name: 'Obstructive Sleep Apnea', icd10: 'G47.33', status: 'active', severity: 'moderate', diagnosingProvider: 'Dr. Sarah Chen', onsetDate: '2023-06-05' },
];

// Dummy symptoms (last 30 days)
const symptoms = [
  { id: 1, type: 'Cough', severity: 4, location: 'Chest', date: '2026-01-22', status: 'active', duration: '2 hours' },
  { id: 2, type: 'Fatigue', severity: 6, location: null, date: '2026-01-21', status: 'active', duration: 'ongoing' },
  { id: 3, type: 'Congestion', severity: 3, location: 'Nasal', date: '2026-01-20', status: 'resolved', duration: '1 day' },
  { id: 4, type: 'Pain', severity: 5, location: 'Lower back', date: '2026-01-18', status: 'resolved', duration: '4 hours' },
  { id: 5, type: 'Nausea', severity: 4, location: 'Abdomen', date: '2026-01-15', status: 'resolved', duration: '30 minutes' },
  { id: 6, type: 'Headache', severity: 3, location: 'Frontal', date: '2026-01-10', status: 'resolved', duration: '2 hours' },
];

// Dummy providers
const providers = [
  { id: 1, name: 'Dr. Sarah Chen', title: 'MD', specialty: 'Pulmonology', type: 'medical', phone: '(555) 123-4567', isPrimary: true },
  { id: 2, name: 'Dr. Michael Roberts', title: 'MD', specialty: 'Gastroenterology', type: 'medical', phone: '(555) 234-5678', isPrimary: false },
  { id: 3, name: 'Dr. Jennifer Wu', title: 'MD', specialty: 'Physical Medicine & Rehabilitation', type: 'medical', phone: '(555) 345-6789', isPrimary: false },
  { id: 4, name: 'Lisa Thompson', title: 'PT', specialty: 'Pediatric Physical Therapy', type: 'therapy', phone: '(555) 456-7890', isPrimary: true },
  { id: 5, name: 'Amanda Garcia', title: 'OT', specialty: 'Occupational Therapy', type: 'therapy', phone: '(555) 567-8901', isPrimary: true },
  { id: 6, name: 'Rachel Kim', title: 'RN', specialty: 'Home Health Nursing', type: 'nursing', phone: '(555) 678-9012', isPrimary: true },
  { id: 7, name: 'David Lee', title: 'RT', specialty: 'Respiratory Therapy', type: 'therapy', phone: '(555) 789-0123', isPrimary: false },
];

// Dummy implants
const implants = [
  { id: 1, name: 'Tracheostomy Tube', type: 'medical', category: 'Airway', status: 'active', implantDate: '2023-03-15', manufacturer: 'Shiley', model: 'DCT 4.0', isLifeSustaining: true, mriSafety: 'conditional', managingProvider: 'Dr. Sarah Chen' },
  { id: 2, name: 'G-Tube (Gastrostomy)', type: 'medical', category: 'Feeding', status: 'active', implantDate: '2022-08-10', manufacturer: 'MIC-KEY', model: '14Fr 1.5cm', isLifeSustaining: true, mriSafety: 'safe', managingProvider: 'Dr. Michael Roberts' },
  { id: 3, name: 'VP Shunt', type: 'medical', category: 'Neurological', status: 'active', implantDate: '2020-05-22', manufacturer: 'Medtronic', model: 'Strata II', isLifeSustaining: true, mriSafety: 'conditional', managingProvider: 'Dr. Jennifer Wu' },
  { id: 4, name: 'Baclofen Pump', type: 'medical', category: 'Medication Delivery', status: 'active', implantDate: '2021-11-03', manufacturer: 'Medtronic', model: 'SynchroMed II', isLifeSustaining: false, mriSafety: 'conditional', managingProvider: 'Dr. Jennifer Wu' },
];

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
  const handlePrint = () => {
    window.print();
  };

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
              {diagnoses.map(dx => (
                <div key={dx.id} className="profile-list-item diagnosis-item">
                  <div className="diagnosis-header">
                    <span className="diagnosis-name">{dx.name}</span>
                    <span className={getStatusBadgeClass(dx.status)}>{dx.status}</span>
                  </div>
                  <div className="diagnosis-details">
                    <span className="icd-code">{dx.icd10}</span>
                    <span className="severity-badge" data-severity={dx.severity}>{dx.severity}</span>
                    <span className="provider-name">{dx.diagnosingProvider}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Symptoms */}
          <div className="profile-section symptoms-section">
            <h2>Symptoms (Last 30 Days)</h2>
            <div className="profile-list">
              {symptoms.map(symptom => (
                <div key={symptom.id} className="profile-list-item symptom-item">
                  <div className="symptom-header">
                    <span className="symptom-type">{symptom.type}</span>
                    <span className={`symptom-status ${symptom.status}`}>{symptom.status}</span>
                  </div>
                  <div className="symptom-details">
                    <span 
                      className="severity-indicator" 
                      style={{ backgroundColor: getSeverityColor(symptom.severity) }}
                    >
                      {symptom.severity}/10
                    </span>
                    {symptom.location && <span className="symptom-location">{symptom.location}</span>}
                    <span className="symptom-date">{symptom.date}</span>
                    <span className="symptom-duration">{symptom.duration}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Current Medications */}
          <div className="profile-section medications-section">
            <h2>Current Medications</h2>
            <div className="profile-list">
              {medications.map(med => (
                <div key={med.id} className="profile-list-item medication-item">
                  <div className="medication-row">
                    <span className="medication-name">{med.name}</span>
                    <span className="medication-dose-badge">{med.concentration}</span>
                    <span className="medication-qty-badge">{med.quantity} {med.unit}</span>
                    <span className="medication-instructions">{med.instructions}</span>
                  </div>
                  <div className="medication-row">
                    <span className="medication-last-given">Last: {med.lastGiven}</span>
                    <span className="medication-prescriber">Rx: {med.prescriber}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Implants */}
          <div className="profile-section implants-section">
            <h2>Implants & Medical Devices</h2>
            <div className="profile-list">
              {implants.map(implant => (
                <div key={implant.id} className={`profile-list-item implant-item ${implant.isLifeSustaining ? 'life-sustaining' : ''}`}>
                  <div className="implant-header">
                    <span className="implant-name">{implant.name}</span>
                    {implant.isLifeSustaining && <span className="life-sustaining-badge">Life Sustaining</span>}
                  </div>
                  <div className="implant-details">
                    <span className="implant-category">{implant.category}</span>
                    <span className="implant-model">{implant.manufacturer} {implant.model}</span>
                    <span className={`mri-badge ${getMriSafetyClass(implant.mriSafety)}`}>MRI: {implant.mriSafety}</span>
                  </div>
                  <div className="implant-meta">
                    <span className="implant-date">Placed: {implant.implantDate}</span>
                    <span className="implant-provider">{implant.managingProvider}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Vitals Charts */}
          <div className="profile-section vitals-section full-width">
            <h2>Vitals Trends (30 Days)</h2>
            <div className="vitals-charts-grid">
              {/* SpO2 Chart */}
              <div className="vital-chart-container">
                <h3>SpO2 (%)</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={vitalsData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} interval={6} />
                    <YAxis domain={[88, 100]} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} />
                    <ReferenceLine y={92} stroke="#ef4444" strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="spo2" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Heart Rate Chart */}
              <div className="vital-chart-container">
                <h3>Heart Rate (BPM)</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={vitalsData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} interval={6} />
                    <YAxis domain={[50, 120]} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} />
                    <Line type="monotone" dataKey="heartRate" stroke="#ef4444" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Respiratory Rate Chart */}
              <div className="vital-chart-container">
                <h3>Respiratory Rate</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={vitalsData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} interval={6} />
                    <YAxis domain={[10, 30]} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} />
                    <Line type="monotone" dataKey="respRate" stroke="#22c55e" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Temperature Chart */}
              <div className="vital-chart-container">
                <h3>Temperature (°F)</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={vitalsData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} interval={6} />
                    <YAxis domain={[96, 102]} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} />
                    <ReferenceLine y={100.4} stroke="#ef4444" strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="temperature" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Blood Pressure Chart */}
              <div className="vital-chart-container span-2">
                <h3>Blood Pressure (mmHg)</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={vitalsData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} interval={6} />
                    <YAxis domain={[50, 150]} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} />
                    <Legend />
                    <Line type="monotone" dataKey="systolic" stroke="#8b5cf6" strokeWidth={2} dot={false} name="Systolic" />
                    <Line type="monotone" dataKey="diastolic" stroke="#06b6d4" strokeWidth={2} dot={false} name="Diastolic" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Nutrition Intake Chart */}
          <div className="profile-section nutrition-section full-width">
            <h2>Nutrition Intake (% from Goal - 30 Days)</h2>
            <div className="nutrition-chart-container">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={nutritionIntakeData} margin={{ top: 10, right: 30, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} interval={4} />
                  <YAxis 
                    domain={[-30, 30]} 
                    tick={{ fontSize: 10, fill: '#9ca3af' }} 
                    tickFormatter={(value) => `${value > 0 ? '+' : ''}${value}%`}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                    formatter={(value) => [`${value > 0 ? '+' : ''}${value}%`, '']}
                  />
                  <Legend />
                  <ReferenceLine y={0} stroke="#6b7280" strokeWidth={2} />
                  <Line type="monotone" dataKey="calories" stroke="#f59e0b" strokeWidth={2} dot={false} name="Calories" />
                  <Line type="monotone" dataKey="protein" stroke="#ef4444" strokeWidth={2} dot={false} name="Protein" />
                  <Line type="monotone" dataKey="fluids" stroke="#3b82f6" strokeWidth={2} dot={false} name="Fluids" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Nutrition Output Chart */}
          <div className="profile-section nutrition-output-section full-width">
            <h2>Nutrition Output (30 Days)</h2>
            <div className="nutrition-output-grid">
              <div className="output-chart-container">
                <h3>Urine Output (mL)</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={nutritionOutputData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} interval={6} />
                    <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} />
                    <ReferenceLine y={800} stroke="#22c55e" strokeDasharray="3 3" label={{ value: 'Min', fill: '#22c55e', fontSize: 10 }} />
                    <Line type="monotone" dataKey="urine" stroke="#06b6d4" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="output-chart-container">
                <h3>Bowel Movements (count)</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={nutritionOutputData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} interval={6} />
                    <YAxis domain={[0, 5]} tick={{ fontSize: 10, fill: '#9ca3af' }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} />
                    <Line type="stepAfter" dataKey="bowel" stroke="#a855f7" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Care Team / Providers - Table Format */}
          <div className="profile-section providers-section full-width">
            <h2>Care Team</h2>
            <div className="providers-table-wrapper">
              <table className="providers-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Title</th>
                    <th>Specialty</th>
                    <th>Type</th>
                    <th>Phone</th>
                    <th>Primary</th>
                  </tr>
                </thead>
                <tbody>
                  {providers.map(provider => (
                    <tr key={provider.id} className={provider.isPrimary ? 'primary-row' : ''}>
                      <td className="provider-name-cell">{provider.name}</td>
                      <td>{provider.title}</td>
                      <td>{provider.specialty}</td>
                      <td><span className={`type-badge ${provider.type}`}>{provider.type}</span></td>
                      <td>{provider.phone}</td>
                      <td>{provider.isPrimary ? <span className="primary-check">✓</span> : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2ProfileSummary;
