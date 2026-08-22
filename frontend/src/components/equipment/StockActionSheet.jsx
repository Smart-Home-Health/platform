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
// "How many?" sheet for a supply — receiving stock in, or opening/using it.
// Replaces the window.prompt() + alert() pair the live Equipment panel used:
// one number field, validated against what is on hand, errors shown inline.
import { useEffect, useState } from 'react';
import EntityModal, { EmField } from '../vc/EntityModal';
import './equipment-panel.css';

const COPY = {
  receive: {
    title: (name) => `Receive — ${name}`,
    label: 'How many arrived?',
    submit: 'Add to stock',
  },
  open: {
    title: (name) => `Use — ${name}`,
    label: 'How many used?',
    submit: 'Take from stock',
  },
};

export default function StockActionSheet({ open, mode, item, busy = false, error = null, onSubmit, onClose }) {
  const [amount, setAmount] = useState('1');
  const [localError, setLocalError] = useState(null);

  useEffect(() => {
    if (open) { setAmount('1'); setLocalError(null); }
  }, [open, item?.id, mode]);

  if (!item || !COPY[mode]) return null;
  const copy = COPY[mode];
  const onHand = Number(item.quantity) || 0;
  const unit = item.unit_of_measure ? ` ${item.unit_of_measure}` : '';

  const submit = (e) => {
    e.preventDefault();
    const n = Number(amount);
    if (!Number.isInteger(n) || n < 1) {
      setLocalError('Enter a whole number of 1 or more.');
      return;
    }
    if (mode === 'open' && n > onHand) {
      setLocalError(`Only ${onHand}${unit} on hand.`);
      return;
    }
    setLocalError(null);
    onSubmit(n);
  };

  const shown = localError || error;
  return (
    <EntityModal open={open} onOpenChange={(o) => { if (!o) onClose(); }} title={copy.title(item.name)}>
      <form className="em-form" onSubmit={submit} noValidate>
        {shown && <div className="em-error">{shown}</div>}
        <p className="eq-sheet-hint"><strong>{onHand}{unit}</strong> on hand now</p>
        <EmField label={copy.label} required htmlFor="eq-amount">
          <input
            id="eq-amount"
            className="em-input"
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
          />
        </EmField>
        <div className="em-footer">
          <button type="button" className="em-cancel" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="em-submit" disabled={busy}>
            {busy ? 'Saving…' : copy.submit}
          </button>
        </div>
      </form>
    </EntityModal>
  );
}
