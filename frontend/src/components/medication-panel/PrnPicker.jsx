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
// Step one of giving an as-needed dose: pick the medication. Step two (dose,
// time, notes) is the existing MedicationDoseModal, so this only has to hand
// back a choice.
//
// Built on Radix Dialog for focus trapping and escape handling, skinned from vc
// tokens. The content portals to <body>, so the vc class rides on the content
// element rather than being inherited from the panel.
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { XIcon, DropletIcon, PillIcon, TabletPillIcon } from '../Icons';
import { isLowStock } from './lowStock';
import './medication-panel.css';

// A rough read of the form from the unit, only to give each row a recognisable
// silhouette — it is never the only thing distinguishing two medications.
function formIcon(med) {
  const unit = (med.quantity_unit || '').toLowerCase();
  if (unit.includes('ml') || unit.includes('unit') || unit.includes('spray')) return DropletIcon;
  if (unit.includes('capsule')) return PillIcon;
  return TabletPillIcon;
}

const onHandLabel = (med) => {
  const qty = med.quantity ?? 0;
  const unit = med.quantity_unit || '';
  return `${qty}${unit ? ` ${unit}` : ''} on hand`;
};

export default function PrnPicker({ open, onOpenChange, patientName, medications = [], onSelect }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="mp-sheet-overlay" />
        <DialogPrimitive.Content className="mp-sheet" aria-describedby={undefined}>
          <div className="mp-sheet-grip" aria-hidden="true" />

          <div className="mp-sheet-head">
            <div className="mp-sheet-headings">
              <span className="mp-sheet-eyebrow">PRN medication</span>
              <DialogPrimitive.Title className="mp-sheet-title">Select medication</DialogPrimitive.Title>
              <span className="mp-sheet-sub">
                {patientName ? `${patientName} · ` : ''}{medications.length} available
              </span>
            </div>
            <DialogPrimitive.Close className="mp-sheet-close" aria-label="Close">
              <XIcon size={18} />
            </DialogPrimitive.Close>
          </div>

          <div className="mp-sheet-body">
            {medications.length === 0 ? (
              <p className="mp-sheet-empty">No as-needed medications for this patient.</p>
            ) : medications.map((med) => {
              const Icon = formIcon(med);
              const low = isLowStock(med);
              return (
                <button
                  key={med.id}
                  type="button"
                  className="mp-prn-row"
                  onClick={() => onSelect(med)}
                >
                  <span className="mp-prn-icon" aria-hidden="true"><Icon size={22} /></span>
                  <span className="mp-prn-text">
                    <span className="mp-prn-name">{med.name}</span>
                    {med.concentration && <span className="mp-prn-conc">{med.concentration}</span>}
                    <span className={`mp-prn-stock${low ? ' low' : ''}`}>
                      {onHandLabel(med)}
                      {low && <span className="mp-prn-lowtag"> · low</span>}
                    </span>
                  </span>
                  <span className="mp-prn-select">Select ›</span>
                </button>
              );
            })}
          </div>

          {medications.length > 0 && (
            <div className="mp-sheet-foot">
              <span>Select a medication to set dose, reason + time</span>
              <span className="mp-sheet-step">Step 1 of 2</span>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
