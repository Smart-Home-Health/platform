import React, { useEffect, useState } from 'react';
import config from '../../../config';
import {
  XIcon,
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

  if (!open) return null;

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
    <div className="admin-v2-modal-overlay" onClick={onClose}>
      <div className="admin-v2-modal admin-v2-modal-lg" onClick={e => e.stopPropagation()}>
        <div className="admin-v2-modal-header">
          <h3>{editing ? 'Edit Intake' : 'Log Intake'}</h3>
          <button className="admin-v2-modal-close" onClick={onClose}>
            <XIcon size={20} />
          </button>
        </div>
        <form onSubmit={handleSave}>
          <div className="admin-v2-modal-body">
            {formError && <div className="admin-v2-form-error">{formError}</div>}

            <div className="admin-v2-form-group" style={{ marginBottom: '1rem' }}>
              <label><ClockIcon size={16} /> Date & Time *</label>
              <input
                type="datetime-local"
                value={form.consumed_at}
                onChange={e => setForm({ ...form, consumed_at: e.target.value })}
                required
              />
            </div>

            {/* Intake Type Selection */}
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

            {/* Meal Type Selection */}
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

            {/* Item Details Card */}
            <div className="admin-v2-output-details-card">
              <h4 className="admin-v2-output-card-title">Item Details</h4>
              <div className="admin-v2-form-group">
                <label>Item Name *</label>
                <input
                  type="text"
                  value={form.item_name}
                  onChange={e => setForm({ ...form, item_name: e.target.value })}
                  placeholder="e.g., Water, Peptamen, Apple"
                  required
                />
              </div>
              <div className="admin-v2-form-row">
                <div className="admin-v2-form-group">
                  <label>Amount *</label>
                  <input
                    type="number"
                    step="0.1"
                    value={form.amount}
                    onChange={e => setForm({ ...form, amount: e.target.value })}
                    required
                  />
                </div>
                <div className="admin-v2-form-group">
                  <label>Unit</label>
                  <select
                    value={form.amount_unit}
                    onChange={e => setForm({ ...form, amount_unit: e.target.value })}
                  >
                    <option value="ml">ml</option>
                    <option value="oz">oz</option>
                    <option value="cups">cups</option>
                    <option value="grams">grams</option>
                    <option value="servings">servings</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Nutrition Details Card */}
            <div className="admin-v2-output-details-card">
              <h4 className="admin-v2-output-card-title"><FlameIcon size={16} /> Nutrition (Optional)</h4>
              <div className="admin-v2-form-row-3">
                <div className="admin-v2-form-group">
                  <label>Calories</label>
                  <input
                    type="number"
                    step="0.1"
                    value={form.calories}
                    onChange={e => setForm({ ...form, calories: e.target.value })}
                    placeholder="kcal"
                  />
                </div>
                <div className="admin-v2-form-group">
                  <label>Protein (g)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={form.protein_grams}
                    onChange={e => setForm({ ...form, protein_grams: e.target.value })}
                  />
                </div>
                <div className="admin-v2-form-group">
                  <label>Carbs (g)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={form.carbs_grams}
                    onChange={e => setForm({ ...form, carbs_grams: e.target.value })}
                  />
                </div>
              </div>
              <div className="admin-v2-form-row">
                <div className="admin-v2-form-group">
                  <label>Fat (g)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={form.fat_grams}
                    onChange={e => setForm({ ...form, fat_grams: e.target.value })}
                  />
                </div>
                <div className="admin-v2-form-group">
                  <label>Sodium (mg)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={form.sodium_mg}
                    onChange={e => setForm({ ...form, sodium_mg: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="admin-v2-form-group">
              <label><NotesIcon size={16} /> Notes</label>
              <textarea
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                rows={2}
                placeholder="Additional notes..."
              />
            </div>
          </div>
          <div className="admin-v2-modal-footer">
            <button type="button" className="admin-v2-btn admin-v2-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="admin-v2-btn admin-v2-btn-primary" disabled={saving}>
              {saving ? 'Saving...' : (editing ? 'Update' : 'Save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default IntakeModal;
