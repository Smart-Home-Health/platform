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
// The vc yes/no sheet. Pairs with EntityModal the way the shadcn confirm
// Dialog paired with the admin forms, so a panel that needs "are you sure?"
// has one answer and no reason to reach for ui/dialog.
//
//   <ConfirmSheet open={!!pending} onOpenChange={(o) => !o && setPending(null)}
//                 title="Mark as changed" confirmLabel="Mark changed"
//                 busy={saving} error={error} onConfirm={doChange}>
//     Mark <strong>Trach tie</strong> as changed now?
//   </ConfirmSheet>
//
// `tone="destructive"` turns the confirm button red — reserved for actions
// that delete or clinically escalate; supply and schedule confirms stay on
// the primary cyan.
import EntityModal from './EntityModal';
import './confirm-sheet.css';

export default function ConfirmSheet({
  open,
  onOpenChange,
  title,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  busy = false,
  error = null,
  onConfirm,
}) {
  return (
    <EntityModal open={open} onOpenChange={onOpenChange} title={title}>
      <div className="em-form cs-form">
        {error && <div className="em-error">{error}</div>}
        <p className="cs-body">{children}</p>
        <div className="em-footer">
          <button type="button" className="em-cancel" onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`em-submit${tone === 'destructive' ? ' destructive' : ''}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </EntityModal>
  );
}
