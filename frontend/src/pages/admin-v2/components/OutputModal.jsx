import React, { useEffect, useState } from 'react';
import config from '../../../config';
import {
  XIcon,
  UrineIcon,
  BowelIcon,
  VomitIcon,
  NotesIcon,
  DiaperIcon,
  CatheterIcon,
  BloodIcon,
  MucusIcon,
  PainIcon,
  StrainingIcon,
  SizeSmearIcon,
  SizeSmallIcon,
  SizeMediumIcon,
  SizeLargeIcon,
  WetnessDryIcon,
  WetnessWetIcon,
  WetnessSoakedIcon,
} from '../../../components/Icons';
import {
  getCurrentLocalDateTime,
  localDateTimeToUTC,
  getLocalDateTimeString,
} from '../../../utils/timezone';

const emptyForm = () => ({
  output_type: 'urine',
  consistency: '',
  color: '',
  amount: '',
  amount_unit: 'ml',
  clarity: '',
  is_diaper: false,
  diaper_wetness: '',
  diaper_soiled: false,
  is_catheter: false,
  catheter_bag_emptied: false,
  notes: '',
  has_blood: false,
  has_mucus: false,
  pain_reported: false,
  straining: false,
  occurred_at: '',
});

/**
 * Shared "Log Output" modal used by AdminV2Nutrition and AdminV2Schedule's
 * PRN flow. Owns its form state internally so callers only manage open/close.
 *
 * Props:
 *   open        — boolean
 *   onClose     — () => void
 *   onSaved     — () => void              (fires after a successful save)
 *   patient     — { id }
 *   editing     — existing output record (optional; switches to update mode)
 *   defaultDateTime — datetime-local string to seed occurred_at on a fresh open
 */
