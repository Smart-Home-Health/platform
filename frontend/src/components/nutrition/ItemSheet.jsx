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
// Add or edit a saved nutrition item — the library entry a juice or formula
// is logged against. Facts are entered PER SERVING, exactly as the label
// prints them ("240 mL serving, 140 calories"); they are stored per single
// unit so any logged amount scales without anyone doing the arithmetic.
//
// The barcode field leads the form: the Bluetooth scanner is a keyboard
// wedge, so focusing the field and pulling the trigger types the code and
// its Enter runs the lookup — a code already in the library warns instead
// of duplicating, an unknown one is looked up on OpenFoodFacts and lands as
// prefilled fields to check and save.
import { useEffect, useRef, useState } from 'react';
import EntityModal, { EmField } from '../vc/EntityModal';
import SegmentedControl from '../vc/SegmentedControl';
import { nutritionService } from '../../services/nutrition';
import { FoodIcon, LiquidIcon, SupplementIcon, TubeIcon } from '../Icons';
import { INTAKE_TYPES, UNITS_FOR_TYPE } from './intakeVocab';
import './nutrition-sheet.css';

const TYPE_ICONS = {
  liquid: <LiquidIcon size={20} />,
  food: <FoodIcon size={20} />,
  supplement: <SupplementIcon size={20} />,
  tube_feed: <TubeIcon size={20} />,
};

const FACTS = [
  { key: 'calories', label: 'Calories', perUnit: 'calories_per_unit' },
  { key: 'protein', label: 'Protein (g)', perUnit: 'protein_per_unit' },
  { key: 'carbs', label: 'Carbs (g)', perUnit: 'carbs_per_unit' },
  { key: 'fat', label: 'Fat (g)', perUnit: 'fat_per_unit' },
  { key: 'fiber', label: 'Fiber (g)', perUnit: 'fiber_per_unit' },
  { key: 'sodium', label: 'Sodium (mg)', perUnit: 'sodium_per_unit' },
];

const emptyForm = () => ({
  name: '',
  brand: '',
  itemType: 'liquid',
  servingAmount: '100',
  servingUnit: 'ml',
  calories: '',
  protein: '',
  carbs: '',
  fat: '',
  fiber: '',
  sodium: '',
  barcode: '',
});

const numberOrNull = (value) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const perServingString = (perUnit, amount) => {
  if (perUnit == null || !amount) return '';
  const total = Number(perUnit) * Number(amount);
  if (!Number.isFinite(total)) return '';
  return String(Number(total.toFixed(2)));
};

