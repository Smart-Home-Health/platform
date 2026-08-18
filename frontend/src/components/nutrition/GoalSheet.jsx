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
// Set the nutrition targets, in the same vocabulary as the logging sheets.
//
// Targets are effective-dated: saving new ones creates a version rather than
// overwriting the last, which is why the date is required and why the sheet
// says what saving will do.
//
// Fluids and calories lead because they are the two the plan reports coverage
// against; everything else collapses until wanted.
import { useEffect, useState } from 'react';
import EntityModal, { EmField } from '../vc/EntityModal';
import DisclosureRow from '../vc/DisclosureRow';
import { CalendarIcon, DropletIcon, FlameIcon } from '../Icons';
import './nutrition-sheet.css';

const FIELDS = {
  fluids: [
    { key: 'water_ml_target', label: 'Water', unit: 'mL' },
    { key: 'total_fluid_ml_target', label: 'Total fluids', unit: 'mL',
      hint: 'Including fluid from food' },
  ],
  calories: [
    { key: 'calories_target', label: 'Target', unit: 'kcal' },
    { key: 'calories_min', label: 'Minimum', unit: 'kcal' },
    { key: 'calories_max', label: 'Maximum', unit: 'kcal' },
  ],
  macros: [
    { key: 'protein_grams_target', label: 'Protein', unit: 'g' },
    { key: 'carbs_grams_target', label: 'Carbs', unit: 'g' },
    { key: 'fat_grams_target', label: 'Fat', unit: 'g' },
    { key: 'fiber_grams_target', label: 'Fiber', unit: 'g' },
  ],
  limits: [
    { key: 'sodium_mg_max', label: 'Max sodium', unit: 'mg' },
    { key: 'urine_output_ml_min', label: 'Min urine output', unit: 'mL' },
    { key: 'bowel_movements_target', label: 'Bowel movements', unit: '/day' },
  ],
};

const ALL_KEYS = Object.values(FIELDS).flat().map((f) => f.key);

const todayLocal = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const emptyForm = () => ({
  effective_date: todayLocal(),
  notes: '',
  ...Object.fromEntries(ALL_KEYS.map((k) => [k, ''])),
});

const numberOrNull = (value) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

function NumberGrid({ fields, form, set, idPrefix }) {
  return (
    <div className="nsheet-grid">
      {fields.map((field) => (
        <EmField key={field.key} label={field.label} optional htmlFor={`${idPrefix}-${field.key}`}>
          <div className="nsheet-amount">
            <input
              id={`${idPrefix}-${field.key}`}
              className="em-input"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              placeholder={field.hint}
              value={form[field.key]}
              onChange={(e) => set({ [field.key]: e.target.value })}
            />
            <span className="nsheet-unit-label">{field.unit}</span>
          </div>
        </EmField>
      ))}
    </div>
  );
}

export default function GoalSheet({ open, onClose, onSave, editing, saving, error }) {
  const [form, setForm] = useState(emptyForm);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (!open) return;
    if (!editing) { setForm(emptyForm()); return; }
    setForm({
      ...emptyForm(),
      effective_date: editing.effective_date
        ? new Date(editing.effective_date).toISOString().slice(0, 10)
        : todayLocal(),
      notes: editing.notes || '',
      ...Object.fromEntries(ALL_KEYS.map((k) => [k, editing[k] ?? ''])),
    });
  }, [open, editing]);

  const canSave = !!form.effective_date && !saving;

  const submit = (event) => {
    event.preventDefault();
    onSave({
      // Midday local keeps the date on the intended day whichever way the
      // timezone rounds it.
      effective_date: new Date(`${form.effective_date}T12:00:00`).toISOString(),
      notes: form.notes || null,
      ...Object.fromEntries(ALL_KEYS.map((k) => [k, numberOrNull(form[k])])),
    });
  };

  return (
    <EntityModal
      open={open}
      onOpenChange={(next) => { if (!next) onClose?.(); }}
      title={editing ? 'Edit targets' : 'Set targets'}
    >
      <form className="em-form nsheet" onSubmit={submit}>
        <p className="nsheet-sub">
          {editing
            ? 'Editing this version. Its effective date decides which days it applies to.'
            : 'Saving creates a new version — the previous targets are kept, not overwritten.'}
        </p>
        {error && <div className="em-error">{error}</div>}

        <EmField label="Effective from" required htmlFor="goal-date">
          <div className="nsheet-when">
            <span className="nsheet-when-icon"><CalendarIcon size={18} /></span>
            <input
              id="goal-date"
              className="em-input"
              type="date"
              value={form.effective_date}
              onChange={(e) => set({ effective_date: e.target.value })}
              required
            />
          </div>
        </EmField>

        {/* The two the plan reports coverage against. */}
        <section className="nsheet-card">
          <header className="nsheet-card-head">
            <h4><DropletIcon size={15} /> Fluids</h4>
          </header>
          <NumberGrid fields={FIELDS.fluids} form={form} set={set} idPrefix="goal" />
        </section>

        <section className="nsheet-card">
          <header className="nsheet-card-head">
            <h4><FlameIcon size={15} /> Calories</h4>
          </header>
          <NumberGrid fields={FIELDS.calories} form={form} set={set} idPrefix="goal" />
        </section>

        <DisclosureRow label="Macronutrients" optional>
          <NumberGrid fields={FIELDS.macros} form={form} set={set} idPrefix="goal" />
        </DisclosureRow>

        <DisclosureRow label="Restrictions and output targets" optional>
          <NumberGrid fields={FIELDS.limits} form={form} set={set} idPrefix="goal" />
        </DisclosureRow>

        <DisclosureRow
          label="Notes"
          optional
          summary={form.notes ? form.notes.slice(0, 50) : undefined}
        >
          <textarea
            className="em-input"
            rows={3}
            placeholder="Anything a caregiver should know about these targets"
            value={form.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </DisclosureRow>

        <div className="em-footer">
          <button type="button" className="em-cancel" onClick={onClose}>Cancel</button>
          <button type="submit" className="em-submit" disabled={!canSave}>
            {saving ? 'Saving…' : (editing ? 'Save changes' : 'Set targets')}
          </button>
        </div>
      </form>
    </EntityModal>
  );
}
