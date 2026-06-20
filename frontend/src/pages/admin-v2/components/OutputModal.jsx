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
  UrineIcon,
  BowelIcon,
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

const LOCATIONS = [
  { key: 'toilet',   label: 'Restroom',  Icon: NotesIcon,    desc: 'Used the toilet' },
  { key: 'diaper',   label: 'Diaper',    Icon: DiaperIcon,   desc: 'Caught by diaper' },
  { key: 'accident', label: 'Accident',  Icon: PainIcon,     desc: 'Uncontained — floor / clothes' },
  { key: 'catheter', label: 'Catheter',  Icon: CatheterIcon, desc: 'Catheter drainage' },
];

// A single bathroom event may contain both urine and stool. We track each
// independently so the form can collect details for one or both, then split
// into 1 or 2 NutritionOutput rows on save (DB has one output_type per row).
const emptyForm = () => ({
  has_urine: false,
  has_stool: false,
  // Stool-specific
  consistency: '',
  color: '',
  stool_amount_unit: 'medium',
  // Urine-specific
  urine_amount: '',     // ml
  clarity: '',
  // Diaper / catheter specifics
  diaper_wetness: '',
  catheter_bag_emptied: false,
  // Shared
  notes: '',
  has_blood: false,
  has_mucus: false,
  pain_reported: false,
  straining: false,
  occurred_at: '',
});

// Map DB flags back to a single location key for editing.
const inferLocation = (record) => {
  if (record?.is_catheter) return 'catheter';
  if (record?.is_diaper) return 'diaper';
  if (record?.is_accident) return 'accident';
  return 'toilet';
};

/**
 * Two-step output logging modal:
 *   Step 1 — pick location (toilet / diaper / accident / catheter)
 *   Step 2 — pick content (urine vs stool) and fill details
 *
 * Catheter skips the urine/stool picker (catheter drainage is always urine)
 * and goes straight to catheter details on step 2.
 */