const OutputModal = ({ open, onClose, onSaved, patient, editing, defaultDateTime }) => {
  const [form, setForm] = useState(emptyForm);
  const [outputTypes, setOutputTypes] = useState({});
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  // Fetch type metadata once when the modal first opens
  useEffect(() => {
    if (!open || Object.keys(outputTypes).length > 0) return;
    fetch(`${config.apiUrl}/api/nutrition/outputs/types`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setOutputTypes(d); })
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    if (editing) {
      setForm({
        output_type: editing.output_type || 'urine',
        consistency: editing.consistency || '',
        color: editing.color || '',
        amount: editing.amount ?? '',
        amount_unit: editing.amount_unit || 'ml',
        clarity: editing.clarity || '',
        is_diaper: editing.is_diaper || false,
        diaper_wetness: editing.diaper_wetness || '',
        diaper_soiled: editing.diaper_soiled || false,
        is_catheter: editing.is_catheter || false,
        catheter_bag_emptied: editing.catheter_bag_emptied || false,
        notes: editing.notes || '',
        has_blood: editing.has_blood || false,
        has_mucus: editing.has_mucus || false,
        pain_reported: editing.pain_reported || false,
        straining: editing.straining || false,
        occurred_at: editing.occurred_at
          ? getLocalDateTimeString(new Date(editing.occurred_at))
          : getCurrentLocalDateTime(),
      });
    } else {
      setForm({
        ...emptyForm(),
        occurred_at: defaultDateTime || getCurrentLocalDateTime(),
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
        patient_id: patient.id,
        amount: form.amount ? parseFloat(form.amount) : null,
        occurred_at: localDateTimeToUTC(form.occurred_at),
      };
      const url = editing
        ? `${config.apiUrl}/api/nutrition/outputs/${editing.id}`
        : `${config.apiUrl}/api/nutrition/outputs`;
      const res = await fetch(url, {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to save output');
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
          <h3>{editing ? 'Edit Output' : 'Log Output'}</h3>
          <button className="admin-v2-modal-close" onClick={onClose}>
            <XIcon size={20} />
          </button>
        </div>
        <form onSubmit={handleSave}>
          <div className="admin-v2-modal-body">
            {formError && <div className="admin-v2-form-error">{formError}</div>}

            <div className="admin-v2-form-group" style={{ marginBottom: '1rem' }}>
              <label>Date & Time *</label>
              <input
                type="datetime-local"
                value={form.occurred_at}
                onChange={e => setForm({ ...form, occurred_at: e.target.value })}
                required
              />
            </div>

            {/* Output Type Selection */}
            <div className="admin-v2-output-type-section">
              <label className="admin-v2-output-section-label">Output Type *</label>
              <div className="admin-v2-output-type-grid">
                {(outputTypes.output_types || ['urine', 'bowel', 'vomit', 'other']).map(type => (
                  <button
                    key={type}
                    type="button"
                    className={`admin-v2-output-type-btn ${form.output_type === type ? 'active' : ''}`}
                    onClick={() => setForm({ ...form, output_type: type })}
                  >
                    {type === 'urine' && <UrineIcon size={20} />}
                    {type === 'bowel' && <BowelIcon size={20} />}
                    {type === 'vomit' && <VomitIcon size={20} />}
                    {type === 'other' && <NotesIcon size={20} />}
                    <span>{type.charAt(0).toUpperCase() + type.slice(1)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Method Selection */}
            <div className="admin-v2-output-method-section">
              <div className="admin-v2-output-method-options">
                <label className={`admin-v2-output-method-option ${form.is_diaper ? 'active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={form.is_diaper}
                    onChange={e => setForm({ ...form, is_diaper: e.target.checked })}
                  />
                  <span className="admin-v2-output-method-icon"><DiaperIcon size={18} /></span>
                  <span>Diaper</span>
                </label>
                <label className={`admin-v2-output-method-option ${form.is_catheter ? 'active' : ''}`}>
                  <input
                    type="checkbox"
                    checked={form.is_catheter}
                    onChange={e => setForm({ ...form, is_catheter: e.target.checked })}
                  />
                  <span className="admin-v2-output-method-icon"><CatheterIcon size={18} /></span>
                  <span>Catheter</span>
                </label>
              </div>
            </div>

            {/* Bowel Movement Details */}
            {form.output_type === 'bowel' && (
              <div className="admin-v2-output-details-card">
                <h4 className="admin-v2-output-card-title">Bowel Movement Details</h4>

                <div className="admin-v2-form-group">
                  <label>Amount</label>
                  <div className="admin-v2-output-amount-grid">
                    {['smear', 'small', 'medium', 'large'].map(size => (
                      <button
                        key={size}
                        type="button"
                        className={`admin-v2-output-amount-btn ${form.amount_unit === size ? 'active' : ''}`}
                        onClick={() => setForm({ ...form, amount_unit: size, amount: null })}
                      >
                        <span className="admin-v2-output-amount-icon">
                          {size === 'smear' && <SizeSmearIcon size={20} />}
                          {size === 'small' && <SizeSmallIcon size={20} />}
                          {size === 'medium' && <SizeMediumIcon size={20} />}
                          {size === 'large' && <SizeLargeIcon size={20} />}
                        </span>
                        <span>{size.charAt(0).toUpperCase() + size.slice(1)}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="admin-v2-form-row">
                  <div className="admin-v2-form-group">
                    <label>Consistency</label>
                    <select
                      value={form.consistency}
                      onChange={e => setForm({ ...form, consistency: e.target.value })}
                    >
                      <option value="">Select...</option>
                      {(outputTypes.consistency_types || []).map(type => (
                        <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')}</option>
                      ))}
                    </select>
                  </div>
                  <div className="admin-v2-form-group">
                    <label>Color</label>
                    <select
                      value={form.color}
                      onChange={e => setForm({ ...form, color: e.target.value })}
                    >
                      <option value="">Select...</option>
                      {(outputTypes.color_types || []).map(type => (
                        <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Urine Details */}
            {form.output_type === 'urine' && (
              <div className="admin-v2-output-details-card">
                <h4 className="admin-v2-output-card-title">Urine Details</h4>
                <div className="admin-v2-form-row">
                  <div className="admin-v2-form-group">
                    <label>Clarity</label>
                    <select
                      value={form.clarity}
                      onChange={e => setForm({ ...form, clarity: e.target.value })}
                    >
                      <option value="">Select...</option>
                      {(outputTypes.clarity_types || []).map(type => (
                        <option key={type} value={type}>{type.charAt(0).toUpperCase() + type.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="admin-v2-form-group">
                    <label>Amount (ml)</label>
                    <input
                      type="number"
                      step="1"
                      value={form.amount ?? ''}
                      onChange={e => setForm({ ...form, amount: e.target.value })}
                      placeholder="Enter ml"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Diaper Details */}
            {form.is_diaper && (
              <div className="admin-v2-output-details-card">
                <h4 className="admin-v2-output-card-title">Diaper Details</h4>
                <div className="admin-v2-form-row">
                  <div className="admin-v2-form-group">
                    <label>Wetness Level</label>
                    <div className="admin-v2-output-wetness-grid">
                      {(outputTypes.diaper_wetness_types || ['dry', 'wet', 'soaked']).map(type => (
                        <button
                          key={type}
                          type="button"
                          className={`admin-v2-output-wetness-btn ${form.diaper_wetness === type ? 'active' : ''}`}
                          onClick={() => setForm({ ...form, diaper_wetness: type })}
                        >
                          {type === 'dry' && <WetnessDryIcon size={18} />}
                          {type === 'wet' && <WetnessWetIcon size={18} />}
                          {type === 'soaked' && <WetnessSoakedIcon size={18} />}
                          <span>{type.charAt(0).toUpperCase() + type.slice(1)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="admin-v2-form-group">
                    <label className={`admin-v2-output-toggle-option ${form.diaper_soiled ? 'active' : ''}`}>
                      <input
                        type="checkbox"
                        checked={form.diaper_soiled}
                        onChange={e => setForm({ ...form, diaper_soiled: e.target.checked })}
                      />
                      <span>Soiled (Bowel Movement)</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Catheter Details */}
            {form.is_catheter && (
              <div className="admin-v2-output-details-card">
                <h4 className="admin-v2-output-card-title">Catheter Details</h4>
                <div className="admin-v2-form-row">
                  <div className="admin-v2-form-group">
                    <label className={`admin-v2-output-toggle-option ${form.catheter_bag_emptied ? 'active' : ''}`}>
                      <input
                        type="checkbox"
                        checked={form.catheter_bag_emptied}
                        onChange={e => setForm({ ...form, catheter_bag_emptied: e.target.checked })}
                      />
                      <span>Bag Emptied</span>
                    </label>
                  </div>
                  <div className="admin-v2-form-group">
                    <label>Amount (ml)</label>
                    <input
                      type="number"
                      step="1"
                      value={form.amount ?? ''}
                      onChange={e => setForm({ ...form, amount: e.target.value })}
                      placeholder="Enter ml"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Concerns Section */}
            <div className="admin-v2-output-details-card admin-v2-output-concerns-card">
              <h4 className="admin-v2-output-card-title">Concerns</h4>
              <div className="admin-v2-output-concerns-grid">
                <label className={`admin-v2-output-concern-option ${form.has_blood ? 'active warning' : ''}`}>
                  <input
                    type="checkbox"
                    checked={form.has_blood}
                    onChange={e => setForm({ ...form, has_blood: e.target.checked })}
                  />
                  <span className="admin-v2-concern-icon"><BloodIcon size={20} /></span>
                  <span>Blood</span>
                </label>
                <label className={`admin-v2-output-concern-option ${form.has_mucus ? 'active warning' : ''}`}>
                  <input
                    type="checkbox"
                    checked={form.has_mucus}
                    onChange={e => setForm({ ...form, has_mucus: e.target.checked })}
                  />
                  <span className="admin-v2-concern-icon"><MucusIcon size={20} /></span>
                  <span>Mucus</span>
                </label>
                <label className={`admin-v2-output-concern-option ${form.pain_reported ? 'active warning' : ''}`}>
                  <input
                    type="checkbox"
                    checked={form.pain_reported}
                    onChange={e => setForm({ ...form, pain_reported: e.target.checked })}
                  />
                  <span className="admin-v2-concern-icon"><PainIcon size={20} /></span>
                  <span>Pain</span>
                </label>
                <label className={`admin-v2-output-concern-option ${form.straining ? 'active warning' : ''}`}>
                  <input
                    type="checkbox"
                    checked={form.straining}
                    onChange={e => setForm({ ...form, straining: e.target.checked })}
                  />
                  <span className="admin-v2-concern-icon"><StrainingIcon size={20} /></span>
                  <span>Straining</span>
                </label>
              </div>
            </div>

            {/* Notes */}
            <div className="admin-v2-output-notes-section">
              <label>Notes</label>
              <textarea
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                rows={3}
                placeholder="Any additional observations..."
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

export default OutputModal;
