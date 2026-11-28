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
import { useCallback, useEffect, useState } from 'react';
import ModalBase from './ModalBase';
import config, { apiFetch } from '../config';
import { DailySchedule } from '../pages/admin-v2/AdminV2Schedule';
import { useAuth } from '../contexts/AuthContext';
import { canRecordSchedule, hasSchedulePermission } from './schedule/schedulePermissions';
import PanelViewSwitcher from './section-panel/PanelViewSwitcher';
import PrnPicker from './section-panel/PrnPicker';
import { medicationRows } from './section-panel/prnRows';
import './section-panel/section-panel.css';
import { getCurrentLocalDateTime } from '../utils/timezone';
import MedicationDoseModal from '../pages/admin-v2/components/MedicationDoseModal';

const MedicationModal = ({ patient: selectedPatient, onClose }) => {
  const { user, hasReadAccess } = useAuth();
  const canReadMeds = hasReadAccess !== false && hasSchedulePermission(user, 'medications.read');
  const [tab, setTab] = useState('scheduled');
  const [refreshKey, setRefreshKey] = useState(0);
  const [medicationCatalog, setMedicationCatalog] = useState([]);
  const activeMedications = canReadMeds ? medicationCatalog : [];
  const [loading, setLoading] = useState(false);

  // PRN: pick an as-needed med, then the shared dose modal collects dose/time.
  const [prnPickerOpen, setPrnPickerOpen] = useState(false);
  const [prnMed, setPrnMed] = useState(null);

  const patientId = selectedPatient?.id;
  const fetchActiveMedications = useCallback(async () => {
    if (!patientId || !canReadMeds) return;
    setLoading(true);
    try {
      const res = await apiFetch(`${config.apiUrl}/api/admin/medications/active?patient_id=${patientId}`);
      if (res.ok) setMedicationCatalog(await res.json());
    } catch (err) {
      console.error('Error fetching medications:', err);
    } finally {
      setLoading(false);
    }
  }, [patientId, canReadMeds]);

  useEffect(() => { fetchActiveMedications(); }, [fetchActiveMedications, tab]);

  const viewOptions = [
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'active', label: 'Active medications', count: activeMedications.length },
  ];

  const formatTimestamp = (iso) => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
      });
    } catch {
      return null;
    }
  };

  // ===== PRN =====
  const openPrnPicker = () => setPrnPickerOpen(true);
  const pickPrnMed = (med) => { setPrnPickerOpen(false); setPrnMed(med); };
  const prnMedications = activeMedications.filter(m => m.as_needed);

  // Active-meds reference card (on-hand / last given / next due). Info-only;
  // admin actions live in /admin-v2/medications.
  const renderMedicationCard = (med) => {
    const lastGiven = formatTimestamp(med.last_administered);
    const nextDue = formatTimestamp(med.next_due);
    return (
      <div key={med.id} className="medication-card" style={{
        backgroundColor: 'var(--dash-surface)', borderRadius: '6px', padding: '12px', marginBottom: '8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid var(--vc-state-complete)', borderLeft: '4px solid var(--vc-state-complete)'
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
            <h4 style={{ margin: 0, color: 'var(--dash-text)', fontSize: '16px', fontWeight: 600 }}>{med.name}</h4>
            {med.concentration && (
              <span style={{ fontSize: 12, color: 'var(--dash-text-muted)', fontWeight: 500 }}>{med.concentration}</span>
            )}
            {med.as_needed && (
              <span style={{ background: 'color-mix(in srgb, var(--vc-series-3) 20%, transparent)', color: 'var(--vc-series-3)', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>PRN</span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '6px 16px', fontSize: 13, color: 'var(--dash-text-muted)' }}>
            <span><strong style={{ color: 'var(--dash-text)' }}>On hand:</strong> {med.quantity ?? '—'} {med.quantity_unit || 'units'}</span>
            <span>
              <strong style={{ color: 'var(--dash-text)' }}>Last given:</strong>{' '}
              {lastGiven
                ? <>{lastGiven}{med.last_dose_amount != null && <span style={{ color: 'var(--dash-text-muted)' }}> ({med.last_dose_amount})</span>}</>
                : <span style={{ color: 'var(--dash-text-dim)' }}>never</span>}
            </span>
            {nextDue && <span><strong style={{ color: 'var(--dash-text)' }}>Next due:</strong> {nextDue}</span>}
          </div>
          {med.notes && (
            <div style={{ fontSize: 12, color: 'var(--dash-text-muted)', marginTop: 8, fontStyle: 'italic' }}>
              {med.notes.length > 80 ? med.notes.substring(0, 80) + '…' : med.notes}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ===== Render =====
  return (
    <>
      <ModalBase isOpen={true} onClose={onClose} title={
        <span className="mp-modal-title">
          <span>Medications</span>
          <span className="mp-modal-title-sub">
            {selectedPatient
              ? `${selectedPatient.first_name} ${selectedPatient.last_name} \u00b7 ${tab === 'active' ? 'Active' : 'Schedule'}`
              : 'No patient selected'}
          </span>
        </span>
      }>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {!selectedPatient && (
            <div className="ld-dose-empty">No patient selected</div>
          )}

          <PanelViewSwitcher
            views={viewOptions}
            value={tab}
            onChange={setTab}
            actions={[{
              label: 'PRN',
              count: prnMedications.length,
              onClick: openPrnPicker,
              disabled: !selectedPatient || !canRecordSchedule(user, 'medications') || prnMedications.length === 0,
              title: prnMedications.length === 0
                ? 'No as-needed medications for this patient'
                : 'Give an as-needed medication',
            }]}
          />

          <div className="ld-panel-scroll">
            {selectedPatient && (
              <div hidden={tab !== 'scheduled'}>
                <DailySchedule patient={selectedPatient} category="medications" active={tab === 'scheduled'}
                  refreshKey={refreshKey} onChange={fetchActiveMedications} />
              </div>
            )}
            {tab === 'active' && (
              !canReadMeds ? <p>Medication read access is required.</p>
                : loading
                ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--dash-text-muted)' }}>Loading…</div>
                : activeMedications.length === 0
                  ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--dash-text-muted)' }}>No active medications.</div>
                  : <div>{activeMedications.map(renderMedicationCard)}</div>
            )}
          </div>
        </div>
      </ModalBase>

      {/* PRN step 1: choose an as-needed med (step 2 is MedicationDoseModal) */}
      <PrnPicker
        open={prnPickerOpen}
        onOpenChange={(o) => { if (!o) setPrnPickerOpen(false); }}
        patientName={selectedPatient
          ? `${selectedPatient.first_name} ${selectedPatient.last_name}`.trim()
          : null}
        rows={medicationRows(prnMedications)}
        onSelect={pickPrnMed}
      />

      {/* Shared dose modal for the chosen PRN med */}
      <MedicationDoseModal
        open={!!prnMed}
        onClose={() => setPrnMed(null)}
        onSaved={() => { setPrnMed(null); setRefreshKey(value => value + 1); fetchActiveMedications(); }}
        patient={selectedPatient}
        medication={prnMed}
        defaultDateTime={getCurrentLocalDateTime()}
      />

    </>
  );
};

export default MedicationModal;
