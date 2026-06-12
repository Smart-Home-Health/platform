/*
 * Smart Home Health Hub
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
  ClockIcon,
  FlameIcon,
  NotesIcon,
  LiquidIcon,
  FoodIcon,
  SupplementIcon,
  BreakfastIcon,
  LunchIcon,
  DinnerIcon,
  SnackIcon,
  TubeIcon,
} from '../../../components/Icons';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert } from '@/components/ui/alert';
import { Field, FormRow } from '@/components/ui/field';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  getCurrentLocalDateTime,
  localDateTimeToUTC,
  getLocalDateTimeString,
} from '../../../utils/timezone';

const emptyForm = () => ({
  item_name: '',
  item_type: 'liquid',
  amount: '',
  amount_unit: 'ml',
  calories: '',
  protein_grams: '',
  carbs_grams: '',
  fat_grams: '',
  sodium_mg: '',
  meal_type: 'snack',
  notes: '',
  consumed_at: '',
});

/**
 * Shared "Log Intake" modal used by AdminV2Nutrition and AdminV2Schedule's
 * PRN flow. Owns its form state internally so callers only manage open/close.
 *
 * Props:
 *   open        — boolean
 *   onClose     — () => void
 *   onSaved     — () => void              (fires after a successful save)
 *   patient     — { id }
 *   editing     — existing intake record (optional; switches to update mode)
 *   defaultDateTime — datetime-local string to seed consumed_at on a fresh open
 */
