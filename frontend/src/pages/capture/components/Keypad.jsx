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
// Card-driven numeric keypad for the capture sheet: the shared vc Keypad with
// the active field's digit budget applied (spec §4.1) — the decimal key shows
// only when the field allows decimals, and keys that would overflow are
// blocked at input time, not errored later.
import Keypad from '../../../components/vc/Keypad';
import { acceptKey } from '../vitalConfigs';

export default function CaptureKeypad({ value, field, onKey, onBackspace }) {
  return (
    <Keypad
      value={value}
      onKey={onKey}
      onBackspace={onBackspace}
      canAccept={(k) => acceptKey(value, k, field)}
      showDecimal={field.maxDecimals > 0}
    />
  );
}
