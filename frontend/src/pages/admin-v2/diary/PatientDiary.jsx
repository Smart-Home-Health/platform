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
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import config, { apiFetch } from '../../../config';
import { useAdminPatient } from '../../../contexts/AdminPatientContext';
import { useAuth } from '../../../contexts/AuthContext';
import { newEncounterUid } from '../../capture/useCaptureDraft';
import AdminV2Layout from '../AdminV2Layout';
import PatientGate from '../components/PatientGate';
import { PatientDayTimeline } from '../AdminV2MonitoringTimeline';
import { DiarySettings, ObservationForm } from './DiaryForms';
import DiaryTimeline from './DiaryTimeline';
import { stamp } from './diaryTime';
import './diary.css';

async function request(path, method = 'GET', payload, signal) {
  const res = await apiFetch(config.apiUrl + path, { method, signal,
    ...(payload && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = Array.isArray(data.detail) ? data.detail.map(e => e.msg).join('. ') : data.detail;
    throw new Error(detail || 'Could not complete the diary request.');
  }
  return res.status === 204 ? null : res.json();
}

function DiaryDetail({ diary, patient, base, canWrite, zone, onUpdated }) {
  const path = base + '/' + diary.id;
  const [entries, setEntries] = useState(null);
  const [view, setView] = useState('day');
  const [loadError, setLoadError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [event, setEvent] = useState(null);
  const [settings, setSettings] = useState(false);
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const ac = new AbortController();
    async function load() {
      try {
        const rows = await request(path + '/timeline', 'GET', undefined, ac.signal);
        if (!ac.signal.aborted) { setEntries(rows); setLoadError(''); }
      } catch (err) { if (!ac.signal.aborted) setLoadError(err.message); }
    }
    load();
    const timer = setInterval(() => { if (!document.hidden) load(); }, 60000);
    return () => { ac.abort(); clearInterval(timer); };
  }, [path, refresh]);

  function close() { setEvent(null); setSettings(false); setError(''); }
  async function mutate(action) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(''); setNotice('');
    try {
      await action();
      setEntries(null);
      setRefresh(n => n + 1);
    } catch (err) { setError(err.message); }
    finally { inFlight.current = false; setBusy(false); }
  }
  function capture(payload) {
    setPending(payload);
    mutate(async () => {
      const saved = await request(path + '/events', 'POST', payload);
      setPending(null); setEvent(saved); setNotice('Event recorded.');
    });
  }
  function tap(button) {
    const at = new Date();
    const request_id = newEncounterUid();
    if (at < new Date(diary.starts_at) || (diary.ends_at && at > new Date(diary.ends_at))) {
      setError(''); setEvent({ ...button, request_id }); return;
    }
    capture({ label: button.label, observed_at: at.toISOString(), request_id });
  }
  const cannotPrint = !entries || !!loadError || busy;
  const editObservation = canWrite && !pending && !busy ? entry => { setError(''); setEvent(entry); } : null;
  return <section className="diary-detail">
    <header className="diary-header"><div><h2>{diary.name}</h2>
      <p>{stamp(diary.starts_at, zone)} – {diary.ends_at ? stamp(diary.ends_at, zone) : 'Ongoing'}</p></div>
      {canWrite && <button className="cfg-ghost" onClick={() => { setSettings(true); setError(''); }}
        disabled={busy || !!pending}>Settings</button>}
    </header>
    {canWrite && <section className="diary-section"><h3>Record an event</h3>
      <div className="diary-buttons">{diary.buttons.map(b => <button key={b.label} type="button" className="em-cancel"
        disabled={busy || !!pending} onClick={() => tap(b)}>{b.label}</button>)}</div>
      {(diary.include_medications || diary.include_nutrition) && <p className="em-hint">
        Entries from enabled logs appear automatically. Use a button for an observation you’re recording separately.
      </p>}
    </section>}
    <span role="status">{busy ? 'Saving…' : notice}</span>
    {error && !event && !settings && <div className="em-error" role="alert">{error}
      {pending && <><button className="cfg-ghost" onClick={() => capture(pending)} disabled={busy}>Retry capture</button>
        <button className="cfg-ghost" onClick={() => { setPending(null); setError(''); }}>Dismiss</button></>}
    </div>}
    <div className="diary-header"><div className="diary-views" role="group" aria-label="Diary view">
      <button type="button" aria-pressed={view === 'day'} onClick={() => setView('day')}>Day timeline</button>
      <button type="button" aria-pressed={view === 'entries'} onClick={() => setView('entries')}>All entries</button>
    </div><div className="diary-tools">
      <button className="cfg-ghost" disabled={busy} onClick={() => setRefresh(n => n + 1)}>Refresh</button>
      <button className="cfg-ghost" disabled={cannotPrint} onClick={() => window.print()}>Print diary</button>
    </div></div>
    {loadError && <p role="alert" className="em-error">{loadError}</p>}
    {view === 'day' && <PatientDayTimeline patient={patient} diaryPath={path} diaryEntries={entries}
      refresh={refresh} onEditObservation={editObservation} />}
    {entries ? <DiaryTimeline patient={patient} diary={diary} entries={entries} zone={zone}
      showEntries={view === 'entries'} onEdit={editObservation} /> : !loadError && <p>Loading events…</p>}
    {settings && <DiarySettings initial={diary} error={error} busy={busy} onClose={close} onSave={data => mutate(async () => {
      onUpdated(await request(path, 'PUT', data)); close();
    })} />}
    {event && <ObservationForm event={event} error={error} busy={busy} onClose={close}
      onSave={data => mutate(async () => {
        if (event.id) await request(path + '/events/' + event.id, 'PUT', data);
        else await request(path + '/events', 'POST', { ...data, request_id: event.request_id, label: event.label });
        close(); setNotice('Observation saved.');
      })}
      onRemove={() => mutate(async () => {
        await request(path + '/events/' + event.id, 'DELETE'); close(); setNotice('Observation removed.');
      })} />}
  </section>;
}

