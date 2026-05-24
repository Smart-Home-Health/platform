import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { PatientSelectorModal } from './components';
import { TasksIcon, CheckIcon, ClockIcon, XIcon } from '../../components/Icons';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import config from '../../config';
import './AdminV2.css';

const WINDOWS = [
  { days: 7, label: '7d' },
  { days: 30, label: '30d' },
  { days: 90, label: '90d' },
];

const AdminV2CareTasksOverview = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    patients,
    selectedPatient,
    selectPatient,
    loadingPatients,
  } = useAdminPatient();

  const [showPatientModal, setShowPatientModal] = useState(false);
  const [windowDays, setWindowDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [adherence, setAdherence] = useState(null);
  const [perTask, setPerTask] = useState([]);
  const [perUser, setPerUser] = useState([]);

  // Sync patient param with context
  useEffect(() => {
    const patientId = searchParams.get('patient');
    if (patientId && patients.length > 0) {
      const patient = patients.find(p => p.id === parseInt(patientId));
      if (patient && patient.id !== selectedPatient?.id) {
        selectPatient(patient);
      }
    } else if (!patientId && !selectedPatient && patients.length > 0 && !loadingPatients) {
      setShowPatientModal(true);
    }
  }, [patients, searchParams, loadingPatients]);

  useEffect(() => {
    if (selectedPatient && searchParams.get('patient') !== String(selectedPatient.id)) {
      setSearchParams({ patient: selectedPatient.id });
    }
  }, [selectedPatient]);

  useEffect(() => {
    if (selectedPatient) {
      fetchAll();
    }
  }, [selectedPatient, windowDays]);

  const fetchAll = async () => {
    if (!selectedPatient) return;
    setLoading(true);
    setError(null);
    try {
      const q = `days=${windowDays}&patient_id=${selectedPatient.id}`;
      const [oRes, tRes, uRes] = await Promise.all([
        fetch(`${config.apiUrl}/api/care-tasks/stats/overview?${q}`, { credentials: 'include' }),
        fetch(`${config.apiUrl}/api/care-tasks/stats/completion?${q}`, { credentials: 'include' }),
        fetch(`${config.apiUrl}/api/care-tasks/stats/by-user?${q}`, { credentials: 'include' }),
      ]);
      if (!oRes.ok || !tRes.ok || !uRes.ok) {
        throw new Error('Failed to load one or more stats endpoints');
      }
      setAdherence(await oRes.json());
      const tJson = await tRes.json();
      setPerTask(tJson.stats || []);
      const uJson = await uRes.json();
      setPerUser(uJson.stats || []);
    } catch (err) {
      console.error('Error loading overview stats:', err);
      setError('Failed to load statistics');
    } finally {
      setLoading(false);
    }
  };

  if (loadingPatients) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-loading">Loading patients...</div>
      </AdminV2Layout>
    );
  }

  if (!selectedPatient) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-page">
          <div className="admin-v2-no-patient">
            <TasksIcon size={48} />
            <h2>Select a Patient</h2>
            <p>Choose a patient to view their care task overview</p>
            <button
              className="admin-v2-btn admin-v2-btn-primary"
              onClick={() => setShowPatientModal(true)}
            >
              Select Patient
            </button>
          </div>
          {showPatientModal && (
            <PatientSelectorModal
              patients={patients}
              selectedPatient={selectedPatient}
              onSelectPatient={(p) => { selectPatient(p); setShowPatientModal(false); }}
              onClose={() => setShowPatientModal(false)}
              loading={loadingPatients}
            />
          )}
        </div>
      </AdminV2Layout>
    );
  }

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        <h1 className="schedule-section-title">Care Tasks Overview</h1>

        {/* Window selector */}
        <div className="admin-v2-page-header" style={{ marginTop: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {WINDOWS.map(w => (
              <button
                key={w.days}
                className={`admin-v2-btn admin-v2-btn-sm ${windowDays === w.days ? 'admin-v2-btn-primary' : ''}`}
                onClick={() => setWindowDays(w.days)}
              >
                Last {w.label}
              </button>
            ))}
          </div>
          <button
            className="admin-v2-btn admin-v2-btn-sm"
            onClick={fetchAll}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {error && <div className="admin-v2-error">{error}</div>}

        {/* Adherence summary */}
        {adherence && (
          <div className="admin-v2-stats-row admin-v2-stats-row-compact" style={{ marginTop: '1rem' }}>
            <div className="admin-v2-stat-card">
              <div className="admin-v2-stat-icon" style={{ background: 'rgba(35, 134, 54, 0.15)' }}>
                <CheckIcon size={20} />
              </div>
              <div className="admin-v2-stat-info">
                <h4>{adherence.adherence_rate}%</h4>
                <p>Adherence</p>
              </div>
            </div>
            <div className="admin-v2-stat-card">
              <div className="admin-v2-stat-icon" style={{ background: 'rgba(35, 134, 54, 0.15)' }}>
                <CheckIcon size={20} />
              </div>
              <div className="admin-v2-stat-info">
                <h4>{adherence.on_time}</h4>
                <p>On Time</p>
              </div>
            </div>
            <div className="admin-v2-stat-card">
              <div className="admin-v2-stat-icon" style={{ background: 'rgba(248, 81, 73, 0.15)' }}>
                <ClockIcon size={20} />
              </div>
              <div className="admin-v2-stat-info">
                <h4>{adherence.late}</h4>
                <p>Late</p>
              </div>
            </div>
            <div className="admin-v2-stat-card">
              <div className="admin-v2-stat-icon" style={{ background: 'rgba(158, 106, 3, 0.15)' }}>
                <ClockIcon size={20} />
              </div>
              <div className="admin-v2-stat-info">
                <h4>{adherence.early}</h4>
                <p>Early</p>
              </div>
            </div>
            <div className="admin-v2-stat-card">
              <div className="admin-v2-stat-icon" style={{ background: 'rgba(139, 148, 158, 0.15)' }}>
                <XIcon size={20} />
              </div>
              <div className="admin-v2-stat-info">
                <h4>{adherence.skipped}</h4>
                <p>Skipped</p>
              </div>
            </div>
          </div>
        )}

        {/* Per-task breakdown */}
        <h3 style={{ marginTop: '2rem', color: '#e6edf3' }}>By Task</h3>
        {perTask.length === 0 ? (
          <div className="admin-v2-empty-state" style={{ padding: '1.5rem' }}>
            <p className="admin-v2-text-muted">No completion logs in this window.</p>
          </div>
        ) : (
          <div className="admin-v2-table-container">
            <table className="admin-v2-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Total</th>
                  <th>On Time</th>
                  <th>Late</th>
                  <th>Skipped</th>
                  <th>Completion</th>
                </tr>
              </thead>
              <tbody>
                {perTask.map(row => (
                  <tr key={row.task_id}>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: row.category_color || '#6f42c1',
                          marginRight: 8,
                          verticalAlign: 'middle',
                        }}
                      />
                      {row.task_name}
                    </td>
                    <td>{row.total_logs}</td>
                    <td>{row.on_time}</td>
                    <td>{row.late}</td>
                    <td>{row.skipped}</td>
                    <td>{row.completion_rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Per-user activity */}
        <h3 style={{ marginTop: '2rem', color: '#e6edf3' }}>By User</h3>
        {perUser.length === 0 ? (
          <div className="admin-v2-empty-state" style={{ padding: '1.5rem' }}>
            <p className="admin-v2-text-muted">No completion logs in this window.</p>
          </div>
        ) : (
          <div className="admin-v2-table-container">
            <table className="admin-v2-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Total</th>
                  <th>On Time</th>
                  <th>Late</th>
                  <th>Skipped</th>
                </tr>
              </thead>
              <tbody>
                {perUser.map(row => (
                  <tr key={row.user_id || 'unattributed'}>
                    <td>{row.name}</td>
                    <td>{row.total_logs}</td>
                    <td>{row.on_time}</td>
                    <td>{row.late}</td>
                    <td>{row.skipped}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showPatientModal && (
          <PatientSelectorModal
            patients={patients}
            selectedPatient={selectedPatient}
            onSelectPatient={(p) => { selectPatient(p); setShowPatientModal(false); }}
            onClose={() => setShowPatientModal(false)}
            loading={loadingPatients}
          />
        )}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2CareTasksOverview;
