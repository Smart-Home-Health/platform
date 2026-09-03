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
// The weekly figures and the summary that gets taken to an appointment.
import { describe, it, expect } from 'vitest';
import {
  weekLabel, shiftWeek, weekDays, alignSeries, vitalRows, careGroups, careTotals,
  peakDay, equipmentRollup, headlineTiles, formatNumber, buildSummary, VITAL_COLORS,
} from './weekly';

const week = (over = {}) => ({
  period: { start: '2026-05-20', end: '2026-05-26' },
  vitals: {
    spo2: {
      min: 55, avg: 96.6, max: 100,
      daily: [
        { date: '2026-05-20', avg: 96, low: 55, high: 100 },
        { date: '2026-05-21', avg: 97, low: 92, high: 100 },
        { date: '2026-05-23', avg: 98, low: 94, high: 100 },
      ],
    },
    heart_rate: {
      min: 43, avg: 80.5, max: 150,
      daily: [{ date: '2026-05-20', avg: 80, low: 43, high: 150 }],
    },
    respiratory_rate: { min: null, avg: null, max: null, daily: [] },
    temperature: { min: null, avg: null, max: null, daily: [] },
    weight: { min: null, avg: null, max: null, daily: [] },
  },
  compliance: {
    medications: { total_scheduled: 107, administered: 108, on_time: 25, late: 100, skipped: 0, missed: 17 },
    care_tasks: { total_scheduled: 35, completed: 30, skipped: 2, missed: 3 },
    overall_pct: 88,
  },
  nutrition: {
    daily: [{ date: '2026-05-20', calories: 1500 }, { date: '2026-05-23', calories: 2050 }],
    goals: { calories_target: 1575, water_ml_target: 1710, protein_grams_target: null },
    avg_calories: 1575,
    avg_fluid_ml: 1200,
  },
  alerts: {
    total: 180,
    total_duration_minutes: 640,
    by_type: { spo2_alarm: 2, hr_alarm: 0, external: 0 },
    daily_counts: [
      { date: '2026-05-20', count: 16 }, { date: '2026-05-21', count: 58 },
      { date: '2026-05-22', count: 31 },
    ],
  },
  equipment_due: [],
  symptoms: { new: [], unresolved_count: 0, resolved_count: 0 },
  ...over,
});

describe('week navigation', () => {
  it('reads the week as one range', () => {
    expect(weekLabel({ start: '2026-05-20', end: '2026-05-26' })).toBe('May 20–26, 2026');
  });

  it('names both months when the week crosses one', () => {
    expect(weekLabel({ start: '2026-04-29', end: '2026-05-05' })).toBe('Apr 29 – May 5, 2026');
  });

  it('steps a whole week at a time', () => {
    expect(shiftWeek('2026-05-26', -1)).toBe('2026-05-19');
    expect(shiftWeek('2026-05-26', 1)).toBe('2026-06-02');
  });
});

describe('alignSeries', () => {
  it('keeps all seven days so a gap reads as a gap', () => {
    expect(weekDays(week().period)).toHaveLength(7);
    const series = alignSeries(week().period, week().vitals.spo2.daily);
    expect(series).toHaveLength(7);
    expect(series[1].value).toBe(97);
    expect(series[2].value).toBeNull();   // the 22nd has no readings
    expect(series[0].low).toBe(55);
  });

  it('reads whichever field the series carries', () => {
    const cals = alignSeries(week().period, week().nutrition.daily, 'calories');
    expect(cals[0].value).toBe(1500);
    expect(cals[3].value).toBe(2050);
  });
});

describe('vitalRows', () => {
  it('drops vitals with nothing recorded rather than drawing empty charts', () => {
    expect(vitalRows(week()).map(v => v.key)).toEqual(['spo2', 'heart_rate']);
  });

  it('counts the days that actually have readings', () => {
    expect(vitalRows(week())[0].days).toBe(3);
  });

  it('flags the week as breached only against the configured alarm', () => {
    expect(vitalRows(week(), { low: 90 })[0].breached).toBe(true);
    expect(vitalRows(week(), {})[0].breached).toBe(false);
    // Heart rate has no alarm on this page, however wide its range.
    expect(vitalRows(week(), { low: 90 })[1].breached).toBe(false);
  });

  it('picks out the day SpO2 bottomed out', () => {
    expect(vitalRows(week(), { low: 90 })[0].worstDay).toMatchObject({ date: '2026-05-20', low: 55 });
  });

  it('keeps amber and red out of the vital colours', () => {
    expect(Object.values(VITAL_COLORS)).not.toContain('#f0a52e');
    expect(Object.values(VITAL_COLORS)).not.toContain('#f0563c');
  });
});