export default function ItemSheet({ open, onClose, onSaved, patient, editing }) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [scanNotice, setScanNotice] = useState(null);
  const [lookingUp, setLookingUp] = useState(false);
  // Last code already looked up, so the auto-lookup below fires once per scan
  // (and never re-fires for the barcode an edited item already carries).
  const lastLookedUp = useRef('');

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (!open) return;
    setError(null);
    setScanNotice(null);
    lastLookedUp.current = editing?.barcode || '';
    if (editing) {
      const amount = editing.default_amount ?? 100;
      setForm({
        name: editing.name || '',
        brand: editing.brand || '',
        itemType: editing.item_type || 'liquid',
        servingAmount: String(amount),
        servingUnit: editing.default_amount_unit || 'ml',
        // Stored per unit; shown per serving, the way the label reads.
        ...Object.fromEntries(FACTS.map((f) => [
          f.key, perServingString(editing[f.perUnit], amount),
        ])),
        barcode: editing.barcode || '',
      });
    } else {
      setForm(emptyForm());
    }
  }, [open, editing]);

  const units = UNITS_FOR_TYPE[form.itemType] || UNITS_FOR_TYPE.liquid;
  const canSave = !!form.name.trim() && numberOrNull(form.servingAmount) !== null && !saving;

  const chooseType = (itemType) => {
    const nextUnits = UNITS_FOR_TYPE[itemType] || UNITS_FOR_TYPE.liquid;
    set({
      itemType,
      servingUnit: nextUnits.includes(form.servingUnit) ? form.servingUnit : nextUnits[0],
    });
  };

  // Runs on Enter, on the Look up button, and automatically once a scanned
  // burst of digits stops — wedge scanners differ on the terminator they
  // send (Enter, Tab, or nothing), so all three paths land here.
  const handleBarcode = async (code) => {
    const barcode = String(code || '').trim();
    if (!barcode) return;
    lastLookedUp.current = barcode;
    setScanNotice(null);
    setLookingUp(true);
    try {
      const result = await nutritionService.lookupBarcode(barcode, patient?.id);
      if (result.source === 'library' && result.item && result.item.id !== editing?.id) {
        set({ barcode });
        setScanNotice(`This barcode is already saved as "${result.item.name}".`);
      } else if (result.source === 'openfoodfacts' && result.suggestion) {
        const s = result.suggestion;
        const amount = s.default_amount ?? 100;
        set({
          barcode,
          // Prefill only what is still blank — a scan should never wipe what
          // was already typed.
          ...(form.name.trim() ? {} : { name: s.name || '' }),
          ...(form.brand.trim() ? {} : { brand: s.brand || '' }),
          itemType: s.item_type || form.itemType,
          servingAmount: String(amount),
          servingUnit: s.default_amount_unit || 'ml',
          ...Object.fromEntries(FACTS.map((f) => [
            f.key,
            String(form[f.key] ?? '').trim()
              ? form[f.key]
              : perServingString(s[f.perUnit], amount),
          ])),
        });
        setScanNotice('Filled from the barcode database — check against the label before saving.');
      } else {
        set({ barcode });
        setScanNotice('Barcode attached. No product data found — enter the label facts.');
      }
    } catch {
      set({ barcode });
      setScanNotice('Barcode attached. Lookup failed — enter the label facts.');
    } finally {
      setLookingUp(false);
    }
  };

  // Auto-lookup: a scanner types 8+ digits in a burst; when the field goes
  // quiet the code is looked up even if the scanner sent no terminator.
  useEffect(() => {
    if (!open) return undefined;
    const code = form.barcode.trim();
    if (code.length < 8 || !/^\d+$/.test(code) || code === lastLookedUp.current) return undefined;
    const timer = setTimeout(() => handleBarcode(code), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleBarcode is recreated each render; keying on the code (and open) is the debounce contract
  }, [form.barcode, open]);

  const submit = async (event) => {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    const amount = numberOrNull(form.servingAmount);
    const per = (value) => {
      const total = numberOrNull(value);
      return total === null ? null : Number((total / amount).toFixed(4));
    };
    const payload = {
      name: form.name.trim(),
      brand: form.brand.trim() || null,
      item_type: form.itemType,
      default_amount: amount,
      default_amount_unit: form.servingUnit,
      ...Object.fromEntries(FACTS.map((f) => [f.perUnit, per(form[f.key])])),
      barcode: form.barcode.trim() || null,
    };
    try {
      if (editing) {
        await nutritionService.updateItem(editing.id, payload);
      } else {
        await nutritionService.createItem({ patient_id: patient?.id ?? null, ...payload });
      }
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <EntityModal
      open={open}
      onOpenChange={(next) => { if (!next) onClose?.(); }}
      title={editing ? 'Edit item' : 'Add item'}
    >
      <form className="em-form nsheet" onSubmit={submit}>
        <p className="nsheet-sub">
          A reusable item for logging. Enter the label facts for one serving;
          any amount given later scales from them automatically.
        </p>
        {error && <div className="em-error">{error}</div>}

        {/* First field on purpose: focus, pull the scanner trigger, and the
            wedge types the code + Enter, which fires the lookup. */}
        <EmField label="Barcode" optional htmlFor="item-barcode">
          <div className="nsheet-search">
            <input
              id="item-barcode"
              className="em-input"
              value={form.barcode}
              placeholder="Scan or type the UPC"
              inputMode="numeric"
              autoComplete="off"
              onChange={(e) => set({ barcode: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleBarcode(e.target.value);
                }
              }}
            />
            <button
              type="button"
              className="nsheet-lookup"
              disabled={lookingUp || !form.barcode.trim()}
              onClick={() => handleBarcode(form.barcode)}
            >
              Look up
            </button>
          </div>
        </EmField>
        {lookingUp && <p className="nsheet-note">Looking up barcode…</p>}
        {scanNotice && <p className="nsheet-note">{scanNotice}</p>}

        <EmField label="Name" required htmlFor="item-name">
          <input
            id="item-name"
            className="em-input"
            value={form.name}
            placeholder="e.g. Naked Green Machine"
            onChange={(e) => set({ name: e.target.value })}
            required
          />
        </EmField>

        <EmField label="Brand" optional htmlFor="item-brand">
          <input
            id="item-brand"
            className="em-input"
            value={form.brand}
            placeholder="e.g. Naked"
            onChange={(e) => set({ brand: e.target.value })}
          />
        </EmField>

        <SegmentedControl
          label="Type"
          required
          options={INTAKE_TYPES.map((t) => ({ ...t, icon: TYPE_ICONS[t.value] }))}
          value={form.itemType}
          onChange={chooseType}
        />

        <EmField label="Serving size" required htmlFor="item-serving">
          <div className="nsheet-amount">
            <input
              id="item-serving"
              className="em-input"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={form.servingAmount}
              onChange={(e) => set({ servingAmount: e.target.value })}
              required
            />
            <select
              className="em-input nsheet-unit"
              aria-label="Serving unit"
              value={form.servingUnit}
              onChange={(e) => set({ servingUnit: e.target.value })}
            >
              {units.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </EmField>

        <section className="nsheet-card">
          <header className="nsheet-card-head">
            <h4>Nutrition per {form.servingAmount || '—'} {form.servingUnit}</h4>
          </header>
          <div className="nsheet-grid">
            {FACTS.map((f) => (
              <EmField key={f.key} label={f.label} htmlFor={`item-${f.key}`}>
                <input
                  id={`item-${f.key}`}
                  className="em-input"
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={form[f.key]}
                  onChange={(e) => set({ [f.key]: e.target.value })}
                />
              </EmField>
            ))}
          </div>
        </section>

        <div className="em-footer">
          <button type="button" className="em-cancel" onClick={onClose}>Cancel</button>
          <button type="submit" className="em-submit" disabled={!canSave}>
            {saving ? 'Saving…' : (editing ? 'Save changes' : 'Add item')}
          </button>
        </div>
      </form>
    </EntityModal>
  );
}
