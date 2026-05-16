import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { PatientSelectorModal, MedicationDoseModal } from './components';
import config from '../../config';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import { MedicationsIcon } from '../../components/Icons';
import './AdminV2.css';

// Map a med's timing relative to next_due into a traffic-light color. A med
// that's both PRN and scheduled (e.g. Olanzapine 9pm daily with PRN allowed)
// follows the schedule colors — only fall back to the PRN "always green" when
// there is no scheduled next_due to compare against.
//   ≤60 min away      → green   (acceptable window)
//   60–120 min away   → yellow  (off-window, soft)
//   >120 min away     → red     (well off-window — confirm)
//   PRN, no next_due  → green   (always available)
//   no schedule data  → grey
const doseTimingColor = (med) => {
  if (med.next_due) {
    const due = new Date(med.next_due);
    if (!isNaN(due.getTime())) {
      const minutesOff = Math.abs((due.getTime() - Date.now()) / 60000);
      if (minutesOff <= 60) return { bg: '#238636', label: 'on-window' };
      if (minutesOff <= 120) return { bg: '#bb8009', label: 'soft' };
      return { bg: '#da3633', label: 'hard' };
    }
  }
  if (med.as_needed) return { bg: '#238636', label: 'ok' };
  return { bg: '#6e7681', label: 'unknown' };
};

