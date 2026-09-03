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
// The overnight header figures and the handoff text. The handoff is the piece
// that leaves the app — it gets pasted into a message or a paper log — so what
// it says has to be exactly what the night was.
import { describe, it, expect } from 'vitest';
import {
  windowLabel, windowHours, nightLabel, formatMinutes, formatTime, coverage,
  checklistRollup, careRollup, scheduledSpan, episodes, statTiles, buildHandoff,
  toCsv, csvFileName, STATUS_TONE,
} from './overnight';

const night = (over = {}) => ({
  date: '2026-08-17',
  window: { start: '2026-08-17T20:00', end: '2026-08-18T08:00', start_hour: 20, end_hour: 8 },
  vitals_summary: {
    sample_count: 10530,
    coverage_minutes: 702,
    window_minutes: 720,
    spo2: { min: 70, avg: 97, max: 100, time_below_90_minutes: 9.7 },
    heart_rate: { min: 58, avg: 80.9, max: 121 },
  },
  vitals_chart: [
    { ts: 1787011200, spo2: 100, hr: 86 },
    { ts: 1787011500, spo2: 98, hr: 84 },
  ],
  alerts: {
    total: 2,
    total_duration_minutes: 7.7,
    longest_duration_minutes: 3.5,
    items: [
      { start_time: '2026-08-18T04:13:00Z', end_time: '2026-08-18T04:16:30Z', duration_minutes: 3.5,
        spo2_min: 70, spo2_max: 91, bpm_min: 80, bpm_max: 96, oxygen_used: false, oxygen_highest: null },
      { start_time: '2026-08-18T03:21:00Z', end_time: '2026-08-18T03:23:00Z', duration_minutes: 2,
        spo2_min: 89, spo2_max: 92, bpm_min: 78, bpm_max: 88, oxygen_used: false, oxygen_highest: null },
    ],
  },
  oxygen: { episodes: 0, total_minutes: 0, highest_flow: 0 },
  care_checklist: {
    medications: [
      { name: 'Briviact', scheduled_time: '9:00 PM', status: 'missed', administered_at: null },
      { name: 'Senna', scheduled_time: '11:00 PM', status: 'completed', administered_at: '11:04 PM' },
    ],
    care_tasks: [
      { name: 'Nebulizer', scheduled_time: '9:00 PM', status: 'missed', completed_at: null },
    ],
  },
  symptoms: [],
  compliance_pct: 33.3,
  ...over,
});

describe('window labels', () => {
  it('reads the night window and its length', () => {
    expect(windowLabel(20, 8)).toBe('8 PM–8 AM');
    expect(windowHours(20, 8)).toBe(12);
    expect(windowHours(22, 6)).toBe(8);
  });

  it('spans two dates when the window crosses midnight, one when it does not', () => {
    expect(nightLabel('2026-08-17', 20, 8)).toBe('Aug 17–18');
    expect(nightLabel('2026-08-17', 8, 20)).toBe('Aug 17');
  });

  it('names both months when the night crosses one', () => {
    expect(nightLabel('2026-08-31', 20, 8)).toBe('Aug 31 – Sep 1');
  });
});

describe('formatMinutes', () => {
  it('stays in minutes under an hour and switches to hours above it', () => {
    expect(formatMinutes(9.7)).toBe('9.7m');
    expect(formatMinutes(702)).toBe('11h 42m');
    expect(formatMinutes(720)).toBe('12h');
    expect(formatMinutes(null)).toBe('—');
  });
});

describe('formatTime', () => {
  it('says nothing rather than Invalid Date', () => {
    expect(formatTime('nonsense')).toBe('—');
  });
});

describe('coverage', () => {
  it('reports what the sensor caught against the window', () => {
    expect(coverage(night())).toEqual({ minutes: 702, windowMinutes: 720, pct: 98 });
  });

  it('reports nothing when the payload predates the field', () => {
    expect(coverage({ vitals_summary: { spo2: {} } })).toBeNull();
    expect(coverage({})).toBeNull();
  });
});

describe('checklist rollups', () => {
  it('counts anything given as done, however late', () => {
    const roll = checklistRollup([
      { status: 'completed' }, { status: 'on_time' }, { status: 'late' },
      { status: 'missed' }, { status: 'skipped' },
    ]);
    expect(roll).toEqual({ total: 5, done: 3, missed: 1, skipped: 1 });
  });

  it('adds medications and care tasks into one figure', () => {
    const care = careRollup(night().care_checklist);
    expect(care).toMatchObject({ total: 3, done: 1, missed: 2 });
    expect(care.meds.total).toBe(2);
    expect(care.tasks.missed).toBe(1);
  });

  it('never paints adherence red', () => {
    // Missed and late are amber here; red is for readings, not for people.
    expect(STATUS_TONE.missed).toBe('warn');
    expect(STATUS_TONE.late).toBe('warn');
    expect(Object.values(STATUS_TONE)).not.toContain('breach');
  });
});

