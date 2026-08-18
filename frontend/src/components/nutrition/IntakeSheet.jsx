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
// THE intake logging sheet. Replaces three separate implementations that had
// drifted apart: the admin IntakeModal, the live dashboard's own form, and the
// 997-line care-task NutritionTrackingModal.
//
// The body adapts to the intake type:
//   liquid     - item, volume, optional nutrition
//   food       - item, servings/grams, nutrition
//   supplement - item, count/scoop, optional nutrition
//   tube feed  - formula, volume, bolus/pump/gravity, rate or duration, flush
//
// Presets cover repeated combinations ("Peptamen 250 mL + 60 mL flush, pump").
// Applying one writes a separate intake record per component, grouped — the
// feed and its flush stay distinct so fluid totals keep meaning something.
import { useCallback, useEffect, useMemo, useState } from 'react';
import EntityModal, { EmField } from '../vc/EntityModal';
import SegmentedControl from '../vc/SegmentedControl';
import ChipGroup from '../vc/ChipGroup';
import DisclosureRow from '../vc/DisclosureRow';
import WhenRow from './WhenRow';
import { nutritionService } from '../../services/nutrition';
import {
  BarcodeIcon, BreakfastIcon, DinnerIcon, FoodIcon, LiquidIcon, LunchIcon,
  MinusIcon, MoreHorizontalIcon, PlusIcon, SnackIcon, SupplementIcon, TubeIcon,
} from '../Icons';
import { INTAKE_TYPES, UNITS_FOR_TYPE, describeIntake, scaleNutrition } from './intakeVocab';
import './nutrition-sheet.css';

const TYPE_ICONS = {
  liquid: <LiquidIcon size={20} />,
  food: <FoodIcon size={20} />,
  supplement: <SupplementIcon size={20} />,
  tube_feed: <TubeIcon size={20} />,
};

// Meal context is optional and separate from the intake type. "Supplement"
// deliberately does not appear here as well as in the type list.
const CONTEXTS = [
  { value: 'breakfast', label: 'Breakfast', icon: <BreakfastIcon size={16} /> },
  { value: 'lunch', label: 'Lunch', icon: <LunchIcon size={16} /> },
  { value: 'dinner', label: 'Dinner', icon: <DinnerIcon size={16} /> },
  { value: 'snack', label: 'Snack', icon: <SnackIcon size={16} /> },
  { value: 'other', label: 'Other', icon: <MoreHorizontalIcon size={16} /> },
];

const emptyForm = (when) => ({
  itemType: 'liquid',
  mealType: null,
  itemId: null,
  itemName: '',
  amount: '',
  amountUnit: 'ml',
  consumedAt: when,
  // tube feed
  feedRoute: '',
  rateMlPerHr: '',
  durationMinutes: '',
  // nutrition
  calories: '',
  protein: '',
  carbs: '',
  fat: '',
  fiber: '',
  sodium: '',
  notes: '',
  saveAsItem: false,
});

