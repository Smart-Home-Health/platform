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
// Destructive confirm on the same bottom sheet as the compose form, so the two
// steps of "post a message / remove one" look like one surface.
import BottomSheet from '../../pages/capture/components/BottomSheet';
import './messages-panel.css';

export default function ConfirmSheet({
  open, title, children, confirmLabel, onConfirm, onClose, busy = false,
}) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => { if (!next) onClose(); }}
      onSwipeDown={onClose}
      title={title}
    >
      <div className="mx-confirm">
        {children}
        <div className="vc-sheet-actions">
          <button type="button" className="vc-btn secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="vc-btn mx-danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
