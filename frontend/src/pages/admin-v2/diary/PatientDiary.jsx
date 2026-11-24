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
import { MoreHorizontalIcon, PlusIcon } from '../../../components/Icons';
import EntityModal from '../../../components/vc/EntityModal';
import AdminV2Layout from '../AdminV2Layout';
import PatientGate from '../components/PatientGate';
import { PatientDayTimeline } from '../AdminV2MonitoringTimeline';
import { DiarySettings, ObservationForm } from './DiaryForms';
import DiaryTimeline from './DiaryTimeline';
import { stamp, studyRange } from './diaryTime';
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

function DiaryDetail({ diary, diaries, patient, base, canWrite, zone, onSelect, onCreate, onUpdated }) {
  const path = base + '/' + diary.id;
  const [entries, setEntries] = useState(null);
  const [view, setView] = useState('day');
  const [loadError, setLoadError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [event, setEvent] = useState(null);
  const [panel, setPanel] = useState(null);
  const returnFocus = useRef(null);
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

  function close() {
    setEvent(null); setPanel(null); setError('');
    requestAnimationFrame(() => returnFocus.current?.focus({ preventScroll: true }));
  }
  function openPanel(name, trigger) {
    returnFocus.current = trigger;
    setPanel(name);
  }
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
      setPending(null); setPanel(null); setEvent(saved); setNotice('Event recorded.');
    });
  }
  function tap(button) {
    if (inFlight.current) return;
    const at = new Date();
    const request_id = newEncounterUid();
    const inStudy = at >= new Date(diary.starts_at) && (!diary.ends_at || at <= new Date(diary.ends_at));
    if (!button || !inStudy) {
      setError(''); setPanel(null);
      setEvent({ ...button, request_id, at: inStudy ? at.toISOString() : null });
      return;
    }
    capture({ label: button.label, observed_at: at.toISOString(), request_id });
  }
  const cannotPrint = !entries || !!loadError || busy;
  const editObservation = canWrite && !pending && !busy ? entry => {
    returnFocus.current = document.activeElement;
    setError(''); setEvent(entry);
  } : null;
  return <section className="diary-detail">
    <header className="diary-header"><div className="diary-study">
      {diaries.length > 1 ? <select className="em-input" aria-label="Select diary" value={diary.id}
        onChange={e => onSelect(Number(e.target.value))}>
        {diaries.map(d => <option key={d.id} value={d.id}>{d.name} · {stamp(d.starts_at, zone)}</option>)}
      </select> : <h1>{diary.name}</h1>}
      <p>{studyRange(diary.starts_at, diary.ends_at, zone)}</p></div>
      <button type="button" className="diary-more" aria-label="Diary actions" title="Diary actions" aria-haspopup="dialog"
        onClick={e => openPanel('actions', e.currentTarget)}><MoreHorizontalIcon size={22} /></button>
    </header>
    <span role="status">{busy ? 'Saving…' : notice}</span>
    <div className="diary-views" role="group" aria-label="Diary view">
      <button type="button" aria-pressed={view === 'day'} onClick={() => setView('day')}>Day timeline</button>
      <button type="button" aria-pressed={view === 'entries'} onClick={() => setView('entries')}>All entries</button>
    </div>
    {loadError && <p role="alert" className="em-error">{loadError}</p>}
    {view === 'day' && <PatientDayTimeline patient={patient} diaryPath={path} diaryEntries={entries}
      refresh={refresh} onEditObservation={editObservation} />}
    {entries ? <DiaryTimeline patient={patient} diary={diary} entries={entries} zone={zone}
      showEntries={view === 'entries'} onEdit={editObservation} /> : !loadError && <p>Loading events…</p>}
    {canWrite && <button type="button" className="diary-add" aria-label="Record an event" title="Record an event"
      aria-haspopup="dialog" onClick={e => openPanel('record', e.currentTarget)}><PlusIcon size={26} /></button>}
    {panel === 'actions' && <EntityModal open title="Diary actions" onOpenChange={open => { if (!open) close(); }}>
      <p className="em-hint">{stamp(diary.starts_at, zone)} – {diary.ends_at ? stamp(diary.ends_at, zone) : 'Ongoing'}</p>
      <div className="diary-buttons">
        {canWrite && <button className="em-cancel" disabled={busy || !!pending}
          onClick={() => { setError(''); setPanel('settings'); }}>Settings</button>}
        {canWrite && <button className="em-cancel" disabled={busy || !!pending}
          onClick={() => { setPanel(null); onCreate(); }}>New diary</button>}
        <button className="em-cancel" disabled={busy} onClick={() => { close(); setRefresh(n => n + 1); }}>Refresh</button>
        <button className="em-cancel" disabled={cannotPrint} onClick={() => { close(); window.print(); }}>Print diary</button>
      </div>
    </EntityModal>}
    {canWrite && panel === 'record' && <EntityModal open title="Record an event"
      onOpenChange={open => { if (!open && !busy && !pending) close(); }} hideClose={busy || !!pending}>
      <div className="diary-buttons">
        <button className="em-cancel diary-custom" disabled={busy || !!pending} onClick={() => tap(null)}>Custom</button>
        {diary.buttons.map(b => <button key={b.label} className="em-cancel" disabled={busy || !!pending}
          onClick={() => tap(b)}>{b.label.toLowerCase() === 'custom' ? b.label + ' (preset)' : b.label}</button>)}
      </div>
      {(diary.include_medications || diary.include_nutrition) && <p className="em-hint">
        Entries from enabled logs appear automatically.
      </p>}
      {error && <div className="em-error" role="alert">{error}</div>}
      {pending && !busy && <div className="em-footer">
        <button className="em-cancel" onClick={() => { setPending(null); close(); }}>Dismiss</button>
        <button className="em-submit" onClick={() => capture(pending)}>Retry capture</button>
      </div>}
    </EntityModal>}
    {panel === 'settings' && <DiarySettings initial={diary} error={error} busy={busy} onClose={close} onSave={data => mutate(async () => {
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
    {error && !creating && <p className="em-error" role="alert">{error} <button className="cfg-ghost" onClick={() => setReload(n => n + 1)}>Retry</button></p>}
    {!data && !error && <p>Loading diaries…</p>}
    {data?.diaries.length === 0 && <><p>No diaries for this patient yet.</p>
      {data.can_write && <button className="em-submit" onClick={() => setCreating(true)}>New diary</button>}</>}
    {activeDiary && <DiaryDetail key={activeDiary.id} diary={activeDiary} diaries={data.diaries} patient={patient} base={base}
      canWrite={data.can_write} zone={data.timezone} onSelect={setId} onCreate={() => setCreating(true)} onUpdated={selectSaved} />}
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
