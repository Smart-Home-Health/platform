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

const newEncounter = () => ({
  encounterUid: newEncounterUid(),
  startedAt: new Date().toISOString(),
  readings: {},
});

function encounterLabel(startedAt) {
  const d = new Date(startedAt);
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

export function ConnectionChip({ connection }) {
  const { connected, lastSuccess } = connection;
  const stamp = lastSuccess
    ? lastSuccess.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;
  return (
    <span className={`vc-chip ${connected ? '' : 'offline'}`}>
      <span className="vc-chip-dot" aria-hidden="true" />
      {connected
        ? `Connected${stamp ? ` · Synced ${stamp}` : ''}`
        : `Offline${stamp ? ` · Last synced ${stamp}` : ''}`}
    </span>
  );
}

export default function CaptureVitalsPanel({ patient, connection, embedded = false }) {
  const patientId = patient.id;
  const { connected, markSuccess } = connection;

  const [customDefs, setCustomDefs] = useState([]);
  const [ranges, setRanges] = useState([]);
  const [encounter, setEncounter] = useState(newEncounter);
  const [resumable, setResumable] = useState(null);
  const [openVital, setOpenVital] = useState(null);
  const [toast, setToast] = useState(null);
  const [justSaved, setJustSaved] = useState([]);
  const [saving, setSaving] = useState(false);
  const toastTimer = useRef(null);

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
        measured_at: r.measuredAt,
        source: 'manual',
        confirmed_against_warning: Boolean(r.confirmedAgainstWarning),
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
        setJustSaved(savedKeys);
        setTimeout(() => setJustSaved([]), 4000);
        showToast(`Vitals saved · ${savedKeys.length} reading${savedKeys.length === 1 ? '' : 's'}`);
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
        <span>Encounter</span>
        <span>{encounterLabel(encounter.startedAt)}</span>
        {embedded && <ConnectionChip connection={connection} />}
      </div>

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