const OutputModal = ({ open, onClose, onSaved, patient, editing, defaultDateTime }) => {
  const [step, setStep] = useState(1);
  const [location, setLocation] = useState(null);
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
      const loc = inferLocation(editing);
      const isUrineRow = editing.output_type === 'urine';
      const isBowelRow = editing.output_type === 'bowel';
      setLocation(loc);
      setStep(2); // jump past the picker when editing an existing row
      setForm({
        has_urine: isUrineRow || loc === 'catheter',
        has_stool: isBowelRow,
        consistency: editing.consistency || '',
        color: editing.color || '',
        stool_amount_unit: isBowelRow ? (editing.amount_unit || 'medium') : 'medium',
        urine_amount: isUrineRow ? (editing.amount ?? '') : '',
        clarity: editing.clarity || '',
        diaper_wetness: editing.diaper_wetness || '',
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
      setLocation(null);
      setStep(1);
      setForm({
        ...emptyForm(),
        occurred_at: defaultDateTime || getCurrentLocalDateTime(),
      });
    }
  }, [open, editing, defaultDateTime]);

  const pickLocation = (loc) => {
    setLocation(loc);
    // Catheter only logs urine drainage; skip the content picker.
    setForm(prev => ({
      ...prev,
      has_urine: loc === 'catheter' ? true : prev.has_urine,
      has_stool: loc === 'catheter' ? false : prev.has_stool,
    }));
    setStep(2);
  };

  // Build a NutritionOutput payload for one content type (urine or bowel).
  // Shared metadata (location flags, concerns, notes, occurred_at) is identical
  // across both payloads so the rows cluster on display.
  const buildPayload = (type) => {
    const occurredAtUtc = localDateTimeToUTC(form.occurred_at);
    const shared = {
      patient_id: patient.id,
      occurred_at: occurredAtUtc,
      is_diaper:   location === 'diaper',
      is_catheter: location === 'catheter',
      is_accident: location === 'accident',
      notes: form.notes || null,
      has_blood: form.has_blood,
      has_mucus: form.has_mucus,
      pain_reported: form.pain_reported,
      straining: form.straining,
    };
    if (type === 'urine') {
      return {
        ...shared,
        output_type: 'urine',
        clarity: form.clarity || null,
        amount: form.urine_amount === '' || form.urine_amount === null
          ? null
          : parseFloat(form.urine_amount),
        amount_unit: form.urine_amount ? 'ml' : null,
        diaper_wetness: location === 'diaper' ? (form.diaper_wetness || null) : null,
        catheter_bag_emptied: location === 'catheter' ? form.catheter_bag_emptied : null,
        // Stool-only fields explicitly null
        consistency: null,
        color: null,
        diaper_soiled: false,
      };
    }
    // type === 'bowel'
    return {
      ...shared,
      output_type: 'bowel',
      consistency: form.consistency || null,
      color: form.color || null,
      amount: null,                  // stool uses qualitative size
      amount_unit: form.stool_amount_unit || null,
      // For diaper + stool, mark the diaper as soiled.
      diaper_soiled: location === 'diaper',
      // Urine-only fields explicitly null
      clarity: null,
      diaper_wetness: null,
      catheter_bag_emptied: null,
    };
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!patient || !location) return;
    if (!form.has_urine && !form.has_stool) {
      setFormError('Pick urine, stool, or both before saving.');
      return;
    }
    setSaving(true);
    setFormError(null);

    try {
      if (editing) {
        // Editing a single existing row: keep its output_type stable. Submit
        // the matching payload via PUT. We don't try to add a second row in
        // edit mode — that's done via a fresh "Log Output" entry.
        const editType = editing.output_type === 'bowel' ? 'bowel' : 'urine';
        const payload = buildPayload(editType);
        const res = await fetch(`${config.apiUrl}/api/nutrition/outputs/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || 'Failed to save output');
        }
      } else {
        const types = [];
        if (form.has_urine) types.push('urine');
        if (form.has_stool) types.push('bowel');
        // Fire both POSTs in parallel — same backend, same DB, same auth, so
        // success/failure tend to be all-or-nothing in practice.
        const results = await Promise.all(types.map(t =>
          fetch(`${config.apiUrl}/api/nutrition/outputs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(buildPayload(t)),
          })
        ));
        const failed = results.find(r => !r.ok);
        if (failed) {
          const err = await failed.json().catch(() => ({}));
          throw new Error(err.detail || 'Failed to save output');
        }
      }
      onSaved?.();
      onClose?.();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const isCatheter = location === 'catheter';
  const isDiaper = location === 'diaper';
  const showUrine = form.has_urine;
  const showStool = form.has_stool;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="sm:max-w-[640px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>
            {editing ? 'Edit Output' : (step === 1 ? 'Log Output — Where?' : 'Log Output — Details')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSave} className="flex flex-col gap-4">
          {formError && <Alert variant="destructive">{formError}</Alert>}

          {/* ─────────── STEP 1: location (specialised picker — chrome) ─────────── */}
          {step === 1 && (
            <div className="admin-v2-output-location-grid">
              {LOCATIONS.map(loc => (
                <button
                  key={loc.key}
                  type="button"
                  className="admin-v2-output-location-btn"
                  onClick={() => pickLocation(loc.key)}
                >
                  <loc.Icon size={28} />
                  <span className="admin-v2-output-location-label">{loc.label}</span>
                  <span className="admin-v2-output-location-desc">{loc.desc}</span>
                </button>
              ))}
            </div>
          )}

          {/* ─────────── STEP 2: details ─────────── */}
          {step === 2 && (
            <>
              <div className="flex items-center justify-between rounded-md bg-secondary px-3 py-2">
                <span className="text-sm text-muted-foreground">
                  Location:&nbsp;
                  <strong className="text-foreground">
                    {LOCATIONS.find(l => l.key === location)?.label}
                  </strong>
                </span>
                {!editing && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => { setStep(1); setLocation(null); }}
                  >
                    ← Change
                  </Button>
                )}
              </div>

              <Field label="Date &amp; Time" required htmlFor="output-when">
                <Input
                  id="output-when"
                  type="datetime-local"
                  value={form.occurred_at}
                  onChange={e => setForm({ ...form, occurred_at: e.target.value })}
                  required
                />
              </Field>

              {/* Content picker — specialised toggle grid, kept as chrome. */}
              {!isCatheter && (
                <div className="admin-v2-output-type-section">
                  <label className="admin-v2-output-section-label">
                    What was it? * <span style={{ color: 'var(--muted-foreground)', fontWeight: 400, fontSize: '0.8rem' }}>(pick one or both)</span>
                  </label>
                  <div className="admin-v2-output-type-grid">
                    {(!editing || editing.output_type === 'urine') && (
                      <button
                        type="button"
                        className={`admin-v2-output-type-btn ${showUrine ? 'active' : ''}`}
                        onClick={() => setForm(prev => ({ ...prev, has_urine: !prev.has_urine }))}
                        disabled={editing && editing.output_type === 'urine'}
                        title={editing && editing.output_type === 'urine' ? 'Editing this urine record' : undefined}
                      >
                        <UrineIcon size={20} />
                        <span>Urine</span>
                      </button>
                    )}
                    {(!editing || editing.output_type === 'bowel') && (
                      <button
                        type="button"
                        className={`admin-v2-output-type-btn ${showStool ? 'active' : ''}`}
                        onClick={() => setForm(prev => ({ ...prev, has_stool: !prev.has_stool }))}
                        disabled={editing && editing.output_type === 'bowel'}
                        title={editing && editing.output_type === 'bowel' ? 'Editing this stool record' : undefined}
                      >
                        <BowelIcon size={20} />
                        <span>Stool</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Diaper wetness — only for diaper + urine (specialised picker — chrome) */}
              {isDiaper && showUrine && (
                <div className="admin-v2-output-details-card">
                  <h4 className="admin-v2-output-card-title">Diaper Wetness</h4>
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
              )}

              {/* Stool details */}
              {showStool && (
                <div className="admin-v2-output-details-card">
                  <h4 className="admin-v2-output-card-title">Stool Details</h4>
                  {/* Size — specialised icon picker, kept as chrome */}
                  <div className="admin-v2-form-group">
                    <label>Amount</label>
                    <div className="admin-v2-output-amount-grid">
                      {['smear', 'small', 'medium', 'large'].map(size => (
                        <button
                          key={size}
                          type="button"
                          className={`admin-v2-output-amount-btn ${form.stool_amount_unit === size ? 'active' : ''}`}
                          onClick={() => setForm({ ...form, stool_amount_unit: size })}
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
                  <FormRow className="mt-3">
                    <Field label="Consistency">
                      <Select
                        value={form.consistency || undefined}
                        onValueChange={(v) => setForm({ ...form, consistency: v })}
                      >
                        <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent>
                          {(outputTypes.consistency_types || []).map(type => (
                            <SelectItem key={type} value={type}>
                              {type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Color">
                      <Select
                        value={form.color || undefined}
                        onValueChange={(v) => setForm({ ...form, color: v })}
                      >
                        <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent>
                          {(outputTypes.color_types || []).map(type => (
                            <SelectItem key={type} value={type}>
                              {type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </FormRow>
                </div>
              )}

              {/* Urine details */}
              {showUrine && (
                <div className="admin-v2-output-details-card">
                  <h4 className="admin-v2-output-card-title">Urine Details</h4>
                  <FormRow>
                    <Field label="Clarity">
                      <Select
                        value={form.clarity || undefined}
                        onValueChange={(v) => setForm({ ...form, clarity: v })}
                      >
                        <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent>
                          {(outputTypes.clarity_types || []).map(type => (
                            <SelectItem key={type} value={type}>
                              {type.charAt(0).toUpperCase() + type.slice(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Amount (ml)" htmlFor="output-urine-amount">
                      <Input
                        id="output-urine-amount"
                        type="number"
                        step="1"
                        value={form.urine_amount ?? ''}
                        onChange={e => setForm({ ...form, urine_amount: e.target.value })}
                        placeholder="Enter ml"
                      />
                    </Field>
                  </FormRow>
                  {isCatheter && (
                    <div className="admin-v2-form-group" style={{ marginTop: '0.75rem' }}>
                      <label className={`admin-v2-output-toggle-option ${form.catheter_bag_emptied ? 'active' : ''}`}>
                        <input
                          type="checkbox"
                          checked={form.catheter_bag_emptied}
                          onChange={e => setForm({ ...form, catheter_bag_emptied: e.target.checked })}
                        />
                        <span>Bag emptied</span>
                      </label>
                    </div>
                  )}
                </div>
              )}

              {/* Concerns Section — specialised toggle grid, kept as chrome */}
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
              <Field label="Notes" htmlFor="output-notes">
                <Textarea
                  id="output-notes"
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  placeholder="Any additional observations..."
                />
              </Field>
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            {step === 2 && (
              <Button
                type="submit"
                disabled={saving || (!isCatheter && !form.has_urine && !form.has_stool)}
              >
                {saving ? 'Saving...' : (editing ? 'Update' : 'Save')}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default OutputModal;
