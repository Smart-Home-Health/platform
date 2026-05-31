import React, { useEffect, useMemo, useState } from 'react';
import config from '../../config';
import { XIcon } from '../Icons';
// Pull in AdminV2 styles so the admin-v2-* classes resolve when this form is
// mounted from outside the admin-v2 route (e.g. the live dashboard History
// modal). Vite dedupes with admin pages that also import it.
import '../../pages/admin-v2/AdminV2.css';

/**
 * Shared "Record Vitals" form used by AdminV2 Vitals → Record and by the
 * live dashboard's History modal + per-chart quick-add. Lifts the previously
 * inline AdminV2Vitals form so the two consumers share the same UX.
 *
 * Props:
 *   patientId              — required, drives the API calls
 *   onSaved                — called after a successful submit (refresh hook)
 *   allowCreateDefinitions — when true, render the inline custom-vital-
 *                            definition manager (AdminV2 only)
 *   singleVitalType        — when set, render only that one vital's card and
 *                            hide the toggle bar (used by chart quick-add)
 *   defaultDateTime        — datetime-local string to seed the timestamp
 *   showNotes              — default true; quick-add can set false
 *   submitLabel            — primary button text (default 'Record Vitals')
 */

const BUILT_IN_VITAL_TYPES = [
  { value: 'blood_pressure',   label: 'Blood Pressure',   unit: 'mmHg' },
  { value: 'heart_rate',       label: 'Heart Rate',       unit: 'bpm' },
  { value: 'spo2',             label: 'SpO2',             unit: '%' },
  { value: 'temperature',      label: 'Temperature',      unit: '°F' },
  { value: 'respiratory_rate', label: 'Respiratory Rate', unit: '/min' },
  { value: 'weight',           label: 'Weight',           unit: 'lbs' },
];

function localDateTimeString() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

const emptyForm = (timestamp) => ({
  heart_rate: '', spo2: '', respiratory_rate: '',
  temperature: '', weight: '',
  systolic: '', diastolic: '',
  notes: '',
  timestamp,
});

