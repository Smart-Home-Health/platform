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
// Add or edit one supply.
//
// The old catalogue built this payload twice — once to create and once to
// update, byte-identical but for patient_id — so a new field had to be added
// in both places or it silently saved on one path only. It is built once here.
import { useEffect, useState } from 'react';
import EntityModal, { EmField, EmRow, EmSelect } from '../vc/EntityModal';
import DisclosureRow from '../vc/DisclosureRow';

// The values the column actually stores (schemas/equipment.py: item, box,
// none). The old form offered quantity/lot/serial, none of which the backend
// recognises — so every supply created through it got a meaningless level,
// and 'none', the one value that turns the out-of-stock gate off, could not
// be chosen at all.
const TRACKING_LEVELS = [
  { value: 'item', label: 'Each item' },
  { value: 'box', label: 'By the box' },
  { value: 'none', label: "Don't track a count" },
];

// Kept to what the list can actually group by. The old form also offered
// 'medication', which no filter handled, so those supplies appeared under
// "All" and were counted nowhere.
const CATEGORIES = ['Equipment', 'Supply', 'Consumable'];

const EMPTY = {
  name: '',
  quantity: 1,
  scheduled_replacement: false,
  last_changed: '',
  useful_days: '',
  item_number: '',
  description: '',
  category: 'supply',
  tracking_level: 'item',
  default_manufacturer: '',
  unit_of_measure: '',
  unit_size: '',
  unit_description: '',
  reorder_point: '',
  par_level: '',
  storage_location: '',
};

const asDate = (value) => (value ? String(value).slice(0, 10) : '');
const numberOrNull = (value) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const fromSupply = (supply) => (supply ? {
  name: supply.name || '',
  quantity: supply.quantity ?? 0,
  scheduled_replacement: Boolean(supply.scheduled_replacement),
  last_changed: asDate(supply.last_changed),
  useful_days: supply.useful_days ?? '',
  item_number: supply.item_number || '',
  description: supply.description || '',
  category: supply.category || 'supply',
  tracking_level: supply.tracking_level || 'item',
  default_manufacturer: supply.default_manufacturer || '',
  unit_of_measure: supply.unit_of_measure || '',
  unit_size: supply.unit_size ?? '',
  unit_description: supply.unit_description || '',
  reorder_point: supply.reorder_point ?? '',
  par_level: supply.par_level ?? '',
  storage_location: supply.storage_location || '',
} : { ...EMPTY });

