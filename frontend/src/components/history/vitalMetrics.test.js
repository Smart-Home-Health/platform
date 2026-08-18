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
import { describe, it, expect } from 'vitest';
import {
  metricFor, orderTypes, latestByType, formatReading, relativeAge,
  since, toSeries, METRICS,
} from './vitalMetrics';

const iso = (s) => new Date(s).toISOString();

describe('metricFor', () => {
  it('knows the real vitals', () => {
    expect(metricFor('blood_pressure').label).toBe('Blood pressure');
    expect(metricFor('spo2').unit).toBe('%');
    expect(metricFor('temperature').decimals).toBe(1);
  });

  it('marks anything it does not know rather than dropping it', () => {
    const m = metricFor('patient_id');
    expect(m.unrecognised).toBe(true);
    expect(m.label).toBe('Patient Id');
  });

  it('only blood pressure carries multiple fields', () => {
    expect(metricFor('blood_pressure').fields).toHaveLength(3);
    expect(METRICS.filter(m => m.fields)).toHaveLength(1);
  });
});

describe('orderTypes', () => {
  it('puts known vitals in clinical order regardless of API order', () => {
    expect(orderTypes(['heart_rate', 'weight', 'blood_pressure', 'spo2']))
      .toEqual(['blood_pressure', 'weight', 'spo2', 'heart_rate']);
  });

  it('sorts junk to the end instead of hiding it', () => {
    expect(orderTypes(['patient_id', 'spo2'])).toEqual(['spo2', 'patient_id']);
  });

  it('omits known vitals the patient has no data for', () => {
    expect(orderTypes(['spo2'])).toEqual(['spo2']);
    expect(orderTypes([])).toEqual([]);
  });
});

describe('latestByType', () => {
  const records = [
    { vital_type: 'spo2', value: 95, timestamp: iso('2026-08-17T21:00:00Z') },
    { vital_type: 'spo2', value: 99, timestamp: iso('2026-08-18T09:00:00Z') },
    { vital_type: 'weight', value: 140, timestamp: iso('2026-08-01T09:00:00Z') },
  ];

  it('keeps the newest of each type', () => {
    const map = latestByType(records);
    expect(map.get('spo2').value).toBe(99);
    expect(map.get('weight').value).toBe(140);
  });

  it('does not assume the API sorted them', () => {
    const map = latestByType([...records].reverse());
    expect(map.get('spo2').value).toBe(99);
  });

  it('ignores rows with no type or an unparseable time', () => {
    const map = latestByType([{ value: 1 }, { vital_type: 'spo2', timestamp: 'nope' }]);
    expect(map.size).toBe(0);
  });
});

describe('formatReading', () => {
  const bp = metricFor('blood_pressure');

  it('renders blood pressure as a pair', () => {
    expect(formatReading({ systolic: 124, diastolic: 71 }, bp)).toBe('124/71');
  });

  it('shows which half of a pair is missing rather than inventing it', () => {
    expect(formatReading({ systolic: 97, diastolic: null }, bp)).toBe('97/--');
  });

  it('rounds a scalar to the metric decimals', () => {
    expect(formatReading({ value: 100.47 }, metricFor('temperature'))).toBe('100.5');
    expect(formatReading({ value: 87.6 }, metricFor('heart_rate'))).toBe('88');
  });

  it('is null when there is nothing recorded', () => {
    expect(formatReading({ value: null }, metricFor('spo2'))).toBeNull();
    expect(formatReading({ systolic: null, diastolic: null }, bp)).toBeNull();
    expect(formatReading(null, bp)).toBeNull();
  });
});

describe('relativeAge', () => {
  const now = new Date('2026-08-18T12:00:00Z').getTime();
  it('reads at the scale a caregiver thinks in', () => {
    expect(relativeAge('2026-08-18T11:59:30Z', now)).toBe('just now');
    expect(relativeAge('2026-08-18T11:30:00Z', now)).toBe('30m ago');
    expect(relativeAge('2026-08-18T09:00:00Z', now)).toBe('3h ago');
    expect(relativeAge('2026-08-07T12:00:00Z', now)).toBe('11d ago');
  });

  it('is blank rather than "NaN ago" for an unparseable stamp', () => {
    expect(relativeAge('nope', now)).toBe('');
  });
});

describe('since', () => {
  it('walks back whole days from now', () => {
    const now = new Date('2026-08-18T12:00:00Z').getTime();
    expect(since(7, now)).toBe('2026-08-11T12:00:00.000Z');
  });
});

describe('toSeries', () => {
  it('flips the API newest-first order so the line reads left to right', () => {
    const pts = toSeries([
      { value: 3, timestamp: iso('2026-08-18T12:00:00Z') },
      { value: 1, timestamp: iso('2026-08-16T12:00:00Z') },
      { value: 2, timestamp: iso('2026-08-17T12:00:00Z') },
    ], metricFor('spo2'));
    expect(pts.map(p => p.value)).toEqual([1, 2, 3]);
  });

  it('carries all three blood pressure fields', () => {
    const [p] = toSeries([{ systolic: 124, diastolic: 71, map: 89, timestamp: iso('2026-08-18T12:00:00Z') }],
      metricFor('blood_pressure'));
    expect(p).toMatchObject({ systolic: 124, diastolic: 71, map: 89 });
  });

  it('keeps a blood pressure record that has only one field', () => {
    const pts = toSeries([{ systolic: 97, diastolic: null, map: null, timestamp: iso('2026-08-06T18:20:00Z') }],
      metricFor('blood_pressure'));
    expect(pts).toHaveLength(1);
    expect(pts[0].diastolic).toBeNull();
  });

  it('drops records with nothing to plot', () => {
    expect(toSeries([{ value: null, timestamp: iso('2026-08-18T12:00:00Z') }], metricFor('spo2'))).toEqual([]);
    expect(toSeries([{ value: 1, timestamp: 'nope' }], metricFor('spo2'))).toEqual([]);
  });
});
