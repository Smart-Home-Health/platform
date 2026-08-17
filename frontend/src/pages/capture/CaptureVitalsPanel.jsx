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
// The capture experience itself (grid, sheet, draft, save), shared by two
// shells: the standalone phone surface at /capture and the embedded
// admin-v2 vitals page at /care/vitals (inside the hamburger layout).
import '../../styles/vcFonts';
import './capture.css';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircleIcon, AlertIcon } from '../../components/Icons';
import config, { apiFetch } from '../../config';
import { buildConfigs } from './vitalConfigs';
import CaptureSheet from './components/CaptureSheet';
import VitalTile from './components/VitalTile';
import { clearDraft, loadDraft, newEncounterUid, saveDraft } from './useCaptureDraft';
import ConnectionChip from '../../components/ConnectionChip';

const newEncounter = () => ({
  encounterUid: newEncounterUid(),
  startedAt: new Date().toISOString(),
  readings: {},
});

function encounterLabel(startedAt) {
  const d = new Date(startedAt);
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

// <input type="datetime-local"> wants local wall-clock with no zone, so the
// ISO string has to be shifted out of UTC before slicing.
function toLocalInput(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

/* Vitals the connected oximeter can supply, in the order the panel shows them.
 * Keyed to BUILTIN_CONFIGS; `read` pulls the value off the board's live
 * sensor state. */
const SNAPSHOT_VITALS = [
  { key: 'spo2', read: (s) => s.spo2 },
  { key: 'heart_rate', read: (s) => s.bpm },
];

export default function CaptureVitalsPanel({
  patient,
  connection,
  embedded = false,
  layout = 'grid',
  snapshot = null,
  onSaved,
}) {
  const patientId = patient.id;
  const { connected, markSuccess } = connection;
  const rows = layout === 'rows';

  const [customDefs, setCustomDefs] = useState([]);
  const [ranges, setRanges] = useState([]);
  const [encounter, setEncounter] = useState(newEncounter);
  const [resumable, setResumable] = useState(null);
  const [openVital, setOpenVital] = useState(null);
  const [toast, setToast] = useState(null);
  const [justSaved, setJustSaved] = useState([]);
  const [saving, setSaving] = useState(false);
  const toastTimer = useRef(null);
  // Row layout extras (mirrors the bedside panel design): a set-level time
  // override for readings taken a few minutes ago, and a note carried onto
  // every reading in the encounter.
  const [timeOverride, setTimeOverride] = useState(null);
  const [editingTime, setEditingTime] = useState(false);
  const [note, setNote] = useState('');
  const [editingNote, setEditingNote] = useState(false);

  const configs = useMemo(() => buildConfigs(customDefs), [customDefs]);

  // Per-patient data: custom definitions, ranges, and any resumable draft.
  useEffect(() => {
    if (!patientId) return undefined;
    setEncounter(newEncounter());
    setResumable(loadDraft(patientId));
    setOpenVital(null);
    let cancelled = false;
    (async () => {
      try {
        const [defsResp, rangesResp] = await Promise.all([
          apiFetch(`${config.apiUrl}/api/vitals/custom-definitions?patient_id=${patientId}`),
          apiFetch(`${config.apiUrl}/api/vitals/ranges?patient_id=${patientId}`),
        ]);
        if (cancelled) return;
        if (defsResp.ok) setCustomDefs(await defsResp.json());
        if (rangesResp.ok) setRanges((await rangesResp.json()).ranges || []);
      } catch {
        // Offline start: capture still works, warnings just can't fire.
      }
    })();
    return () => { cancelled = true; };
  }, [patientId]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const showToast = useCallback((message, kind = 'success') => {
    clearTimeout(toastTimer.current);
    setToast({ message, kind });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const readingCount = Object.keys(encounter.readings).length;
  const requiredKeys = useMemo(
    () => ranges.filter((r) => r.required && (r.field_key || '') === '').map((r) => r.vital_key),
    [ranges]);
  const missingRequired = requiredKeys.filter((k) => !encounter.readings[k]);
  const allRequiredDone = requiredKeys.length > 0 && missingRequired.length === 0;
  const saveState = readingCount === 0 ? 'disabled'
    : (requiredKeys.length === 0 || allRequiredDone) ? 'primary' : 'neutral';

  const commitReading = (reading) => {
    setEncounter((prev) => {
      const next = { ...prev, readings: { ...prev.readings, [reading.vitalKey]: reading } };
      saveDraft(patientId, next);
      return next;
    });
    setOpenVital(null);
  };

  // Accept a live oximeter value into the encounter. Recorded with
  // source 'pulse_ox' — the record must not claim someone typed it, and the
  // backend keys the SpO2 LOINC code off exactly this distinction.
  const acceptSnapshot = (vitalKey, value, unit) => {
    setEncounter((prev) => {
      const next = {
        ...prev,
        readings: {
          ...prev.readings,
          [vitalKey]: {
            vitalKey, value, unit, source: 'pulse_ox',
            measuredAt: new Date().toISOString(),
          },
        },
      };
      saveDraft(patientId, next);
      return next;
    });
  };

  const removeReading = (vitalKey) => {
    setEncounter((prev) => {
      const readings = { ...prev.readings };
      delete readings[vitalKey];
      const next = { ...prev, readings };
      saveDraft(patientId, next);
      return next;
    });
  };

  const handleSave = async () => {
    if (saving || readingCount === 0 || !connected) return;
    setSaving(true);
    // A resumed draft can hold a reading for a custom vital that was since
    // deleted in configuration — drop it rather than 422 the whole batch.
    const knownKeys = new Set(configs.map((c) => c.key));
    const readings = Object.values(encounter.readings)
      .filter((r) => knownKeys.has(r.vitalKey))
      .map((r) => ({
        vital_key: r.vitalKey,
        ...(r.vitalKey === 'blood_pressure'
          ? { systolic: r.systolic, diastolic: r.diastolic }
          : { value: r.value }),
        unit: r.unit,
        // A set-level time override wins: the caregiver is stating when the
        // readings were actually taken, not when they typed them in.
        measured_at: timeOverride || r.measuredAt,
        source: r.source === 'pulse_ox' ? 'pulse_ox' : 'manual',
        confirmed_against_warning: Boolean(r.confirmedAgainstWarning),
        ...(note.trim() ? { note: note.trim() } : {}),
      }));
    try {
      const resp = await apiFetch(`${config.apiUrl}/api/vitals/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: patientId,
          encounter_uid: encounter.encounterUid,
          readings,
        }),
      });
      if (resp.ok) {
        // Count/highlight only what was actually sent (unknown/deleted custom
        // vitals were filtered out of the payload above).
        const savedKeys = readings.map((r) => r.vital_key);
        clearDraft(patientId);
        markSuccess();
        setEncounter(newEncounter());
        setTimeOverride(null);
        setNote('');
        setEditingNote(false);
        setJustSaved(savedKeys);
        setTimeout(() => setJustSaved([]), 4000);
        showToast(`Vitals saved · ${savedKeys.length} reading${savedKeys.length === 1 ? '' : 's'}`);
        if (onSaved) onSaved(savedKeys);
      } else if (resp.status === 409 || resp.status === 422) {
        // Server ranges disagreed with ours (stale client). Reopen the first
        // offending vital so the caregiver sees the server's range.
        const detail = (await resp.json())?.detail;
        const offender = detail?.warnings?.[0] || detail?.errors?.[0];
        if (offender?.vital_key) {
          try {
            const rr = await apiFetch(`${config.apiUrl}/api/vitals/ranges?patient_id=${patientId}`);
            if (rr.ok) setRanges((await rr.json()).ranges || []);
          } catch { /* keep old ranges */ }
          removeReading(offender.vital_key);
          setOpenVital(offender.vital_key);
          showToast('One reading needs another look', 'error');
        } else {
          showToast('Could not save — check the values', 'error');
        }
      } else {
        showToast('Could not save — try again', 'error');
      }
    } catch {
      showToast('Could not save — check connection', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Throw away the in-progress encounter (distinct from the resume banner's
  // Discard, which drops a draft from a *previous* sitting).
  const clearEncounter = () => {
    clearDraft(patientId);
    setEncounter(newEncounter());
    setTimeOverride(null);
    setEditingTime(false);
    setNote('');
    setEditingNote(false);
    setOpenVital(null);
  };

  const resumeDraft = () => {
    setEncounter(resumable);
    setResumable(null);
  };
  const discardDraft = () => {
    clearDraft(patientId);
    setResumable(null);
  };

  const openConfig = configs.find((c) => c.key === openVital);
  const openInitial = openConfig && encounter.readings[openVital]
    ? (openConfig.key === 'blood_pressure'
        ? [encounter.readings[openVital].systolic, encounter.readings[openVital].diastolic]
        : [encounter.readings[openVital].value])
    : null;

  const counter = `${readingCount} of ${configs.length} recorded` +
    (requiredKeys.length > 0 && allRequiredDone ? ' · All required complete' : '');
  const remaining = configs.length - readingCount;

  // Row layout splits the list the way the bedside does: what the connected
  // oximeter can answer for, and what a person has to measure.
  const snapshotKeys = snapshot ? SNAPSHOT_VITALS.map((s) => s.key) : [];
  const snapshotConfigs = snapshot
    ? SNAPSHOT_VITALS
        .map((s) => ({ config: configs.find((c) => c.key === s.key), live: s.read(snapshot.values || {}) }))
        .filter((s) => s.config)
    : [];
  const manualConfigs = configs.filter((c) => !snapshotKeys.includes(c.key));
  // Say which of the three situations we're in rather than only "offline":
  // a stalled probe still shows its last values, and accepting one of those
  // silently would be the wrong kind of quiet.
  const hasLive = snapshotConfigs.some((s) => s.live != null);
  const snapshotCaption = !hasLive
    ? 'Pulse ox offline — enter these by hand'
    : snapshot.streaming
      ? 'From the pulse ox at encounter time'
      : 'Pulse ox not streaming — these may be stale';

  return (
    <>
      {toast && (
        <div className={`vc-toast ${toast.kind === 'error' ? 'error' : ''}`} role="status">
          {toast.kind === 'error' ? <AlertIcon size={16} /> : <CheckCircleIcon size={16} />}
          {toast.message}
        </div>
      )}

      {resumable && (
        <div className="vc-resume" role="alert">
          <span>
            Unsaved readings from {encounterLabel(resumable.startedAt)}
            {' '}({Object.keys(resumable.readings).length}).
          </span>
          <span className="vc-resume-actions">
            <button type="button" className="vc-btn secondary" onClick={discardDraft}>
              Discard
            </button>
            <button type="button" className="vc-btn primary" onClick={resumeDraft}>
              Resume
            </button>
          </span>
        </div>
      )}

      <div className="vc-encounter vc-label">
        <span>{rows && !timeOverride ? 'Now' : 'Encounter'}</span>
        <span>{encounterLabel(timeOverride || encounter.startedAt)}</span>
        {rows && (
          <button
            type="button"
            className="vc-linklike vc-encounter-edit"
            onClick={() => setEditingTime((v) => !v)}
            aria-expanded={editingTime}
          >
            {editingTime ? 'Done' : 'Edit time'}
          </button>
        )}
        {embedded && <ConnectionChip connection={connection} />}
      </div>

      {rows && editingTime && (
        <div className="vc-encounter-time">
          <label className="vc-caption" htmlFor="vc-measured-at">
            When were these taken?
          </label>
          <input
            id="vc-measured-at"
            type="datetime-local"
            className="vc-text-input"
            value={toLocalInput(timeOverride || encounter.startedAt)}
            max={toLocalInput(new Date().toISOString())}
            onChange={(e) => setTimeOverride(
              e.target.value ? new Date(e.target.value).toISOString() : null)}
          />
          {timeOverride && (
            <button type="button" className="vc-linklike" onClick={() => setTimeOverride(null)}>
              Reset to now
            </button>
          )}
        </div>
      )}

      {rows ? (
        <>
          {snapshotConfigs.length > 0 && (
            <>
              <div className="vc-section vc-label">
                <span>Connected snapshot</span>
                <span className="vc-caption">{snapshotCaption}</span>
              </div>
              <div className="vc-rows">
                {snapshotConfigs.map(({ config: c, live }) => (
                  <VitalTile
                    key={c.key}
                    config={c}
                    reading={encounter.readings[c.key]}
                    justSaved={justSaved.includes(c.key)}
                    onOpen={() => setOpenVital(c.key)}
                    row
                    liveValue={live}
                    onAcceptLive={live == null
                      ? null
                      : () => acceptSnapshot(c.key, live, c.unit)}
                  />
                ))}
              </div>
            </>
          )}
          <div className="vc-section vc-label">
            <span>{snapshotConfigs.length > 0 ? 'Manual readings' : 'Readings'}</span>
          </div>
          <div className="vc-rows">
            {manualConfigs.map((c) => (
              <VitalTile
                key={c.key}
                config={c}
                reading={encounter.readings[c.key]}
                justSaved={justSaved.includes(c.key)}
                onOpen={() => setOpenVital(c.key)}
                row
              />
            ))}
          </div>
        </>
      ) : (
        <div className="vc-grid">
          {configs.map((c) => (
            <VitalTile
              key={c.key}
              config={c}
              reading={encounter.readings[c.key]}
              justSaved={justSaved.includes(c.key)}
              onOpen={() => setOpenVital(c.key)}
            />
          ))}
        </div>
      )}

      {rows && (
        <div className="vc-note">
          {editingNote || note ? (
            <>
              <label className="vc-caption" htmlFor="vc-note">Note for this set</label>
              <textarea
                id="vc-note"
                className="vc-text-input"
                rows={2}
                value={note}
                maxLength={500}
                placeholder="Context that applies to all readings — position, activity, device…"
                onChange={(e) => setNote(e.target.value)}
              />
            </>
          ) : (
            <button type="button" className="vc-note-add" onClick={() => setEditingNote(true)}>
              <span>Add note</span>
              <span aria-hidden="true">›</span>
            </button>
          )}
        </div>
      )}

      <div className="vc-footer">
        <div className="vc-progress" aria-live="polite">{counter}</div>
        {remaining > 0 && (
          <p className="vc-progress-hint">
            {missingRequired.length > 0
              ? `${missingRequired.length} required reading${missingRequired.length === 1 ? '' : 's'} remaining`
              : `${remaining} optional reading${remaining === 1 ? '' : 's'} remaining`}
          </p>
        )}
        {!connected && readingCount > 0 && (
          <p className="vc-progress-hint">
            Offline — readings are kept on this device until the hub is reachable.
          </p>
        )}
        <button
          type="button"
          className={`vc-save ${saveState}`}
          disabled={saveState === 'disabled' || saving || !connected}
          onClick={handleSave}
        >
          {saving ? 'Saving…' : 'Save vitals'}
        </button>
        {rows && (
          <button
            type="button"
            className="vc-btn secondary vc-clear"
            disabled={readingCount === 0 && !note && !timeOverride}
            onClick={clearEncounter}
          >
            Clear draft
          </button>
        )}
      </div>

      {openConfig && (
        <CaptureSheet
          key={openVital}
          config={openConfig}
          ranges={ranges}
          patientFirstName={patient.first_name}
          initialValues={openInitial}
          onCommit={commitReading}
          onClose={() => setOpenVital(null)}
        />
      )}
    </>
  );
}
