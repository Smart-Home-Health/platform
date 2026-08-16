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
// Numeric entry sheet. Phases: entering -> (classify on commit) ok | warn |
// blocked. Blood pressure runs a two-step field flow (NEXT: DIASTOLIC) with
// the cross-field rule evaluated when both fields are present. The keypad
// stays visible during warnings so a mis-key is a one-tap fix.
import { useEffect, useState } from 'react';
import { AlertIcon, CheckIcon } from '../../../components/Icons';
import BottomSheet from './BottomSheet';
import Keypad from './Keypad';
import { formatValue, normalizeValue } from '../vitalConfigs';
import {
  classify, concerningMessage, evaluateBloodPressure, formatWithUnit,
  implausibleMessage, rangeFor,
} from '../validation';

function timeLabel(date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function CaptureSheet({ config, ranges, patientFirstName,
                                       initialValues, onCommit, onClose }) {
  const isBP = config.key === 'blood_pressure';
  const fields = config.fields;
  const [values, setValues] = useState(() =>
    fields.map((f, i) => formatValue(initialValues?.[i] ?? null, f)));
  const [activeIdx, setActiveIdx] = useState(0);
  const [phase, setPhase] = useState('entering'); // entering | warn | blocked
  const [messages, setMessages] = useState([]);
  const [openedAt] = useState(() => new Date());

  // Any edit returns the sheet to the entering phase.
  useEffect(() => { setPhase('entering'); setMessages([]); }, [values, activeIdx]);

  const activeField = fields[activeIdx];
  const activeValue = values[activeIdx];
  const committed = values.map((v, i) => normalizeValue(values[i]) !== null && i !== activeIdx);

  const setActiveValue = (next) => {
    setValues((prev) => prev.map((v, i) => (i === activeIdx ? next : v)));
  };

  const anyValueEntered = values.some((v) => v !== '');

  const requestClose = () => {
    if (anyValueEntered &&
        !window.confirm('Discard this reading? The value you entered will be lost.')) {
      return;
    }
    onClose();
  };

  const evaluate = () => {
    if (isBP) {
      const systolic = normalizeValue(values[0]);
      const diastolic = normalizeValue(values[1]);
      return { parsed: { systolic, diastolic },
               ...evaluateBloodPressure({ systolic, diastolic, ranges, patientFirstName }) };
    }
    const value = normalizeValue(values[0]);
    const range = rangeFor(ranges, config.key, '');
    const band = classify(value, range);
    const messagesFor = band === 'implausible'
      ? [implausibleMessage({ value, unit: config.unit, label: config.label })]
      : band === 'concerning'
        ? [concerningMessage({ value, unit: config.unit, range, patientFirstName,
                               vitalKey: config.key })]
        : [];
    return { parsed: { value }, band, messages: messagesFor, range };
  };

  const commit = (result, confirmed) => {
    const measuredAt = new Date().toISOString();
    const rangeShown = isBP
      ? { systolic: rangeFor(ranges, 'blood_pressure', 'systolic'),
          diastolic: rangeFor(ranges, 'blood_pressure', 'diastolic') }
      : result.range || null;
    onCommit({
      vitalKey: config.key,
      unit: config.unit,
      measuredAt,
      confirmedAgainstWarning: confirmed,
      rangeShown,
      ...result.parsed,
    });
  };

  const handlePrimary = () => {
    if (isBP && activeIdx === 0) {
      if (normalizeValue(values[0]) === null) return;
      setActiveIdx(1);
      return;
    }
    const result = evaluate();
    if (result.band === 'implausible') {
      setPhase('blocked');
      setMessages(result.messages);
      return;
    }
    if (result.band === 'concerning') {
      setPhase('warn');
      setMessages(result.messages);
      return;
    }
    commit(result, false);
  };

  const handleConfirmWarned = () => {
    const result = evaluate();
    if (result.band !== 'concerning') return; // value changed since warning
    commit(result, true);
  };

  const primaryDisabled = normalizeValue(activeValue) === null;
  const confirmLabel = isBP
    ? `Confirm ${normalizeValue(values[0])}/${normalizeValue(values[1])}`
    : `Confirm ${formatWithUnit(normalizeValue(values[0]), config.unit)}`;
  const primaryLabel = isBP && activeIdx === 0 ? 'Next: Diastolic' : 'Add reading';

  return (
    <BottomSheet
      open
      onOpenChange={(open) => { if (!open) requestClose(); }}
      onSwipeDown={requestClose}
      title={config.sheetLabel || config.label}
    >
      <div className="vc-sheet-meta">
        <span><span className="vc-label">Source</span>{' '}
          <span className="vc-value vc-label">Manual</span></span>
        <span><span className="vc-label">Measured</span>{' '}
          <span className="vc-value vc-label">{timeLabel(openedAt)}</span></span>
      </div>

      <p className="vc-sheet-prompt">{activeField.prompt}</p>

      <div className={`vc-hero ${isBP ? 'bp' : ''}`} aria-live="polite">
        {fields.map((f, i) => (
          <span key={f.key || 'value'} style={{ display: 'contents' }}>
            {i > 0 && <span className="vc-hero-sep" aria-hidden="true">/</span>}
            <button
              type="button"
              className={`vc-hero-field ${i === activeIdx ? 'active' : ''} ${values[i] === '' ? 'placeholder' : ''}`}
              aria-label={`${f.label}: ${values[i] || 'not entered'}`}
              onClick={() => setActiveIdx(i)}
            >
              {values[i] === '' ? '– – –' : values[i]}
              {i === activeIdx && <span className="vc-caret" aria-hidden="true" />}
              {committed[i] && isBP && (
                <span className="vc-field-check"><CheckIcon size={16} /></span>
              )}
            </button>
          </span>
        ))}
        <span className="vc-unit">{config.unit}</span>
      </div>

      {phase !== 'entering' && (
        <div className={`vc-band ${phase === 'warn' ? 'warn' : 'block'}`} role="alert">
          <AlertIcon size={18} />
          <div>
            <span className="vc-band-title">
              {phase === 'warn' ? 'Outside expected range' : "Can't be right"}
            </span>
            {messages.map((m) => <div key={m}>{m}</div>)}
          </div>
        </div>
      )}

      <Keypad
        value={activeValue}
        field={activeField}
        onKey={(k) => setActiveValue(activeValue + k)}
        onBackspace={() => setActiveValue(activeValue.slice(0, -1))}
      />

      {isBP && activeIdx === 1 && (
        <button type="button" className="vc-linklike" onClick={() => setActiveIdx(0)}>
          Edit systolic
        </button>
      )}

      <div className="vc-sheet-actions">
        {phase === 'entering' && (
          <>
            <button type="button" className="vc-btn secondary" onClick={requestClose}>
              Cancel
            </button>
            <button type="button" className="vc-btn primary" disabled={primaryDisabled}
                    onClick={handlePrimary}>
              {primaryLabel}
            </button>
          </>
        )}
        {phase === 'warn' && (
          <>
            <button type="button" className="vc-btn secondary"
                    onClick={() => { setPhase('entering'); setMessages([]); }}>
              Edit value
            </button>
            <button type="button" className="vc-btn confirm-warn" onClick={handleConfirmWarned}>
              {confirmLabel}
            </button>
          </>
        )}
        {phase === 'blocked' && (
          <button type="button" className="vc-btn secondary" style={{ flex: 1 }}
                  onClick={() => { setPhase('entering'); setMessages([]); }}>
            Edit value
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
