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
// The measurements list is read at a glance, so the claims worth pinning are
// about what a row is allowed to say: a vital whose bounds live on component
// rows still reads as configured, a vital with no bounds says so instead of
// showing a half-range, and the counters never fold in a measurement twice.
import { describe, it, expect } from 'vitest';
import {
  formatRange, buildMeasurementRows, buildRoomRows, measurementCounts, completionSummary,
} from './measurementRows';

const row = (over = {}) => ({
  vital_key: 'heart_rate', field_key: '', label: 'Heart Rate', unit: 'bpm',
  builtin: true, expected_min: 40, expected_max: 180,
  implausible_min: 10, implausible_max: 350,
  required: false, source: 'default', note: null, ...over,
});

const BP = [
  row({ vital_key: 'blood_pressure', label: 'Blood Pressure', unit: 'mmHg',
        expected_min: null, expected_max: null, required: true }),
  row({ vital_key: 'blood_pressure', field_key: 'systolic', label: 'Systolic',
        unit: 'mmHg', expected_min: 70, expected_max: 200, required: true }),
  row({ vital_key: 'blood_pressure', field_key: 'diastolic', label: 'Diastolic',
        unit: 'mmHg', expected_min: 40, expected_max: 120, required: true }),
];

describe('formatRange', () => {
  it('spells out a one-sided bound instead of using a comparison glyph', () => {
    expect(formatRange(40, 180, 'bpm')).toBe('40–180 bpm');
    expect(formatRange(40, null, 'bpm')).toBe('40 bpm and up');
    expect(formatRange(null, 180, 'bpm')).toBe('Up to 180 bpm');
    expect(formatRange(null, null, 'bpm')).toBe(null);
  });

  it('drops the unit when the measurement has none', () => {
    expect(formatRange(1, 5, null)).toBe('1–5');
  });
});

describe('buildMeasurementRows', () => {
  it('composes a component vital from its component rows, systolic first', () => {
    // The API sorts component rows by key, which would read "diastolic · systolic".
    const [bp] = buildMeasurementRows([BP[0], BP[2], BP[1]]);
    expect(bp.summary).toBe('70–200 systolic · 40–120 diastolic mmHg');
    expect(bp.configured).toBe(true);
    expect(bp.required).toBe(true);
    expect(bp.components).toHaveLength(2);
  });

  it('names the component that is missing rather than hiding it', () => {
    const rows = buildMeasurementRows([
      BP[0], BP[1], { ...BP[2], expected_min: null, expected_max: null },
    ]);
    expect(rows[0].summary).toBe('70–200 mmHg systolic · diastolic not set');
  });

  it('says so when a vital has no expected range at all', () => {
    const rows = buildMeasurementRows([
      row({ vital_key: 'weight', label: 'Weight', unit: 'lbs',
            expected_min: null, expected_max: null }),
    ]);
    expect(rows[0].summary).toBe('No expected range');
    expect(rows[0].configured).toBe(false);
  });

  it('carries the label, unit and custom flag straight from the API', () => {
    const rows = buildMeasurementRows([
      row({ vital_key: 'peak_flow', label: 'peak flow', unit: 'L/min',
            builtin: false, expected_min: null, expected_max: 600 }),
    ]);
    expect(rows[0]).toMatchObject({ label: 'peak flow', unit: 'L/min', builtin: false });
    expect(rows[0].summary).toBe('Up to 600 L/min');
  });

  it('keeps the order the API returned', () => {
    const rows = buildMeasurementRows([...BP, row(), row({ vital_key: 'spo2', label: 'SpO2' })]);
    expect(rows.map((r) => r.key)).toEqual(['blood_pressure', 'heart_rate', 'spo2']);
  });
});

describe('measurementCounts', () => {
  it('counts each measurement once, whatever its bounds are spread across', () => {
    const rows = buildMeasurementRows([
      ...BP,
      row({ vital_key: 'weight', label: 'Weight', expected_min: null, expected_max: null }),
      row({ vital_key: 'peak_flow', label: 'peak flow', builtin: false,
            expected_min: null, expected_max: null }),
    ]);
    const counts = measurementCounts(rows);
    expect(counts).toMatchObject({ standard: 2, custom: 1, configured: 1, needsReview: 2 });
    expect(counts.unconfigured.map((r) => r.key)).toEqual(['weight', 'peak_flow']);
  });
});

describe('completionSummary', () => {
  it('lists the required readings in a sentence', () => {
    const rows = buildMeasurementRows([
      ...BP,
      row({ vital_key: 'spo2', label: 'SpO2', required: true }),
      row({ vital_key: 'temperature', label: 'Temperature', required: true }),
      row({ vital_key: 'weight', label: 'Weight' }),
    ]);
    const summary = completionSummary(rows);
    expect(summary.count).toBe(3);
    expect(summary.headline).toBe('3 readings required per encounter');
    expect(summary.detail).toBe('Blood Pressure, SpO2, and Temperature.');
  });

  it('does not claim a requirement when nothing is required', () => {
    const summary = completionSummary(buildMeasurementRows([row()]));
    expect(summary.count).toBe(0);
    expect(summary.headline).toBe('No readings are required to complete an encounter');
  });
});

describe('buildRoomRows', () => {
  it('reads caution and critical as separate bands', () => {
    const [temp] = buildRoomRows([
      { metric: 'temperature', source: 'patient',
        critical_min: 15, caution_min: 18, caution_max: 26, critical_max: 30 },
    ]);
    expect(temp.summary).toBe('Caution 18–26 °C · Critical 15–30 °C');
    expect(temp.configured).toBe(true);
  });

  it('does not bolt two sentences together on a one-sided band', () => {
    const [co2] = buildRoomRows([
      { metric: 'co2', source: 'default', caution_max: 1000, critical_max: 2000 },
    ]);
    expect(co2.summary).toBe('Caution up to 1000 ppm · Critical up to 2000 ppm');
  });

  it('says a metric is unbounded rather than showing an empty range', () => {
    const [co2] = buildRoomRows([
      { metric: 'co2', source: 'default',
        critical_min: null, caution_min: null, caution_max: null, critical_max: null },
    ]);
    expect(co2.summary).toBe('Not bounded');
    expect(co2.configured).toBe(false);
    expect(co2.hasFloor).toBe(false);
  });

  it('only lists metrics the API returned', () => {
    expect(buildRoomRows([{ metric: 'pm25', caution_max: 35 }]).map((r) => r.key))
      .toEqual(['pm25']);
    expect(buildRoomRows([])).toEqual([]);
  });
});
