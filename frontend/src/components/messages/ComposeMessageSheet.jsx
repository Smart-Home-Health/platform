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
// Composing a broadcast, on the same bottom sheet the capture surface uses —
// the established shape for "fill this in on a phone".
//
// Every control maps to a real field on the message: there is deliberately no
// audience picker, because the API has no audience. A message goes to everyone
// on the account, and who *clearing* it acts for is the ack_scope row below.
import { useState } from 'react';
import BottomSheet from '../../pages/capture/components/BottomSheet';
import { CheckIcon, InfoIcon } from '../Icons';
import './messages-panel.css';

const TITLE_MAX = 255;   // matches MessageCreate on the backend

// The mockup's NORMAL / IMPORTANT, plus the urgent stop the API already
// supports — dropping it would quietly remove a level someone could set before.
const PRIORITIES = [
  { value: 'info', label: 'Normal' },
  { value: 'warning', label: 'Important' },
  { value: 'critical', label: 'Urgent' },
];

const SCOPES = [
  { value: 'anyone', label: 'Clear for everyone', hint: 'One person handling it resolves it for the group' },
  { value: 'per_user', label: 'Each person clears their own', hint: 'Everyone has to acknowledge it themselves' },
];

const EMPTY = {
  title: '', body: '', severity: 'info', ack_scope: 'anyone',
  dismissible: true, snoozable: true,
};

function Toggle({ checked, onChange, label, hint, disabled }) {
  return (
    <div className={`mx-toggle-row${disabled ? ' disabled' : ''}`}>
      <span className="mx-toggle-text">
        <span className="mx-toggle-label">{label}</span>
        <span className="mx-toggle-hint">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`mx-switch${checked ? ' on' : ''}`}
        onClick={() => onChange(!checked)}
        disabled={disabled}
      >
        <span className="mx-switch-knob" />
      </button>
    </div>
  );
}

export default function ComposeMessageSheet({ open, onClose, onSubmit, saving = false, error = null }) {
  const [form, setForm] = useState(EMPTY);
  const set = (patch) => setForm(prev => ({ ...prev, ...patch }));
  const titleLeft = TITLE_MAX - form.title.length;

  const submit = (e) => {
    e.preventDefault();
    if (!form.title.trim() || saving) return;
    onSubmit({ ...form, title: form.title.trim(), body: form.body.trim() || null });
  };

  const close = () => { setForm(EMPTY); onClose(); };

  return (
    <BottomSheet
      open={open}
      onOpenChange={(next) => { if (!next) close(); }}
      onSwipeDown={close}
      title="Compose message"
    >
      <form className="mx-compose" onSubmit={submit}>
        <p className="mx-compose-sub">Share an update with everyone on the care team.</p>

        {error && <div className="mx-error">{error}</div>}

        <label className="mx-field">
          <span className="mx-field-label">
            Title <span className="mx-req">Required</span>
          </span>
          <input
            className="mx-input"
            value={form.title}
            onChange={e => set({ title: e.target.value.slice(0, TITLE_MAX) })}
            maxLength={TITLE_MAX}
            placeholder="What should everyone know?"
            autoFocus
          />
          {/* Counted down from the column's real limit rather than an invented
              one, and only once it is close enough to matter. */}
          {titleLeft <= 40 && <span className="mx-count">{titleLeft} left</span>}
        </label>

        <label className="mx-field">
          <span className="mx-field-label">
            Message <span className="mx-opt">Optional</span>
          </span>
          <textarea
            className="mx-input mx-textarea"
            value={form.body}
            onChange={e => set({ body: e.target.value })}
            rows={4}
            placeholder="Add helpful details or next steps…"
          />
        </label>

        <div className="mx-field">
          <span className="mx-field-label">Priority</span>
          <div className="mx-seg" role="radiogroup" aria-label="Priority">
            {PRIORITIES.map(p => (
              <button
                key={p.value}
                type="button"
                role="radio"
                aria-checked={form.severity === p.value}
                className={`mx-seg-btn ${p.value}${form.severity === p.value ? ' on' : ''}`}
                onClick={() => set({ severity: p.value })}
              >
                {form.severity === p.value && <CheckIcon size={13} />}
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mx-card-block">
          <span className="mx-block-head">Follow-up</span>
          <Toggle
            label="Allow clearing"
            hint="Anyone can mark this handled"
            checked={form.dismissible}
            onChange={v => set({ dismissible: v })}
          />
          <Toggle
            label="Allow snoozing"
            hint="It can be hidden until later"
            checked={form.snoozable}
            onChange={v => set({ snoozable: v })}
          />
        </div>

        {/* Only asked when it can happen: with clearing off, the message stays
            up until it is deleted, so who clears it has no answer. */}
        {form.dismissible && (
          <div className="mx-field">
            <span className="mx-field-label">When someone clears it</span>
            <div className="mx-choices" role="radiogroup" aria-label="When someone clears it">
              {SCOPES.map(s => (
                <button
                  key={s.value}
                  type="button"
                  role="radio"
                  aria-checked={form.ack_scope === s.value}
                  className={`mx-choice${form.ack_scope === s.value ? ' on' : ''}`}
                  onClick={() => set({ ack_scope: s.value })}
                >
                  <span className="mx-choice-text">
                    <span className="mx-choice-label">{s.label}</span>
                    <span className="mx-choice-hint">{s.hint}</span>
                  </span>
                  {form.ack_scope === s.value && <CheckIcon size={16} />}
                </button>
              ))}
            </div>
          </div>
        )}

        <p className="mx-compose-note">
          <InfoIcon size={14} />
          This appears as a <strong>manual message</strong>, filed under Other.
        </p>

        <div className="vc-sheet-actions mx-compose-actions">
          <button type="button" className="vc-btn secondary" onClick={close}>Cancel</button>
          <button type="submit" className="vc-btn primary" disabled={!form.title.trim() || saving}>
            {saving ? 'Posting…' : 'Post message'}
          </button>
        </div>
      </form>
    </BottomSheet>
  );
}
