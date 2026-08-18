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
  findEpisodes, coverageBuckets, downsample, samplePeriodMs,
  formatDuration, formatHours, atAGlance, WATCH_SPO2, collapseDistribution,
} from './pulseOxDay';

const T0 = Date.UTC(2026, 7, 18, 12, 0, 0);
// Readings two seconds apart, which is the real sampler's cadence.
const at = (i, spo2, bpm = 90) => ({ timestamp: new Date(T0 + i * 2000).toISOString(), spo2, bpm });

describe('samplePeriodMs', () => {
  it('takes the median gap, so one long dropout does not skew it', () => {
    const rs = [at(0, 98), at(1, 98), at(2, 98), { timestamp: new Date(T0 + 600000).toISOString(), spo2: 98 }];
    expect(samplePeriodMs(rs)).toBe(2000);
  });

  it('is zero when there is nothing to measure', () => {
    expect(samplePeriodMs([])).toBe(0);
    expect(samplePeriodMs([at(0, 98)])).toBe(0);
  });
});

describe('findEpisodes', () => {
  it('finds a run below the watch threshold and reports its nadir', () => {
    const rs = [at(0, 98), at(1, 93), at(2, 91), at(3, 92), at(4, 97)];
    const [e] = findEpisodes(rs);
    expect(e.nadir).toBe(91);
    expect(e.readings).toBe(3);
    expect(e.durationMs).toBe(4000);
  });

  it('reports the heart rate at the nadir, not at the start', () => {
    const rs = [at(0, 98, 80), at(1, 93, 88), at(2, 90, 121), at(3, 97, 85)];
    expect(findEpisodes(rs)[0].bpmAtNadir).toBe(121);
  });

  it('gives a single-sample dip one sample period rather than zero', () => {
    const rs = [at(0, 98), at(1, 92), at(2, 98)];
    expect(findEpisodes(rs)[0].durationMs).toBe(2000);
  });

  it('separates two dips that recover in between', () => {
    const rs = [at(0, 98), at(1, 92), at(2, 98), at(3, 91), at(4, 99)];
    expect(findEpisodes(rs)).toHaveLength(2);
  });

  it('treats a sensor dropout as missing, not as a dip or a recovery', () => {
    // spo2 0 is how the analyzer's error readings arrive.
    const rs = [at(0, 98), at(1, 92), at(2, 0), at(3, 91), at(4, 98)];
    const eps = findEpisodes(rs);
    expect(eps).toHaveLength(1);
    expect(eps[0].nadir).toBe(91);
    expect(eps[0].readings).toBe(2);
  });

  it('marks alert level only when the configured alarm threshold is breached', () => {
    const rs = [at(0, 98), at(1, 92), at(2, 98), at(3, 88), at(4, 98)];
    const eps = findEpisodes(rs, { alarm: 90 });
    expect(eps.map(e => e.alertLevel)).toEqual([false, true]);
  });

  it('does not mark alert level when no threshold is known', () => {
    expect(findEpisodes([at(0, 70), at(1, 98)])[0].alertLevel).toBe(false);
  });

  it('closes a run that reaches the end of the day', () => {
    const eps = findEpisodes([at(0, 98), at(1, 91), at(2, 90)]);
    expect(eps).toHaveLength(1);
    expect(eps[0].nadir).toBe(90);
  });

  it('is empty for a clean day', () => {
    expect(findEpisodes([at(0, 98), at(1, 99), at(2, 100)])).toEqual([]);
    expect(findEpisodes([])).toEqual([]);
  });

  it('uses 94 as the watch threshold, the top of the analyzer low-90s band', () => {
    expect(WATCH_SPO2).toBe(94);
    expect(findEpisodes([at(0, 94), at(1, 98)])).toHaveLength(0);
    expect(findEpisodes([at(0, 93), at(1, 98)])).toHaveLength(1);
  });
});

describe('coverageBuckets', () => {
  it('marks only the slots that contain readings', () => {
    // Readings in the first and last tenth of the window, nothing between.
    const rs = [at(0, 98), at(1, 98), at(48, 98), at(49, 98)];
    const { buckets } = coverageBuckets(rs, 10);
    expect(buckets[0]).toBe(true);
    expect(buckets[9]).toBe(true);
    expect(buckets.slice(1, 9).every(b => !b)).toBe(true);
  });

  it('reports the covered window rather than the whole day', () => {
    const { startMs, endMs } = coverageBuckets([at(0, 98), at(10, 98)], 8);
    expect(startMs).toBe(T0);
    expect(endMs).toBe(T0 + 20000);
  });

  it('is empty when there is nothing to cover', () => {
    expect(coverageBuckets([], 10).buckets).toEqual([]);
    expect(coverageBuckets([at(0, 0), at(1, 0)], 10).buckets).toEqual([]);
  });
});

