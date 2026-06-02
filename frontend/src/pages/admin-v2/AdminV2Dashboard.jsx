import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { useAuth } from '../../contexts/AuthContext';
import {
  PatientsIcon,
  MedicationsIcon,
  TasksIcon,
  EquipmentIcon,
  PlusIcon,
  CameraIcon
} from '../../components/Icons';
import CameraLiveModal from '../../components/CameraLiveModal';
import config, { API_BASE_URL, getApiBaseUrl } from '../../config';
import './AdminV2.css';

// Calculate age from DOB
const calculateAge = (dob) => {
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

// Get initials from name
const getInitials = (name) => {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase();
};

// Get status class for due counter
const getDueStatus = (count) => {
  if (count >= 3) return 'overdue';
  if (count > 0) return 'has-due';
  return '';
};

const AdminV2Dashboard = () => {
  const { hasReadAccess } = useAuth();
  const [patients, setPatients] = useState([]);
  const [summary, setSummary] = useState({
    total_patients: 0,
    active_patients: 0,
    medications_due: 0,
    tasks_due: 0,
    equipment_due: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [patientReadings, setPatientReadings] = useState({});
  const [cameraModalPatient, setCameraModalPatient] = useState(null);
  const wsRef = useRef(null);

  useEffect(() => {
    fetchDashboardData();
  }, [hasReadAccess]);

  // Per-patient readings: poll on mount and subscribe to WebSocket for live updates
  useEffect(() => {
    const fetchReadings = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/dashboard/patient-readings`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setPatientReadings(data);
        }
      } catch (e) {
        // ignore
      }
    };
    fetchReadings();
    const pollInterval = setInterval(fetchReadings, 8000);

    const wsUrl = config.wsUrl || (getApiBaseUrl().replace(/^http/, 'ws') + '/ws/sensors');
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'sensor_update' && data.state && data.state.patient_readings) {
          setPatientReadings(data.state.patient_readings);
        }
      } catch (_) {}
    };
    ws.onerror = () => {};
    ws.onclose = () => {};

    return () => {
      clearInterval(pollInterval);
      if (wsRef.current) {
        try { wsRef.current.close(); } catch (_) {}
      }
    };
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      if (hasReadAccess) {
        const response = await fetch(`${API_BASE_URL}/api/dashboard/summary`, {
          credentials: 'include'
        });
        if (!response.ok) {
          throw new Error('Failed to fetch dashboard data');
        }
        const data = await response.json();
        setPatients(data.patients || []);
        setSummary(data.summary || {
          total_patients: 0,
          active_patients: 0,
          medications_due: 0,
          tasks_due: 0,
          equipment_due: 0
        });
      } else {
        // Restricted mode: only fetch patient list so user can select who to perform care for
        const response = await fetch(`${API_BASE_URL}/api/patients?active_only=true`, {
          credentials: 'include'
        });
        if (!response.ok) {
          throw new Error('Failed to fetch patients');
        }
        const patientList = await response.json();
        // Normalize to dashboard shape (name, status, due_counts)
        const normalized = (patientList || []).map(p => ({
          ...p,
          name: p.name || [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || 'Unknown',
          status: p.status || (p.is_active ? 'active' : 'inactive'),
          due_counts: p.due_counts || { medications: 0, tasks: 0, equipment: 0 }
        }));
        setPatients(normalized);
        const active = normalized.filter(p => p.is_active);
        setSummary({
          total_patients: normalized.length,
          active_patients: active.length,
          medications_due: 0,
          tasks_due: 0,
          equipment_due: 0
        });
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminV2Layout>
      <div className="admin-v2-dashboard">
        <div className="admin-v2-dashboard-header">
          <h1 className="admin-v2-dashboard-title">Dashboard</h1>
          <p className="admin-v2-dashboard-subtitle">
            Overview of all patients and their care status
          </p>
        </div>

        {/* Error State */}
        {error && (
          <div className="admin-v2-error-message">
            <p>Error loading dashboard: {error}</p>
            <button onClick={fetchDashboardData} className="admin-v2-btn admin-v2-btn-primary">
              Retry
            </button>
          </div>
        )}

        {/* Summary Statistics */}
        <div className="admin-v2-summary-stats">
          <div className="admin-v2-stat-card">
            <div className="admin-v2-stat-icon patients">
              <PatientsIcon size={24} />
            </div>
            <div className="admin-v2-stat-info">
              <h4>{loading ? '...' : `${summary.active_patients}/${summary.total_patients}`}</h4>
              <p>Active Patients</p>
            </div>
          </div>
          <div className="admin-v2-stat-card">
            <div className="admin-v2-stat-icon medications">
              <MedicationsIcon size={24} />
            </div>
            <div className="admin-v2-stat-info">
              <h4>{loading ? '...' : summary.medications_due}</h4>
              <p>Medications Due</p>
            </div>
          </div>
          <div className="admin-v2-stat-card">
            <div className="admin-v2-stat-icon tasks">
              <TasksIcon size={24} />
            </div>
            <div className="admin-v2-stat-info">
              <h4>{loading ? '...' : summary.tasks_due}</h4>
              <p>Tasks Due</p>
            </div>
          </div>
          <div className="admin-v2-stat-card">
            <div className="admin-v2-stat-icon equipment">
              <EquipmentIcon size={24} />
            </div>
            <div className="admin-v2-stat-info">
              <h4>{loading ? '...' : summary.equipment_due}</h4>
              <p>Equipment Due</p>
            </div>
          </div>
        </div>

        {/* Section Header */}
        <div className="admin-v2-section-header">
          <h2 className="admin-v2-section-title">All Patients</h2>
          <Link to="/care/patients/create" className="admin-v2-btn admin-v2-btn-primary">
            <PlusIcon size={16} /> Add Patient
          </Link>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="admin-v2-loading">
            <p>Loading patients...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && patients.length === 0 && !error && (
          <div className="admin-v2-empty-state">
            <PatientsIcon size={48} />
            <h3>No patients yet</h3>
            <p>Add your first patient to get started</p>
            <Link to="/care/patients/create" className="admin-v2-btn admin-v2-btn-primary">
              <PlusIcon size={16} /> Add Patient
            </Link>
          </div>
        )}

        {cameraModalPatient && (
          <CameraLiveModal
            patientId={cameraModalPatient.id}
            patientName={cameraModalPatient.name}
            onClose={() => setCameraModalPatient(null)}
          />
        )}

        {/* Patients Grid */}
        {!loading && patients.length > 0 && (
          <div className="admin-v2-patients-grid">
            {patients.map((patient) => (
              <div key={patient.id} className="admin-v2-patient-card">
                <div className="admin-v2-patient-header">
                  <div className="admin-v2-patient-avatar">
                    {getInitials(patient.name)}
                  </div>
                  <div className="admin-v2-patient-info">
                    <h3 className="admin-v2-patient-name">{patient.name}</h3>
                    <p className="admin-v2-patient-meta">
                      {patient.date_of_birth ? `Age ${calculateAge(patient.date_of_birth)}` : 'Age unknown'}
                      {patient.room ? ` • ${patient.room}` : ''}
                    </p>
                  </div>
                  <Link
                    to="/live"
                    className="admin-v2-patient-readings"
                    title="Touch Dashboard"
                  >
                    {patientReadings[patient.id]
                      ? `${patientReadings[patient.id].spo2 ?? '—'}% · ${patientReadings[patient.id].bpm ?? '—'} bpm`
                      : '— · —'}
                  </Link>
                  {patient.has_camera && (
                    <button
                      type="button"
                      onClick={() => setCameraModalPatient(patient)}
                      title={`Live camera: ${patient.camera_name || ''}`}
                      style={{
                        background: 'transparent',
                        border: '1px solid rgba(255,255,255,0.15)',
                        color: '#58a6ff',
                        padding: '4px 6px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                      }}
                    >
                      <CameraIcon size={18} />
                    </button>
                  )}
                  <span className={`admin-v2-patient-status ${patient.status}`}>
                    {patient.status}
                  </span>
                </div>

                {/* Due Counters */}
                <div className="admin-v2-due-counters">
                  <Link
                    to={`/care/medications/schedule?patient=${patient.id}`}
                    className={`admin-v2-due-item ${getDueStatus(patient.due_counts?.medications || 0)}`}
                  >
                    <p className="admin-v2-due-count">{patient.due_counts?.medications || 0}</p>
                    <p className="admin-v2-due-label">Meds Due</p>
                  </Link>
                  <Link
                    to={`/care/equipment?patient=${patient.id}`}
                    className={`admin-v2-due-item ${getDueStatus(patient.due_counts?.equipment || 0)}`}
                  >
                    <p className="admin-v2-due-count">{patient.due_counts?.equipment || 0}</p>
                    <p className="admin-v2-due-label">Equip Due</p>
                  </Link>
                  <Link
                    to={`/care/care-tasks/schedule?patient=${patient.id}`}
                    className={`admin-v2-due-item ${getDueStatus(patient.due_counts?.tasks || 0)}`}
                  >
                    <p className="admin-v2-due-count">{patient.due_counts?.tasks || 0}</p>
                    <p className="admin-v2-due-label">Tasks Due</p>
                  </Link>
                </div>

                {/* Actions */}
                <div className="admin-v2-patient-actions">
                  <Link to={`/care/profile?patient=${patient.id}`} className="admin-v2-btn">
                    View Details
                  </Link>
                  <Link to={`/care/schedule?patient=${patient.id}`} className="admin-v2-btn admin-v2-btn-primary">
                    Schedule
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Dashboard;
