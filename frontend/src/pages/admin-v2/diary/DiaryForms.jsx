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
import { useState } from 'react';
import EntityModal, { EmField } from '../../../components/vc/EntityModal';
import { getLocalDateTimeString } from '../../../utils/timezone';

const recorder = 'Did you press the recorder button?';
const eegButtons = [
  { label: 'Ate' }, { label: 'Woke up' }, { label: 'Fell asleep' }, { label: 'Took medicine' },
  { label: 'Seizure', question: recorder }, { label: 'Questionable event', question: recorder },
];

function localInput(instant) {
  if (!instant) return '';
  const date = new Date(instant);
  return getLocalDateTimeString(date) + ':' + String(date.getSeconds()).padStart(2, '0');
}

function fromInput(value, original) {
  const parsed = new Date(value);
  if (original) {
    const wallTime = localInput(parsed);
    if (wallTime === localInput(original)) return original;
    // datetime-local omits the offset. Keep the original occurrence of a
    // repeated hour only if that offset still gives the requested wall time.
    const offsetChange = new Date(original).getTimezoneOffset() - parsed.getTimezoneOffset();
    const withOriginalOffset = new Date(parsed.getTime() + offsetChange * 60000);
    if (localInput(withOriginalOffset) === wallTime) return withOriginalOffset.toISOString();
  }
  return parsed.toISOString();
}

const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export function DiarySettings({ initial, reusable, onSave, onClose, busy, error }) {
  const [name, setName] = useState(initial?.name || '');
  const [originalStart] = useState(() => initial?.starts_at || new Date().toISOString());
  const [start, setStart] = useState(() => localInput(originalStart));
  const [end, setEnd] = useState(localInput(initial?.ends_at));
  const [buttons, setButtons] = useState(initial?.buttons || [{ label: 'Observation' }]);
  const [meds, setMeds] = useState(initial?.include_medications ?? false);
  const [nutrition, setNutrition] = useState(initial?.include_nutrition ?? false);
  const update = (i, field, value) => setButtons(buttons.map((b, index) => index === i ? { ...b, [field]: value } : b));
  const useEEG = () => {
    setName('Home EEG');
    setButtons(eegButtons);
    setMeds(true);
    setNutrition(true);
  };
  const submit = e => {
    e.preventDefault();
    onSave({ name: name.trim(), starts_at: fromInput(start, originalStart),
      ends_at: end ? fromInput(end, initial?.ends_at) : null, buttons: buttons.map(b => ({
        label: b.label.trim(), question: b.question?.trim() || null,
      })), include_medications: meds, include_nutrition: nutrition });
  };
  return <EntityModal open title={initial ? 'Diary settings' : 'New diary'} onOpenChange={o => { if (!o && !busy) onClose(); }}>
    <form className="em-form diary-form" onSubmit={submit}>
      {!initial && <div className="diary-templates">
        <button type="button" className="cfg-ghost" onClick={useEEG}>Use Home EEG template</button>
        {reusable && <button type="button" className="cfg-ghost" onClick={() => {
          setName(reusable.name); setButtons(reusable.buttons);
          setMeds(reusable.include_medications); setNutrition(reusable.include_nutrition);
        }}>Reuse {reusable.name} settings</button>}
      </div>}
      <EmField label="Diary name" htmlFor="diary-name"><input id="diary-name" className="em-input" required maxLength={120}
        value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sleep diary" /></EmField>
      <div className="diary-dates">
        <EmField label="Starts" htmlFor="diary-start"><input id="diary-start" className="em-input" type="datetime-local"
          required step="1" value={start} onChange={e => setStart(e.target.value)} /></EmField>
        <EmField label="Ends" optional htmlFor="diary-end"><input id="diary-end" className="em-input" type="datetime-local"
          step="1" value={end} onChange={e => setEnd(e.target.value)} /></EmField>
      </div>
      <span className="em-hint">Enter times in {deviceZone}.</span>
      <fieldset className="diary-fieldset"><legend>Quick buttons</legend>
        {buttons.map((b, i) => <div key={i} className="diary-button-fields">
          <input className="em-input" aria-label={`Button ${i + 1} label`} placeholder="Event name"
            required maxLength={80} value={b.label} onChange={e => update(i, 'label', e.target.value)} />
          <button type="button" className="cfg-ghost" disabled={buttons.length === 1} aria-label={`Remove button ${i + 1}`}
            onClick={() => setButtons(buttons.filter((_, index) => index !== i))}>Remove</button>
          <input className="em-input diary-question" aria-label={`Follow-up question for button ${i + 1}`}
            placeholder="Optional yes/no question" maxLength={160} value={b.question || ''}
            onChange={e => update(i, 'question', e.target.value)} />
        </div>)}
        <button type="button" className="cfg-ghost" disabled={buttons.length >= 32}
          onClick={() => setButtons([...buttons, { label: '' }])}>Add button</button>
      </fieldset>
      <fieldset className="diary-fieldset"><legend>Include existing records</legend>
        <label><input type="checkbox" checked={meds} onChange={e => setMeds(e.target.checked)} /> Medication doses</label>
        <label><input type="checkbox" checked={nutrition} onChange={e => setNutrition(e.target.checked)} /> Nutrition intake</label>
      </fieldset>
      {error && <p className="em-error" role="alert">{error}</p>}
      <div className="em-footer">
        <button type="button" className="em-cancel" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="em-submit" disabled={busy}>{initial ? 'Save settings' : 'Create diary'}</button>
      </div>
    </form>
  </EntityModal>;
}