export default function RecordVitalsForm({
  patientId,
  onSaved,
  allowCreateDefinitions = false,
  singleVitalType,
  defaultDateTime,
  showNotes = true,
  submitLabel = 'Record Vitals',
}) {
  const initialTimestamp = defaultDateTime || localDateTimeString();

  const [vitalsFormData, setVitalsFormData] = useState(() => emptyForm(initialTimestamp));
  const [customVitalsData, setCustomVitalsData] = useState({});
  const [customDefinitions, setCustomDefinitions] = useState([]);

  // Which vitals are "open" in the form. In single-vital mode this is forced
  // to one row; otherwise the user toggles them from the bar.
  const [activeVitals, setActiveVitals] = useState(() => {
    if (singleVitalType) return { [singleVitalType]: true };
    return {
      blood_pressure: false, heart_rate: false, spo2: false,
      respiratory_rate: false, temperature: false, weight: false,
    };
  });

  const [newCustomName, setNewCustomName] = useState('');
  const [newCustomUnit, setNewCustomUnit] = useState('');
  const [showCustomManager, setShowCustomManager] = useState(false);
  const [customDefError, setCustomDefError] = useState(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Reset timestamp/form state when the seed changes (e.g. modal reopens).
  useEffect(() => {
    setVitalsFormData(emptyForm(defaultDateTime || localDateTimeString()));
    setCustomVitalsData({});
    setError(null);
    setSuccess(null);
  }, [defaultDateTime]);

  // Custom vital definitions for this patient.
  useEffect(() => {
    if (!patientId) { setCustomDefinitions([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${config.apiUrl}/api/vitals/custom-definitions?patient_id=${patientId}`,
          { credentials: 'include' }
        );
        if (!res.ok) return;
        const defs = await res.json();
        if (!cancelled) setCustomDefinitions(defs);
      } catch (e) {
        console.error('Error loading custom vital definitions:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [patientId]);

  const toggleVital = (key) => {
    if (singleVitalType) return; // locked
    setActiveVitals(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAddCustomDefinition = async () => {
    if (!newCustomName.trim() || !patientId) return;
    setCustomDefError(null);
    try {
      const res = await fetch(`${config.apiUrl}/api/vitals/custom-definitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          patient_id: patientId,
          name: newCustomName.trim(),
          unit: newCustomUnit.trim() || null,
          display_label: newCustomName.trim(),
        }),
      });
      if (res.ok) {
        const def = await res.json();
        setCustomDefinitions(prev => [...prev, def]);
        setActiveVitals(prev => ({ ...prev, [def.name]: true }));
        setNewCustomName('');
        setNewCustomUnit('');
      } else {
        const err = await res.json().catch(() => ({}));
        setCustomDefError(err.detail || 'Failed to create');
      }
    } catch (err) {
      setCustomDefError(err.message);
    }
  };

  const handleDeleteCustomDefinition = async (defId) => {
    try {
      const res = await fetch(
        `${config.apiUrl}/api/vitals/custom-definitions/${defId}`,
        { method: 'DELETE', credentials: 'include' }
      );
      if (!res.ok) return;
      setCustomDefinitions(prev => {
        const removed = prev.find(d => d.id === defId);
        if (removed) {
          setActiveVitals(a => { const next = { ...a }; delete next[removed.name]; return next; });
          setCustomVitalsData(d => { const next = { ...d }; delete next[removed.name]; return next; });
        }
        return prev.filter(d => d.id !== defId);
      });
    } catch (err) {
      console.error('Error deleting custom vital definition:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!patientId) { setError('Please select a patient first'); return; }

    const hasBuiltIn = vitalsFormData.heart_rate || vitalsFormData.spo2 ||
                     vitalsFormData.respiratory_rate || vitalsFormData.temperature ||
                     vitalsFormData.weight || (vitalsFormData.systolic && vitalsFormData.diastolic);
    const hasCustom = Object.values(customVitalsData).some(v => v !== '' && v != null);
    const hasNotes = vitalsFormData.notes?.trim();

    if (!hasBuiltIn && !hasCustom && !hasNotes) {
      setError('Please enter at least one vital or notes');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const base = {
        patient_id: patientId,
        datetime: vitalsFormData.timestamp,
        notes: vitalsFormData.notes,
      };
      const promises = [];
      const post = (vital_type, value) => promises.push(fetch(
        `${config.apiUrl}/api/vitals/manual`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ ...base, vital_type, value }),
        }
      ));

      if (vitalsFormData.systolic && vitalsFormData.diastolic) {
        const systolic = parseFloat(vitalsFormData.systolic);
        const diastolic = parseFloat(vitalsFormData.diastolic);
        const map = Math.round(diastolic + (systolic - diastolic) / 3);
        post('blood_pressure', { systolic, diastolic, map });
      }
      if (vitalsFormData.heart_rate)       post('heart_rate',       parseFloat(vitalsFormData.heart_rate));
      if (vitalsFormData.spo2)             post('spo2',             parseFloat(vitalsFormData.spo2));
      if (vitalsFormData.respiratory_rate) post('respiratory_rate', parseFloat(vitalsFormData.respiratory_rate));
      if (vitalsFormData.temperature)      post('temperature',      parseFloat(vitalsFormData.temperature));
      if (vitalsFormData.weight)           post('weight',           parseFloat(vitalsFormData.weight));

      for (const def of customDefinitions) {
        const val = customVitalsData[def.name];
        if (val !== undefined && val !== '' && val != null) {
          post(def.name, parseFloat(val));
        }
      }

      if (promises.length > 0) {
        const results = await Promise.all(promises);
        if (results.every(r => r.ok)) {
          const count = promises.length;
          setSuccess(`${count} vital${count > 1 ? 's' : ''} recorded successfully!`);
          setVitalsFormData(emptyForm(defaultDateTime || localDateTimeString()));
          setCustomVitalsData({});
          if (onSaved) onSaved();
          setTimeout(() => setSuccess(null), 3000);
        } else {
          throw new Error('Some vitals failed to save');
        }
      } else if (hasNotes) {
        setSuccess('Notes saved!');
        setVitalsFormData(prev => ({ ...prev, notes: '' }));
        if (onSaved) onSaved();
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Render gate: when locked to a single vital, only render the matching card.
  const renderBuiltInCard = (key) => {
    if (singleVitalType && singleVitalType !== key) return null;
    if (!singleVitalType && !activeVitals[key]) return null;

    switch (key) {
      case 'blood_pressure':
        return (
          <div className="vital-input-card" key="bp">
            <div className="vital-input-header">
              <span className="vital-input-title">Blood Pressure</span>
            </div>
            <div className="vital-input-fields bp-fields">
              <div className="vital-input-group">
                <input type="text" inputMode="decimal" value={vitalsFormData.systolic}
                  onChange={e => setVitalsFormData(p => ({ ...p, systolic: e.target.value }))}
                  className="vital-input" placeholder="120" />
                <span className="vital-input-label">Systolic</span>
              </div>
              <span className="bp-separator">/</span>
              <div className="vital-input-group">
                <input type="text" inputMode="decimal" value={vitalsFormData.diastolic}
                  onChange={e => setVitalsFormData(p => ({ ...p, diastolic: e.target.value }))}
                  className="vital-input" placeholder="80" />
                <span className="vital-input-label">Diastolic</span>
              </div>
              <span className="vital-unit">mmHg</span>
            </div>
          </div>
        );
      case 'heart_rate':
        return singleCard('heart_rate', 'Heart Rate', 'bpm', '72');
      case 'spo2':
        return singleCard('spo2', 'SpO2', '%', '98');
      case 'respiratory_rate':
        return singleCard('respiratory_rate', 'Respiratory Rate', '/min', '16');
      case 'temperature':
        return singleCard('temperature', 'Temperature', '°F', '98.6');
      case 'weight':
        return singleCard('weight', 'Weight', 'lbs', '150');
      default:
        return null;
    }
  };

  const singleCard = (key, title, unit, placeholder) => (
    <div className="vital-input-card" key={key}>
      <div className="vital-input-header">
        <span className="vital-input-title">{title}</span>
      </div>
      <div className="vital-input-fields single-field">
        <input
          type="text" inputMode="decimal"
          value={vitalsFormData[key]}
          onChange={e => setVitalsFormData(p => ({ ...p, [key]: e.target.value }))}
          className="vital-input large"
          placeholder={placeholder}
        />
        <span className="vital-unit">{unit}</span>
      </div>
    </div>
  );

  const customRenderable = useMemo(() => {
    if (singleVitalType) {
      const def = customDefinitions.find(d => d.name === singleVitalType);
      return def ? [def] : [];
    }
    return customDefinitions.filter(def => activeVitals[def.name]);
  }, [customDefinitions, activeVitals, singleVitalType]);

  return (
    <div className="admin-v2-vitals-content">
      <div className="admin-v2-settings-card">
        <form onSubmit={handleSubmit}>
          {/* Status messages */}
          {error && <div className="admin-v2-form-error" style={{ marginBottom: 12 }}>{error}</div>}
          {success && (
            <div style={{
              padding: '8px 12px', borderRadius: 6, marginBottom: 12,
              background: 'rgba(63,185,80,0.15)',
              border: '1px solid rgba(63,185,80,0.5)',
              color: '#3fb950', fontSize: 13,
            }}>{success}</div>
          )}

          {/* Date/Time Header */}
          <div className="vitals-form-header">
            <div className="vitals-datetime-field">
              <label>Date/Time</label>
              <input
                type="datetime-local"
                value={vitalsFormData.timestamp}
                onChange={e => setVitalsFormData(p => ({ ...p, timestamp: e.target.value }))}
                className="admin-v2-input"
                required
              />
            </div>
          </div>

          {/* Toggle bar — hidden in single-vital mode */}
          {!singleVitalType && (
            <div className="vitals-toggle-bar">
              {BUILT_IN_VITAL_TYPES.map(vt => (
                <button
                  key={vt.value}
                  type="button"
                  className={`vitals-toggle-btn ${activeVitals[vt.value] ? 'active' : ''}`}
                  onClick={() => toggleVital(vt.value)}
                >{vt.label}</button>
              ))}
              {customDefinitions.map(def => (
                <button
                  key={def.name}
                  type="button"
                  className={`vitals-toggle-btn custom ${activeVitals[def.name] ? 'active' : ''}`}
                  onClick={() => toggleVital(def.name)}
                >{def.display_label}</button>
              ))}
              {allowCreateDefinitions && (
                <button
                  type="button"
                  className="vitals-toggle-btn manage-custom"
                  onClick={() => setShowCustomManager(!showCustomManager)}
                  title="Manage custom vitals"
                >+</button>
              )}
            </div>
          )}

          {/* Custom Vital Definition Manager — admin only */}
          {allowCreateDefinitions && showCustomManager && !singleVitalType && (
            <div className="custom-vitals-manager">
              <div className="custom-vitals-manager-header"><span>Custom Vitals</span></div>
              <div className="custom-vitals-add-row">
                <input
                  type="text" value={newCustomName}
                  onChange={e => setNewCustomName(e.target.value)}
                  placeholder="Name (e.g. Blood Glucose)"
                  className="admin-v2-input"
                />
                <input
                  type="text" value={newCustomUnit}
                  onChange={e => setNewCustomUnit(e.target.value)}
                  placeholder="Unit (e.g. mg/dL)"
                  className="admin-v2-input"
                  style={{ maxWidth: 120 }}
                />
                <button
                  type="button"
                  className="admin-v2-btn admin-v2-btn-primary"
                  onClick={handleAddCustomDefinition}
                  disabled={!newCustomName.trim()}
                >Add</button>
              </div>
              {customDefError && <div className="custom-vitals-error">{customDefError}</div>}
              {customDefinitions.length > 0 && (
                <div className="custom-vitals-list">
                  {customDefinitions.map(def => (
                    <div key={def.id} className="custom-vital-item">
                      <span className="custom-vital-name">{def.display_label}</span>
                      {def.unit && <span className="custom-vital-unit">{def.unit}</span>}
                      <button
                        type="button" className="custom-vital-delete"
                        onClick={() => handleDeleteCustomDefinition(def.id)}
                        title="Remove custom vital"
                      ><XIcon size={14} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Vital Input Cards */}
          <div className="vitals-input-grid">
            {BUILT_IN_VITAL_TYPES.map(vt => renderBuiltInCard(vt.value))}
            {customRenderable.map(def => (
              <div className="vital-input-card" key={def.name}>
                <div className="vital-input-header">
                  <span className="vital-input-title">{def.display_label}</span>
                </div>
                <div className="vital-input-fields single-field">
                  <input
                    type="text" inputMode="decimal"
                    value={customVitalsData[def.name] || ''}
                    onChange={e => setCustomVitalsData(p => ({ ...p, [def.name]: e.target.value }))}
                    className="vital-input large"
                    placeholder="—"
                  />
                  {def.unit && <span className="vital-unit">{def.unit}</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Notes */}
          {showNotes && (
            <div className="vitals-notes-section">
              <label>Notes (optional)</label>
              <textarea
                value={vitalsFormData.notes}
                onChange={e => setVitalsFormData(p => ({ ...p, notes: e.target.value }))}
                className="admin-v2-input"
                rows={2}
                placeholder="Any additional notes..."
              />
            </div>
          )}

          {/* Submit */}
          <div className="vitals-form-actions">
            <button
              type="submit"
              disabled={saving || !patientId}
              className="admin-v2-btn admin-v2-btn-primary vitals-submit-btn"
            >
              {saving ? 'Saving...' : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
