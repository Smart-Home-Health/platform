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
// Bathroom logging — ONE adaptive sheet, replacing the old two-screen modal
// (pick a location, then fill a long form). Location stays inline, quick
// presets cover the common events in a tap, and only the sections that apply
// to what was actually selected are rendered.
//
// The minimum valid log is time + location + urine/stool. Everything else is
// optional, including every detail the old form demanded.
//
// Concerns are recorded as plain observations. Nothing here interprets or
// diagnoses them.
import { useEffect, useMemo, useState } from 'react';
import EntityModal, { EmField } from '../vc/EntityModal';
import SegmentedControl from '../vc/SegmentedControl';
import ChipGroup from '../vc/ChipGroup';
import DisclosureRow from '../vc/DisclosureRow';
import WhenRow from './WhenRow';
import { nutritionService } from '../../services/nutrition';
import {
  BloodIcon, BowelIcon, CheckIcon, DiaperIcon, MucusIcon,
  PainIcon, StrainingIcon, ToiletIcon, UrineIcon,
} from '../Icons';
import { BRISTOL_LABELS, LOCATIONS, bristolFor, describeEvent } from './outputVocab';
import './nutrition-sheet.css';

const CONCERNS = [
  { value: 'has_blood', label: 'Blood', icon: <BloodIcon size={16} /> },
  { value: 'has_mucus', label: 'Mucus', icon: <MucusIcon size={16} /> },
  { value: 'pain_reported', label: 'Pain', icon: <PainIcon size={16} /> },
  { value: 'straining', label: 'Straining', icon: <StrainingIcon size={16} /> },
];

// One tap for the events that make up most of a shift.
const QUICK_LOGS = [
  {
    value: 'wet-diaper',
    label: 'Wet diaper · urine',
    apply: { location: 'diaper', hasUrine: true, hasStool: false, wetness: 'wet' },
  },
  {
    value: 'bm-type-4',
    label: 'BM · medium · type 4',
    apply: { hasStool: true, hasUrine: false, stoolAmount: 'medium', bristol: 4 },
  },
  {
    value: 'mixed-diaper',
    label: 'Mixed diaper',
    apply: {
      location: 'diaper', hasUrine: true, hasStool: true,
      wetness: 'wet', stoolAmount: 'medium', bristol: 4,
    },
  },
];

const emptyForm = (when) => ({
  location: 'restroom',
  hasUrine: false,
  hasStool: false,
  occurredAt: when,
  // urine
  wetness: '',
  clarity: '',
  urineAmount: '',
  urineAmountUnit: 'ml',
  catheterBagEmptied: false,
  // stool
  stoolAmount: 'medium',
  bristol: null,
  color: '',
  // shared
  notes: '',
  has_blood: false,
  has_mucus: false,
  pain_reported: false,
  straining: false,
});

