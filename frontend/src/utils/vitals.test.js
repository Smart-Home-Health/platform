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
// Wave 1 — vital display-name formatter.
import { describe, it, expect } from 'vitest';
import { formatVitalDisplayName, KNOWN_VITAL_LABELS } from './vitals';

describe('formatVitalDisplayName', () => {
  it('maps known slugs to curated labels', () => {
    expect(formatVitalDisplayName('blood_pressure')).toBe('Blood Pressure');
    expect(formatVitalDisplayName('spo2')).toBe('SpO₂');
    expect(formatVitalDisplayName('heart_rate')).toBe('Heart Rate');
  });

  it('title-cases unknown snake_case slugs', () => {
    expect(formatVitalDisplayName('custom_vital_thing')).toBe('Custom Vital Thing');
  });

  it('returns empty string for falsy input', () => {
    expect(formatVitalDisplayName('')).toBe('');
    expect(formatVitalDisplayName(null)).toBe('');
    expect(formatVitalDisplayName(undefined)).toBe('');
  });

  it('every curated label is non-empty', () => {
    for (const [slug, label] of Object.entries(KNOWN_VITAL_LABELS)) {
      expect(label, slug).toBeTruthy();
      expect(formatVitalDisplayName(slug)).toBe(label);
    }
  });
});
