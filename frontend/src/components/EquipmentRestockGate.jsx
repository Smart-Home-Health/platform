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
import React, { useEffect, useState } from 'react';
import config from '../config';

/**
 * Hard gate shown when marking equipment as changed is refused because on-hand
 * stock is exhausted (backend 409 `error: "insufficient_quantity"` from
 * `POST /api/equipment/{id}/change`). Mirrors the medication out-of-stock flow.
 *
 * The caregiver MUST enter a new on-hand quantity to continue. On save we PUT
 * the new quantity, then call onUpdated() so the caller can retry the change.
 *
 * Self-contained inline styling so it renders consistently whether hosted in
 * the dark admin-v2 UI or the lighter dashboard/legacy screens.
 *
 * Props:
 *   info     — the 409 payload: { equipment_id, equipment_name, current_quantity, unit_of_measure }
 *   onClose  — () => void   (cancel: aborts the change)
 *   onUpdated— () => void   (called after the quantity is saved; caller retries)
 */
const EquipmentRestockGate = ({ info, onClose, onUpdated }) => {
  const [quantity, setQuantity] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setQuantity('');
    setError(null);
  }, [info]);

  if (!info) return null;

  const unit = info.unit_of_measure || '';
  const newQty = parseInt(quantity, 10);
  const valid = quantity !== '' && Number.isFinite(newQty) && newQty > 0;

  const handleSave = async () => {
    if (!valid) {
      setError('Enter a quantity greater than 0');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${config.apiUrl}/api/equipment/${info.equipment_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ quantity: newQty }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (typeof data.detail === 'string' && data.detail) || `Failed to update quantity (${res.status})`
        );
      }
      onUpdated?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const btn = {
    padding: '9px 18px', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: 'pointer',
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 2000,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: '#1a2332',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12, padding: 24,
          maxWidth: 440, width: '90%',
          boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
          color: '#e6edf3',
        }}
      >
        <h3 style={{
          margin: '0 0 16px 0', fontSize: 18, fontWeight: 700,
          paddingBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          Out of Stock — {info.equipment_name}
        </h3>

        {error && (
          <div style={{
            background: 'rgba(248,81,73,0.12)', border: '1px solid rgba(248,81,73,0.5)',
            borderRadius: 6, padding: '0.6rem 0.9rem', marginBottom: 12, fontSize: 13,
          }}>{error}</div>
        )}

        <div
          role="alert"
          style={{
            background: 'rgba(248,81,73,0.12)', border: '1px solid rgba(248,81,73,0.5)',
            borderRadius: 6, padding: '0.75rem 1rem', marginBottom: 16, fontSize: 14,
          }}
        >
          Only <strong>{info.current_quantity ?? 0} {unit}</strong> on hand. Update the on-hand
          quantity to continue — the change can’t be recorded until you do.
        </div>

        <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13 }}>
          New on-hand quantity{unit ? ` (${unit})` : ''} *
        </label>
        <input
          type="number"
          min="1"
          value={quantity}
          autoFocus
          onChange={e => setQuantity(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && valid && !saving) handleSave(); }}
          placeholder="Enter current count on hand"
          style={{
            width: '100%', padding: 10, fontSize: 14,
            background: '#2d3748', color: '#e6edf3',
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6,
            boxSizing: 'border-box', outline: 'none',
          }}
        />

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              ...btn, fontWeight: 500,
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'transparent', color: '#e6edf3',
            }}
          >Cancel</button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !valid}
            style={{
              ...btn, border: 'none',
              background: '#3b82f6', color: '#fff',
              opacity: saving || !valid ? 0.6 : 1,
            }}
          >{saving ? 'Saving…' : 'Update & Continue'}</button>
        </div>
      </div>
    </div>
  );
};

export default EquipmentRestockGate;
