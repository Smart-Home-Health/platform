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
import config from '../../../config';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Alert, AlertDescription } from '@/components/ui/alert';

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

  // Parent gates mounting (`{qtyGate.open && ...}`), so the Dialog is always open.
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="sm:max-w-[440px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Out of Stock — {info.medication_name}</DialogTitle>
        </DialogHeader>

        {error && <Alert variant="destructive">{error}</Alert>}

        <Alert variant="destructive">
          <AlertDescription>
            Only <strong>{info.current_quantity ?? 0} {unit}</strong> on hand, but this dose
            needs <strong>{info.requested_dose} {unit}</strong>. Update the on-hand quantity to continue —
            the dose can’t be recorded until you do.
          </AlertDescription>
        </Alert>

        <Field label={`New on-hand quantity${unit ? ` (${unit})` : ''}`} required>
          <Input
            type="number"
            step="0.1"
            min="0"
            value={quantity}
            autoFocus
            onChange={e => setQuantity(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && valid && !saving) handleSave(); }}
            placeholder="Enter current count on hand"
          />
        </Field>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || !valid}
          >
            {saving ? 'Saving...' : 'Update & Continue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UpdateQuantityModal;
