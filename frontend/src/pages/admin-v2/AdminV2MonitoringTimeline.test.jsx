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
// AdminV2MonitoringTimeline: pulse-ox series picker — SpO2 / BPM / Perfusion
// chips, at most two active at once (one per y-axis), tap-to-swap behavior.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

const { chartInstances } = vi.hoisted(() => ({ chartInstances: [] }));

vi.mock('chart.js/auto', () => {
  class MockChart {
    constructor(ctx, config) {
      this.config = config;
      chartInstances.push(this);
    }
    destroy() {}
    resetZoom() {}
    zoomScale() {}
    update() {}
  }
  MockChart.register = () => {};
  return { default: MockChart };
});
vi.mock('chartjs-adapter-date-fns', () => ({}));
vi.mock('chartjs-plugin-annotation', () => ({ default: {} }));
vi.mock('chartjs-plugin-zoom', () => ({ default: {} }));
vi.mock('../../config', () => ({ default: { apiUrl: '' } }));
vi.mock('../../contexts/AdminPatientContext', () => {
  // Stable identity: a fresh object per render would retrigger the fetch
  // effect (selectedPatient is a useCallback dep) and loop forever.
  const selectedPatient = { id: 5, first_name: 'Test' };
  return { useAdminPatient: () => ({ selectedPatient }) };
});
vi.mock('../../hooks/useChartColors', () => ({
  useChartColors: () => ({ grid: '#333', axis: '#999', foreground: '#fff' }),
}));

import AdminV2MonitoringTimeline from './AdminV2MonitoringTimeline';

const timelinePayload = {
  date: '2026-07-14',
  pulse_ox: [
    { ts: '2026-07-14T10:00:00', spo2: 97.2, bpm: 88, perfusion: 1.4 },
    { ts: '2026-07-14T10:01:00', spo2: 96.8, bpm: 90, perfusion: 1.1 },
    { ts: '2026-07-14T10:02:00', spo2: null, bpm: 91, perfusion: null },
  ],
  medications: [],
  care_tasks: [],
  nutrition_intake: [],
  nutrition_output: [],
  vitals: [],
  alerts: [],
};

const latestChart = () => chartInstances[chartInstances.length - 1];
const datasetLabels = () => latestChart().config.data.datasets.map(d => d.label);
const scaleIds = () => Object.keys(latestChart().config.options.scales).filter(k => k !== 'x');

const renderPage = async () => {
  await act(async () => {
    render(<AdminV2MonitoringTimeline />);
  });
};

beforeEach(() => {
  chartInstances.length = 0;
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({}));
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => timelinePayload,
  })));
});

describe('AdminV2MonitoringTimeline vital series picker', () => {
  it('shows all three chips and defaults to SpO2 + BPM', async () => {
    await renderPage();
    expect(screen.getByRole('button', { name: /SpO2/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /BPM/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Perfusion/ })).toBeInTheDocument();

    expect(datasetLabels()).toEqual(['SpO2 (%)', 'BPM']);
    expect(scaleIds()).toEqual(['y_spo2', 'y_bpm']);
    expect(latestChart().config.options.scales.y_spo2.position).toBe('left');
    expect(latestChart().config.options.scales.y_bpm.position).toBe('right');
  });

  it('tapping a third series replaces the oldest selection (max 2 active)', async () => {
    await renderPage();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Perfusion/ }));
    });
    // SpO2 was oldest, so BPM + Perfusion remain; BPM takes the left axis
    expect(datasetLabels()).toEqual(['BPM', 'Perfusion (PI)']);
    expect(latestChart().config.options.scales.y_bpm.position).toBe('left');
    expect(latestChart().config.options.scales.y_perfusion.position).toBe('right');
  });

  it('tapping an active series removes it, leaving a single left axis', async () => {
    await renderPage();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /BPM/ }));
    });
    expect(datasetLabels()).toEqual(['SpO2 (%)']);
    expect(scaleIds()).toEqual(['y_spo2']);
    expect(latestChart().config.options.scales.y_spo2.position).toBe('left');
  });

  it('perfusion dataset uses perfusion values and skips null readings', async () => {
    await renderPage();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Perfusion/ }));
    });
    const perfusion = latestChart().config.data.datasets.find(d => d.label === 'Perfusion (PI)');
    expect(perfusion.data.map(p => p.y)).toEqual([1.4, 1.1]);
    expect(perfusion.yAxisID).toBe('y_perfusion');
  });
});
