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
import { createPortal } from 'react-dom';
import ModalBase from '../ModalBase';
import RecordVitalsForm from './RecordVitalsForm';
import { formatVitalDisplayName } from '../../utils/vitals';

/**
 * Minimal wrapper that opens RecordVitalsForm locked to a single vital_type.
 * Used by the small per-vital charts on the live dashboard so caregivers can
 * jot a quick reading without navigating to the full History form.
 *
 * Rendered via createPortal because the parent DynamicVitalsCard uses
 * `transform` / `perspective` for its flip animation — those create a new
 * containing block for `position: fixed`, which would trap the modal inside
 * the tiny card area. Portaling to document.body escapes that context.
 */
export default function QuickAddVitalModal({ vitalType, patientId, onClose, onSaved }) {
  if (!vitalType || !patientId) return null;
  return createPortal(
    <ModalBase isOpen={true} onClose={onClose} title={`Quick Add — ${formatVitalDisplayName(vitalType)}`}>
      <RecordVitalsForm
        patientId={patientId}
        singleVitalType={vitalType}
        showNotes={true}
        submitLabel="Save"
        onSaved={() => {
          if (onSaved) onSaved();
          onClose();
        }}
      />
    </ModalBase>,
    document.body
  );
}
