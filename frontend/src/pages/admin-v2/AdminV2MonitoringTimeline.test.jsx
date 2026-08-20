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
// Day timeline. The claims worth pinning: the two charts stay one instrument
// (same window, same plot geometry), the day summary is computed from the
// payload rather than trusted, an unclosed alert is never given a duration,
// and the day requested is the local one.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const { charts } = vi.hoisted(() => ({ charts: [] }));

vi.mock('chart.js/auto', () => {
  class MockChart {
    constructor(ctx, cfg) {
      this.config = cfg;
      this.options = cfg.options;
      this.data = cfg.data;
      this.scales = {
        x: { min: cfg.options.scales.x.min, max: cfg.options.scales.x.max },
        y: { min: cfg.options.scales.y.min, max: cfg.options.scales.y.max },
      };
      this.destroyed = false;
      charts.push(this);
    }
    zoomScale(axis, { min, max }) { this.scales[axis] = { min, max }; }
    update() {}
    destroy() { this.destroyed = true; }
  }
  MockChart.register = () => {};
  return { default: MockChart };
});
vi.mock('chartjs-adapter-date-fns', () => ({}));
vi.mock('chartjs-plugin-annotation', () => ({ default: {} }));
vi.mock('chartjs-plugin-zoom', () => ({ default: {} }));
vi.mock('../../config', () => ({
  default: { apiUrl: '' },
  apiFetch: (...args) => fetch(...args),
}));
vi.mock('../../contexts/AdminPatientContext', () => {
  // Stable identity: a fresh object each render would retrigger the fetch
  // effect and loop.
  const selectedPatient = { id: 5, first_name: 'Test', last_name: 'Testerson' };
  return { useAdminPatient: () => ({ selectedPatient }) };
});

import AdminV2MonitoringTimeline from './AdminV2MonitoringTimeline';

const DAY = '2026-08-19';
const at = (hhmm, s = 0) => `${DAY}T${hhmm}:${String(s).padStart(2, '0')}`;

const payload = {
  date: DAY,
  pulse_ox: [
    { ts: at('08:00'), spo2: 98, bpm: 70, perfusion: 5.1 },
    { ts: at('09:00'), spo2: 96, bpm: 80, perfusion: 4.4 },
    { ts: at('12:57'), spo2: 89, bpm: 84, perfusion: 7.2 },
    { ts: at('14:00'), spo2: 94, bpm: 112, perfusion: 3.9 },
  ],
  medications: [{ ts: at('12:43'), name: 'Ondansetron', dose: '4 mg', status: 'on-time', notes: '' }],
  care_tasks: [{ ts: at('07:30'), name: 'Trach care', category: 'Airway', status: 'completed', notes: '' }],
  nutrition_intake: [{ ts: at('12:30'), item_name: 'Tube feed', item_type: 'formula', amount: 525, amount_unit: 'mL', calories: 500 }],
  nutrition_output: [{ ts: at('11:00'), output_type: 'urine', is_diaper: false }],
  vitals: [{ ts: at('10:00'), vital_type: 'temperature', vital_group: null, value: 37.1, unit: 'C', notes: '' }],
  alerts: [
    { start: at('12:57'), end: at('12:58', 22), spo2_alarm: true, hr_alarm: false, spo2_min: 89, bpm_min: 84, oxygen_used: false, acknowledged: true },
    { start: at('14:00'), end: null, spo2_alarm: false, hr_alarm: true, spo2_min: 94, bpm_min: 112, oxygen_used: true, acknowledged: false },
  ],
};

const SETTINGS = { min_spo2: 90, max_spo2: 100, min_bpm: 55, max_bpm: 155 };

const ENV_RANGES = {
  patient_id: 5,
  ranges: [
    { metric: 'temperature', source: 'default', caution_min: 18, caution_max: 24, critical_min: 15, critical_max: 28 },
    { metric: 'relative_humidity', source: 'default', caution_min: 30, caution_max: 60, critical_min: 20, critical_max: 70 },
    { metric: 'co2', source: 'default', caution_min: null, caution_max: 1000, critical_min: null, critical_max: 2000 },
    { metric: 'pm25', source: 'default', caution_min: null, caution_max: 12, critical_min: null, critical_max: 35 },
  ],
};
const LOCATIONS = [
  { scope: 'room', location: 'Bedroom' },
  { scope: 'room', location: 'Living room' },
  { scope: 'outdoor', location: '' },
];
// Newest-first, the way the observations API returns them.
let envObservations = {
  co2: [
    { ts: at('14:00'), avg: 2400 },
    { ts: at('13:45'), avg: 1400 },
    { ts: at('13:30'), avg: 600 },
  ],
  pm25: [
    { ts: at('13:45'), avg: 40 },
    { ts: at('13:30'), avg: 5 },
  ],
  temperature: [{ ts: at('13:30'), avg: 21 }],
  relative_humidity: [{ ts: at('13:30'), avg: 45 }],
};

