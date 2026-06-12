/*
 * Smart Home Health Hub
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
import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { useAuth } from '../../contexts/AuthContext';
import {
  PatientsIcon,
  MedicationsIcon,
  TasksIcon,
  EquipmentIcon,
  NutritionIcon,
  PlusIcon,
  CameraIcon,
  VitalsIcon,
  HeartIcon,
  CalendarIcon
} from '../../components/Icons';
import CameraLiveModal from '../../components/CameraLiveModal';
import config, { API_BASE_URL, getApiBaseUrl } from '../../config';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
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

const AdminV2Dashboard = () => {
  const { hasReadAccess } = useAuth();
  const [patients, setPatients] = useState([]);
  const [summary, setSummary] = useState({
    total_patients: 0,
    active_patients: 0,
    medications_due: 0,
    tasks_due: 0,
    equipment_due: 0,
    nutrition_due: 0
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
      } catch {
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
      } catch {
        // ignore malformed WS payloads
      }
    };
    ws.onerror = () => {};
    ws.onclose = () => {};

    return () => {
      clearInterval(pollInterval);
      if (wsRef.current) {
        try { wsRef.current.close(); } catch { /* already closed */ }
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
          equipment_due: 0,
          nutrition_due: 0
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
          due_counts: p.due_counts || { medications: 0, tasks: 0, equipment: 0, nutrition: 0 }
        }));
        setPatients(normalized);
        const active = normalized.filter(p => p.is_active);
        setSummary({
          total_patients: normalized.length,
          active_patients: active.length,
          medications_due: 0,
          tasks_due: 0,
          equipment_due: 0,
          nutrition_due: 0
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
        {/* Error State */}
        {error && (
          <div className="tw" style={{ marginBottom: '1.5rem' }}>
            <Alert variant="destructive" className="flex items-center justify-between gap-3">
              <span>Error loading dashboard: {error}</span>
              <Button size="sm" className="shrink-0" onClick={fetchDashboardData}>
                Retry
              </Button>
            </Alert>
          </div>
        )}

        {/* Summary Statistics */}
        <div className="admin-v2-summary-stats">
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
            <div className="admin-v2-stat-icon nutrition">
              <NutritionIcon size={24} />
            </div>
            <div className="admin-v2-stat-info">
              <h4>{loading ? '...' : summary.nutrition_due}</h4>
              <p>Nutrition Due</p>
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
          <h2 className="admin-v2-section-title">All Patients ({patients.length})</h2>
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
            <div className="tw">
              <Button asChild>
                <Link to="/care/patients/create">
                  <PlusIcon size={16} /> Add Patient
                </Link>
              </Button>
            </div>
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
            {patients.map((patient) => {
              const reading = patientReadings[patient.id];
              const spo2 = reading?.spo2;
              const bpm = reading?.bpm;
              // SpO2 and HR both come from the pulse-ox reader. Show each only
              // when the patient has a pulse-ox source (an active Reader) or is
              // currently streaming that value, and hide the whole chip when
              // neither applies — so a patient without a pulse ox shows no
              // orphaned "-- bpm".
              const showSpo2 = patient.has_pulse_ox || (spo2 !== null && spo2 !== undefined);
              const showHr = patient.has_pulse_ox || (bpm !== null && bpm !== undefined);
              const showVitals = showSpo2 || showHr;

              return (
              <div key={patient.id} className="admin-v2-patient-card">
                <div className="admin-v2-patient-header">
                  <div className="admin-v2-patient-header-top">
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

                    {/* Across from name/age: ACTIVE on top, camera under it */}
                    <div className="admin-v2-patient-status-stack">
                      <span className={`admin-v2-patient-status ${patient.status}`}>
                        {patient.status}
                      </span>
                      {patient.has_camera && (
                        <button
                          type="button"
                          className="admin-v2-vitals-camera"
                          onClick={() => setCameraModalPatient(patient)}
                          title={`Live camera: ${patient.camera_name || ''}`}
                        >
                          <CameraIcon size={18} />
                        </button>
                      )}
                    </div>
                  </div>

                  {showVitals && (
                    <div className="admin-v2-vitals-row">
                      <Link to="/live" className="admin-v2-vitals" title="Touch Dashboard">
                        {showSpo2 && (
                          <span className="admin-v2-vital spo2">
                            <VitalsIcon size={15} />
                            <span className="admin-v2-vital-label">SpO₂</span>
                            <span className="admin-v2-vital-value">
                              {spo2 !== null && spo2 !== undefined ? `${spo2}%` : '--'}
                            </span>
                          </span>
                        )}
                        {showHr && (
                          <span className="admin-v2-vital bpm">
                            <HeartIcon size={15} />
                            <span className="admin-v2-vital-value">
                              {bpm !== null && bpm !== undefined ? bpm : '--'}
                            </span>
                            <span className="admin-v2-vital-unit">bpm</span>
                          </span>
                        )}
                      </Link>
                    </div>
                  )}
                </div>

                {/* Due Counters — red when that category has an overdue item */}
                <div className="admin-v2-due-counters">
                  <Link
                    to={`/care/medications/schedule?patient=${patient.id}`}
                    className={`admin-v2-due-item meds${patient.overdue_counts?.medications ? ' overdue' : ''}`}
                  >
                    <p className="admin-v2-due-count">{patient.due_counts?.medications || 0}</p>
                    <p className="admin-v2-due-label">Meds</p>
                  </Link>
                  <Link
                    to={`/care/nutrition?patient=${patient.id}`}
                    className={`admin-v2-due-item nutrition${patient.overdue_counts?.nutrition ? ' overdue' : ''}`}
                  >
                    <p className="admin-v2-due-count">{patient.due_counts?.nutrition || 0}</p>
                    <p className="admin-v2-due-label">Nutrition</p>
                  </Link>
                  <Link
                    to={`/care/care-tasks/schedule?patient=${patient.id}`}
                    className={`admin-v2-due-item tasks${patient.overdue_counts?.tasks ? ' overdue' : ''}`}
                  >
                    <p className="admin-v2-due-count">{patient.due_counts?.tasks || 0}</p>
                    <p className="admin-v2-due-label">Tasks</p>
                  </Link>
                  <Link
                    to={`/care/equipment?patient=${patient.id}`}
                    className="admin-v2-due-item equip"
                  >
                    <p className="admin-v2-due-count">{patient.due_counts?.equipment || 0}</p>
                    <p className="admin-v2-due-label">Equip</p>
                  </Link>
                </div>

                {/* Actions */}
                <div className="admin-v2-patient-actions tw">
                  <Button asChild variant="secondary" className="max-md:min-w-[120px] max-md:flex-1">
                    <Link to={`/care/profile?patient=${patient.id}`}>
                      View Details
                    </Link>
                  </Button>
                  <Button asChild className="max-md:min-w-[120px] max-md:flex-1">
                    <Link to={`/care/schedule?patient=${patient.id}`}>
                      <CalendarIcon size={16} /> Schedule
                    </Link>
                  </Button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Dashboard;
