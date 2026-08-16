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
// Card-driven numeric keypad. The decimal key renders only when the active
// field allows decimals (spec §4.1) and keypresses that would exceed the
// field's digit budget are blocked at input time, not errored later.
import { BackspaceIcon } from '../../../components/Icons';
import { acceptKey } from '../vitalConfigs';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export default function Keypad({ value, field, onKey, onBackspace }) {
  const showDecimal = field.maxDecimals > 0;
  return (
    <div className="vc-keypad" role="group" aria-label="Number pad">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          className="vc-key"
          aria-label={k}
          disabled={!acceptKey(value, k, field)}
          onClick={() => onKey(k)}
        >
          {k}
        </button>
      ))}
      {showDecimal ? (
        <button
          type="button"
          className="vc-key"
          aria-label="Decimal point"
          disabled={!acceptKey(value, '.', field)}
          onClick={() => onKey('.')}
        >
          .
        </button>
      ) : (
        <span className="vc-key" aria-hidden="true" />
      )}
      <button
        type="button"
        className="vc-key"
        aria-label="0"
        disabled={!acceptKey(value, '0', field)}
        onClick={() => onKey('0')}
      >
        0
      </button>
      <button
        type="button"
        className="vc-key"
        aria-label="Backspace"
        disabled={!value}
        onClick={onBackspace}
      >
        <BackspaceIcon size={22} />
      </button>
    </div>
  );
}