const IntakeModal = ({ open, onClose, onSaved, patient, editing, defaultDateTime }) => {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    if (editing) {
      setForm({
        item_name: editing.item_name || '',
        item_type: editing.item_type || 'liquid',
        amount: editing.amount ?? '',
        amount_unit: editing.amount_unit || 'ml',
        calories: editing.calories ?? '',
        protein_grams: editing.protein_grams ?? '',
        carbs_grams: editing.carbs_grams ?? '',
        fat_grams: editing.fat_grams ?? '',
        sodium_mg: editing.sodium_mg ?? '',
        meal_type: editing.meal_type || 'snack',
        notes: editing.notes || '',
        consumed_at: editing.consumed_at
          ? getLocalDateTimeString(new Date(editing.consumed_at))
          : getCurrentLocalDateTime(),
      });
    } else {
      setForm({
        ...emptyForm(),
        consumed_at: defaultDateTime || getCurrentLocalDateTime(),
      });
    }
  }, [open, editing, defaultDateTime]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!patient) return;
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        ...form,
        amount: parseFloat(form.amount) || 0,
        calories: form.calories ? parseFloat(form.calories) : null,
        protein_grams: form.protein_grams ? parseFloat(form.protein_grams) : null,
        carbs_grams: form.carbs_grams ? parseFloat(form.carbs_grams) : null,
        fat_grams: form.fat_grams ? parseFloat(form.fat_grams) : null,
        sodium_mg: form.sodium_mg ? parseFloat(form.sodium_mg) : null,
        consumed_at: localDateTimeToUTC(form.consumed_at),
      };
      const url = editing
        ? `${config.apiUrl}/api/nutrition-intake/${editing.id}`
        : `${config.apiUrl}/api/nutrition-intake?patient_id=${patient.id}`;
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to save intake');
      }
      onSaved?.();
      onClose?.();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="sm:max-w-[640px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Intake' : 'Log Intake'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          {formError && <Alert variant="destructive">{formError}</Alert>}

          <Field label={<><ClockIcon size={16} /> Date &amp; Time</>} required htmlFor="intake-when">
            <Input
              id="intake-when"
              type="datetime-local"
              value={form.consumed_at}
              onChange={e => setForm({ ...form, consumed_at: e.target.value })}
              required
            />
          </Field>

          {/* Intake Type Selection — specialised icon picker kept as chrome */}
          <div className="admin-v2-output-type-section">
            <label className="admin-v2-output-section-label">Intake Type *</label>
            <div className="admin-v2-output-type-grid">
              {['liquid', 'food', 'supplement', 'tube_feed'].map(type => (
                <button
                  key={type}
                  type="button"
                  className={`admin-v2-output-type-btn ${form.item_type === type ? 'active' : ''}`}
                  onClick={() => setForm({ ...form, item_type: type })}
                >
                  {type === 'liquid' && <LiquidIcon size={20} />}
                  {type === 'food' && <FoodIcon size={20} />}
                  {type === 'supplement' && <SupplementIcon size={20} />}
                  {type === 'tube_feed' && <TubeIcon size={20} />}
                  <span>{type === 'tube_feed' ? 'Tube Feed' : type.charAt(0).toUpperCase() + type.slice(1)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Meal Type Selection — specialised icon picker kept as chrome */}
          <div className="admin-v2-output-type-section">
            <label className="admin-v2-output-section-label">Meal Type</label>
            <div className="admin-v2-output-type-grid">
              {['breakfast', 'lunch', 'dinner', 'snack', 'supplement'].map(type => (
                <button
                  key={type}
                  type="button"
                  className={`admin-v2-output-type-btn ${form.meal_type === type ? 'active' : ''}`}
                  onClick={() => setForm({ ...form, meal_type: type })}
                >
                  {type === 'breakfast' && <BreakfastIcon size={20} />}
                  {type === 'lunch' && <LunchIcon size={20} />}
                  {type === 'dinner' && <DinnerIcon size={20} />}
                  {type === 'snack' && <SnackIcon size={20} />}
                  {type === 'supplement' && <SupplementIcon size={20} />}
                  <span>{type.charAt(0).toUpperCase() + type.slice(1)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Item Details */}
          <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
            <h4 className="text-sm font-semibold text-foreground">Item Details</h4>
            <Field label="Item Name" required htmlFor="intake-item">
              <Input
                id="intake-item"
                value={form.item_name}
                onChange={e => setForm({ ...form, item_name: e.target.value })}
                placeholder="e.g., Water, Peptamen, Apple"
                required
              />
            </Field>
            <FormRow>
              <Field label="Amount" required htmlFor="intake-amount">
                <Input
                  id="intake-amount"
                  type="number"
                  step="0.1"
                  value={form.amount}
                  onChange={e => setForm({ ...form, amount: e.target.value })}
                  required
                />
              </Field>
              <Field label="Unit">
                <Select
                  value={form.amount_unit}
                  onValueChange={(v) => setForm({ ...form, amount_unit: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ml">ml</SelectItem>
                    <SelectItem value="oz">oz</SelectItem>
                    <SelectItem value="cups">cups</SelectItem>
                    <SelectItem value="grams">grams</SelectItem>
                    <SelectItem value="servings">servings</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </FormRow>
          </div>

          {/* Nutrition Details */}
          <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
            <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <FlameIcon size={16} /> Nutrition (Optional)
            </h4>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field label="Calories" htmlFor="intake-cal">
                <Input id="intake-cal" type="number" step="0.1" value={form.calories} onChange={e => setForm({ ...form, calories: e.target.value })} placeholder="kcal" />
              </Field>
              <Field label="Protein (g)" htmlFor="intake-protein">
                <Input id="intake-protein" type="number" step="0.1" value={form.protein_grams} onChange={e => setForm({ ...form, protein_grams: e.target.value })} />
              </Field>
              <Field label="Carbs (g)" htmlFor="intake-carbs">
                <Input id="intake-carbs" type="number" step="0.1" value={form.carbs_grams} onChange={e => setForm({ ...form, carbs_grams: e.target.value })} />
              </Field>
              <Field label="Fat (g)" htmlFor="intake-fat">
                <Input id="intake-fat" type="number" step="0.1" value={form.fat_grams} onChange={e => setForm({ ...form, fat_grams: e.target.value })} />
              </Field>
              <Field label="Sodium (mg)" htmlFor="intake-sodium">
                <Input id="intake-sodium" type="number" step="0.1" value={form.sodium_mg} onChange={e => setForm({ ...form, sodium_mg: e.target.value })} />
              </Field>
            </div>
          </div>

          <Field label={<><NotesIcon size={16} /> Notes</>} htmlFor="intake-notes">
            <Textarea
              id="intake-notes"
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              rows={2}
              placeholder="Additional notes..."
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : (editing ? 'Update' : 'Save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default IntakeModal;
