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
// The vc on-screen number pad. Owns no state: the parent holds the string and
// decides what a tap means (`onKey(char)` / `onBackspace()`); `canAccept(char)`
// lets it grey out keys that would overflow the field. Used by the vitals
// capture sheet (digits + optional decimal) and the caregiver PIN challenge
// (digits only, 4–8).
import { BackspaceIcon } from '../Icons';
import './keypad.css';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export default function Keypad({
  value = '',
  onKey,
  onBackspace,
  canAccept = () => true,
  showDecimal = false,
  className = '',
}) {
  return (
    <div className={`vc-keypad${className ? ` ${className}` : ''}`} role="group" aria-label="Number pad">
      {KEYS.map((k) => (
        <button key={k} type="button" className="vc-key" aria-label={k}
                disabled={!canAccept(k)} onClick={() => onKey(k)}>
          {k}
        </button>
      ))}
      {showDecimal ? (
        <button type="button" className="vc-key" aria-label="Decimal point"
                disabled={!canAccept('.')} onClick={() => onKey('.')}>
          .
        </button>
      ) : (
        <span className="vc-key" aria-hidden="true" />
      )}
      <button type="button" className="vc-key" aria-label="0"
              disabled={!canAccept('0')} onClick={() => onKey('0')}>
        0
      </button>
      <button type="button" className="vc-key" aria-label="Backspace"
              disabled={!value} onClick={onBackspace}>
        <BackspaceIcon size={22} />
      </button>
    </div>
  );
}
