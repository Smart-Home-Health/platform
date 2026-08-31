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
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import AdminV2Layout from './AdminV2Layout';
import { PatientSelectorModal, MedStockBar, MedicationHistoryModal } from './components';
import config from '../../config';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import { MedicationsIcon, ClockIcon, PackageIcon, ChevronRightIcon } from '../../components/Icons';
import EntityCard from '../../components/vc/EntityCard';
import EntityToolbar from '../../components/vc/EntityToolbar';
import { CfgStat } from './settings/CfgSection';
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

  const [searchTerm, setSearchTerm] = useState('');
  const [filterKey, setFilterKey] = useState('all');
  const [historyMed, setHistoryMed] = useState(null);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- one-way URL→context sync; adding contextPatient would re-run on selection change and revert it to the stale URL param
  }, [searchParams, patients, loadingPatients]);

  useEffect(() => {
    if (contextPatient && searchParams.get('patient') !== String(contextPatient.id)) {
      setSearchParams({ patient: contextPatient.id });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- one-way context→URL sync; runs only when the selection changes
  }, [contextPatient]);

  useEffect(() => {
    if (selectedPatient) fetchActiveMedications();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch helper is recreated each render; effect is keyed on patient change only
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

  const scheduledCount = medications.filter(m => !m.as_needed).length;
  const prnCount = medications.filter(m => m.as_needed).length;
  const lowStockCount = medications.filter(m => m.stock_low).length;

  const matchesSearch = (med) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return med.name.toLowerCase().includes(q) || med.instructions?.toLowerCase().includes(q);
  };
  const matchesFilter = (med) => {
    if (filterKey === 'scheduled') return !med.as_needed;
    if (filterKey === 'prn') return med.as_needed;
    if (filterKey === 'low_stock') return !!med.stock_low;
    return true;
  };
  const filtered = medications.filter(med => matchesSearch(med) && matchesFilter(med));
  const scheduledMeds = filtered.filter(m => !m.as_needed);
  const prnMeds = filtered.filter(m => m.as_needed);

  const renderCard = (med) => (
    <EntityCard
      key={med.id}
      initials={med.name.slice(0, 2).toUpperCase()}
      title={med.name}
      badges={[med.concentration, med.is_global ? 'Global' : null].filter(Boolean)}
      tag={med.stock_low ? { label: 'Low stock', tone: 'due' } : undefined}
      details={[
        { icon: <ClockIcon size={18} />, label: 'Last given', value: formatDateTime(med.last_administered) },
        { icon: <ClockIcon size={18} />, label: 'Next due', value: formatDateTime(med.next_due) },
        { icon: <PackageIcon size={18} />, label: 'On hand', value: `${med.quantity} ${med.quantity_unit}` },
      ]}
      quickActions={[
        { icon: <ChevronRightIcon size={20} />, label: `View history for ${med.name}`, onClick: () => setHistoryMed(med) },
      ]}
    >
      <MedStockBar daysLeft={med.days_left} low={med.stock_low} />
    </EntityCard>
  );

  if (loadingPatients) {
    return (
      <AdminV2Layout>
        <div className="admin-v2-page">
          <p className="cfg-loading">Loading patients...</p>
        </div>
      </AdminV2Layout>
    );
  }

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {selectedPatient ? (
          <div className="cfg">
            {error && <div className="em-error ec-page-alert">{error}</div>}

            <div className="cfg-stats row">
              <CfgStat label="Active" value={medications.length} />
              <CfgStat label="Scheduled" value={scheduledCount} />
              <CfgStat label="PRN" value={prnCount} />
              <CfgStat label="Low Stock" value={lowStockCount} />
            </div>

            <EntityToolbar
              search={searchTerm}
              onSearchChange={setSearchTerm}
              searchPlaceholder="Search medications"
              filter={{
                value: filterKey,
                onChange: setFilterKey,
                label: 'Show',
                options: [
                  { value: 'all', label: 'All' },
                  { value: 'scheduled', label: 'Scheduled' },
                  { value: 'prn', label: 'PRN' },
                  { value: 'low_stock', label: 'Low stock' },
                ],
              }}
            />

            {loading ? (
              <div className="ec-empty">Loading medications…</div>
            ) : filtered.length === 0 ? (
              <div className="ec-empty">
                <MedicationsIcon size={32} />
                <p>{searchTerm ? 'No medications match your search.' : 'No active medications for this patient.'}</p>
              </div>
            ) : (
              <>
                {scheduledMeds.length > 0 && (
                  <>
                    <h3 className="cfg-toolbar-title">Scheduled · {scheduledMeds.length}</h3>
                    <div className="ec-grid">
                      {scheduledMeds.map(renderCard)}
                    </div>
                  </>
                )}
                {prnMeds.length > 0 && (
                  <>
                    <h3 className="cfg-toolbar-title">As Needed · {prnMeds.length}</h3>
                    <div className="ec-grid">
                      {prnMeds.map(renderCard)}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="cfg-nopatient">
            <MedicationsIcon size={48} />
            <h2>Select a Patient</h2>
            <p>Choose a patient to view their medications</p>
            <button type="button" className="em-submit" onClick={() => setShowPatientModal(true)}>
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

        <MedicationHistoryModal
          open={!!historyMed}
          medication={historyMed}
          patientId={selectedPatient?.id}
          onClose={() => setHistoryMed(null)}
        />

      </div>
    </AdminV2Layout>
  );
};

export default AdminV2Medications;