let timelineBody;
const calls = [];

beforeEach(() => {
  charts.length = 0;
  calls.length = 0;
  timelineBody = payload;
  envObservations = {
    co2: [
      { ts: at('14:00'), avg: 2400 },
      { ts: at('13:45'), avg: 1400 },
      { ts: at('13:30'), avg: 600 },
    ],
    pm25: [
      { ts: at('13:45'), avg: 40 },
      { ts: at('13:30'), avg: 5 },
    ],
    temperature: [{ ts: at('13:30'), avg: 21 }],
    relative_humidity: [{ ts: at('13:30'), avg: 45 }],
  };
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes('/api/settings')) return { ok: true, json: async () => SETTINGS };
    if (u.includes('/api/environment/ranges')) return { ok: true, json: async () => ENV_RANGES };
    if (u.includes('/api/environment/locations')) return { ok: true, json: async () => LOCATIONS };
    if (u.includes('/api/environment/observations')) {
      const metric = new URL(u, 'http://x').searchParams.get('metric');
      return { ok: true, json: async () => envObservations[metric] ?? [] };
    }
    return { ok: true, json: async () => timelineBody };
  }));
  // Chart.js is mocked, but jsdom still has no 2d context.
  HTMLCanvasElement.prototype.getContext = () => ({});
});
afterEach(() => { vi.unstubAllGlobals(); });

const renderPage = async () => {
  const utils = render(<AdminV2MonitoringTimeline />);
  await act(async () => { await Promise.resolve(); });
  return utils;
};

// A lane marker and its activity row share an accessible name on purpose —
// they are the same event. Scope clicks to the list so the query is unique.
const clickActivity = async (name) => {
  const list = document.querySelector('.mtl-activity');
  await act(async () => {
    fireEvent.click(within(list).getByRole('button', { name }));
  });
};

describe('day timeline summary', () => {
  it('computes the day figures from the readings, not from the payload', async () => {
    await renderPage();
    // spo2 avg of 98/96/89/94 = 94.25, low 89; bpm avg 86.5, high 112.
    expect(screen.getByText('94.3')).toBeInTheDocument();
    expect(screen.getByText('89')).toBeInTheDocument();
    expect(screen.getByText('87')).toBeInTheDocument();
    expect(screen.getByText('112')).toBeInTheDocument();
  });

  it('counts alerts separately from the other events', async () => {
    await renderPage();
    const stats = document.querySelector('.mtl-stats');
    // 2 alerts; 5 non-alert events (med, care task, intake, output, vital).
    expect(within(stats).getByText('2')).toBeInTheDocument();
    expect(within(stats).getByText('5')).toBeInTheDocument();
  });

  it('renders a day with no readings without inventing numbers', async () => {
    timelineBody = { ...payload, pulse_ox: [], alerts: [] };
    await renderPage();
    expect(screen.getByText(/No pulse-ox data this day/)).toBeInTheDocument();
    expect(document.querySelectorAll('.mtl-stat-empty').length).toBeGreaterThan(0);
  });
});

describe('the two charts are one instrument', () => {
  it('renders a chart per active signal', async () => {
    await renderPage();
    expect(charts.filter((c) => !c.destroyed)).toHaveLength(2);
  });

  it('gives both charts the same time window', async () => {
    await renderPage();
    const [spo2, bpm] = charts.filter((c) => !c.destroyed);
    expect(spo2.options.scales.x.min).toBe(bpm.options.scales.x.min);
    expect(spo2.options.scales.x.max).toBe(bpm.options.scales.x.max);
  });

  it('pins both y-axes to the same width so the plot boxes line up', async () => {
    await renderPage();
    const widths = charts.filter((c) => !c.destroyed).map((c) => {
      const scale = { width: 0 };
      c.options.scales.y.afterFit(scale);
      return scale.width;
    });
    expect(widths).toEqual([52, 52]);
    // …and the stylesheet insets the lanes and scrubber by that same gutter.
    // jsdom does not apply the imported CSS, so read the contract from source:
    // if these two ever disagree the markers stop landing on their samples.
    const css = readFileSync(resolve(__dirname, 'monitoring-timeline.css'), 'utf8');
    expect(css).toMatch(/--mtl-gutter:\s*52px/);
    expect(css).toMatch(/--mtl-rpad:\s*12px/);
  });

  it('only the bottom chart draws time labels', async () => {
    await renderPage();
    const shown = charts.filter((c) => !c.destroyed).map((c) => c.options.scales.x.ticks.display);
    expect(shown).toEqual([false, true]);
  });

  it('each chart keeps its own y scale', async () => {
    await renderPage();
    const [spo2, bpm] = charts.filter((c) => !c.destroyed);
    expect(spo2.options.scales.y.max).toBeLessThanOrEqual(100);
    expect(bpm.options.scales.y.max).toBeGreaterThan(100);
  });

  it('a zoom on one chart moves the other', async () => {
    await renderPage();
    const before = charts.filter((c) => !c.destroyed);
    const min = new Date(at('12:00')).getTime();
    const max = new Date(at('13:00')).getTime();
    before[0].scales.x = { min, max };
    await act(async () => {
      before[0].options.plugins.zoom.zoom.onZoomComplete({ chart: before[0] });
    });
    const after = charts.filter((c) => !c.destroyed);
    expect(after[1].scales.x).toEqual({ min, max });
  });
});

