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
// Room readings -> timeline lanes. The rules worth pinning are the ones about
// absent bounds and absent data, because both are easy to render as a
// confident "fine".
import { describe, it, expect } from 'vitest';
import {
  classifyEnv, buildEnvSpans, worstStatus, severityOf, directionOf,
} from './timelineEnv';

const BOTH = { caution_min: 18, caution_max: 24, critical_min: 15, critical_max: 28 };
const CEILING = { caution_min: null, caution_max: 1000, critical_min: null, critical_max: 2000 };
const MIN = 60_000;

describe('classifyEnv', () => {
  it('reads a value against both bands on both sides', () => {
    expect(classifyEnv(21, BOTH)).toBe('ok');
    expect(classifyEnv(25, BOTH)).toBe('caution-high');
    expect(classifyEnv(29, BOTH)).toBe('critical-high');
    expect(classifyEnv(17, BOTH)).toBe('caution-low');
    expect(classifyEnv(14, BOTH)).toBe('critical-low');
  });

  it('reports the worse band when a value passes both', () => {
    expect(classifyEnv(3000, CEILING)).toBe('critical-high');
  });

  it('treats a missing bound as no opinion, not as zero', () => {
    // A ceiling-only metric must never report "low" — a 0 floor would flag
    // every clean reading.
    expect(classifyEnv(0, CEILING)).toBe('ok');
    expect(classifyEnv(-5, CEILING)).toBe('ok');
  });

  it('will not judge a reading it does not have', () => {
    expect(classifyEnv(null, BOTH)).toBe('unknown');
    expect(classifyEnv(21, null)).toBe('unknown');
    expect(classifyEnv(undefined, BOTH)).toBe('unknown');
  });

  it('is inclusive of the bound itself', () => {
    expect(classifyEnv(24, BOTH)).toBe('ok');
    expect(classifyEnv(18, BOTH)).toBe('ok');
  });
});

describe('buildEnvSpans', () => {
  const rows = (...vals) => vals.map((v, i) => ({ ts: i * 15 * MIN, value: v }));

  it('merges neighbouring readings of the same status into one span', () => {
    const spans = buildEnvSpans(rows(30, 30, 30), BOTH, 15 * MIN);
    expect(spans).toHaveLength(1);
    expect(spans[0].status).toBe('critical-high');
    expect(spans[0].samples).toBe(3);
  });

  it('drops in-range stretches unless the lane is banded', () => {
    const spans = buildEnvSpans(rows(21, 30, 21), BOTH, 15 * MIN);
    expect(spans.map((s) => s.status)).toEqual(['critical-high']);

    const banded = buildEnvSpans(rows(21, 30, 21), BOTH, 15 * MIN, { keepOk: true });
    expect(banded.map((s) => s.status)).toEqual(['ok', 'critical-high', 'ok']);
  });

  it('extends a span to cover the bucket it ends in', () => {
    const spans = buildEnvSpans(rows(30), BOTH, 15 * MIN);
    // One reading is a quarter hour of room, not an instant.
    expect(spans[0].to - spans[0].from).toBe(15 * MIN);
  });

  it('breaks a span across a gap instead of bridging it', () => {
    const spans = buildEnvSpans([
      { ts: 0, value: 30 },
      { ts: 15 * MIN, value: 30 },
      // Four hours with no readings, then the room is hot again.
      { ts: 4 * 60 * MIN, value: 30 },
    ], BOTH, 15 * MIN);
    expect(spans).toHaveLength(2);
    expect(spans[0].to).toBe(30 * MIN);
  });

  it('keeps the reading that justifies the span', () => {
    const hot = buildEnvSpans(rows(29, 33, 30), BOTH, 15 * MIN);
    expect(hot[0].peak).toBe(33);
    const cold = buildEnvSpans(rows(14, 11, 13), BOTH, 15 * MIN);
    expect(cold[0].peak).toBe(11);
  });

  it('produces nothing from no readings', () => {
    expect(buildEnvSpans([], BOTH, 15 * MIN)).toEqual([]);
  });

  it('produces no flags when the patient has no bounds set', () => {
    expect(buildEnvSpans(rows(30, 40), undefined, 15 * MIN)).toEqual([]);
  });
});

describe('lane summary', () => {
  it('reports the worst band the day reached', () => {
    expect(worstStatus([])).toBe('ok');
    expect(worstStatus([{ status: 'caution-high' }])).toBe('caution');
    expect(worstStatus([{ status: 'caution-high' }, { status: 'critical-low' }]))
      .toBe('critical');
  });
});

describe('severity and direction are separate readings', () => {
  it('splits the status into the two things the lane encodes', () => {
    expect(severityOf('critical-low')).toBe('critical');
    expect(directionOf('critical-low')).toBe('low');
    expect(severityOf('caution-high')).toBe('caution');
    expect(directionOf('caution-high')).toBe('high');
    expect(directionOf('ok')).toBeNull();
  });
});
