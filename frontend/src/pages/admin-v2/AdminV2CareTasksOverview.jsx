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
import {
  PatientSelectorModal, CareTasksOverviewPanel, CareTaskHistoryModal,
} from './components';
import PatientGate from './components/PatientGate';
import { careTaskService } from '../../services/careTasks';
import { TasksIcon } from '../../components/Icons';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import config from '../../config';
import '../../components/vc/entity-card.css';
import './AdminV2.css';

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
  const [showHistory, setShowHistory] = useState(false);
  // Categories are only needed to label and filter the history modal.
  const [categories, setCategories] = useState([]);

  const formatDateTime = (value) => (value
    ? new Date(value).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    })
    : '—');

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-way URL→context sync; adding selectedPatient would re-run on selection change and revert it to the stale URL param
  }, [patients, searchParams, loadingPatients]);

  useEffect(() => {
    if (selectedPatient && searchParams.get('patient') !== String(selectedPatient.id)) {
      setSearchParams({ patient: selectedPatient.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-way context→URL sync; runs only when the selection changes
  }, [selectedPatient]);

  useEffect(() => {
    if (selectedPatient) {
      fetchAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch helper is recreated each render; effect is keyed on patient/window change only
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
      // Only used to label and filter the history modal, so a failure here
      // must not take the stats down with it.
      careTaskService.listCategories().then(setCategories).catch(() => setCategories([]));
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
          <PatientGate
            icon={<TasksIcon size={48} />}
            message="Choose a patient to view their care task overview"
          />
        </div>
      </AdminV2Layout>
    );
  }

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {error && <div className="em-error ec-page-alert" role="alert">{error}</div>}

        <CareTasksOverviewPanel
          windowDays={windowDays}
          onWindowChange={setWindowDays}
          adherence={adherence}
          perTask={perTask}
          perUser={perUser}
          loading={loading}
          onViewHistory={() => setShowHistory(true)}
        />

        {showPatientModal && (
          <PatientSelectorModal
            patients={patients}
            selectedPatient={selectedPatient}
            onSelectPatient={(p) => { selectPatient(p); setShowPatientModal(false); }}
            onClose={() => setShowPatientModal(false)}
            loading={loadingPatients}
          />
        )}

        {/* The completion record, opened from the numbers it explains rather
            than living in the nav. */}
        <CareTaskHistoryModal
          open={showHistory}
          onOpenChange={setShowHistory}
          patient={selectedPatient}
          categories={categories}
          formatDateTime={formatDateTime}
        />
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2CareTasksOverview;