export function ObservationForm({ event, onSave, onClose, onRemove, error, busy }) {
  const [time, setTime] = useState(localInput(event.at));
  const [note, setNote] = useState(event.note || '');
  const [answer, setAnswer] = useState(event.answer || '');
  const [removing, setRemoving] = useState(false);
  function submit(e) {
    e.preventDefault();
    onSave({ observed_at: fromInput(time, event.at), note, answer: answer || null });
  }
  return <EntityModal open title={event.label} onOpenChange={o => { if (!o && !busy) onClose(); }}>
    <form className="em-form diary-form" onSubmit={submit}>
      <EmField label="Observed at" htmlFor="diary-time" hint={deviceZone}>
        <input id="diary-time" type="datetime-local" className="em-input" required step="1"
          value={time} onChange={e => setTime(e.target.value)} />
      </EmField>
      {event.question && <fieldset className="diary-fieldset"><legend>{event.question}</legend>
        <div className="diary-answers">{['Yes', 'No', 'Unsure'].map(option =>
          <label key={option}><input type="radio" name="answer" checked={answer === option}
            onChange={() => setAnswer(option)} /> {option}</label>)}</div>
      </fieldset>}
      <EmField label="Description" optional htmlFor="diary-note"><textarea id="diary-note" className="em-input"
        rows={3} maxLength={8000} value={note} onChange={e => setNote(e.target.value)} /></EmField>
      {event.id && (removing
        ? <div role="group" aria-label="Confirm removal">Remove this observation?
            <button type="button" className="cfg-ghost" disabled={busy} onClick={onRemove}>Yes, remove</button>
            <button type="button" className="cfg-ghost" onClick={() => setRemoving(false)}>Keep</button>
          </div>
        : <div><button type="button" className="cfg-ghost" disabled={busy} onClick={() => setRemoving(true)}>Remove observation</button></div>)}
      {error && <p className="em-error" role="alert">{error}</p>}
      <div className="em-footer">
        <button type="button" className="em-cancel" disabled={busy} onClick={onClose}>{event.id ? 'Close' : 'Cancel'}</button>
        <button className="em-submit" disabled={busy}>{event.id ? 'Save changes' : 'Record event'}</button>
      </div>
    </form>
  </EntityModal>;
}
