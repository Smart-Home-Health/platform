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
// Step one of an as-needed entry: pick the thing. Step two collects the
// details — MedicationDoseModal for a dose, a when/notes form for a care task
// — so this only has to hand back a choice.
//
// Built on Radix Dialog for focus trapping and escape handling, skinned from vc
// tokens. The content portals to <body>, so the vc class rides on the content
// element rather than being inherited from the panel.
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { XIcon } from '../Icons';
import './section-panel.css';

/* `rows` are section-shaped — see prnRows.jsx for the mappers. Each is
 * { id, name, meta, note, tone, icon, record }, so the picker never learns
 * what a medication or a care task actually is. */
export default function PrnPicker({
  open, onOpenChange, patientName, rows = [], onSelect,
  eyebrow = 'PRN medication',
  title = 'Select medication',
  hint = 'Select a medication to set dose, reason + time',
  emptyText = 'No as-needed medications for this patient.',
  step = 'Step 1 of 2',
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="mp-sheet-overlay" />
        <DialogPrimitive.Content className="mp-sheet" aria-describedby={undefined}>
          <div className="mp-sheet-grip" aria-hidden="true" />

          <div className="mp-sheet-head">
            <div className="mp-sheet-headings">
              <span className="mp-sheet-eyebrow">{eyebrow}</span>
              <DialogPrimitive.Title className="mp-sheet-title">{title}</DialogPrimitive.Title>
              <span className="mp-sheet-sub">
                {patientName ? `${patientName} · ` : ''}{rows.length} available
              </span>
            </div>
            <DialogPrimitive.Close className="mp-sheet-close" aria-label="Close">
              <XIcon size={18} />
            </DialogPrimitive.Close>
          </div>

          <div className="mp-sheet-body">
            {rows.length === 0 ? (
              <p className="mp-sheet-empty">{emptyText}</p>
            ) : rows.map((row) => {
              const Icon = row.icon;
              return (
                <button
                  key={row.id}
                  type="button"
                  className="mp-prn-row"
                  onClick={() => onSelect(row.record ?? row)}
                >
                  {Icon && <span className="mp-prn-icon" aria-hidden="true"><Icon size={22} /></span>}
                  <span className="mp-prn-text">
                    <span className="mp-prn-name">{row.name}</span>
                    {row.meta && <span className="mp-prn-conc">{row.meta}</span>}
                    {row.note && (
                      <span className={`mp-prn-stock${row.tone === 'low' ? ' low' : ''}`}>
                        {row.note}
                        {row.tone === 'low' && <span className="mp-prn-lowtag"> · low</span>}
                      </span>
                    )}
                  </span>
                  <span className="mp-prn-select">Select ›</span>
                </button>
              );
            })}
          </div>

          {rows.length > 0 && (
            <div className="mp-sheet-foot">
              <span>{hint}</span>
              <span className="mp-sheet-step">{step}</span>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