describe('downsample', () => {
  it('leaves a short series alone', () => {
    const rs = [at(0, 98), at(1, 97)];
    expect(downsample(rs, 240)).toHaveLength(2);
  });

  it('keeps a brief desaturation instead of averaging it away', () => {
    const rs = Array.from({ length: 400 }, (_, i) => at(i, i === 200 ? 84 : 98));
    const out = downsample(rs, 40);
    expect(out.length).toBeLessThanOrEqual(60);
    expect(Math.min(...out.map(p => p.spo2))).toBe(84);
  });

  it('emits points in time order', () => {
    const rs = Array.from({ length: 400 }, (_, i) => at(i, 90 + (i % 10)));
    const out = downsample(rs, 40);
    const ts = out.map(p => p.t);
    expect([...ts].sort((a, b) => a - b)).toEqual(ts);
  });

  it('drops sensor errors so they cannot plot as a cliff to zero', () => {
    const out = downsample([at(0, 98), at(1, 0), at(2, 97)], 240);
    expect(out).toHaveLength(2);
  });
});

describe('formatting', () => {
  it('formats durations under and over a minute', () => {
    expect(formatDuration(18000)).toBe('18s');
    expect(formatDuration(124000)).toBe('2m 04s');
    expect(formatDuration(0)).toBe('0s');
  });

  it('formats coverage in hours and minutes', () => {
    expect(formatHours(181)).toBe('3h 01m');
    expect(formatHours(47)).toBe('47m');
    expect(formatHours(0)).toBe('0m');
  });
});

describe('atAGlance', () => {
  const analysis = (over = {}) => ({
    time_logged_minutes: 181,
    error_spo2_readings: 0,
    spo2_distribution: {
      high_90s_97_plus: { count: 4820, percentage: 89.2 },
      mid_90s_94_96: { count: 569, percentage: 10.5 },
      low_90s_90_93: { count: 15, percentage: 0.3 },
      high_eighties_85_89: { count: 0, percentage: 0 },
      zero_errors: { count: 0, percentage: 0 },
    },
    ...over,
  });

  it('leads with the reassuring line when nothing fell below 90', () => {
    const lines = atAGlance(analysis(), [], 90);
    expect(lines[0]).toEqual({ tone: 'ok', text: 'No readings below 90%' });
    expect(lines[1].text).toBe('15 readings between 90-93%');
    expect(lines.at(-1).text).toBe('Coverage: 3h 01m of selected day');
  });

  it('counts every sub-90 bucket, not just the 85-89 one', () => {
    const a = analysis();
    a.spo2_distribution.high_eighties_85_89.count = 4;
    a.spo2_distribution.seventies_70_79 = { count: 2, percentage: 0.1 };
    const lines = atAGlance(a, [], 90);
    expect(lines[0]).toEqual({ tone: 'alert', text: '6 readings below 90%' });
  });

  it('never counts sensor errors as desaturations', () => {
    const a = analysis({ error_spo2_readings: 12 });
    a.spo2_distribution.zero_errors = { count: 12, percentage: 0.2 };
    const lines = atAGlance(a, [], 90);
    expect(lines[0].text).toBe('No readings below 90%');
    expect(lines.some(l => l.text === '12 sensor errors')).toBe(true);
  });

  it('calls out alert-level episodes against the configured threshold', () => {
    const lines = atAGlance(analysis(), [{ alertLevel: true }, { alertLevel: false }], 90);
    expect(lines.some(l => l.text === '1 episode below the 90% alarm threshold')).toBe(true);
  });

  it('omits the low-90s line when there were none', () => {
    const a = analysis();
    a.spo2_distribution.low_90s_90_93.count = 0;
    expect(atAGlance(a, [], 90).some(l => /90-93/.test(l.text))).toBe(false);
  });

  it('is empty without an analysis', () => {
    expect(atAGlance(null, [], 90)).toEqual([]);
  });
});

describe('collapseDistribution', () => {
  const dist = {
    high_90s_97_plus: { count: 4820, percentage: 89.2 },
    mid_90s_94_96: { count: 569, percentage: 10.5 },
    low_90s_90_93: { count: 15, percentage: 0.3 },
    high_eighties_85_89: { count: 3, percentage: 0.1 },
    seventies_70_79: { count: 2, percentage: 0.1 },
    zero_errors: { count: 7, percentage: 0.2 },
  };

  it('folds every sub-90 bucket into one band rather than dropping the tail', () => {
    const below = collapseDistribution(dist).find(b => b.key === 'below');
    expect(below.count).toBe(5);
    expect(below.percentage).toBe(0.2);
  });

  it('keeps sensor errors out of the clinical bands', () => {
    const bands = collapseDistribution(dist);
    expect(bands.find(b => b.key === 'errors').count).toBe(7);
    expect(bands.find(b => b.key === 'below').count).toBe(5);
  });

  it('always returns all five bands, so the scale does not move between days', () => {
    expect(collapseDistribution({}).map(b => b.key)).toEqual(['high', 'mid', 'low', 'below', 'errors']);
    expect(collapseDistribution(undefined).every(b => b.count === 0)).toBe(true);
  });

  it('reserves red for the sub-90 band alone', () => {
    const tones = Object.fromEntries(collapseDistribution(dist).map(b => [b.key, b.tone]));
    expect(tones).toEqual({ high: 'complete', mid: 'live', low: 'due', below: 'alert', errors: 'idle' });
  });
});
