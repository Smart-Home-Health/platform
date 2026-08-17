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
// Third shell for CaptureVitalsPanel, after the phone surface at /capture and
// the admin embed at /care/vitals. This one docks into the live dashboard, so
// it is the only shell that can offer the connected snapshot: the board
// already holds the oximeter's current SpO2 and heart rate.
//
// The host contract is the same as the others (see AdminV2VitalsCapture):
// an outer `.vitals-capture <modifier>` element plus patient + connection.
import { useEffect, useState } from 'react';
import ModalBase from '../ModalBase';
import CaptureVitalsPanel from '../../pages/capture/CaptureVitalsPanel';
import useConnectionStatus from '../../hooks/useConnectionStatus';
import ConnectionChip from '../ConnectionChip';
import { useModalDock } from '../../contexts/ModalDockContext';

export default function CaptureVitalsModal({ patient, sensorValues, streaming, onClose, onSaved }) {
  const connection = useConnectionStatus();
  const { docked, expanded } = useModalDock();

  // The value-entry sheet portals to <body>, so it can't inherit the panel's
  // bounds. Flag them on <body> and let capture.css align the sheet (and the
  // toast) to the panel band instead of the middle of the screen.
  useEffect(() => {
    if (!docked) return undefined;
    const cls = document.body.classList;
    cls.add('ld-capture-docked');
    cls.toggle('ld-capture-wide', expanded);
    return () => cls.remove('ld-capture-docked', 'ld-capture-wide');
  }, [docked, expanded]);

  // Freeze the oximeter values at open. A snapshot that kept ticking would
  // mean the number the caregiver accepted is not the number they read.
  const [snapshot, setSnapshot] = useState(null);
  useEffect(() => {
    setSnapshot({
      values: { spo2: sensorValues?.spo2 ?? null, bpm: sensorValues?.bpm ?? null },
      streaming,
      at: new Date().toISOString(),
    });
    // Deliberately open-only: see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const title = (
    <span className="ld-capture-title">
      <span>Capture Vitals</span>
      <ConnectionChip connection={connection} />
    </span>
  );

  return (
    <ModalBase isOpen onClose={onClose} title={title}>
      <div className="vitals-capture vc-docked">
        <CaptureVitalsPanel
          patient={patient}
          connection={connection}
          layout="rows"
          snapshot={snapshot}
          onSaved={onSaved}
        />
      </div>
    </ModalBase>
  );
}