export default function SupplySheet({ open, onOpenChange, supply = null, onSave }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const editing = Boolean(supply);

  useEffect(() => {
    if (!open) return;
    setForm(fromSupply(supply));
    setError(null);
  }, [open, supply]);

  const set = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }));
  const setChecked = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.checked }));

  // The API requires both when a replacement is scheduled, and answers 400
  // otherwise; asking for them here means the form says so before the save.
  const scheduleIncomplete = form.scheduled_replacement
    && (!form.last_changed || !String(form.useful_days).trim());
  const canSave = form.name.trim() && !scheduleIncomplete;

  const submit = async (event) => {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: form.name.trim(),
        quantity: numberOrNull(form.quantity) ?? 0,
        scheduled_replacement: form.scheduled_replacement,
        last_changed: form.scheduled_replacement ? (form.last_changed || null) : null,
        useful_days: form.scheduled_replacement ? numberOrNull(form.useful_days) : null,
        item_number: form.item_number.trim() || null,
        description: form.description.trim() || null,
        category: form.category || null,
        tracking_level: form.tracking_level || null,
        default_manufacturer: form.default_manufacturer.trim() || null,
        unit_of_measure: form.unit_of_measure.trim() || null,
        unit_size: numberOrNull(form.unit_size),
        unit_description: form.unit_description.trim() || null,
        reorder_point: numberOrNull(form.reorder_point),
        par_level: numberOrNull(form.par_level),
        storage_location: form.storage_location.trim() || null,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <EntityModal open={open} onOpenChange={onOpenChange}
                 title={editing ? 'Edit supply' : 'Add supply'} wide>
      <form className="em-form" onSubmit={submit}>
        {error && <div className="em-error">{error}</div>}

        <EmField label="Name" required htmlFor="sup-name">
          <input id="sup-name" className="em-input" value={form.name}
                 onChange={set('name')} placeholder="What you call it" />
        </EmField>

        <EmRow>
          <EmField label="On hand" htmlFor="sup-qty">
            <input id="sup-qty" className="em-input" type="number" min="0"
                   value={form.quantity} onChange={set('quantity')} />
          </EmField>
          <EmField label="Category" optional htmlFor="sup-cat">
            <EmSelect id="sup-cat" value={form.category} onChange={set('category')}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c.toLowerCase()}>{c}</option>
              ))}
            </EmSelect>
          </EmField>
        </EmRow>

        <label className="sup-check">
          <input type="checkbox" checked={form.scheduled_replacement}
                 onChange={setChecked('scheduled_replacement')} />
          <span>This is replaced on a schedule</span>
        </label>

        {form.scheduled_replacement && (
          <EmRow>
            <EmField label="Last changed" required htmlFor="sup-last">
              <input id="sup-last" className="em-input" type="date"
                     value={form.last_changed} onChange={set('last_changed')} />
            </EmField>
            <EmField label="Days between changes" required htmlFor="sup-days">
              <input id="sup-days" className="em-input" type="number" min="1"
                     value={form.useful_days} onChange={set('useful_days')} />
            </EmField>
          </EmRow>
        )}

        <DisclosureRow label="Stock levels" optional
                       summary={form.reorder_point !== '' || form.par_level !== ''
                         ? `Reorder at ${form.reorder_point || '—'}, keep ${form.par_level || '—'}`
                         : undefined}>
          <EmRow>
            <EmField label="Reorder at" optional htmlFor="sup-reorder">
              <input id="sup-reorder" className="em-input" type="number" min="0"
                     value={form.reorder_point} onChange={set('reorder_point')} />
            </EmField>
            <EmField label="Keep on hand" optional htmlFor="sup-par">
              <input id="sup-par" className="em-input" type="number" min="0"
                     value={form.par_level} onChange={set('par_level')} />
            </EmField>
          </EmRow>
          <EmField label="Where it lives" optional htmlFor="sup-loc">
            <input id="sup-loc" className="em-input" value={form.storage_location}
                   onChange={set('storage_location')} placeholder="Hall closet, top shelf" />
          </EmField>
          <EmField label="How it is counted" optional htmlFor="sup-track">
            <EmSelect id="sup-track" value={form.tracking_level} onChange={set('tracking_level')}>
              {TRACKING_LEVELS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </EmSelect>
          </EmField>
        </DisclosureRow>

        <DisclosureRow label="Ordering details" optional
                       summary={form.item_number || form.default_manufacturer || undefined}>
          <EmRow>
            <EmField label="Item number" optional htmlFor="sup-item">
              <input id="sup-item" className="em-input" value={form.item_number}
                     onChange={set('item_number')} />
            </EmField>
            <EmField label="Manufacturer" optional htmlFor="sup-maker">
              <input id="sup-maker" className="em-input" value={form.default_manufacturer}
                     onChange={set('default_manufacturer')} />
            </EmField>
          </EmRow>
          <EmRow>
            <EmField label="Unit" optional htmlFor="sup-uom">
              <input id="sup-uom" className="em-input" value={form.unit_of_measure}
                     onChange={set('unit_of_measure')} placeholder="EA, BX, PK…" />
            </EmField>
            <EmField label="Units per box" optional htmlFor="sup-usize">
              <input id="sup-usize" className="em-input" type="number" min="1"
                     value={form.unit_size} onChange={set('unit_size')} />
            </EmField>
          </EmRow>
          <EmField label="Unit description" optional htmlFor="sup-udesc">
            <input id="sup-udesc" className="em-input" value={form.unit_description}
                   onChange={set('unit_description')} placeholder="e.g. BX = 100 EA" />
          </EmField>
          <EmField label="Notes" optional htmlFor="sup-desc">
            <textarea id="sup-desc" className="em-input" rows={2}
                      value={form.description} onChange={set('description')} />
          </EmField>
        </DisclosureRow>

        <div className="em-footer">
          <button type="button" className="em-cancel" onClick={() => onOpenChange(false)}>
            Cancel
          </button>
          <button type="submit" className="em-submit" disabled={!canSave || saving}>
            {saving ? 'Saving…' : (editing ? 'Save supply' : 'Add supply')}
          </button>
        </div>
      </form>
    </EntityModal>
  );
}
