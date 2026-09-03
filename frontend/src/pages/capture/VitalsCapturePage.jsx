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
// Standalone phone shell for the capture experience (/capture): full-screen
// dark chrome with its own header and bottom tab bar. The admin-v2 vitals
// page embeds the same panel inside the hamburger layout instead.
import { useEffect, useState } from 'react';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import config, { apiFetch } from '../../config';
import CaptureVitalsPanel from './CaptureVitalsPanel';
import ConnectionChip from '../../components/ConnectionChip';
import CaptureTabBar from './components/CaptureTabBar';
import useConnectionStatus from '../../hooks/useConnectionStatus';

export default function VitalsCapturePage() {
  const { patients: contextPatients, selectedPatient, selectPatient } = useAdminPatient();
  const connection = useConnectionStatus();

  // AdminPatientContext skips its fetch while the session is read-restricted
  // (monitoring mode), but recording is an allowed action there and the server
  // is the authority on /api/patients — so this page fetches its own list as
  // a fallback rather than showing "no patients" on a phone that can record.
  const [localPatients, setLocalPatients] = useState([]);
  useEffect(() => {
    if (contextPatients.length > 0) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const resp = await apiFetch(`${config.apiUrl}/api/patients`);
        if (resp.ok && !cancelled) setLocalPatients(await resp.json());
      } catch {
        // offline / genuinely restricted: the empty-state copy handles it
      }
    })();
    return () => { cancelled = true; };
  }, [contextPatients.length]);
  const patients = contextPatients.length > 0 ? contextPatients : localPatients;

  if (!selectedPatient) {
    return (
      <div className="vitals-capture">
        <header className="vc-header">
          <span className="vc-header-patient">Capture vitals</span>
        </header>
        <p className="vc-progress-hint" style={{ padding: '2rem 1rem' }}>
          {patients.length === 0
            ? 'No patients available.'
            : 'Pick a patient under More to start capturing.'}
        </p>
        <div className="vc-footer" />
        <CaptureTabBar patients={patients} selectedPatient={null}
                       onSelectPatient={selectPatient} />
      </div>
    );
  }

  return (
    <div className="vitals-capture">
      <header className="vc-header">
        <span className="vc-header-patient">
          {selectedPatient.first_name} {selectedPatient.last_name}
        </span>
        <ConnectionChip connection={connection} />
      </header>

      <h1 className="vc-title">Capture vitals</h1>

      <CaptureVitalsPanel patient={selectedPatient} connection={connection} />

      <CaptureTabBar patients={patients} selectedPatient={selectedPatient}
                     onSelectPatient={selectPatient} />
    </div>
  );
}
