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
import { useEffect, useState } from 'react';
import config from '../../../config';
import EntityModal, { EmField } from '../../../components/vc/EntityModal';
import '../vc-schedule.css';

/**
 * Hard gate shown when an administration is refused because the medication's
 * on-hand quantity is below the dose (backend 409 `error: "insufficient_quantity"`).
 *
 * The caregiver MUST enter a new on-hand quantity to continue — there is no
 * "administer anyway". On save we PUT the new quantity, then call onUpdated()
 * so the caller can retry the administration.
 *
 * Props:
 *   info     — { medication_id, medication_name, current_quantity, quantity_unit, requested_dose }
 *   onClose  — () => void   (cancel: aborts the administration)
 *   onUpdated— () => void    (called after the quantity is saved; caller retries)
 */
const UpdateQuantityModal = ({ info, onClose, onUpdated }) => {
  const [quantity, setQuantity] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setQuantity('');
    setError(null);
  }, [info]);

  if (!info) return null;

  const unit = info.quantity_unit || '';
  const newQty = parseFloat(quantity);
  const valid = quantity !== '' && Number.isFinite(newQty) && newQty > 0;

  const handleSave = async () => {
    if (!valid) {
      setError('Enter a quantity greater than 0');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${config.apiUrl}/api/medications/${info.medication_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ quantity: newQty }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Failed to update quantity (${res.status})`);
      }
      onUpdated?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Parent gates mounting (`{qtyGate.open && ...}`), so the modal is always open.
  return (
    <EntityModal
      open
      onOpenChange={(o) => { if (!o) onClose?.(); }}
      title={`Out of Stock — ${info.medication_name}`}
    >
      <div className="em-form">
        {error && <div className="em-error">{error}</div>}

        <div className="sch-warn" role="alert">
          <p className="sch-warn-title">Update quantity to continue</p>
          <p className="sch-warn-body">
            Only <strong>{info.current_quantity ?? 0} {unit}</strong> on hand, but this dose
            needs <strong>{info.requested_dose} {unit}</strong>. The dose can’t be recorded
            until the on-hand quantity is updated.
          </p>
        </div>

        <EmField label={`New on-hand quantity${unit ? ` (${unit})` : ''}`} required htmlFor="qty-new">
          <input
            id="qty-new"
            className="em-input"
            type="number"
            step="0.1"
            min="0"
            value={quantity}
            autoFocus
            onChange={e => setQuantity(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && valid && !saving) handleSave(); }}
            placeholder="Enter current count on hand"
          />
        </EmField>

        <div className="em-footer">
          <button type="button" className="em-cancel" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="em-submit"
            onClick={handleSave}
            disabled={saving || !valid}
          >
            {saving ? 'Saving...' : 'Update & Continue'}
          </button>
        </div>
      </div>
    </EntityModal>
  );
};

export default UpdateQuantityModal;
