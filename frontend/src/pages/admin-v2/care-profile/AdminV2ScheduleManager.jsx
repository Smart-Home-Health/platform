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
import { Link, useParams } from 'react-router-dom';
import { EmField, EmSelect } from '../../../components/vc/EntityModal';
import { useAuth } from '../../../contexts/AuthContext';
import { scheduleManagerService } from '../../../services/scheduleManager';
import { CfgFields, CfgGroup, CfgSection } from '../settings/CfgSection';
import { BathroomCheckCard } from './BathroomCheckCard';
import { formatDateTime } from './careProfileFormat';
import ReminderDefaults from './ReminderDefaults';
import CareProfileSection from './CareProfileSection';
import useCareProfile from './useCareProfile';

const HISTORY_LABELS = {
  dry: 'Checked dry', changed: 'Diaper changed', snooze: 'Suggestion snoozed', dismiss: 'Suggestion dismissed',
};

function Toggle({ checked, onChange, children }) {
  return <label className="sm-toggle">
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    <span>{children}</span>
  </label>;
}

function CheckList({ title, choices, selected, onChange, empty = 'Add a recurring intake in the Nutrition plan to select it here.' }) {
  return (
    <fieldset className="sm-choices">
      <legend className="em-label">{title}</legend>
      <div className="cfg-checks">
        {choices.map(({ id, name }) => (
          <Toggle key={id} checked={selected.includes(id)}
            onChange={(checked) => onChange(checked ? [...selected, id] : selected.filter((item) => item !== id))}>
            {name}
          </Toggle>
        ))}
        {!choices.length && <p className="cfg-fine">{empty}</p>}
      </div>
    </fieldset>
  );
}

function Minutes({ field, label, draft, edit, min = 1 }) {
  return <EmField htmlFor={field} label={label}>
    <input className="em-input" id={field} type="number" inputMode="numeric" step="1"
      min={min} max="1440" required value={draft[field] ?? ''}
      onChange={(event) => edit({ [field]: event.target.value === '' ? null : Number(event.target.value) })} />
  </EmField>;
}