describe('care', () => {
  it('keeps medications and care tasks as separate bars', () => {
    // Only medications record a late/on-time split; a completed task has no
    // punctuality to report and must not be counted as on time.
    const groups = careGroups(week().compliance);
    expect(groups.map(g => g.label)).toEqual(['Medications', 'Care tasks']);
    expect(groups[0].segments.map(s => s.key)).toEqual(['on_time', 'late', 'missed']);
    expect(groups[1].segments.map(s => s.key)).toEqual(['completed', 'skipped', 'missed']);
  });

  it('never gives an adherence segment the breach tone', () => {
    const tones = careGroups(week().compliance).flatMap(g => g.segments.map(s => s.tone));
    expect(tones).not.toContain('breach');
  });

  it('adds both groups into one completed figure', () => {
    expect(careTotals(week().compliance)).toMatchObject({ scheduled: 142, done: 155, missed: 20, pct: 88 });
  });

  it('says nothing rather than dividing by zero on an empty week', () => {
    expect(careGroups({})).toEqual([]);
    expect(careTotals({}).pct).toBeNull();
  });
});

describe('peakDay', () => {
  it('finds the busiest day', () => {
    expect(peakDay(week().alerts.daily_counts)).toMatchObject({ date: '2026-05-21', count: 58 });
  });

  it('has no answer for a quiet week', () => {
    expect(peakDay([{ date: '2026-05-20', count: 0 }])).toBeNull();
    expect(peakDay([])).toBeNull();
  });
});

describe('equipmentRollup', () => {
  it('separates overdue from merely due', () => {
    const roll = equipmentRollup([
      { name: 'Trach Tube', days_overdue: 39 },
      { name: 'Filter', days_overdue: 0 },
    ]);
    expect(roll).toMatchObject({ total: 2, overdue: 1 });
    expect(roll.worst.name).toBe('Trach Tube');
  });

  it('reports an empty list as nothing due', () => {
    expect(equipmentRollup([])).toMatchObject({ total: 0, overdue: 0, worst: null });
  });
});

describe('headlineTiles', () => {
  const tiles = (data) => Object.fromEntries(headlineTiles(data).map(t => [t.key, t]));

  it('reports the week in four figures', () => {
    const t = tiles(week());
    expect(t.care.value).toBe('88%');
    expect(t.care.note).toBe('155 of 142');
    expect(t.alerts.value).toBe(180);
    expect(t.calories.value).toBe('1,575');
    expect(t.equipment.note).toBe('Nothing due');
  });

  it('keeps care amber when short and never red', () => {
    expect(tiles(week()).care.tone).toBe('warn');
    expect(tiles(week({ compliance: { ...week().compliance, overall_pct: 96 } })).care.tone).toBe('ok');
  });

  it('marks overdue equipment amber', () => {
    const t = tiles(week({ equipment_due: [{ name: 'Trach Tube', days_overdue: 39 }] }));
    expect(t.equipment.tone).toBe('warn');
    expect(t.equipment.note).toBe('1 overdue');
  });

  it('survives a week with nothing in it', () => {
    const t = tiles({});
    expect(t.care.value).toBe('—');
    expect(t.alerts.value).toBe(0);
    expect(t.calories.value).toBe('—');
  });
});

describe('formatNumber', () => {
  it('groups thousands and says nothing for nothing', () => {
    expect(formatNumber(1575)).toBe('1,575');
    expect(formatNumber(null)).toBe('—');
  });
});

describe('buildSummary', () => {
  const text = (data = week()) => buildSummary(data, { patientName: 'Elijah Carty', alarms: { low: 90 } });

  it('leads with who and which week', () => {
    expect(text().split('\n')[0]).toBe('Elijah Carty · Week of May 20–26, 2026');
  });

  it('carries each vital with its range, and says which one breached', () => {
    const out = text();
    expect(out).toContain('SpO2: avg 96.6% · range 55–100% (under the 90% alarm)');
    expect(out).toContain('Heart rate: avg 80.5bpm · range 43–150bpm');
  });

  it('reports care, alerts, nutrition and equipment', () => {
    const out = text(week({ equipment_due: [{ name: 'Trach Tube', days_overdue: 39 }] }));
    expect(out).toContain('Care: 155 of 142 completed (88%) · 20 missed');
    expect(out).toContain('Alert triggers: 180');
    expect(out).toContain('Nutrition: 1,575 cal/day average against a 1,575 goal');
    expect(out).toContain('Equipment: 1 due, 1 overdue');
  });

  it('says a quiet week was quiet instead of printing blanks', () => {
    const out = buildSummary({ period: { start: '2026-05-20', end: '2026-05-26' } }, {});
    expect(out).toContain('Alert triggers: none');
    expect(out).not.toContain('undefined');
    expect(out).not.toContain('NaN');
  });
});
