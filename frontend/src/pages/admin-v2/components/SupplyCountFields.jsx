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
import React from 'react';
import { countTotal } from '../../../lib/catalogImport';

const numInput = {
  width: '64px', textAlign: 'center', padding: '8px',
};

const FieldLabel = ({ children }) => (
  <span
    className="admin-v2-text-muted"
    style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}
  >
    {children}
  </span>
);

/**
 * value: { packages, perPackage, loose } (strings ok — controlled inputs)
 * onChange(nextValue)
 */
export default function SupplyCountFields({ value = {}, onChange, disabled = false }) {
  const set = (field) => (e) => onChange?.({ ...value, [field]: e.target.value });
  const total = countTotal(value);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <FieldLabel>Packages</FieldLabel>
        <input
          type="number" min="0" inputMode="numeric"
          value={value.packages ?? ''}
          onChange={set('packages')}
          disabled={disabled}
          style={numInput}
        />
      </div>
      <span style={{ paddingBottom: 8 }}>×</span>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <FieldLabel>In each</FieldLabel>
        <input
          type="number" min="1" inputMode="numeric"
          value={value.perPackage ?? ''}
          placeholder="1"
          onChange={set('perPackage')}
          disabled={disabled}
          style={numInput}
        />
      </div>
      <span style={{ paddingBottom: 8 }}>+</span>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <FieldLabel>Loose</FieldLabel>
        <input
          type="number" min="0" inputMode="numeric"
          value={value.loose ?? ''}
          onChange={set('loose')}
          disabled={disabled}
          style={numInput}
        />
      </div>
      <span style={{ paddingBottom: 8, whiteSpace: 'nowrap' }}>
        = <strong>{total}</strong> total
      </span>
    </div>
  );
}