function FeedRules({ draft, schedules, edit }) {
  const managed = schedules.filter((row) => draft.feed_schedule_ids.includes(row.id));
  const selectFeeds = (ids) => {
    const clearTarget = !ids.includes(draft.overnight_schedule_id);
    edit({
      feed_schedule_ids: ids,
      ...(clearTarget && { overnight_schedule_id: null, overnight_target: null }),
    });
  };
  return <CfgSection title="Feed timing">
    <CfgGroup>
      <Toggle checked={draft.feeds_enabled} onChange={(feeds_enabled) => edit({ feeds_enabled })}>
        Adjust feed times when the day runs late
      </Toggle>
      {draft.feeds_enabled && <>
        <p className="cfg-fine">Choose the feeds and scheduled water that share a gap. Each starts at its usual time or later, allowing the previous feed’s recorded start and run time to count.</p>
        <CheckList title="Feeds to adjust" choices={schedules} selected={draft.feed_schedule_ids} onChange={selectFeeds} />
        <CfgFields>
          <Minutes field="min_gap_minutes" label="Minimum minutes between starts" draft={draft} edit={edit} />
          <EmField label="Overnight feed" htmlFor="sm-overnight">
            <EmSelect id="sm-overnight" value={draft.overnight_schedule_id ?? ''}
              onChange={(event) => edit({
                overnight_schedule_id: event.target.value ? Number(event.target.value) : null,
                ...(!event.target.value && { overnight_target: null }),
              })}>
              <option value="">None</option>
              {managed.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </EmSelect>
          </EmField>
          {draft.overnight_schedule_id != null && <EmField label="Preferred latest start" optional htmlFor="sm-target" hint="Use the care account’s time zone.">
            <input className="em-input" type="time" id="sm-target" value={draft.overnight_target || ''}
              onChange={(event) => edit({ overnight_target: event.target.value || null })} />
          </EmField>}
        </CfgFields>
      </>}
    </CfgGroup>
  </CfgSection>;
}

function CheckRules({ draft, schedules, caregivers, audienceNeedsReview, audienceEdited, edit, patientId }) {
  const selected = caregivers.filter(({ id }) => draft.check_recipient_ids?.includes(id)).map(({ id }) => id);
  const review = audienceNeedsReview && !audienceEdited;
  return <CfgSection title="Bathroom checks">
    <CfgGroup>
      <Toggle checked={draft.manual_checks_enabled} onChange={(manual_checks_enabled) => edit({ manual_checks_enabled })}>
        Record bathroom checks manually
      </Toggle>
      <Toggle checked={draft.checks_enabled} onChange={(checks_enabled) => edit({ checks_enabled })}>
        Suggest a diaper check after selected feeds
      </Toggle>
      {draft.checks_enabled && <>
        <p className="cfg-fine">Suggest a check after a logged feed when there has been no recent recorded change.</p>
        <CheckList title="Feeds that can prompt a check" choices={schedules} selected={draft.check_feed_ids}
          onChange={(check_feed_ids) => edit({ check_feed_ids })} />
        <CfgFields>
          <Minutes field="check_delay_minutes" label="Wait after feed starts (min)" min={0} draft={draft} edit={edit} />
          <Minutes field="check_window_minutes" label="Keep suggestion available (min)" draft={draft} edit={edit} />
          <Minutes field="change_lookback_minutes" label="A change counts as recent for (min)" draft={draft} edit={edit} />
          <Minutes field="check_cooldown_minutes" label="Minimum time between checks (min)" draft={draft} edit={edit} />
        </CfgFields>
        <div className="em-field">
          <span className="em-label">Suggestion hours</span>
          <p className="cfg-fine">Leave both times blank for any time. Use the care account’s time zone. The window can cross midnight.</p>
          <CfgFields>
            <EmField label="From" htmlFor="sm-check-start">
              <input id="sm-check-start" className="em-input" type="time" value={draft.check_hours_start || ''}
                required={Boolean(draft.check_hours_end)} onChange={(event) => edit({ check_hours_start: event.target.value || null })} />
            </EmField>
            <EmField label="Until" htmlFor="sm-check-end">
              <input id="sm-check-end" className="em-input" type="time" value={draft.check_hours_end || ''}
                required={Boolean(draft.check_hours_start)} onChange={(event) => edit({ check_hours_end: event.target.value || null })} />
            </EmField>
          </CfgFields>
        </div>
      </>}
      {(draft.checks_enabled || audienceNeedsReview) &&
        <div className="em-field">
          {review && <p className="cfg-fine" role="status">
            A previously selected caregiver is no longer available. Suggestions are still restricted. Saving other rules keeps the current audience.
          </p>}
          <CheckList title="Who sees suggestions" choices={caregivers} selected={selected}
            onChange={(check_recipient_ids) => edit({ check_recipient_ids })}
            empty="No eligible caregivers are available to select." />
          <p className="cfg-fine">
            {review && !selected.length ? 'No eligible caregivers are currently selected.'
              : selected.length
              ? 'Only selected caregivers see suggestions.'
              : 'Everyone with recording access sees suggestions. Select names to limit who sees them.'}
            {' '}Logged checks stay in the shared care history.
          </p>
          {(review || selected.length > 0) && <div className="sm-actions">
            {review && selected.length > 0 && <button type="button" className="cfg-ghost"
              onClick={() => edit({ check_recipient_ids: selected })}>Keep selected caregivers</button>}
            <button type="button" className="cfg-ghost" onClick={() => edit({ check_recipient_ids: [] })}>Include all caregivers</button>
          </div>}
        </div>}
      <div className="sm-actions">
        <Link className="cfg-ghost" to={`/care/nutrition/plan?patient=${encodeURIComponent(patientId)}`}>Set up fixed-time checks in Nutrition plan</Link>
      </div>
    </CfgGroup>
  </CfgSection>;
}

function previewTime(value, usualStart) {
  const time = new Date(value);
  if (!value || Number.isNaN(time.getTime())) return '—';
  const showDay = time.toDateString() !== new Date(usualStart).toDateString();
  return time.toLocaleString(undefined, {
    ...(showDay && { month: 'short', day: 'numeric' }), hour: 'numeric', minute: '2-digit',
  });
}

function Preview({ projection }) {
  return <CfgSection title="Today’s preview" subtitle="Based on today’s recorded feed starts. Times are shown in your device’s time zone.">
    <CfgGroup>
      {projection.feeds.length ? <ul className="sm-list">
        {projection.feeds.map((feed) => <li key={`${feed.schedule_id ?? feed.name}-${feed.scheduled_time}`}>
          <strong>{feed.name}</strong>
          <span>Usual {previewTime(feed.scheduled_time, feed.scheduled_time)} · {feed.completed ? 'Started' : 'Planned'} {previewTime(feed.effective_time || feed.completed_at || feed.scheduled_time, feed.scheduled_time)}</span>
          {feed.timing_reason && <span className="cfg-fine">{feed.timing_reason}</span>}
          {feed.overnight_target_at && <span className={feed.overnight_delayed ? 'sm-target' : 'cfg-fine'}>
            Preferred start by {previewTime(feed.overnight_target_at, feed.scheduled_time)}{feed.overnight_delayed && ' · Review timing'}
          </span>}
        </li>)}
      </ul> : <p className="cfg-fine">No feeds in today’s preview.</p>}
      <p className="cfg-fine">{projection.suggestion
        ? `A diaper check would be suggested after ${projection.suggestion.feed_name}.`
        : 'No diaper check suggested right now.'}</p>
    </CfgGroup>
  </CfgSection>;
}

function Manager({ patientId }) {
  const { patient } = useCareProfile(patientId);
  const { user } = useAuth();
  const [record, setRecord] = useState(null);
  const [draft, setDraft] = useState(null);
  const [audienceEdited, setAudienceEdited] = useState(false);
  const [projection, setProjection] = useState(null);
  const [busy, setBusy] = useState('');
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const sequence = useRef(0);
  const form = useRef(null);
  const previewSection = useRef(null);

  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const state = await scheduleManagerService.get(patientId);
      if (request === sequence.current) {
        setRecord(state);
        setLoadError('');
      }
    } catch (err) {
      if (request === sequence.current) {
        if ([401, 403, 404].includes(err.status)) {
          setRecord(null);
          setDraft(null);
          setAudienceEdited(false);
          setProjection(null);
        }
        setLoadError(err.message);
      }
    }
  }, [patientId]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  const updateRecord = (nextRecord) => {
    sequence.current++;
    setRecord(nextRecord);
    setLoadError('');
    setProjection(null);
  };
  const settings = draft || record?.settings;
  const edit = (patch) => {
    setDraft({ ...settings, ...patch });
    if ('check_recipient_ids' in patch) setAudienceEdited(true);
    setNotice('');
    setError('');
    setProjection(null);
  };

  const submit = async (mode) => {
    if (!form.current.reportValidity()) return;
    setError('');
    setNotice('');
    if (settings.feeds_enabled && !settings.feed_schedule_ids.length) {
      setError('Choose at least one feed to adjust.');
      return;
    }
    if (settings.checks_enabled && !settings.check_feed_ids.length) {
      setError('Choose at least one feed that can prompt a diaper check.');
      return;
    }
    if (settings.check_hours_start && settings.check_hours_start === settings.check_hours_end) {
      setError('Choose different start and end times, or clear both for all-day suggestions.');
      return;
    }
    setBusy(mode);
    try {
      if (mode === 'save') {
        updateRecord(await scheduleManagerService.save(patientId, settings, audienceEdited));
        setDraft(null);
        setAudienceEdited(false);
        setNotice('Schedule rules saved.');
      } else {
        setProjection(await scheduleManagerService.preview(patientId, settings, audienceEdited));
        requestAnimationFrame(() => previewSection.current?.focus());
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const forPatient = `?patient=${encodeURIComponent(patientId)}`;
  const canRead = (area) => user?.is_system_admin || user?.permissions?.includes(`${area}.read`);
  return <CareProfileSection patientId={patientId} patient={patient} title="Schedule Manager"
    description="Choose how this person’s schedule responds to care recorded throughout the day."
    loading={!record && !loadError} error={error || loadError} notice={notice}>
    {!record && loadError && <button type="button" className="cfg-ghost" onClick={refresh}>Try again</button>}
    {patient && <ReminderDefaults patientId={patientId} />}
    {record && settings && <>
      {(record.settings.manual_checks_enabled || record.settings.checks_enabled) && (record.can_record || record.suggestion) &&
        <BathroomCheckCard state={record} patientId={patientId} onUpdate={updateRecord} />}
      <form className="sm-form" ref={form} onSubmit={(event) => { event.preventDefault(); submit('save'); }}>
        <fieldset className="sm-choices sm-form" disabled={!record.can_manage || Boolean(busy)}>
          <FeedRules draft={settings} schedules={record.schedules} edit={edit} />
          <CheckRules draft={settings} schedules={record.schedules} caregivers={record.caregivers || []}
            audienceNeedsReview={record.audience_needs_review} audienceEdited={audienceEdited} edit={edit} patientId={patientId} />
        </fieldset>
        <div className="sm-actions">
          <button type="button" className="em-cancel" disabled={Boolean(busy)} onClick={() => submit('preview')}>
            {busy === 'preview' ? 'Calculating…' : 'Preview today'}
          </button>
          {record.can_manage && <button type="submit" className="em-submit" disabled={!draft || Boolean(busy)}>
            {busy === 'save' ? 'Saving…' : 'Save rules'}
          </button>}
          {record.can_manage && draft && <button type="button" className="cfg-ghost" disabled={Boolean(busy)}
            onClick={() => { setDraft(null); setAudienceEdited(false); setProjection(null); setError(''); }}>Discard edits</button>}
          {!record.can_manage && <p className="cfg-fine">You have read-only access to these rules.</p>}
        </div>
      </form>
      {projection && <div ref={previewSection} tabIndex="-1"><Preview projection={projection} /></div>}
      {(record.history.length > 0 || record.settings.manual_checks_enabled || record.settings.checks_enabled) && <CfgSection title="Bathroom check history">
        <CfgGroup>{record.history.length ? <ul className="sm-list">{record.history.map((entry) => (
          <li key={entry.id}><strong>{HISTORY_LABELS[entry.action] || entry.action}</strong>
            <span>{formatDateTime(entry.occurred_at)}{entry.recorded_by && ` · ${entry.recorded_by_name || `Caregiver #${entry.recorded_by}`}`}</span>
          </li>
        ))}</ul> : <p className="cfg-fine">No checks or responses recorded here yet.</p>}</CfgGroup>
      </CfgSection>}
      <CfgSection title="Other schedules">
        <CfgGroup><nav aria-label="Related schedules" className="sm-actions">
          <Link className="cfg-ghost" to={`/care/schedule${forPatient}`}>Daily schedule</Link>
          <Link className="cfg-ghost" to={`/care/nutrition/plan${forPatient}`}>Nutrition plan</Link>
          {canRead('medications') && <Link className="cfg-ghost" to={`/care/medications/schedule${forPatient}`}>Medication schedule</Link>}
          {canRead('care_tasks') && <Link className="cfg-ghost" to={`/care/care-tasks/schedule${forPatient}`}>Care task schedule</Link>}
          {canRead('equipment') && <Link className="cfg-ghost" to={`/care/equipment${forPatient}`}>Equipment and useful days</Link>}
        </nav></CfgGroup>
      </CfgSection>
    </>}
  </CareProfileSection>;
}

export default function AdminV2ScheduleManager() {
  const { patientId } = useParams();
  return <Manager key={patientId} patientId={patientId} />;
}
