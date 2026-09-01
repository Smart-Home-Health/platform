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
// "Count this supply" dialog for the Supplies page: package math in, one
// audited absolute count out (POST /api/equipment/{id}/count).
import { useEffect, useState } from 'react';
import EntityModal from '../../../components/vc/EntityModal';
import { equipmentService } from '../../../services/equipment';
import { countTotal } from '../../../lib/catalogImport';
import SupplyCountFields from './SupplyCountFields';

// item: { equipment_id (or id), name, unit_size, quantity, unit_description }
export default function SupplyCountModal({ open, onClose, item, onSaved }) {
  const [fields, setFields] = useState({ packages: '', perPackage: '', loose: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && item) {
      setFields({ packages: '', perPackage: item.unit_size ? String(item.unit_size) : '', loose: '' });
      setError(null);
    }
  }, [open, item]);

  if (!open || !item) return null;
  const equipmentId = item.equipment_id ?? item.id;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await equipmentService.setCount(equipmentId, {
        quantity: countTotal(fields),
        note: 'Shelf count',
      });
      onSaved?.(result);
      onClose?.();
    } catch (err) {
      setError(err.message || 'Failed to save the count');
    } finally {
      setSaving(false);
    }
  };

  return (
    <EntityModal open onOpenChange={(o) => { if (!o) onClose?.(); }} title={`Count: ${item.name}`}>
      <div className="em-form">
        {error && <div className="em-error">{error}</div>}

        <p className="em-hint">
          Count the unopened packages first, then anything loose.
          We currently have {item.quantity ?? 0} on record.
        </p>

        <SupplyCountFields value={fields} onChange={setFields} disabled={saving} />

        <div className="em-footer">
          <button type="button" className="em-cancel" onClick={() => onClose?.()} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="em-submit" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save count'}
          </button>
        </div>
      </div>
    </EntityModal>
  );
}