const toLocalInput = (value) => {
  const d = value ? new Date(value) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Location the record was logged at, for edit mode. The booleans predate the
// `location` column and remain populated, so either can answer.
const locationOf = (record) => {
  if (!record) return 'restroom';
  if (record.location) return record.location;
  if (record.is_catheter) return 'catheter';
  if (record.is_diaper) return 'diaper';
  if (record.is_accident) return 'accident';
  return 'restroom';
};

export default function OutputSheet({
  open, onClose, onSaved, patient, editing, defaultDateTime, careTaskLogId,
}) {
  const [form, setForm] = useState(() => emptyForm(toLocalInput(defaultDateTime)));
  const [colorOptions, setColorOptions] = useState([]);
  const [clarityOptions, setClarityOptions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [savedCount, setSavedCount] = useState(0);
  const [showMeasuredVolume, setShowMeasuredVolume] = useState(false);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSavedCount(0);
    if (editing) {
      const isStool = editing.output_type === 'bowel';
      setForm({
        ...emptyForm(toLocalInput(editing.occurred_at)),
        location: locationOf(editing),
        hasUrine: !isStool,
        hasStool: isStool,
        wetness: editing.diaper_wetness || '',
        clarity: editing.clarity || '',
        urineAmount: !isStool && editing.amount != null ? String(editing.amount) : '',
        urineAmountUnit: editing.amount_unit || 'ml',
        catheterBagEmptied: !!editing.catheter_bag_emptied,
        stoolAmount: isStool ? (editing.amount_unit || 'medium') : 'medium',
        bristol: editing.bristol_scale ?? bristolFor(editing.consistency),
        color: editing.color || '',
        notes: editing.notes || '',
        has_blood: !!editing.has_blood,
        has_mucus: !!editing.has_mucus,
        pain_reported: !!editing.pain_reported,
        straining: !!editing.straining,
      });
      setShowMeasuredVolume(!isStool && editing.amount != null);
    } else {
      setForm(emptyForm(toLocalInput(defaultDateTime)));
      setShowMeasuredVolume(false);
    }
  }, [open, editing, defaultDateTime]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    nutritionService.outputTypes()
      .then((types) => {
        if (cancelled) return;
        setColorOptions(types.color_types || []);
        setClarityOptions(types.clarity_types || []);
      })
      .catch(() => { /* the selects fall back to their defaults */ });
    return () => { cancelled = true; };
  }, [open]);

  const isCatheter = form.location === 'catheter';
  const isDiaper = form.location === 'diaper';

  const concernValues = CONCERNS.filter((c) => form[c.value]).map((c) => c.value);

  const needsCatheterVolume = isCatheter && !String(form.urineAmount).trim();
  const nothingSelected = !form.hasUrine && !form.hasStool;
  const canSave = !nothingSelected && !needsCatheterVolume && !saving;

  const summary = useMemo(() => describeEvent(form), [form]);

  const applyQuickLog = (option) => {
    set({ ...option.apply });
    // A measured diaper volume is opt-in; a quick log never implies one.
    setShowMeasuredVolume(false);
  };

  const buildEvent = () => {
    const event = {
      patient_id: patient.id,
      location: form.location,
      occurred_at: new Date(form.occurredAt).toISOString(),
      notes: form.notes || null,
      has_blood: form.has_blood,
      has_mucus: form.has_mucus,
      pain_reported: form.pain_reported,
      straining: form.straining,
    };
    if (careTaskLogId) event.care_task_log_id = careTaskLogId;

    if (form.hasUrine) {
      const amount = String(form.urineAmount).trim();
      event.urine = {
        // A diaper is described by wetness. A number only appears here when
        // the diaper was actually weighed.
        amount: amount ? Number(amount) : null,
        amount_unit: amount ? form.urineAmountUnit : null,
        clarity: form.clarity || null,
        diaper_wetness: isDiaper ? (form.wetness || null) : null,
        catheter_bag_emptied: isCatheter ? form.catheterBagEmptied : null,
      };
    }
    if (form.hasStool) {
      event.stool = {
        bristol_scale: form.bristol ?? null,
        color: form.color || null,
        amount_unit: form.stoolAmount || null,
      };
    }
    return event;
  };

  const persist = async () => {
    if (editing) {
      // Editing touches the one existing row; its output_type stays put.
      const isStool = editing.output_type === 'bowel';
      const payload = {
        location: form.location,
        occurred_at: new Date(form.occurredAt).toISOString(),
        notes: form.notes || null,
        has_blood: form.has_blood,
        has_mucus: form.has_mucus,
        pain_reported: form.pain_reported,
        straining: form.straining,
        ...(isStool
          ? {
            bristol_scale: form.bristol ?? null,
            color: form.color || null,
            amount_unit: form.stoolAmount || null,
          }
          : {
            amount: String(form.urineAmount).trim() ? Number(form.urineAmount) : null,
            amount_unit: String(form.urineAmount).trim() ? form.urineAmountUnit : null,
            clarity: form.clarity || null,
            diaper_wetness: isDiaper ? (form.wetness || null) : null,
            catheter_bag_emptied: isCatheter ? form.catheterBagEmptied : null,
          }),
      };
      await nutritionService.updateOutput(editing.id, payload);
      return;
    }
    // One event, written server-side as its 1-2 rows in a single transaction.
    await nutritionService.createOutputEvent(buildEvent());
  };

  const submit = async (event, andAnother = false) => {
    event.preventDefault();
    if (!patient) return;
    if (nothingSelected) { setError('Pick urine, stool, or both before saving.'); return; }
    if (needsCatheterVolume) { setError('Catheter output needs a measured volume.'); return; }

    setSaving(true);
    setError(null);
    try {
      await persist();
      onSaved?.();
      if (andAnother) {
        // Keep the location and time so a run of changes stays fast.
        setForm((f) => ({ ...emptyForm(f.occurredAt), location: f.location }));
        setShowMeasuredVolume(false);
        setSavedCount((n) => n + 1);
      } else {
        onClose?.();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!patient) return null;

  return (
    <EntityModal
      open={open}
      onOpenChange={(next) => { if (!next) onClose?.(); }}
      title={editing ? 'Edit bathroom log' : 'Log bathroom'}
    >
      <form className="em-form nsheet" onSubmit={(e) => submit(e, false)}>
        <p className="nsheet-sub">Record urine, stool, or catheter output.</p>
        {error && <div className="em-error">{error}</div>}
        {savedCount > 0 && (
          <div className="em-success">
            {savedCount} {savedCount === 1 ? 'entry' : 'entries'} logged. Ready for the next one.
          </div>
        )}

        <WhenRow
          id="output-when"
          value={form.occurredAt}
          onChange={(v) => set({ occurredAt: v })}
        />

        <SegmentedControl
          label="Location"
          required
          options={LOCATIONS}
          value={form.location}
          onChange={(location) => set(location === 'catheter'
            // Catheter drainage is urine by definition, and the reason to log
            // it at all is the measured volume.
            ? { location, hasUrine: true, hasStool: false }
            : { location })}
        />

        {!editing && (
          <ChipGroup
            label="Quick log"
            hint="Tap to prefill."
            mode="action"
            scroll
            options={QUICK_LOGS}
            onSelect={applyQuickLog}
          />
        )}

        {/* Urine and stool are independent — a mixed event is normal. */}
        <div className="nsheet-field">
          <div className="nsheet-label">
            Output
            <span className="nsheet-req">Select one or both</span>
          </div>
          <div className="nsheet-toggles">
            <button
              type="button"
              className={`nsheet-toggle ${form.hasUrine ? 'on' : ''}`}
              aria-pressed={form.hasUrine}
              disabled={isCatheter || (editing && editing.output_type === 'bowel')}
              onClick={() => set({ hasUrine: !form.hasUrine })}
            >
              <UrineIcon size={18} />
              <span className="nsheet-toggle-label">Urine</span>
              <span className="nsheet-toggle-check" aria-hidden="true"><CheckIcon size={13} /></span>
            </button>
            <button
              type="button"
              className={`nsheet-toggle ${form.hasStool ? 'on' : ''}`}
              aria-pressed={form.hasStool}
              disabled={isCatheter || (editing && editing.output_type === 'urine')}
              onClick={() => set({ hasStool: !form.hasStool })}
            >
              <BowelIcon size={18} />
              <span className="nsheet-toggle-label">Stool</span>
              <span className="nsheet-toggle-check" aria-hidden="true"><CheckIcon size={13} /></span>
            </button>
          </div>
          {isCatheter && (
            <p className="nsheet-note">Catheter drainage is recorded as urine.</p>
          )}
        </div>

        {/* Diaper — wetness, not an invented millilitre figure. */}
        {isDiaper && form.hasUrine && (
          <section className="nsheet-card">
            <header className="nsheet-card-head">
              <h4>Diaper</h4>
              <button
                type="button"
                className="nsheet-link"
                onClick={() => setShowMeasuredVolume((v) => !v)}
              >
                {showMeasuredVolume ? 'Use wetness only' : 'Add measured weight or volume'}
              </button>
            </header>
            <SegmentedControl
              label="Wetness"
              options={[
                { value: 'dry', label: 'Dry' },
                { value: 'wet', label: 'Wet' },
                { value: 'soaked', label: 'Soaked' },
              ]}
              value={form.wetness}
              onChange={(wetness) => set({ wetness })}
            />
            {showMeasuredVolume && (
              <EmField label="Measured volume" optional htmlFor="output-diaper-volume">
                <div className="nsheet-amount">
                  <input
                    id="output-diaper-volume"
                    className="em-input"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="decimal"
                    placeholder="Weighed volume"
                    value={form.urineAmount}
                    onChange={(e) => set({ urineAmount: e.target.value })}
                  />
                  <select
                    className="em-input nsheet-unit"
                    aria-label="Volume unit"
                    value={form.urineAmountUnit}
                    onChange={(e) => set({ urineAmountUnit: e.target.value })}
                  >
                    <option value="ml">mL</option>
                    <option value="oz">oz</option>
                  </select>
                </div>
              </EmField>
            )}
          </section>
        )}

        {/* Stool */}
        {form.hasStool && (
          <section className="nsheet-card">
            <header className="nsheet-card-head"><h4>Stool</h4></header>
            <SegmentedControl
              label="Amount"
              options={[
                { value: 'smear', label: 'Smear' },
                { value: 'small', label: 'Small' },
                { value: 'medium', label: 'Medium' },
                { value: 'large', label: 'Large' },
              ]}
              value={form.stoolAmount}
              onChange={(stoolAmount) => set({ stoolAmount })}
            />
            <SegmentedControl
              label="Consistency"
              size="sm"
              inline
              hint={form.bristol ? `Type ${form.bristol} · ${BRISTOL_LABELS[form.bristol]}` : undefined}
              options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({
                value: n,
                label: String(n),
                title: `Bristol type ${n} — ${BRISTOL_LABELS[n]}`,
              }))}
              value={form.bristol}
              onChange={(bristol) => set({ bristol })}
              ariaLabel="Bristol stool scale"
            />
            <EmField label="Color" optional htmlFor="output-color">
              <select
                id="output-color"
                className="em-input"
                value={form.color}
                onChange={(e) => set({ color: e.target.value })}
              >
                <option value="">Not recorded</option>
                {colorOptions.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1).replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </EmField>
          </section>
        )}

        {/* Urine */}
        {form.hasUrine && (
          <section className="nsheet-card">
            <header className="nsheet-card-head"><h4>Urine</h4></header>
            <SegmentedControl
              label="Appearance"
              options={[
                { value: 'clear', label: 'Clear' },
                { value: 'cloudy', label: 'Cloudy' },
                { value: 'dark', label: 'Dark' },
              ]}
              value={form.clarity}
              onChange={(clarity) => set({ clarity })}
            />
            <DisclosureRow label="More urine details" optional>
              {!isDiaper && (
                <EmField
                  label="Volume"
                  required={isCatheter}
                  optional={!isCatheter}
                  htmlFor="output-urine-amount"
                >
                  <div className="nsheet-amount">
                    <input
                      id="output-urine-amount"
                      className="em-input"
                      type="number"
                      min="0"
                      step="1"
                      inputMode="decimal"
                      placeholder={isCatheter ? 'Measured volume' : 'If measured'}
                      value={form.urineAmount}
                      onChange={(e) => set({ urineAmount: e.target.value })}
                    />
                    <select
                      className="em-input nsheet-unit"
                      aria-label="Volume unit"
                      value={form.urineAmountUnit}
                      onChange={(e) => set({ urineAmountUnit: e.target.value })}
                    >
                      <option value="ml">mL</option>
                      <option value="oz">oz</option>
                    </select>
                  </div>
                </EmField>
              )}
              <EmField label="Clarity detail" optional htmlFor="output-clarity">
                <select
                  id="output-clarity"
                  className="em-input"
                  value={form.clarity}
                  onChange={(e) => set({ clarity: e.target.value })}
                >
                  <option value="">Not recorded</option>
                  {clarityOptions.map((c) => (
                    <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
              </EmField>
              {isCatheter && (
                <label className="em-check-row">
                  <input
                    type="checkbox"
                    className="em-check"
                    checked={form.catheterBagEmptied}
                    onChange={(e) => set({ catheterBagEmptied: e.target.checked })}
                  />
                  <span className="em-check-label">Bag emptied</span>
                </label>
              )}
            </DisclosureRow>
          </section>
        )}

        {/* Observations only — the app records these, it does not read anything
            into them. */}
        <ChipGroup
          label="Concerns"
          optional
          tone="due"
          mode="multi"
          scroll
          options={CONCERNS}
          value={concernValues}
          onChange={(next) => set(Object.fromEntries(
            CONCERNS.map((c) => [c.value, next.includes(c.value)]),
          ))}
        />

        <DisclosureRow
          label="Notes"
          optional
          summary={form.notes ? form.notes.slice(0, 60) : undefined}
        >
          <textarea
            className="em-input"
            rows={3}
            placeholder="Anything worth passing on"
            value={form.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </DisclosureRow>

        {!nothingSelected && (
          <div className="nsheet-summary">
            <span className="nsheet-summary-icon">
              {isDiaper ? <DiaperIcon size={18} /> : <ToiletIcon size={18} />}
            </span>
            <div className="nsheet-summary-text">
              <strong>{summary.title}</strong>
              {summary.detail && <span>{summary.detail}</span>}
            </div>
          </div>
        )}

        <div className="em-footer">
          <button type="button" className="em-cancel" onClick={onClose}>Cancel</button>
          {!editing && (
            <button
              type="button"
              className="em-cancel nsheet-another"
              disabled={!canSave}
              onClick={(e) => submit(e, true)}
            >
              Save + another
            </button>
          )}
          <button type="submit" className="em-submit" disabled={!canSave}>
            {saving ? 'Saving…' : (editing ? 'Save changes' : 'Log output')}
          </button>
        </div>
      </form>
    </EntityModal>
  );
}