const toLocalInput = (value) => {
  const d = value ? new Date(value) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    + `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const numberOrNull = (value) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

export default function IntakeSheet({
  open, onClose, onSaved, patient, editing, defaultDateTime,
  careTaskLogId, careTaskName,
}) {
  const [form, setForm] = useState(() => emptyForm(toLocalInput(defaultDateTime)));
  const [recent, setRecent] = useState([]);
  const [presets, setPresets] = useState([]);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [savedCount, setSavedCount] = useState(0);

  const set = useCallback((patch) => setForm((f) => ({ ...f, ...patch })), []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSavedCount(0);
    setSearch('');
    setResults([]);
    if (editing) {
      setForm({
        ...emptyForm(toLocalInput(editing.consumed_at)),
        itemType: editing.item_type || 'liquid',
        mealType: editing.meal_type || null,
        itemId: editing.item_id ?? null,
        itemName: editing.item_name || '',
        amount: editing.amount != null ? String(editing.amount) : '',
        amountUnit: editing.amount_unit || 'ml',
        feedRoute: editing.feed_route || '',
        rateMlPerHr: editing.rate_ml_per_hr != null ? String(editing.rate_ml_per_hr) : '',
        durationMinutes: editing.duration_minutes != null ? String(editing.duration_minutes) : '',
        calories: editing.calories != null ? String(editing.calories) : '',
        protein: editing.protein_grams != null ? String(editing.protein_grams) : '',
        carbs: editing.carbs_grams != null ? String(editing.carbs_grams) : '',
        fat: editing.fat_grams != null ? String(editing.fat_grams) : '',
        fiber: editing.fiber_grams != null ? String(editing.fiber_grams) : '',
        sodium: editing.sodium_mg != null ? String(editing.sodium_mg) : '',
        notes: editing.notes || '',
      });
    } else {
      setForm(emptyForm(toLocalInput(defaultDateTime)));
    }
  }, [open, editing, defaultDateTime]);

  // Recent combinations and presets back the one-tap prefill rows.
  useEffect(() => {
    if (!open || !patient || editing) return;
    let cancelled = false;
    Promise.all([
      nutritionService.recent(patient.id).catch(() => ({ recent: [] })),
      nutritionService.listPresets(patient.id).catch(() => []),
    ]).then(([recentBody, presetList]) => {
      if (cancelled) return;
      setRecent(recentBody.recent || []);
      setPresets(Array.isArray(presetList) ? presetList : []);
    });
    return () => { cancelled = true; };
  }, [open, patient, editing]);

  // Item search over the saved library.
  useEffect(() => {
    if (!open || !patient) return undefined;
    const term = search.trim();
    if (!term) { setResults([]); return undefined; }
    let cancelled = false;
    const timer = setTimeout(() => {
      nutritionService.listItems({ patientId: patient.id, search: term, limit: 8 })
        .then((items) => { if (!cancelled) setResults(items); })
        .catch(() => { if (!cancelled) setResults([]); });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search, open, patient]);

  const isTubeFeed = form.itemType === 'tube_feed';
  const units = UNITS_FOR_TYPE[form.itemType] || UNITS_FOR_TYPE.liquid;

  const summary = useMemo(() => describeIntake(form), [form]);
  const canSave = !!form.itemName.trim() && numberOrNull(form.amount) !== null && !saving;

  const chooseType = (itemType) => {
    const nextUnits = UNITS_FOR_TYPE[itemType] || UNITS_FOR_TYPE.liquid;
    set({
      itemType,
      // Keep the current unit if it still makes sense for the new type.
      amountUnit: nextUnits.includes(form.amountUnit) ? form.amountUnit : nextUnits[0],
      ...(itemType === 'tube_feed' ? {} : { feedRoute: '', rateMlPerHr: '', durationMinutes: '' }),
    });
  };

  // Picking a saved item fills the amount and scales its per-unit nutrition.
  const chooseItem = (item) => {
    const amount = item.default_amount ?? numberOrNull(form.amount) ?? '';
    const unit = item.default_amount_unit || form.amountUnit;
    set({
      itemId: item.id,
      itemName: item.name,
      itemType: item.item_type || form.itemType,
      amount: amount === '' ? '' : String(amount),
      amountUnit: unit,
      ...scaleNutrition(item, Number(amount) || 0),
    });
    setSearch('');
    setResults([]);
  };

  const applyRecent = (option) => {
    const entry = option.entry;
    set({
      itemId: null,
      itemName: entry.item_name,
      itemType: entry.item_type || form.itemType,
      amount: entry.amount != null ? String(entry.amount) : '',
      amountUnit: entry.amount_unit || form.amountUnit,
    });
  };

  const stepAmount = (delta) => {
    const current = numberOrNull(form.amount) ?? 0;
    const next = Math.max(0, current + delta);
    set({ amount: String(next) });
  };

  const applyPreset = async (option) => {
    if (!patient) return;
    setSaving(true);
    setError(null);
    try {
      await nutritionService.applyPreset(option.preset.id, {
        patient_id: patient.id,
        consumed_at: new Date(form.consumedAt).toISOString(),
        meal_type: form.mealType || undefined,
        care_task_log_id: careTaskLogId || undefined,
      });
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const buildPayload = () => ({
    item_id: form.itemId,
    item_name: form.itemName.trim(),
    item_type: form.itemType,
    amount: numberOrNull(form.amount),
    amount_unit: form.amountUnit,
    consumed_at: new Date(form.consumedAt).toISOString(),
    meal_type: form.mealType || null,
    feed_route: isTubeFeed && form.feedRoute ? form.feedRoute : null,
    rate_ml_per_hr: isTubeFeed ? numberOrNull(form.rateMlPerHr) : null,
    duration_minutes: isTubeFeed ? numberOrNull(form.durationMinutes) : null,
    calories: numberOrNull(form.calories),
    protein_grams: numberOrNull(form.protein),
    carbs_grams: numberOrNull(form.carbs),
    fat_grams: numberOrNull(form.fat),
    fiber_grams: numberOrNull(form.fiber),
    sodium_mg: numberOrNull(form.sodium),
    notes: form.notes || null,
    ...(careTaskLogId ? { care_task_log_id: careTaskLogId } : {}),
  });

  const maybeSaveItem = async () => {
    if (!form.saveAsItem || form.itemId) return;
    const amount = numberOrNull(form.amount) || 1;
    const per = (value) => {
      const total = numberOrNull(value);
      return total === null ? null : Number((total / amount).toFixed(4));
    };
    try {
      await nutritionService.createItem({
        patient_id: patient.id,
        name: form.itemName.trim(),
        item_type: form.itemType,
        default_amount: amount,
        default_amount_unit: form.amountUnit,
        calories_per_unit: per(form.calories),
        protein_per_unit: per(form.protein),
        carbs_per_unit: per(form.carbs),
        fat_per_unit: per(form.fat),
        fiber_per_unit: per(form.fiber),
        sodium_per_unit: per(form.sodium),
      });
    } catch {
      // A duplicate name is not worth losing the logged intake over.
    }
  };

  const submit = async (event, andAnother = false) => {
    event.preventDefault();
    if (!patient || !canSave) return;
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await nutritionService.updateIntake(editing.id, buildPayload());
      } else {
        await nutritionService.createIntake(patient.id, buildPayload());
        await maybeSaveItem();
      }
      onSaved?.();
      if (andAnother) {
        // Same meal, next item: keep the time and context.
        setForm((f) => ({
          ...emptyForm(f.consumedAt),
          itemType: f.itemType,
          amountUnit: f.amountUnit,
          mealType: f.mealType,
        }));
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

  const amountLabel = {
    liquid: 'Volume',
    food: 'Amount',
    supplement: 'Amount',
    tube_feed: 'Volume',
  }[form.itemType] || 'Amount';

  return (
    <EntityModal
      open={open}
      onOpenChange={(next) => { if (!next) onClose?.(); }}
      title={editing ? 'Edit intake' : 'Log intake'}
    >
      <form className="em-form nsheet" onSubmit={(e) => submit(e, false)}>
        <p className="nsheet-sub">
          {careTaskName
            ? `Recording against ${careTaskName}.`
            : 'Add food, fluid, supplement, or tube feeding.'}
        </p>
        {error && <div className="em-error">{error}</div>}
        {savedCount > 0 && (
          <div className="em-success">
            {savedCount} {savedCount === 1 ? 'item' : 'items'} logged. Ready for the next one.
          </div>
        )}

        <WhenRow
          id="intake-when"
          value={form.consumedAt}
          onChange={(v) => set({ consumedAt: v })}
        />

        <SegmentedControl
          label="Intake type"
          required
          options={INTAKE_TYPES.map((t) => ({ ...t, icon: TYPE_ICONS[t.value] }))}
          value={form.itemType}
          onChange={chooseType}
        />

        <ChipGroup
          label="Context"
          optional
          options={CONTEXTS}
          value={form.mealType}
          onChange={(mealType) => set({ mealType })}
        />

        {!editing && presets.length > 0 && (
          <ChipGroup
            label="Presets"
            hint="Logs every part as its own record."
            mode="action"
            options={presets.map((p) => ({
              value: `preset-${p.id}`,
              label: p.name,
              sublabel: `${p.components?.length || 0} items`,
              preset: p,
            }))}
            onSelect={applyPreset}
          />
        )}

        {!editing && recent.length > 0 && (
          <ChipGroup
            label="Recent"
            hint="Tap to prefill."
            mode="action"
            options={recent.map((r, i) => ({
              value: `recent-${i}`,
              label: `${r.item_name} · ${r.amount} ${r.amount_unit}`,
              entry: r,
            }))}
            onSelect={applyRecent}
          />
        )}

        <section className="nsheet-card">
          <header className="nsheet-card-head"><h4>Item</h4></header>

          <EmField label={isTubeFeed ? 'Formula' : 'Item'} required htmlFor="intake-item">
            <input
              id="intake-item"
              className="em-input"
              value={form.itemName}
              placeholder={isTubeFeed ? 'e.g. Peptamen' : 'e.g. Water, Apple'}
              onChange={(e) => set({ itemName: e.target.value, itemId: null })}
              required
            />
          </EmField>

          <EmField label="Search saved items" optional htmlFor="intake-search">
            <div className="nsheet-search">
              <input
                id="intake-search"
                className="em-input"
                value={search}
                placeholder="Search saved items"
                onChange={(e) => setSearch(e.target.value)}
              />
              {/* Barcode lookup is not wired up yet — the scan dialogs exist
                  but nothing maps a barcode to a nutrition item. */}
              <button
                type="button"
                className="nsheet-scan"
                disabled
                title="Barcode scanning is not available yet"
                aria-label="Scan a barcode (not available yet)"
              >
                <BarcodeIcon size={20} />
              </button>
            </div>
          </EmField>

          {results.length > 0 && (
            <div className="nsheet-results">
              {results.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="nsheet-result"
                  onClick={() => chooseItem(item)}
                >
                  <span className="nsheet-result-icon">
                    {TYPE_ICONS[item.item_type] || <LiquidIcon size={18} />}
                  </span>
                  <span className="nsheet-result-text">
                    <span className="nsheet-result-name">{item.name}</span>
                    <span className="nsheet-result-meta">
                      {[
                        item.item_type?.replace('_', ' '),
                        item.default_amount
                          ? `${item.default_amount} ${item.default_amount_unit || ''}`.trim()
                          : null,
                        item.calories_per_unit ? `${item.calories_per_unit}/unit kcal` : 'no nutrition profile',
                      ].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="nsheet-result-add"><PlusIcon size={18} /></span>
                </button>
              ))}
            </div>
          )}

          <EmField label={amountLabel} required htmlFor="intake-amount">
            <div className="nsheet-amount">
              <input
                id="intake-amount"
                className="em-input"
                type="number"
                min="0"
                step="any"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => set({ amount: e.target.value })}
                required
              />
              <select
                className="em-input nsheet-unit"
                aria-label="Amount unit"
                value={form.amountUnit}
                onChange={(e) => set({ amountUnit: e.target.value })}
              >
                {units.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              <button type="button" className="nsheet-step" aria-label="Decrease amount"
                      onClick={() => stepAmount(-10)}>
                <MinusIcon size={18} />
              </button>
              <button type="button" className="nsheet-step" aria-label="Increase amount"
                      onClick={() => stepAmount(10)}>
                <PlusIcon size={18} />
              </button>
            </div>
          </EmField>
        </section>

        {/* Tube feed — delivery detail. The water flush is logged as its own
            entry (or as part of a preset), not squeezed in here. */}
        {isTubeFeed && (
          <section className="nsheet-card">
            <header className="nsheet-card-head"><h4>Delivery</h4></header>
            <SegmentedControl
              label="Route"
              optional
              options={[
                { value: 'bolus', label: 'Bolus' },
                { value: 'pump', label: 'Pump' },
                { value: 'gravity', label: 'Gravity' },
              ]}
              value={form.feedRoute}
              onChange={(feedRoute) => set({ feedRoute })}
            />
            <div className="nsheet-amount">
              <EmField label="Rate (mL/hr)" optional htmlFor="intake-rate">
                <input
                  id="intake-rate"
                  className="em-input"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={form.rateMlPerHr}
                  onChange={(e) => set({ rateMlPerHr: e.target.value })}
                />
              </EmField>
              <EmField label="Duration (min)" optional htmlFor="intake-duration">
                <input
                  id="intake-duration"
                  className="em-input"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={form.durationMinutes}
                  onChange={(e) => set({ durationMinutes: e.target.value })}
                />
              </EmField>
            </div>
          </section>
        )}

        {!!summary.title && (
          <div className="nsheet-summary">
            <span className="nsheet-summary-icon">
              {TYPE_ICONS[form.itemType] || <LiquidIcon size={18} />}
            </span>
            <div className="nsheet-summary-text">
              <strong>{summary.title}</strong>
              {summary.detail && <span>{summary.detail}</span>}
            </div>
          </div>
        )}

        <DisclosureRow
          label="Nutrition details"
          optional
          summary="Calories, protein, carbs, fat, sodium"
        >
          <div className="nsheet-amount">
            <EmField label="Calories" htmlFor="intake-cal">
              <input id="intake-cal" className="em-input" type="number" min="0" step="any"
                     inputMode="decimal" value={form.calories}
                     onChange={(e) => set({ calories: e.target.value })} />
            </EmField>
            <EmField label="Protein (g)" htmlFor="intake-protein">
              <input id="intake-protein" className="em-input" type="number" min="0" step="any"
                     inputMode="decimal" value={form.protein}
                     onChange={(e) => set({ protein: e.target.value })} />
            </EmField>
          </div>
          <div className="nsheet-amount">
            <EmField label="Carbs (g)" htmlFor="intake-carbs">
              <input id="intake-carbs" className="em-input" type="number" min="0" step="any"
                     inputMode="decimal" value={form.carbs}
                     onChange={(e) => set({ carbs: e.target.value })} />
            </EmField>
            <EmField label="Fat (g)" htmlFor="intake-fat">
              <input id="intake-fat" className="em-input" type="number" min="0" step="any"
                     inputMode="decimal" value={form.fat}
                     onChange={(e) => set({ fat: e.target.value })} />
            </EmField>
          </div>
          <div className="nsheet-amount">
            <EmField label="Fiber (g)" htmlFor="intake-fiber">
              <input id="intake-fiber" className="em-input" type="number" min="0" step="any"
                     inputMode="decimal" value={form.fiber}
                     onChange={(e) => set({ fiber: e.target.value })} />
            </EmField>
            <EmField label="Sodium (mg)" htmlFor="intake-sodium">
              <input id="intake-sodium" className="em-input" type="number" min="0" step="any"
                     inputMode="decimal" value={form.sodium}
                     onChange={(e) => set({ sodium: e.target.value })} />
            </EmField>
          </div>
        </DisclosureRow>

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

        {!editing && !form.itemId && (
          <label className="nsheet-switch-row">
            <span className="nsheet-switch-text">
              <strong>Save as a reusable item</strong>
              <span>Makes future logging faster</span>
            </span>
            <input
              type="checkbox"
              className="em-check"
              checked={form.saveAsItem}
              onChange={(e) => set({ saveAsItem: e.target.checked })}
            />
          </label>
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
            {saving ? 'Saving…' : (editing ? 'Save changes' : 'Log intake')}
          </button>
        </div>
      </form>
    </EntityModal>
  );
}
