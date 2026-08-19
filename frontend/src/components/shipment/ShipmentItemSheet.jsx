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
// Add or edit one line on a shipment.
//
// Linking the line to one of our supplies fills the identifying fields from
// it, so the same catheter is not typed three different ways across three
// months of deliveries.
import { useEffect, useState } from 'react';
import EntityModal, { EmField, EmRow, EmSelect } from '../vc/EntityModal';

const EMPTY = {
  equipment_id: '',
  item_number: '',
  item_description: '',
  manufacturer_name: '',
  qty_ordered: 1,
  qty_shipped: 0,
  qty_backordered: 0,
  unit_of_measure: '',
  unit_description: '',
};

const fromItem = (item) => (item ? {
  equipment_id: item.equipment_id ? String(item.equipment_id) : '',
  item_number: item.item_number || '',
  item_description: item.item_description || '',
  manufacturer_name: item.manufacturer_name || '',
  qty_ordered: item.qty_ordered ?? 0,
  qty_shipped: item.qty_shipped ?? 0,
  qty_backordered: item.qty_backordered ?? 0,
  unit_of_measure: item.unit_of_measure || '',
  unit_description: item.unit_description || '',
} : { ...EMPTY });

export default function ShipmentItemSheet({
  open, onOpenChange, item = null, equipment = [], onSave,
}) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const editing = Boolean(item);

  useEffect(() => {
    if (!open) return;
    setForm(fromItem(item));
    setError(null);
  }, [open, item]);

  const set = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }));

  // Picking a supply carries its identifiers across; typing over them
  // afterwards is still allowed, since a supplier can relabel the same thing.
  const pickEquipment = (event) => {
    const value = event.target.value;
    const eq = equipment.find((e) => String(e.id) === value);
    setForm((f) => ({
      ...f,
      equipment_id: value,
      ...(eq ? {
        item_number: eq.item_number || f.item_number,
        item_description: f.item_description || eq.name || '',
        manufacturer_name: eq.default_manufacturer || f.manufacturer_name,
        unit_of_measure: eq.unit_of_measure || f.unit_of_measure,
        unit_description: eq.unit_description || f.unit_description,
      } : {}),
    }));
  };

  const canSave = String(form.item_description || '').trim() || form.equipment_id;

  const submit = async (event) => {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        equipment_id: form.equipment_id ? parseInt(form.equipment_id, 10) : null,
        item_number: form.item_number.trim() || null,
        item_description: form.item_description.trim() || null,
        manufacturer_name: form.manufacturer_name.trim() || null,
        qty_ordered: parseInt(form.qty_ordered, 10) || 0,
        qty_shipped: parseInt(form.qty_shipped, 10) || 0,
        qty_backordered: parseInt(form.qty_backordered, 10) || 0,
        unit_of_measure: form.unit_of_measure.trim() || null,
        unit_description: form.unit_description.trim() || null,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <EntityModal open={open} onOpenChange={onOpenChange}
                 title={editing ? 'Edit item' : 'Add item'} wide>
      <form className="em-form" onSubmit={submit}>
        {error && <div className="em-error">{error}</div>}

        <EmField label="Our supply" optional htmlFor="si-equipment">
          <EmSelect id="si-equipment" value={form.equipment_id} onChange={pickEquipment}>
            <option value="">Not linked</option>
            {equipment.map((e) => (
              <option key={e.id} value={String(e.id)}>{e.name}</option>
            ))}
          </EmSelect>
        </EmField>

        <EmField label="Description" required htmlFor="si-desc">
          <input id="si-desc" className="em-input" value={form.item_description}
                 onChange={set('item_description')} placeholder="What the supplier calls it" />
        </EmField>

        <EmRow>
          <EmField label="Item number" optional htmlFor="si-number">
            <input id="si-number" className="em-input" value={form.item_number}
                   onChange={set('item_number')} />
          </EmField>
          <EmField label="Manufacturer" optional htmlFor="si-maker">
            <input id="si-maker" className="em-input" value={form.manufacturer_name}
                   onChange={set('manufacturer_name')} />
          </EmField>
        </EmRow>

        <EmRow>
          <EmField label="Ordered" htmlFor="si-ordered">
            <input id="si-ordered" className="em-input" type="number" min="0"
                   value={form.qty_ordered} onChange={set('qty_ordered')} />
          </EmField>
          <EmField label="Shipped" optional htmlFor="si-shipped">
            <input id="si-shipped" className="em-input" type="number" min="0"
                   value={form.qty_shipped} onChange={set('qty_shipped')} />
          </EmField>
          <EmField label="To follow" optional htmlFor="si-bo">
            <input id="si-bo" className="em-input" type="number" min="0"
                   value={form.qty_backordered} onChange={set('qty_backordered')} />
          </EmField>
        </EmRow>

        <EmRow>
          <EmField label="Unit" optional htmlFor="si-uom">
            <input id="si-uom" className="em-input" value={form.unit_of_measure}
                   onChange={set('unit_of_measure')} placeholder="EA, BX, PK…" />
          </EmField>
          <EmField label="Unit description" optional htmlFor="si-udesc">
            <input id="si-udesc" className="em-input" value={form.unit_description}
                   onChange={set('unit_description')} placeholder="e.g. BX = 100 EA" />
          </EmField>
        </EmRow>

        <div className="em-footer">
          <button type="button" className="em-cancel" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="submit" className="em-submit" disabled={!canSave || saving}>
            {saving ? 'Saving…' : (editing ? 'Save item' : 'Add item')}
          </button>
        </div>
      </form>
    </EntityModal>
  );
}
