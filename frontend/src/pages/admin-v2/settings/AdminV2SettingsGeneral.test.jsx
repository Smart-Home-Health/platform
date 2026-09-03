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
// AdminV2SettingsGeneral on the vc cfg-* chassis (native selects + em-* fields).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';

vi.mock('../AdminV2Layout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('../../../contexts/AdminPatientContext', () => ({
  useAdminPatient: () => ({ selectedPatient: { id: 5, first_name: 'Eli', last_name: 'Carty' } }),
}));
vi.mock('../../../config', () => ({ default: { apiUrl: '' } }));

const { getSettings, setSetting, updateSettings } = vi.hoisted(() => ({
  getSettings: vi.fn(),
  setSetting: vi.fn(),
  updateSettings: vi.fn(),
}));
vi.mock('../../../services/settings', () => ({ getSettings, setSetting, updateSettings }));

import AdminV2SettingsGeneral from './AdminV2SettingsGeneral';

const SAVED = {
  show_statistics: true, perfusion_as_percent: false,
  dashboard_chart_1_vital: 'blood_pressure', dashboard_chart_2_vital: 'nutrition',
  day_start_hour: 7, idle_lock_target: 'select-user',
  min_spo2: 90, max_spo2: 100, min_bpm: 55, max_bpm: 155,
  daily_calories: 2000, daily_water: 2000,
};

beforeEach(() => {
  getSettings.mockReset().mockResolvedValue(SAVED);
  setSetting.mockReset().mockResolvedValue({});
  updateSettings.mockReset().mockResolvedValue({});
  vi.stubGlobal('fetch', vi.fn(async (url) => ({
    ok: true, status: 200,
    json: async () => (url.includes('has-data')
      ? { has_data: true }
      : ['blood_pressure', 'temperature', 'weight']),
  })));
});

const renderPage = async () => { await act(async () => { render(<AdminV2SettingsGeneral />); }); };

describe('AdminV2SettingsGeneral', () => {
  it('renders vc sections rather than shadcn cards', async () => {
    await renderPage();
    const titles = [...document.querySelectorAll('.cfg-title')].map(t => t.textContent);
    expect(titles).toEqual(['Application Settings', 'Patient Settings', 'About']);
    // No shadcn island left on the page.
    expect(document.querySelector('.tw')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.em-input').length).toBeGreaterThan(0);
  });

  it('reflects saved values in the native selects', async () => {
    await renderPage();
    expect(document.querySelector('#cfg-day-start').value).toBe('7');
    expect(document.querySelector('#cfg-idle-lock').value).toBe('select-user');
    expect(document.querySelector('#cfg-chart-1').value).toBe('blood_pressure');
    expect(document.querySelector('#cfg-chart-2').value).toBe('nutrition');
  });

  it('keeps each vital selectable on only one sub-chart', async () => {
    await renderPage();
    const chart1 = [...document.querySelectorAll('#cfg-chart-1 option')].map(o => o.value);
    // 'nutrition' is taken by chart 2, so chart 1 cannot offer it.
    expect(chart1).not.toContain('nutrition');
    expect(chart1).toContain('blood_pressure');
  });

  it('saves the application settings with parsed types', async () => {
    await renderPage();
    await act(async () => {
      fireEvent.change(document.querySelector('#cfg-day-start'), { target: { value: '9' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save Application Settings/i }));
    });
    expect(updateSettings).toHaveBeenCalledWith(expect.objectContaining({
      day_start_hour: 9,
      idle_lock_target: 'select-user',
      show_statistics: true,
    }));
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('toggles a checkbox through the shared em-check input', async () => {
    await renderPage();
    const perfusion = screen.getByLabelText('Display Perfusion as Percent (%)');
    expect(perfusion.checked).toBe(false);
    await act(async () => { fireEvent.click(perfusion); });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save Application Settings/i }));
    });
    expect(updateSettings).toHaveBeenCalledWith(expect.objectContaining({ perfusion_as_percent: true }));
  });

  it('saves patient thresholds as ints', async () => {
    await renderPage();
    await act(async () => {
      fireEvent.change(document.querySelector('#cfg-min-spo2'), { target: { value: '88' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save Patient Settings/i }));
    });
    expect(setSetting).toHaveBeenCalledWith('min_spo2', 88, 'int', expect.any(String));
  });

  it('surfaces a load failure in the shared em-error box', async () => {
    getSettings.mockRejectedValueOnce(new Error('nope'));
    await renderPage();
    const alert = document.querySelector('.em-error');
    expect(alert).toHaveTextContent(/Failed to load settings/i);
  });
});
