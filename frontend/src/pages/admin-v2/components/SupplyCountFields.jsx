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
// Shelf-count math fields: packages x per-package + loose = total.
// DME packaging is weird (1 case = 30, 1 pack = 5, loose extras everywhere),
// so the user counts in packaging units and we store base units. Controlled
// and fetch-free — the wizard count step and the Supplies-page count modal share it.
import { countTotal } from '../../../lib/catalogImport';
import '../../../components/vc/entity-card.css';
import './supply-count.css';

/**
 * value: { packages, perPackage, loose } (strings ok — controlled inputs)
 * onChange(nextValue)
 */
export default function SupplyCountFields({ value = {}, onChange, disabled = false }) {
  const set = (field) => (e) => onChange?.({ ...value, [field]: e.target.value });
  const total = countTotal(value);

  return (
    <div className="supc-row">
      <label className="supc-cell">
        <span className="supc-label">Packages</span>
        <input
          type="number" min="0" inputMode="numeric"
          className="em-input"
          value={value.packages ?? ''}
          onChange={set('packages')}
          disabled={disabled}
        />
      </label>
      <span className="supc-op">×</span>
      <label className="supc-cell">
        <span className="supc-label">In each</span>
        <input
          type="number" min="1" inputMode="numeric"
          className="em-input"
          value={value.perPackage ?? ''}
          placeholder="1"
          onChange={set('perPackage')}
          disabled={disabled}
        />
      </label>
      <span className="supc-op">+</span>
      <label className="supc-cell">
        <span className="supc-label">Loose</span>
        <input
          type="number" min="0" inputMode="numeric"
          className="em-input"
          value={value.loose ?? ''}
          onChange={set('loose')}
          disabled={disabled}
        />
      </label>
      <span className="supc-total">
        = <strong>{total}</strong> total
      </span>
    </div>
  );
}