function PatientDiaries({ patient }) {
  const base = `/api/patients/${patient.id}/diaries`;
  const [data, setData] = useState(null);
  const [id, setId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const ac = new AbortController();
    request(base, 'GET', undefined, ac.signal).then(result => {
      if (!ac.signal.aborted) { setData(result); setError(''); }
    }).catch(err => { if (!ac.signal.aborted) setError(err.message); });
    return () => ac.abort();
  }, [base, reload]);
  const selectSaved = useCallback(diary => {
    setData(prev => ({ ...prev, diaries: [diary, ...prev.diaries.filter(d => d.id !== diary.id)] }));
    setId(diary.id);
  }, []);
  const activeDiary = data?.diaries.find(d => d.id === id) || data?.diaries[0];
  async function create(form) {
    setBusy(true); setError('');
    try { selectSaved(await request(base, 'POST', form)); setCreating(false); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <div className="admin-v2-page diary-page">
    <div className="diary-header"><h1>Event diary</h1>
      {data?.can_write && <button className="em-submit" onClick={() => setCreating(true)}>New diary</button>}</div>
    <p className="diary-patient">{patient.first_name} {patient.last_name}</p>
    {error && !creating && <p className="em-error" role="alert">{error} <button className="cfg-ghost" onClick={() => setReload(n => n + 1)}>Retry</button></p>}
    {!data && !error && <p>Loading diaries…</p>}
    {data?.diaries.length === 0 && <p>No diaries for this patient yet.</p>}
    {data?.diaries.length > 1 && <label className="em-field">Select diary
      <select className="em-input" value={activeDiary.id} onChange={e => setId(Number(e.target.value))}>
        {data.diaries.map(d => <option key={d.id} value={d.id}>{d.name} · {stamp(d.starts_at, data.timezone)}</option>)}
      </select></label>}
    {activeDiary && <DiaryDetail key={activeDiary.id} diary={activeDiary} patient={patient} base={base}
      canWrite={data.can_write} zone={data.timezone} onUpdated={selectSaved} />}
    {creating && <DiarySettings reusable={activeDiary} onSave={create} busy={busy} error={error} onClose={() => { setCreating(false); setError(''); }} />}
  </div>;
}

export default function PatientDiary() {
  const [params] = useSearchParams();
  const { selectedPatient, patients, selectPatient, loadingPatients } = useAdminPatient();
  const { hasReadAccess, user } = useAuth();
  const requested = params.get('patient');
  const patient = requested ? patients.find(p => String(p.id) === requested) : selectedPatient;
  useEffect(() => {
    if (patient && requested && selectedPatient?.id !== patient.id) selectPatient(patient);
  }, [patient, requested, selectedPatient, selectPatient]);
  return <AdminV2Layout>
    {hasReadAccess && (patient
      ? <PatientDiaries key={`${user?.id}-${patient.id}`} patient={patient} />
      : requested ? <p>{loadingPatients ? 'Loading patient…' : 'Patient unavailable.'}</p> : <PatientGate />)}
  </AdminV2Layout>;
}
