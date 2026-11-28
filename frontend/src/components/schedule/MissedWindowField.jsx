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
import { useId, useState } from 'react';
import { EmField } from '../vc/EntityModal';
import { durationUnits, displayUnit, validMissedWindow } from './reminderTiming';

export default function MissedWindowField({ value, onChange, hint, placeholder, disabled, legacyValue, initialMinutes = value }) {
  const id = useId();
  const [unit, setUnit] = useState(() => displayUnit(initialMinutes));
  const amount = value == null ? '' : Number((value / durationUnits[unit]).toPrecision(12));
  const change = (raw, multiplier) => {
    if (raw === '') onChange(null);
    else onChange(Number((Number(raw) * multiplier).toPrecision(12)));
  };
  const invalid = !validMissedWindow(value) && value !== legacyValue;
  return <EmField label="Mark missed after" htmlFor={id} hint={hint}>
    <div className="em-row">
      <input id={id} className="em-input" type="number" step="any" inputMode="decimal"
        value={amount} placeholder={placeholder} disabled={disabled} aria-invalid={invalid || undefined}
        onChange={event => change(event.target.value, durationUnits[unit])} />
      <select className="em-input" aria-label="Duration unit" value={unit} disabled={disabled}
        onChange={event => { setUnit(event.target.value); change(amount, durationUnits[event.target.value]); }}>
        {Object.keys(durationUnits).map(name => <option key={name} value={name}>{name}</option>)}
      </select>
    </div>
    {invalid && <span className="em-error">Enter a duration of one or more whole minutes.</span>}
  </EmField>;
}