describe('signal toggles', () => {
  it('turning a signal off drops its chart', async () => {
    await renderPage();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Heart Rate/ })); });
    expect(charts.filter((c) => !c.destroyed)).toHaveLength(1);
  });

  it('refuses to leave the card with no signal in it', async () => {
    await renderPage();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Heart Rate/ })); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^SpO2/ })); });
    expect(charts.filter((c) => !c.destroyed)).toHaveLength(1);
    expect(screen.getByRole('button', { name: /^SpO2/ })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('alarm thresholds', () => {
  it('draws the configured floor, not an invented one', async () => {
    await renderPage();
    const [spo2, bpm] = charts.filter((c) => !c.destroyed);
    expect(spo2.options.plugins.annotation.annotations.low.yMin).toBe(90);
    expect(spo2.options.plugins.annotation.annotations.high).toBeUndefined();
    expect(bpm.options.plugins.annotation.annotations.low.yMin).toBe(55);
    expect(bpm.options.plugins.annotation.annotations.high.yMin).toBe(155);
  });
});

describe('alert bands', () => {
  it('bands every alert on both charts', async () => {
    await renderPage();
    charts.filter((c) => !c.destroyed).forEach((c) => {
      const boxes = Object.entries(c.options.plugins.annotation.annotations)
        .filter(([k]) => k.startsWith('band'));
      expect(boxes).toHaveLength(2);
    });
  });

  it('runs an unclosed alert to the end of the day rather than stopping it early', async () => {
    await renderPage();
    const [spo2] = charts.filter((c) => !c.destroyed);
    const open = spo2.options.plugins.annotation.annotations.band1;
    const endOfDay = new Date(`${DAY}T23:59:59.999`).getTime();
    expect(open.xMax).toBe(endOfDay);
  });
});

describe('the scrubbed moment', () => {
  it('reads the sample at the selected time, perfusion included', async () => {
    await renderPage();
    await clickActivity(/12:57 PM Low SpO2 alert/);
    const detail = document.querySelector('.mtl-detail-main');
    expect(within(detail).getByText('89')).toBeInTheDocument();
    expect(within(detail).getByText('84')).toBeInTheDocument();
    expect(within(detail).getByText('7.2')).toBeInTheDocument();
  });

  it('gives a closed alert its duration', async () => {
    await renderPage();
    await clickActivity(/12:57 PM Low SpO2 alert/);
    expect(screen.getByText(/1m 22s/)).toBeInTheDocument();
  });

  it('says an unclosed alert is still open instead of timing it', async () => {
    await renderPage();
    await clickActivity(/2:00 PM Heart rate alert/);
    expect(screen.getByText(/still open/)).toBeInTheDocument();
    expect(screen.getByText('Alert ongoing')).toBeInTheDocument();
    expect(screen.queryByText(/Duration/)).not.toBeInTheDocument();
  });

  it('will not read a value for a time with no nearby sample', async () => {
    await renderPage();
    await clickActivity(/7:30 AM Trach care/);
    expect(screen.getByText(/No pulse-ox reading within a minute/)).toBeInTheDocument();
  });
});

describe('event lanes', () => {
  it('shows four lanes until asked for the rest', async () => {
    await renderPage();
    // Scoped: the room-condition lanes share the .mtl-lane class.
    const events = () => document.querySelectorAll('.mtl-lanes:not(.mtl-envlanes) .mtl-lane');
    expect(events()).toHaveLength(4);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /more/i })); });
    expect(events()).toHaveLength(6);
  });

  it('places a marker by its position in the visible window', async () => {
    await renderPage();
    const mark = document.querySelector('.mtl-lanes:not(.mtl-envlanes) .mtl-lane-mark');
    // 12:57 PM of a full day ≈ 54%.
    expect(parseFloat(mark.style.left)).toBeCloseTo(53.96, 1);
  });
});

