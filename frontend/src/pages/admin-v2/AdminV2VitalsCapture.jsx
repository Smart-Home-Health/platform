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
// Vitals Record inside the admin shell: the capture experience embedded in
// AdminV2Layout (hamburger nav, sidebar patient selection). The standalone
// phone shell for the same panel lives at /capture.
import AdminV2Layout from './AdminV2Layout';
import PatientGate from './components/PatientGate';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import CaptureVitalsPanel from '../capture/CaptureVitalsPanel';
import useConnectionStatus from '../../hooks/useConnectionStatus';
import './AdminV2.css';

const AdminV2VitalsCapture = () => {
  const { selectedPatient } = useAdminPatient();
  const connection = useConnectionStatus();

  return (
    <AdminV2Layout>
      <div className="admin-v2-page">
        {!selectedPatient ? (
          <PatientGate message="Choose a patient to capture vitals." />
        ) : (
          <div className="vitals-capture vc-embedded">
            <CaptureVitalsPanel patient={selectedPatient} connection={connection} embedded />
          </div>
        )}
      </div>
    </AdminV2Layout>
  );
};

export default AdminV2VitalsCapture;
