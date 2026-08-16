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
// Symptom logging in the bedside-monitor aesthetic (from the supplied
// mockup): observed-time card, symptom picker sheet with search, recent
// chips, 0–10 severity scale with clinical color bands, optional
// location/duration/note/care-action, sticky log footer.
import { useEffect, useMemo, useState } from 'react';
import config, { apiFetch } from '../../../config';
import {
  CalendarIcon, CheckCircleIcon, ChevronRightIcon, ClockIcon, PlusIcon,
  SearchIcon, AlertIcon,
} from '../../../components/Icons';
import BottomSheet from '../../capture/components/BottomSheet';
import '../symptom-log.css';

const titleCase = (s) =>
  (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// Severity bands: 0 idle, 1–3 mild (green), 4–7 moderate (amber),
// 8–10 severe (red — clinical concern, the one place red belongs).
const bandFor = (sev) => {
  if (sev === 0) return { key: 'none', label: 'None' };
  if (sev <= 3) return { key: 'mild', label: 'Mild' };
  if (sev <= 7) return { key: 'moderate', label: 'Moderate' };
  return { key: 'severe', label: 'Severe' };
};

const DURATION_OPTIONS = ['Ongoing', '15 minutes', '30 minutes', '1 hour',
                          '2 hours', '4 hours', 'All day'];

const nowLocalInput = () => {
  const d = new Date();
  d.setSeconds(0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function SymptomLogForm({ patient, symptomTypes = [],
                                         bodyLocations = [], onLogged }) {
  // Recent entries feed the quick chips; fetched here because the page only
  // loads symptoms for its Active/History views.
  const [recentSymptoms, setRecentSymptoms] = useState([]);
  const [observedAt, setObservedAt] = useState(nowLocalInput);
  const [timeEdited, setTimeEdited] = useState(false);
  const [editingTime, setEditingTime] = useState(false);
  const [symptomType, setSymptomType] = useState('');
  const [severity, setSeverity] = useState(5);
  const [location, setLocation] = useState('');
  const [duration, setDuration] = useState('');
  const [note, setNote] = useState('');
  const [careAction, setCareAction] = useState('');
  const [showCareAction, setShowCareAction] = useState(false);
  const [stillActive, setStillActive] = useState(true);
  const [sheet, setSheet] = useState(null); // 'type' | 'location' | 'duration'
  const [typeSearch, setTypeSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!patient?.id) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const resp = await apiFetch(`${config.apiUrl}/api/symptoms/patient/${patient.id}?limit=20`);
        if (resp.ok && !cancelled) setRecentSymptoms(await resp.json());
      } catch { /* chips are optional */ }
    })();
    return () => { cancelled = true; };
  }, [patient?.id]);

  const recentTypes = useMemo(() => {
    const seen = [];
    for (const s of recentSymptoms) {
      if (s.symptom_type && !seen.includes(s.symptom_type)) seen.push(s.symptom_type);
      if (seen.length === 3) break;
    }
    return seen;
  }, [recentSymptoms]);

  const filteredTypes = useMemo(() => {
    const q = typeSearch.trim().toLowerCase();
    if (!q) return symptomTypes;
    return symptomTypes.filter((t) => titleCase(t).toLowerCase().includes(q));
  }, [symptomTypes, typeSearch]);

  const band = bandFor(severity);
  const missingRequired = symptomType ? 0 : 1;
  const observed = new Date(observedAt);
  const timeLabel = observed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const dateLabel = observed.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

  const showToast = (message, kind = 'success') => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 4000);
  };

  const reset = () => {
    setObservedAt(nowLocalInput());
    setTimeEdited(false);
    setEditingTime(false);
    setSymptomType('');
    setSeverity(5);
    setLocation('');
    setDuration('');
    setNote('');
    setCareAction('');
    setShowCareAction(false);
    setStillActive(true);
  };

  const submit = async () => {
    if (!symptomType || saving) return;
    setSaving(true);
    try {
      const resp = await apiFetch(`${config.apiUrl}/api/symptoms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patient.id,
          symptom_type: symptomType,
          severity,
          location: location || null,
          duration: duration || null,
          description: note || null,
          notes: careAction || null,
          timestamp: observedAt,
          is_resolved: !stillActive,
        }),
      });
      if (resp.ok) {
        showToast(`Symptom logged · ${titleCase(symptomType)}`);
        reset();
        onLogged?.();
      } else {
        const data = await resp.json().catch(() => ({}));
        showToast(typeof data.detail === 'string' ? data.detail : 'Could not log symptom', 'error');
      }
    } catch {
      showToast('Could not log symptom — check connection', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="symptom-log">
      {toast && (
        <div className={`sl-toast ${toast.kind === 'error' ? 'error' : ''}`} role="status">
          {toast.kind === 'error' ? <AlertIcon size={16} /> : <CheckCircleIcon size={16} />}
          {toast.message}
        </div>
      )}

      {/* Observed time */}
      <div className="sl-observed">
        <div className="sl-observed-main">
          <span className="sl-label">Observed</span>
          <span className="sl-observed-time">
            {!timeEdited && <>Now <span className="sl-dot" aria-hidden="true" /> </>}
            {timeLabel}
            <span className="sl-observed-date">{dateLabel}</span>
          </span>
        </div>
        <button type="button" className="sl-ghost-btn"
                onClick={() => setEditingTime((v) => !v)}>
          <CalendarIcon size={15} /> {editingTime ? 'Done' : 'Edit time'}
        </button>
      </div>
      {editingTime && (
        <input
          type="datetime-local"
          className="sl-datetime"
          value={observedAt}
          max={nowLocalInput()}
          aria-label="Observed date and time"
          onChange={(e) => { setObservedAt(e.target.value); setTimeEdited(true); }}
        />
      )}

      {/* Symptom type */}
      <span className="sl-label">Symptom type <span className="sl-req">*</span></span>
      <button type="button" className={`sl-picker ${symptomType ? 'set' : ''}`}
              onClick={() => { setTypeSearch(''); setSheet('type'); }}>
        <span>{symptomType ? titleCase(symptomType) : 'Select symptom'}</span>
        <span className="sl-picker-icons">
          <SearchIcon size={16} />
          <ChevronRightIcon size={16} />
        </span>
      </button>

      {recentTypes.length > 0 && (
        <>
          <span className="sl-label dim">Recent choices <span className="sl-optional">(optional)</span></span>
          <div className="sl-recent">
            {recentTypes.map((t) => (
              <button key={t} type="button"
                      className={`sl-chip ${symptomType === t ? 'selected' : ''}`}
                      onClick={() => setSymptomType(t)}>
                <ClockIcon size={13} /> {titleCase(t)}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Severity */}
      <span className="sl-label">Severity (0–10) <span className="sl-req">*</span></span>
      <div className="sl-severity-hero">
        <span className={`sl-severity-value band-${band.key}`}>{severity}</span>
        <span className="sl-severity-denominator">/ 10</span>
        <span className="sl-severity-divider" aria-hidden="true" />
        <span className={`sl-severity-band band-${band.key}`}>
          <span className="sl-band-dot" aria-hidden="true" /> {band.label}
        </span>
      </div>
      <div className="sl-severity-scale" role="radiogroup" aria-label="Severity 0 to 10">
        {Array.from({ length: 11 }, (_, n) => {
          const cellBand = bandFor(n).key;
          return (
            <button key={n} type="button" role="radio" aria-checked={severity === n}
                    className={`sl-severity-cell band-${cellBand} ${severity === n ? 'selected' : ''}`}
                    onClick={() => setSeverity(n)}>
              {n}
            </button>
          );
        })}
      </div>
      <div className="sl-severity-legend" aria-hidden="true">
        <span>None</span>
        <span className="moderate">Moderate</span>
        <span className="severe">Severe</span>
      </div>

      {/* Location + duration */}
      <div className="sl-two-col">
        <div>
          <span className="sl-label dim">Body location <span className="sl-optional">(optional)</span></span>
          <button type="button" className={`sl-picker compact ${location ? 'set' : ''}`}
                  onClick={() => setSheet('location')}>
            <span>{location ? titleCase(location) : 'Not specified'}</span>
            <ChevronRightIcon size={16} />
          </button>
        </div>
        <div>
          <span className="sl-label dim">Duration <span className="sl-optional">(optional)</span></span>
          <button type="button" className={`sl-picker compact ${duration ? 'set' : ''}`}
                  onClick={() => setSheet('duration')}>
            <span>{duration || 'Ongoing / set duration'}</span>
            <ChevronRightIcon size={16} />
          </button>
        </div>
      </div>

      {/* Note */}
      <span className="sl-label dim">Observation note <span className="sl-optional">· optional</span></span>
      <div className="sl-note-wrap">
        <textarea
          className="sl-note"
          maxLength={250}
          rows={4}
          placeholder="Describe what you observed, triggers, response…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <span className="sl-note-count">{note.length} / 250</span>
      </div>

      {/* Care action */}
      <button type="button" className="sl-expander"
              aria-expanded={showCareAction}
              onClick={() => setShowCareAction((v) => !v)}>
        Add care action / response <PlusIcon size={16} />
      </button>
      {showCareAction && (
        <textarea
          className="sl-note"
          rows={3}
          placeholder="What was done in response (medication given, position change…)"
          value={careAction}
          onChange={(e) => setCareAction(e.target.value)}
        />
      )}

      {/* Still active */}
      <label className="sl-active-row">
        <span className="sl-label">Symptom still active</span>
        <input
          type="checkbox"
          className="sl-checkbox"
          checked={stillActive}
          onChange={(e) => setStillActive(e.target.checked)}
        />
      </label>

      {/* Footer */}
      <div className="sl-footer">
        <span className={`sl-footer-status ${missingRequired ? 'missing' : 'ready'}`}>
          {missingRequired
            ? `${missingRequired} required field${missingRequired === 1 ? '' : 's'}`
            : 'Ready to log'}
        </span>
        <button type="button" className="sl-submit"
                disabled={missingRequired > 0 || saving} onClick={submit}>
          {saving ? 'Logging…' : 'Log symptom'}
        </button>
      </div>

      {/* Pickers */}
      {sheet === 'type' && (
        <BottomSheet open onOpenChange={(o) => { if (!o) setSheet(null); }}
                     onSwipeDown={() => setSheet(null)} title="Symptom Type">
          <div className="sl-sheet-search">
            <SearchIcon size={16} />
            <input
              type="text"
              placeholder="Search symptoms…"
              value={typeSearch}
              onChange={(e) => setTypeSearch(e.target.value)}
            />
          </div>
          <div className="sl-sheet-list">
            {filteredTypes.map((t) => (
              <button key={t} type="button"
                      className={`sl-sheet-item ${symptomType === t ? 'selected' : ''}`}
                      onClick={() => { setSymptomType(t); setSheet(null); }}>
                {titleCase(t)}
              </button>
            ))}
            {filteredTypes.length === 0 && (
              <p className="sl-sheet-empty">No symptoms match “{typeSearch}”.</p>
            )}
          </div>
        </BottomSheet>
      )}
      {sheet === 'location' && (
        <BottomSheet open onOpenChange={(o) => { if (!o) setSheet(null); }}
                     onSwipeDown={() => setSheet(null)} title="Body Location">
          <div className="sl-sheet-list">
            <button type="button" className={`sl-sheet-item ${!location ? 'selected' : ''}`}
                    onClick={() => { setLocation(''); setSheet(null); }}>
              Not specified
            </button>
            {bodyLocations.map((l) => (
              <button key={l} type="button"
                      className={`sl-sheet-item ${location === l ? 'selected' : ''}`}
                      onClick={() => { setLocation(l); setSheet(null); }}>
                {titleCase(l)}
              </button>
            ))}
          </div>
        </BottomSheet>
      )}
      {sheet === 'duration' && (
        <BottomSheet open onOpenChange={(o) => { if (!o) setSheet(null); }}
                     onSwipeDown={() => setSheet(null)} title="Duration">
          <div className="sl-sheet-list">
            <button type="button" className={`sl-sheet-item ${!duration ? 'selected' : ''}`}
                    onClick={() => { setDuration(''); setSheet(null); }}>
              Not specified
            </button>
            {DURATION_OPTIONS.map((d) => (
              <button key={d} type="button"
                      className={`sl-sheet-item ${duration === d ? 'selected' : ''}`}
                      onClick={() => { setDuration(d); setSheet(null); }}>
                {d}
              </button>
            ))}
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