describe('the day it asks for', () => {
  it('uses the local calendar date, not the UTC one', async () => {
    // 11pm on the 19th in a zone behind UTC is already the 20th in UTC; the
    // request must still be for the 19th.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 19, 23, 30));
    try {
      await renderPage();
      expect(calls.find((c) => c.includes('/api/monitoring/timeline')))
        .toContain('target_date=2026-08-19');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('time cuts', () => {
  it('offers the whole ladder down to a minute', async () => {
    await renderPage();
    const group = screen.getByRole('group', { name: 'Time range' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent))
      .toEqual(['24H', '6H', '1H', '30M', '5M', '1M']);
  });

  it('narrows the window to the chosen span', async () => {
    await renderPage();
    await clickActivity(/12:57 PM Low SpO2 alert/);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '5M' })); });
    const [spo2, bpm] = charts.filter((c) => !c.destroyed);
    expect(spo2.scales.x.max - spo2.scales.x.min).toBe(5 * 60_000);
    // …and the sibling came with it.
    expect(bpm.scales.x).toEqual(spo2.scales.x);
  });

  it('keeps a narrow cut inside the day at the edges', async () => {
    await renderPage();
    await clickActivity(/7:30 AM Trach care/);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '1M' })); });
    const [spo2] = charts.filter((c) => !c.destroyed);
    const dayStart = new Date(`${DAY}T00:00:00`).getTime();
    const dayEnd = new Date(`${DAY}T23:59:59.999`).getTime();
    expect(spo2.scales.x.min).toBeGreaterThanOrEqual(dayStart);
    expect(spo2.scales.x.max).toBeLessThanOrEqual(dayEnd);
    expect(spo2.scales.x.max - spo2.scales.x.min).toBe(60_000);
  });
});

describe('room condition lanes', () => {
  it('draws a lane per judged metric', async () => {
    await renderPage();
    const env = document.querySelector('.mtl-envlanes');
    expect(within(env).getByText('Room °C')).toBeInTheDocument();
    expect(within(env).getByText('Humidity')).toBeInTheDocument();
    expect(within(env).getByText('CO2')).toBeInTheDocument();
    expect(within(env).getByText('PM2.5')).toBeInTheDocument();
  });

  it('flags only what is out of bounds, at the right severity', async () => {
    await renderPage();
    const env = document.querySelector('.mtl-envlanes');
    // CO2 ran 600 (ok) -> 1400 (caution) -> 2400 (critical).
    expect(env.querySelectorAll('.mtl-env-span.sev-caution.dir-high')).toHaveLength(1);
    expect(env.querySelectorAll('.mtl-env-span.sev-critical.dir-high')).toHaveLength(1);
    // Temperature and humidity sat in range, so they draw nothing.
    expect(env.querySelectorAll('.mtl-lane-empty').length).toBeGreaterThanOrEqual(2);
  });

  it('bands PM2.5 across its whole day, good stretches included', async () => {
    await renderPage();
    const env = document.querySelector('.mtl-envlanes');
    const banded = env.querySelectorAll('.mtl-env-span.banded');
    expect(banded).toHaveLength(2);
    expect(banded[0].className).toContain('sev-ok');
    expect(banded[1].className).toContain('sev-critical');
  });

  it('encodes direction as position, not just colour', async () => {
    envObservations.temperature = [{ ts: at('13:30'), avg: 12 }];
    await renderPage();
    const cold = document.querySelector('.mtl-envlanes .mtl-env-span.dir-low');
    expect(cold).toBeTruthy();
    expect(cold.className).toContain('sev-critical');
  });

  it('summarises how much of the room was out of range', async () => {
    await renderPage();
    expect(screen.getByText('2 of 4 out of range at some point.')).toBeInTheDocument();
  });

  it('says so when the room was never measured', async () => {
    envObservations = {};
    await renderPage();
    expect(screen.getByText('No room readings for this day.')).toBeInTheDocument();
  });

  it('asks for the room the patient is in, at room scope', async () => {
    await renderPage();
    const obs = calls.filter((c) => c.includes('/api/environment/observations'));
    expect(obs).toHaveLength(4);
    obs.forEach((c) => {
      expect(c).toContain('scope=room');
      expect(c).toContain('location=Bedroom');
    });
  });

  it('offers the rooms that have readings', async () => {
    await renderPage();
    const picker = screen.getByRole('combobox', { name: 'Room' });
    expect([...picker.options].map((o) => o.textContent))
      .toEqual(['Bedroom', 'Living room']);
  });
});