const formatDateTime = (iso) => {
  if (!iso) return '—';
  const normalized = iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z';
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const AdminV2Medications = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    patients,
    selectedPatient: contextPatient,
    selectPatient: setContextPatient,
    loadingPatients,
  } = useAdminPatient();

  const selectedPatient = contextPatient;
  const [showPatientModal, setShowPatientModal] = useState(false);

  const [medications, setMedications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [doseModalMed, setDoseModalMed] = useState(null);
  const [showDoseModal, setShowDoseModal] = useState(false);

  // 'auto' = table on desktop, cards on mobile (via CSS media query).
  // 'cards' = force the card layout at any width (handy on iPad).
  const [viewMode, setViewMode] = useState(
    () => localStorage.getItem('adminV2MedsViewMode') || 'auto'
  );
  useEffect(() => {
    localStorage.setItem('adminV2MedsViewMode', viewMode);
  }, [viewMode]);

  // Sync URL <-> context patient
  useEffect(() => {
    const patientId = searchParams.get('patient');
    if (patientId && patients.length > 0) {
      const patient = patients.find(p => p.id === parseInt(patientId));
      if (patient && patient.id !== contextPatient?.id) {
        setContextPatient(patient);
      }
    } else if (!patientId && !contextPatient && patients.length > 0 && !loadingPatients) {
      setShowPatientModal(true);
    }
  }, [searchParams, patients, loadingPatients]);

  useEffect(() => {
    if (contextPatient && searchParams.get('patient') !== String(contextPatient.id)) {
      setSearchParams({ patient: contextPatient.id });
    }
  }, [contextPatient]);

  useEffect(() => {
    if (selectedPatient) fetchActiveMedications();
  }, [selectedPatient]);

  const fetchActiveMedications = async () => {
    if (!selectedPatient) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(
        `${config.apiUrl}/api/admin/medications/active?patient_id=${selectedPatient.id}`,
        { credentials: 'include' }
      );
      if (res.ok) {
        const data = await res.json();
        const sorted = data.sort((a, b) => {
          const aTime = a.last_administered ? new Date(a.last_administered).getTime() : -Infinity;
          const bTime = b.last_administered ? new Date(b.last_administered).getTime() : -Infinity;
          if (bTime !== aTime) return bTime - aTime;
          return a.name.localeCompare(b.name);
        });
        setMedications(sorted);
      } else {
        setError('Failed to load medications');
      }
    } catch (err) {
      console.error('Error fetching medications:', err);
      setError('Error connecting to server');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPatient = (patient) => {
    setContextPatient(patient);
    setSearchParams({ patient: patient.id });
    setShowPatientModal(false);
  };

  if (loadingPatients) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-loading">Loading patients...</div>
      </AdminV2Layout>
    );
  }

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {selectedPatient ? (
          <>
            <div className="admin-v2-meds-header">
              <h1 className="schedule-section-title">Medications Overview</h1>
              <div className="admin-v2-meds-view-toggle" role="group" aria-label="View mode">
                <button
                  type="button"
                  className={`admin-v2-btn admin-v2-btn-sm${viewMode === 'auto' ? ' admin-v2-btn-primary' : ''}`}
                  onClick={() => setViewMode('auto')}
                  aria-pressed={viewMode === 'auto'}
                >
                  Table
                </button>
                <button
                  type="button"
                  className={`admin-v2-btn admin-v2-btn-sm${viewMode === 'cards' ? ' admin-v2-btn-primary' : ''}`}
                  onClick={() => setViewMode('cards')}
                  aria-pressed={viewMode === 'cards'}
                >
                  Cards
                </button>
              </div>
            </div>

            {error && <div className="admin-v2-error-banner">{error}</div>}

            {loading ? (
              <div className="admin-v2-loading">Loading medications...</div>
            ) : medications.length === 0 ? (
              <div className="admin-v2-empty-state">
                <MedicationsIcon size={32} />
                <p>No active medications for this patient</p>
              </div>
            ) : (
              <div className={viewMode === 'cards' ? 'admin-v2-meds-force-cards' : ''}>
                {/* Desktop: dense table */}
                <div className="admin-v2-table-container admin-v2-meds-desktop">
                  <table className="admin-v2-table">
                    <thead>
                      <tr>
                        <th>Medication</th>
                        <th>Concentration</th>
                        <th>Qty</th>
                        <th>Instructions</th>
                        <th>Status</th>
                        <th>Last Given</th>
                        <th>Next Due</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {medications.map(med => {
                        const timing = doseTimingColor(med);
                        return (
                          <tr key={med.id}>
                            <td>
                              <div className="admin-v2-med-name">
                                <strong>{med.name}</strong>
                                {med.is_global && (
                                  <span className="admin-v2-badge admin-v2-badge-info">Global</span>
                                )}
                              </div>
                            </td>
                            <td>{med.concentration || '—'}</td>
                            <td>{med.quantity} {med.quantity_unit}</td>
                            <td className="admin-v2-instructions-cell">
                              {med.instructions || '—'}
                            </td>
                            <td>
                              {med.as_needed ? (
                                <span className="admin-v2-badge admin-v2-badge-warning">PRN</span>
                              ) : (
                                <span className="admin-v2-badge admin-v2-badge-secondary">SCH</span>
                              )}
                            </td>
                            <td>{formatDateTime(med.last_administered)}</td>
                            <td>{formatDateTime(med.next_due)}</td>
                            <td>
                              <button
                                type="button"
                                className="admin-v2-btn admin-v2-btn-sm"
                                onClick={() => { setDoseModalMed(med); setShowDoseModal(true); }}
                                title={
                                  med.next_due
                                    ? `Next due ${formatDateTime(med.next_due)}${med.as_needed ? ' (PRN also)' : ''}`
                                    : med.as_needed
                                      ? 'Log an as-needed dose'
                                      : 'No scheduled dose'
                                }
                                style={{
                                  background: timing.bg,
                                  borderColor: timing.bg,
                                  color: '#fff',
                                  fontWeight: 600,
                                }}
                              >
                                Dose
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile: stacked card list */}
                <div className="admin-v2-meds-cards">
                  {medications.map(med => {
                    const timing = doseTimingColor(med);
                    return (
                      <div key={med.id} className="admin-v2-med-card">
                        <div className="admin-v2-med-card-row admin-v2-med-card-header">
                          <div className="admin-v2-med-card-title">
                            <strong>{med.name}</strong>
                            {med.concentration && (
                              <span className="admin-v2-med-card-concentration">{med.concentration}</span>
                            )}
                          </div>
                          <div className="admin-v2-med-card-badges">
                            {med.as_needed ? (
                              <span className="admin-v2-badge admin-v2-badge-warning">PRN</span>
                            ) : (
                              <span className="admin-v2-badge admin-v2-badge-secondary">SCH</span>
                            )}
                            {med.is_global && (
                              <span className="admin-v2-badge admin-v2-badge-info">Global</span>
                            )}
                          </div>
                        </div>

                        {med.instructions && (
                          <div className="admin-v2-med-card-instructions">{med.instructions}</div>
                        )}

                        <div className="admin-v2-med-card-row admin-v2-med-card-meta">
                          <div className="admin-v2-med-card-meta-item">
                            <span className="admin-v2-med-card-label">Qty</span>
                            <span>{med.quantity} {med.quantity_unit}</span>
                          </div>
                          <div className="admin-v2-med-card-meta-item">
                            <span className="admin-v2-med-card-label">Last given</span>
                            <span>{formatDateTime(med.last_administered)}</span>
                            {med.last_administered && med.last_dose_amount != null && (
                              <span className="admin-v2-med-card-sub">
                                {med.last_dose_amount} {med.quantity_unit}
                              </span>
                            )}
                          </div>
                          <div className="admin-v2-med-card-meta-item">
                            <span className="admin-v2-med-card-label">Next due</span>
                            <span>{formatDateTime(med.next_due)}</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="admin-v2-btn admin-v2-med-card-dose"
                          onClick={() => { setDoseModalMed(med); setShowDoseModal(true); }}
                          style={{
                            background: timing.bg,
                            borderColor: timing.bg,
                            color: '#fff',
                            fontWeight: 600,
                          }}
                        >
                          Dose
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="admin-v2-no-patient">
            <MedicationsIcon size={48} />
            <h2>Select a Patient</h2>
            <p>Choose a patient to view their medications</p>
            <button
              className="admin-v2-btn admin-v2-btn-primary"
              onClick={() => setShowPatientModal(true)}
            >
              Select Patient
            </button>
          </div>
        )}

        {showPatientModal && (
          <PatientSelectorModal
            patients={patients}
            selectedPatient={selectedPatient}
            onSelectPatient={handleSelectPatient}
            onClose={() => setShowPatientModal(false)}
            loading={loadingPatients}
          />
        )}

        <MedicationDoseModal
          open={showDoseModal}
          onClose={() => { setShowDoseModal(false); setDoseModalMed(null); }}
          onSaved={fetchActiveMedications}
          patient={selectedPatient}
          medication={doseModalMed}
        />
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Medications;
