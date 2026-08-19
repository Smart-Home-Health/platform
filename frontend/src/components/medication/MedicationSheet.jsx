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
// Add or edit a medication record.
//
// Adding walks three steps, because a new record needs the drug, then what is
// on hand, then who prescribed it — and nothing can be saved until the first
// step is answered. Editing shows the same three groups at once, opened on the
// drug itself and marking what has changed, because an edit is usually one
// field and the rest is context.
//
// Schedules are not edited here in either mode. They are their own records
// with their own times and doses, and folding them in is how "edit the med"
// becomes "accidentally rewrite the regimen".
import { useEffect, useMemo, useState } from 'react';
import EntityModal, { EmField, EmRow, EmSelect } from '../vc/EntityModal';
import DisclosureRow from '../vc/DisclosureRow';
import SegmentedControl from '../vc/SegmentedControl';
import { AlertIcon, CalendarIcon } from '../Icons';
import './medication-sheet.css';

// What the record actually holds. There is no dosage-form column (tablet /
// liquid / capsule), so the unit below is the inventory unit — what you count
// on the shelf — and is not presented as the drug's form.
const QUANTITY_UNITS = [
  { value: 'tablets', label: 'Tablets' },
  { value: 'capsules', label: 'Capsules' },
  { value: 'ml', label: 'mL' },
  { value: 'mg', label: 'mg' },
  { value: 'units', label: 'Units' },
  { value: 'patches', label: 'Patches' },
  { value: 'doses', label: 'Doses' },
];

// as_needed is a boolean, so these are the two states a record can hold. A
// medication that is both given on a schedule and available as needed is that
// boolean plus its schedules — which live elsewhere and are shown, not set.
const USAGE = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'prn', label: 'As needed' },
];

const THRESHOLD_TYPES = [
  { value: 'quantity', label: 'Amount on hand' },
  { value: 'days', label: 'Days of supply left' },
];

const EMPTY = {
  name: '',
  concentration: '',
  quantity: '',
  quantity_unit: 'tablets',
  low_stock_threshold: '',
  low_stock_threshold_type: 'quantity',
  instructions: '',
  start_date: '',
  end_date: '',
  prescriber_id: '',
  pharmacy_id: '',
  notes: '',
  as_needed: false,
  is_global: false,
  active: true,
};

const asDate = (value) => (value ? String(value).slice(0, 10) : '');
const numberOrNull = (value) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const fromMedication = (med) => (med ? {
  name: med.name || '',
  concentration: med.concentration || '',
  quantity: med.quantity ?? '',
  quantity_unit: med.quantity_unit || 'tablets',
  low_stock_threshold: med.low_stock_threshold ?? '',
  low_stock_threshold_type: med.low_stock_threshold_type || 'quantity',
  instructions: med.instructions || '',
  start_date: asDate(med.start_date),
  end_date: asDate(med.end_date),
  prescriber_id: med.prescriber_id ? String(med.prescriber_id) : '',
  pharmacy_id: med.pharmacy_id ? String(med.pharmacy_id) : '',
  notes: med.notes || '',
  as_needed: Boolean(med.as_needed),
  is_global: Boolean(med.is_global),
  active: med.active !== false,
} : { ...EMPTY });

const STEPS = [
  { key: 'medication', label: 'Medication' },
  { key: 'stock', label: 'Stock' },
  { key: 'care', label: 'Care details' },
];

/** A field whose value differs from the record as saved. */
function ChangedMark() {
  return <span className="ms-changed">Changed</span>;
}

