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
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { PatientSelectorModal } from './components';
import config from '../../config';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import { MedicationsIcon } from '../../components/Icons';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import './AdminV2.css';

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
              <div className="tw flex gap-2" role="group" aria-label="View mode">
                <Button
                  type="button"
                  variant={viewMode === 'auto' ? 'default' : 'secondary'}
                  onClick={() => setViewMode('auto')}
                  aria-pressed={viewMode === 'auto'}
                >
                  Table
                </Button>
                <Button
                  type="button"
                  variant={viewMode === 'cards' ? 'default' : 'secondary'}
                  onClick={() => setViewMode('cards')}
                  aria-pressed={viewMode === 'cards'}
                >
                  Cards
                </Button>
              </div>
            </div>

            {error && <div className="tw mb-4"><Alert variant="destructive">{error}</Alert></div>}

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
                      </tr>
                    </thead>
                    <tbody>
                      {medications.map(med => {
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
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile: stacked card list */}
                <div className="admin-v2-meds-cards">
                  {medications.map(med => {
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
            <div className="tw">
              <Button onClick={() => setShowPatientModal(true)}>
                Select Patient
              </Button>
            </div>
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

      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Medications;
