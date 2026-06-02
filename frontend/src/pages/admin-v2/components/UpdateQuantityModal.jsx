import React, { useEffect, useState } from 'react';
import config from '../../../config';
import { XIcon } from '../../../components/Icons';

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

  return (
    <div className="admin-v2-modal-overlay" onClick={onClose}>
      <div className="admin-v2-modal admin-v2-modal-sm" onClick={e => e.stopPropagation()}>
        <div className="admin-v2-modal-header">
          <h2>Out of Stock — {info.medication_name}</h2>
          <button className="admin-v2-modal-close" onClick={onClose}>
            <XIcon size={20} />
          </button>
        </div>
        <div className="admin-v2-modal-body">
          {error && <div className="admin-v2-error-banner" style={{ marginBottom: '1rem' }}>{error}</div>}
          <div
            role="alert"
            style={{
              background: 'rgba(248, 81, 73, 0.12)',
              border: '1px solid rgba(248, 81, 73, 0.5)',
              borderRadius: 6,
              padding: '0.75rem 1rem',
              marginBottom: '1rem',
              color: '#e6edf3',
              fontSize: '0.9rem',
            }}
          >
            Only <strong>{info.current_quantity ?? 0} {unit}</strong> on hand, but this dose
            needs <strong>{info.requested_dose} {unit}</strong>. Update the on-hand quantity to continue —
            the dose can’t be recorded until you do.
          </div>
          <div className="admin-v2-form-group">
            <label>New on-hand quantity{unit ? ` (${unit})` : ''} *</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={quantity}
              autoFocus
              onChange={e => setQuantity(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && valid && !saving) handleSave(); }}
              placeholder="Enter current count on hand"
            />
          </div>
        </div>
        <div className="admin-v2-modal-footer">
          <button type="button" className="admin-v2-btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="admin-v2-btn admin-v2-btn-primary"
            onClick={handleSave}
            disabled={saving || !valid}
          >
            {saving ? 'Saving...' : 'Update & Continue'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpdateQuantityModal;