export default function MedicationSheet({
  open, onOpenChange, medication = null,
  providers = [], pharmacies = [], scheduleCount = 0,
  onSave, onViewSchedules,
}) {
  const editing = Boolean(medication);
  const [form, setForm] = useState(EMPTY);
  const [step, setStep] = useState(0);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const initial = useMemo(() => fromMedication(medication), [medication]);

  useEffect(() => {
    if (!open) return;
    setForm(initial);
    setStep(0);
    setError(null);
  }, [open, initial]);

  const set = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }));

  const changed = useMemo(() => Object.keys(initial).filter(
    (key) => String(form[key] ?? '') !== String(initial[key] ?? ''),
  ), [form, initial]);
  const isChanged = (field) => editing && changed.includes(field);

  // What the record requires: the API rejects a medication without these.
  const missing = [
    !form.name.trim() && 'name',
    !form.concentration.trim() && 'strength',
    !form.instructions.trim() && 'instructions',
    numberOrNull(form.quantity) === null && 'amount on hand',
    !form.quantity_unit && 'unit',
    !form.start_date && 'start date',
  ].filter(Boolean);

  const stepMissing = {
    medication: missing.filter((m) => ['name', 'strength', 'instructions'].includes(m)),
    stock: missing.filter((m) => ['amount on hand', 'unit'].includes(m)),
    care: missing.filter((m) => m === 'start date'),
  };

  const submit = async (event) => {
    event.preventDefault();
    if (missing.length > 0) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: form.name.trim(),
        concentration: form.concentration.trim(),
        quantity: numberOrNull(form.quantity) ?? 0,
        quantity_unit: form.quantity_unit,
        // Blank means "no alert", which the API now stores rather than
        // dropping — so turning the alert off works.
        low_stock_threshold: numberOrNull(form.low_stock_threshold),
        low_stock_threshold_type: form.low_stock_threshold_type || 'quantity',
        instructions: form.instructions.trim(),
        start_date: form.start_date,
        end_date: form.end_date || null,
        prescriber_id: form.prescriber_id ? parseInt(form.prescriber_id, 10) : null,
        pharmacy_id: form.pharmacy_id ? parseInt(form.pharmacy_id, 10) : null,
        notes: form.notes.trim() || null,
        as_needed: form.as_needed,
        ...(editing ? { active: form.active } : { is_global: form.is_global }),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // --- field groups, shared by both modes ---

  const medicationFields = (
    <>
      <EmField label="Medication name" required htmlFor="ms-name">
        <div className="ms-with-mark">
          <input id="ms-name" className="em-input" value={form.name}
                 onChange={set('name')} placeholder="As written on the label" />
          {isChanged('name') && <ChangedMark />}
        </div>
      </EmField>

      <EmField label="Strength" required htmlFor="ms-conc">
        <div className="ms-with-mark">
          {/* One field, because the record stores strength as a single string
              rather than a number and a unit. */}
          <input id="ms-conc" className="em-input" value={form.concentration}
                 onChange={set('concentration')} placeholder="e.g. 10 mg, 5 mg/mL" />
          {isChanged('concentration') && <ChangedMark />}
        </div>
      </EmField>

      <EmField label="How is it used?" required>
        <SegmentedControl
          options={USAGE}
          value={form.as_needed ? 'prn' : 'scheduled'}
          onChange={(v) => setForm((f) => ({ ...f, as_needed: v === 'prn' }))}
        />
      </EmField>

      {/* A medication can be both. That is this setting plus its schedules,
          and schedules are their own records — so it is reported, not set. */}
      {editing && (
        <p className="ms-note">
          {scheduleCount > 0
            ? `Given on ${scheduleCount} schedule${scheduleCount === 1 ? '' : 's'}.`
            : 'No schedules yet.'}
          {onViewSchedules && (
            <button type="button" className="ms-link" onClick={onViewSchedules}>
              <CalendarIcon size={14} />
              {scheduleCount > 0 ? 'View schedules' : 'Add a schedule'}
            </button>
          )}
        </p>
      )}

      <EmField label="Instructions" required htmlFor="ms-instr">
        <div className="ms-with-mark">
          <textarea id="ms-instr" className="em-input" rows={3} value={form.instructions}
                    onChange={set('instructions')}
                    placeholder="e.g. Give through G-tube with water flush." />
          {isChanged('instructions') && <ChangedMark />}
        </div>
      </EmField>

      {!editing && (
        <label className="ms-check">
          <input type="checkbox" checked={form.is_global}
                 onChange={(e) => setForm((f) => ({ ...f, is_global: e.target.checked }))} />
          <span>Available to every patient, not just this one</span>
        </label>
      )}
    </>
  );

  const stockFields = (
    <>
      <EmRow>
        <EmField label="Amount on hand" required htmlFor="ms-qty">
          <div className="ms-with-mark">
            <input id="ms-qty" className="em-input" type="number" min="0" step="0.25"
                   value={form.quantity} onChange={set('quantity')} />
            {isChanged('quantity') && <ChangedMark />}
          </div>
        </EmField>
        <EmField label="Counted in" required htmlFor="ms-unit">
          <EmSelect id="ms-unit" value={form.quantity_unit} onChange={set('quantity_unit')}>
            {QUANTITY_UNITS.map((u) => (
              <option key={u.value} value={u.value}>{u.label}</option>
            ))}
          </EmSelect>
        </EmField>
      </EmRow>

      <EmRow>
        <EmField label="Warn me below" optional htmlFor="ms-thresh">
          <input id="ms-thresh" className="em-input" type="number" min="0" step="0.25"
                 value={form.low_stock_threshold} onChange={set('low_stock_threshold')}
                 placeholder="Leave blank for no warning" />
        </EmField>
        <EmField label="Measured in" optional htmlFor="ms-thresh-type">
          <EmSelect id="ms-thresh-type" value={form.low_stock_threshold_type}
                    onChange={set('low_stock_threshold_type')}>
            {THRESHOLD_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </EmSelect>
        </EmField>
      </EmRow>
    </>
  );

  const careFields = (
    <>
      <EmRow>
        <EmField label="Started" required htmlFor="ms-start">
          <input id="ms-start" className="em-input" type="date"
                 value={form.start_date} onChange={set('start_date')} />
        </EmField>
        {/* The API has always accepted an end date, and treats a past one as
            expired; the form simply never offered it. */}
        <EmField label="Ends" optional htmlFor="ms-end">
          <input id="ms-end" className="em-input" type="date"
                 value={form.end_date} onChange={set('end_date')} />
        </EmField>
      </EmRow>

      <EmRow>
        <EmField label="Prescriber" optional htmlFor="ms-presc">
          <EmSelect id="ms-presc" value={form.prescriber_id} onChange={set('prescriber_id')}>
            <option value="">No prescriber</option>
            {providers.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {[p.title, p.first_name, p.last_name].filter(Boolean).join(' ')}
              </option>
            ))}
          </EmSelect>
        </EmField>
        <EmField label="Pharmacy" optional htmlFor="ms-pharm">
          <EmSelect id="ms-pharm" value={form.pharmacy_id} onChange={set('pharmacy_id')}>
            <option value="">No pharmacy</option>
            {pharmacies.map((p) => (
              <option key={p.id} value={String(p.id)}>{p.name}</option>
            ))}
          </EmSelect>
        </EmField>
      </EmRow>

      <EmField label="Notes" optional htmlFor="ms-notes">
        <textarea id="ms-notes" className="em-input" rows={2}
                  value={form.notes} onChange={set('notes')} />
      </EmField>
    </>
  );

  // --- add: three steps ---

  if (!editing) {
    const current = STEPS[step];
    const blocked = stepMissing[current.key].length > 0;
    return (
      <EntityModal open={open} onOpenChange={onOpenChange} title="Add medication" wide>
        <form className="em-form" onSubmit={submit}>
          <p className="ms-sub">
            Create the medication record first. Schedules are added afterwards.
          </p>

          <nav className="ms-steps" aria-label="Progress">
            {STEPS.map((s, i) => (
              <button key={s.key} type="button"
                      className={`ms-step ${i === step ? 'is-active' : ''} ${i < step ? 'is-done' : ''}`}
                      aria-current={i === step ? 'step' : undefined}
                      onClick={() => setStep(i)}>
                <span className="ms-step-num">{i + 1}</span>
                <span className="ms-step-name">{s.label}</span>
              </button>
            ))}
          </nav>

          {error && <div className="em-error">{error}</div>}

          {current.key === 'medication' && medicationFields}
          {current.key === 'stock' && stockFields}
          {current.key === 'care' && careFields}

          <div className="ms-foot">
            <span className={`ms-required ${missing.length ? 'is-missing' : ''}`}>
              {missing.length > 0
                ? `Still needed: ${missing.join(', ')}`
                : 'Everything required is filled in'}
            </span>
          </div>

          <div className="em-footer">
            <button type="button" className="em-cancel"
                    onClick={() => (step === 0 ? onOpenChange(false) : setStep(step - 1))}>
              {step === 0 ? 'Cancel' : 'Back'}
            </button>
            {step < STEPS.length - 1 ? (
              <button type="button" className="em-submit" disabled={blocked}
                      onClick={() => setStep(step + 1)}>
                Continue to {STEPS[step + 1].label.toLowerCase()}
              </button>
            ) : (
              <button type="submit" className="em-submit"
                      disabled={missing.length > 0 || saving}>
                {saving ? 'Saving…' : 'Add medication'}
              </button>
            )}
          </div>
        </form>
      </EntityModal>
    );
  }

  // --- edit: the three groups at once ---

  const stockSummary = `${form.quantity || 0} ${form.quantity_unit}`
    + (numberOrNull(form.low_stock_threshold) !== null
      ? ` · warn below ${form.low_stock_threshold} ${
        form.low_stock_threshold_type === 'days' ? 'days of supply' : form.quantity_unit}`
      : ' · no warning set');

  const careSummary = [
    form.start_date ? `Started ${form.start_date}` : null,
    providers.find((p) => String(p.id) === form.prescriber_id)
      ? [providers.find((p) => String(p.id) === form.prescriber_id).title,
        providers.find((p) => String(p.id) === form.prescriber_id).last_name]
        .filter(Boolean).join(' ')
      : null,
    pharmacies.find((p) => String(p.id) === form.pharmacy_id)?.name || null,
  ].filter(Boolean).join(' · ') || 'Nothing recorded';

  return (
    <EntityModal open={open} onOpenChange={onOpenChange} title="Edit medication" wide>
      <form className="em-form" onSubmit={submit}>
        <p className="ms-sub">
          Update the medication record. Schedules are managed separately.
        </p>

        <div className="ms-summary">
          <div className="ms-summary-text">
            <span className="ms-summary-name">{medication.name}</span>
            <span className="ms-summary-conc">{medication.concentration}</span>
          </div>
          <div className="ms-summary-tags">
            <span className={`ms-tag ${form.active ? 'is-active' : 'is-off'}`}>
              {form.active ? 'Active' : 'Inactive'}
            </span>
            {scheduleCount > 0 && <span className="ms-tag">{scheduleCount} sch</span>}
            {medication.as_needed && <span className="ms-tag">PRN</span>}
          </div>
        </div>

        {error && <div className="em-error">{error}</div>}

        <section className="ms-section">
          <h3 className="ms-section-title">Medication</h3>
          {medicationFields}
        </section>

        <DisclosureRow label="Stock and alerts" summary={stockSummary}>
          {stockFields}
        </DisclosureRow>

        <DisclosureRow label="Care details" summary={careSummary}>
          {careFields}
        </DisclosureRow>

        <DisclosureRow label="Advanced" summary={form.active ? undefined : 'Inactive'}>
          <label className="ms-check">
            <input type="checkbox" checked={!form.active}
                   onChange={(e) => setForm((f) => ({ ...f, active: !e.target.checked }))} />
            <span>Deactivate this medication</span>
          </label>
          <p className="ms-note">
            Deactivating keeps the record and its history; it stops appearing in the
            active list and on the schedule.
          </p>
        </DisclosureRow>

        {/* Renaming rewrites how past doses read. The log stores the amount
            given and refers back to this record for the name and strength, so
            it does not preserve what they were at the time. */}
        {(isChanged('name') || isChanged('concentration')) && (
          <div className="ms-warn" role="status">
            <AlertIcon size={16} />
            <span>
              Past doses show this medication&rsquo;s current name and strength, so
              changing them changes how earlier logs read.
            </span>
          </div>
        )}

        <div className="ms-foot">
          <span className={`ms-required ${changed.length ? 'is-dirty' : ''}`}>
            {changed.length === 0
              ? 'No changes yet'
              : `${changed.length} unsaved change${changed.length === 1 ? '' : 's'}`}
          </span>
          {medication.updated_at && (
            <span className="ms-updated">
              Last updated {new Date(medication.updated_at).toLocaleDateString()}
            </span>
          )}
        </div>

        <div className="em-footer">
          <button type="button" className="em-cancel" onClick={() => setForm(initial)}
                  disabled={changed.length === 0}>
            Discard changes
          </button>
          <button type="submit" className="em-submit"
                  disabled={missing.length > 0 || changed.length === 0 || saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </EntityModal>
  );
}
