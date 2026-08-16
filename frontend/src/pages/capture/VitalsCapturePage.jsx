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
// Mobile-first vitals capture surface (/capture). Full-screen dark
// bedside-monitor chrome of its own; patient selection comes from the
// shared AdminPatientContext (Layout provides it on every route).
import '@fontsource/ibm-plex-mono/300.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import './capture.css';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircleIcon, AlertIcon } from '../../components/Icons';
import { useAdminPatient } from '../../contexts/AdminPatientContext';
import config, { apiFetch } from '../../config';
import { buildConfigs } from './vitalConfigs';
import CaptureSheet from './components/CaptureSheet';
import CaptureTabBar from './components/CaptureTabBar';
import VitalTile from './components/VitalTile';
import { clearDraft, loadDraft, newEncounterUid, saveDraft } from './useCaptureDraft';
import useConnectionStatus from './useConnectionStatus';

const newEncounter = () => ({
  encounterUid: newEncounterUid(),
  startedAt: new Date().toISOString(),
  readings: {},
});

function encounterLabel(startedAt) {
  const d = new Date(startedAt);
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })} · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

export default function VitalsCapturePage() {
  const { patients: contextPatients, selectedPatient, selectPatient } = useAdminPatient();
  const { connected, lastSuccess, markSuccess } = useConnectionStatus();
  const patientId = selectedPatient?.id ?? null;

  // AdminPatientContext skips its fetch while the session is read-restricted
  // (monitoring mode), but recording is an allowed action there and the server
  // is the authority on /api/patients — so this page fetches its own list as
  // a fallback rather than showing "no patients" on a phone that can record.
  const [localPatients, setLocalPatients] = useState([]);
  useEffect(() => {
    if (contextPatients.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const resp = await apiFetch(`${config.apiUrl}/api/patients`);
        if (resp.ok && !cancelled) setLocalPatients(await resp.json());
      } catch {
        // offline / genuinely restricted: the empty-state copy handles it
      }
    })();
    return () => { cancelled = true; };
  }, [contextPatients.length]);
  const patients = contextPatients.length > 0 ? contextPatients : localPatients;

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
    if (!patientId) return;
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
    const readings = Object.values(encounter.readings).map((r) => ({
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
        const savedKeys = Object.keys(encounter.readings);
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

  if (!selectedPatient) {
    return (
      <div className="vitals-capture">
        <header className="vc-header">
          <span className="vc-header-patient">Capture vitals</span>
        </header>
        <p className="vc-progress-hint" style={{ padding: '2rem 1rem' }}>
          {patients.length === 0
            ? 'No patients available.'
            : 'Pick a patient under More to start capturing.'}
        </p>
        <div className="vc-footer" />
        <CaptureTabBar patients={patients} selectedPatient={null}
                       onSelectPatient={selectPatient} />
      </div>
    );
  }

  return (
    <div className="vitals-capture">
      <header className="vc-header">
        <span className="vc-header-patient">
          {selectedPatient.first_name} {selectedPatient.last_name}
        </span>
        <span className={`vc-chip ${connected ? '' : 'offline'}`}>
          <span className="vc-chip-dot" aria-hidden="true" />
          {connected
            ? `Connected${lastSuccess ? ` · Synced ${lastSuccess.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}`
            : `Offline${lastSuccess ? ` · Last synced ${lastSuccess.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}`}
        </span>
      </header>

      {toast && (
        <div className={`vc-toast ${toast.kind === 'error' ? 'error' : ''}`} role="status">
          {toast.kind === 'error' ? <AlertIcon size={16} /> : <CheckCircleIcon size={16} />}
          {toast.message}
        </div>
      )}

      <h1 className="vc-title">Capture vitals</h1>

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

      <CaptureTabBar patients={patients} selectedPatient={selectedPatient}
                     onSelectPatient={selectPatient} />

      {openConfig && (
        <CaptureSheet
          key={openVital}
          config={openConfig}
          ranges={ranges}
          patientFirstName={selectedPatient.first_name}
          initialValues={openInitial}
          onCommit={commitReading}
          onClose={() => setOpenVital(null)}
        />
      )}
    </div>
  );
}
