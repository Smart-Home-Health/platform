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
// Dashboard settings: string booleans from the API become real booleans, a
// vital can drive only one sub-chart, and the save payload is exactly the
// four keys the form owns.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import DashboardSettings from './DashboardSettings';

const svc = vi.hoisted(() => ({ getSettings: vi.fn(), updateSettings: vi.fn() }));
vi.mock('../../services/settings', () => svc);
const net = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('../../config', () => ({ default: { apiUrl: '' }, apiFetch: net.apiFetch }));

const json = (body) => Promise.resolve({ ok: true, json: () => Promise.resolve(body) });

beforeEach(() => {
  vi.clearAllMocks();
  svc.getSettings.mockResolvedValue({
    show_statistics: 'True', perfusion_as_percent: 'False',
    dashboard_chart_1_vital: 'temperature', dashboard_chart_2_vital: '',
    show_alerts_count: 'True', unrelated: 'x',
  });
  svc.updateSettings.mockResolvedValue({});
  net.apiFetch.mockImplementation((url) => (
    url.includes('/vitals/types') ? json(['weight']) : json({ has_data: true })
  ));
});

describe('DashboardSettings', () => {
  it('turns the API\'s string booleans into checked state', async () => {
    render(<DashboardSettings />);
    const stats = await screen.findByLabelText(/min \/ max \/ avg/i);
    expect(stats).toBeChecked();
    expect(screen.getByLabelText(/perfusion as a percentage/i)).not.toBeChecked();
  });

  it('keeps chart 1\'s vital out of chart 2\'s options', async () => {
    render(<DashboardSettings />);
    const chart2 = await screen.findByLabelText('Chart 2');
    const labels = within(chart2).getAllByRole('option').map((o) => o.textContent);
    expect(labels).toContain('Blood pressure');
    expect(labels).toContain('Nutrition (calories & water)');
    expect(labels).not.toContain('Temperature');
  });

  it('saves exactly the four dashboard keys', async () => {
    render(<DashboardSettings />);
    const stats = await screen.findByLabelText(/min \/ max \/ avg/i);
    fireEvent.click(stats);
    fireEvent.click(screen.getByRole('button', { name: 'Save dashboard' }));
    await waitFor(() => expect(svc.updateSettings).toHaveBeenCalledTimes(1));
    expect(svc.updateSettings).toHaveBeenCalledWith({
      show_statistics: false,
      perfusion_as_percent: false,
      dashboard_chart_1_vital: 'temperature',
      dashboard_chart_2_vital: '',
    });
    expect(await screen.findByText('Dashboard settings saved.')).toHaveClass('em-success');
  });
});
