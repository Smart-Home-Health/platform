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
// The shipment's own details — supplier, the two reference numbers, dates,
// tracking. One form for both creating a shipment and the detail page's
// "Edit details", which previously were separate: a dialog on the list page
// and five inline blur-to-save inputs on the detail page, so the same field
// validated differently depending on where you typed it.
import { useEffect, useState } from 'react';
import EntityModal, { EmField, EmRow, EmSelect } from '../vc/EntityModal';

const EMPTY = {
  supplier_id: '',
  po_number: '',
  order_number: '',
  ship_date: '',
  expected_delivery: '',
  tracking_number: '',
  ship_method: '',
  notes: '',
};

/** ISO timestamp -> the yyyy-mm-dd a date input wants. */
const asDateValue = (value) => (value ? String(value).slice(0, 10) : '');

const fromShipment = (shipment) => (shipment ? {
  supplier_id: shipment.supplier_id ? String(shipment.supplier_id) : '',
  po_number: shipment.po_number || '',
  order_number: shipment.order_number || '',
  ship_date: asDateValue(shipment.ship_date),
  expected_delivery: asDateValue(shipment.expected_delivery),
  tracking_number: shipment.tracking_number || '',
  ship_method: shipment.ship_method || '',
  notes: shipment.notes || '',
} : { ...EMPTY });

export default function ShipmentDetailsModal({
  open, onOpenChange, shipment = null, suppliers = [], saving, onSave,
}) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const editing = Boolean(shipment);

  useEffect(() => {
    if (!open) return;
    setForm(fromShipment(shipment));
    setError(null);
  }, [open, shipment]);

  const set = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    // Blank means "no value", not the empty string — the API stores what it
    // is given, and "" would read as a PO number that is present but empty.
    const payload = Object.fromEntries(
      Object.entries(form).map(([k, v]) => [k, v === '' ? null : v]),
    );
    payload.supplier_id = form.supplier_id ? parseInt(form.supplier_id, 10) : null;
    try {
      await onSave(payload);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <EntityModal open={open} onOpenChange={onOpenChange}
                 title={editing ? 'Edit details' : 'New shipment'} wide>
      <form className="em-form" onSubmit={submit}>
        {error && <div className="em-error">{error}</div>}

        <EmField label="Supplier" htmlFor="sd-supplier">
          <EmSelect id="sd-supplier" value={form.supplier_id} onChange={set('supplier_id')}>
            <option value="">No supplier</option>
            {suppliers.map((s) => (
              <option key={s.id} value={String(s.id)}>{s.name}</option>
            ))}
          </EmSelect>
        </EmField>

        <EmRow>
          <EmField label="PO number" optional htmlFor="sd-po">
            <input id="sd-po" className="em-input" value={form.po_number}
                   onChange={set('po_number')} placeholder="e.g. 55811" />
          </EmField>
          <EmField label="Order number" optional htmlFor="sd-order">
            <input id="sd-order" className="em-input" value={form.order_number}
                   onChange={set('order_number')} placeholder="e.g. 1099274055" />
          </EmField>
        </EmRow>

        <EmRow>
          <EmField label="Ship date" optional htmlFor="sd-shipped">
            <input id="sd-shipped" type="date" className="em-input"
                   value={form.ship_date} onChange={set('ship_date')} />
          </EmField>
          <EmField label="Expected delivery" optional htmlFor="sd-expected">
            <input id="sd-expected" type="date" className="em-input"
                   value={form.expected_delivery} onChange={set('expected_delivery')} />
          </EmField>
        </EmRow>

        <EmRow>
          <EmField label="Tracking number" optional htmlFor="sd-tracking">
            <input id="sd-tracking" className="em-input" value={form.tracking_number}
                   onChange={set('tracking_number')} />
          </EmField>
          <EmField label="Ship method" optional htmlFor="sd-method">
            <input id="sd-method" className="em-input" value={form.ship_method}
                   onChange={set('ship_method')} placeholder="e.g. FedEx Ground" />
          </EmField>
        </EmRow>

        <EmField label="Notes" optional htmlFor="sd-notes">
          <textarea id="sd-notes" className="em-input" rows={2}
                    value={form.notes} onChange={set('notes')} />
        </EmField>

        <div className="em-footer">
          <button type="button" className="em-cancel" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="submit" className="em-submit" disabled={saving}>
            {saving ? 'Saving…' : (editing ? 'Save details' : 'Create shipment')}
          </button>
        </div>
      </form>
    </EntityModal>
  );
}