describe('scheduledSpan', () => {
  it('reads evening-to-morning in the order the night ran', () => {
    expect(scheduledSpan(night().care_checklist)).toBe('9:00 PM and 11:00 PM');
  });

  it('wraps past midnight rather than sorting 6 AM first', () => {
    const span = scheduledSpan({
      medications: [{ scheduled_time: '6:00 AM' }, { scheduled_time: '10:00 PM' }],
      care_tasks: [],
    });
    expect(span).toBe('10:00 PM and 6:00 AM');
  });

  it('collapses to one time when everything is due together', () => {
    expect(scheduledSpan({ medications: [{ scheduled_time: '9:00 PM' }], care_tasks: [] }))
      .toBe('9:00 PM');
  });

  it('says nothing when there is nothing scheduled', () => {
    expect(scheduledSpan({ medications: [], care_tasks: [] })).toBeNull();
    expect(scheduledSpan(undefined)).toBeNull();
  });
});

describe('episodes', () => {
  it('carries the nadir out for the reader to scan', () => {
    const list = episodes(night());
    expect(list).toHaveLength(2);
    expect(list[0].nadir).toBe(70);
    expect(list[0].startMs).toBe(Date.parse('2026-08-18T04:13:00Z'));
  });

  it('leaves an ongoing episode with no end', () => {
    const list = episodes({ alerts: { items: [{ start_time: '2026-08-18T04:13:00Z', end_time: null }] } });
    expect(list[0].endMs).toBeNull();
  });
});

describe('statTiles', () => {
  const tiles = (data, alarms) => Object.fromEntries(statTiles(data, alarms).map(t => [t.key, t]));

  it('reds the nadir only when it went under the configured alarm', () => {
    expect(tiles(night(), { low: 90 }).nadir.tone).toBe('breach');
    expect(tiles(night(), {}).nadir.tone).toBeNull();
    const calm = night({ vitals_summary: { ...night().vitals_summary, spo2: { min: 95, avg: 97, max: 100, time_below_90_minutes: 0 } } });
    expect(tiles(calm, { low: 90 }).nadir.tone).toBeNull();
  });

  it('keeps care adherence amber, never red', () => {
    expect(tiles(night(), { low: 90 }).care.tone).toBe('warn');
    expect(tiles(night(), { low: 90 }).care.value).toBe('1/3');
  });

  it('calls a clean night clean', () => {
    const quiet = night({
      alerts: { total: 0, total_duration_minutes: 0, longest_duration_minutes: 0, items: [] },
      vitals_summary: { ...night().vitals_summary, spo2: { min: 95, avg: 98, max: 100, time_below_90_minutes: 0 } },
    });
    const t = tiles(quiet, { low: 90 });
    expect(t.episodes.tone).toBe('ok');
    expect(t.episodes.note).toBe('None');
    expect(t.below90.tone).toBe('ok');
  });

  it('survives a night with no readings at all', () => {
    const t = tiles({ vitals_summary: {}, alerts: {}, oxygen: {}, care_checklist: {} }, { low: 90 });
    expect(t.nadir.value).toBe('—');
    expect(t.care.value).toBe('0/0');
    expect(t.care.tone).toBeNull();
  });
});

describe('buildHandoff', () => {
  const text = (data = night(), opts = {}) =>
    buildHandoff(data, { patientName: 'Elijah Carty', startHour: 20, endHour: 8, ...opts });

  it('leads with who and which night', () => {
    expect(text().split('\n')[0]).toBe('Elijah Carty · Overnight Aug 17–18 · 8 PM–8 AM');
  });

  it('carries the numbers a nurse would read out', () => {
    const out = text();
    expect(out).toContain('SpO2 70–100% (avg 97%) · 9.7m below 90%');
    expect(out).toContain('HR 58–121 bpm (avg 80.9)');
    expect(out).toContain('Alert episodes: 2 · 7.7m total · longest 3.5m');
    expect(out).toContain('Oxygen: none');
    expect(out).toContain('Care: 1 of 3 completed · missed 1 medication, 1 care task');
    expect(out).toContain('Sensor coverage: 11h 42m of 12h (98%)');
  });

  it('says outright that there were no readings rather than printing blanks', () => {
    const out = text(night({ vitals_summary: {} }));
    expect(out).toContain('SpO2: no readings in the window');
    expect(out).not.toContain('undefined');
  });

  it('includes symptoms when any were logged', () => {
    const out = text(night({ symptoms: [{ symptom_type: 'Congestion', severity: 4 }] }));
    expect(out).toContain('Symptoms: Congestion (4/10)');
  });

  it('reports oxygen when it was given', () => {
    const out = text(night({ oxygen: { episodes: 1, total_minutes: 12.5, highest_flow: 2 } }));
    expect(out).toContain('Oxygen: 12.5m · peak 2L');
  });
});

describe('toCsv', () => {
  it('writes the plotted samples with real timestamps', () => {
    const lines = toCsv(night()).trim().split('\n');
    expect(lines[0]).toBe('timestamp,spo2,hr');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z,100,86$/);
  });

  it('names the file after the night', () => {
    expect(csvFileName('2026-08-17')).toBe('overnight_2026-08-17.csv');
  });
});
