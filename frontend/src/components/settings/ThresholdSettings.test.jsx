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
// Threshold settings: zero is a value, each pair must be low < high, and the
// save writes the four keys as ints.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ThresholdSettings from './ThresholdSettings';
import { validateThresholds } from './thresholds';

const svc = vi.hoisted(() => ({ getSettings: vi.fn(), setSetting: vi.fn() }));
vi.mock('../../services/settings', () => svc);

beforeEach(() => {
  vi.clearAllMocks();
  svc.getSettings.mockResolvedValue({ min_spo2: '88', max_spo2: '100', min_bpm: '50', max_bpm: '160', other: 'x' });
  svc.setSetting.mockResolvedValue({});
});

describe('validateThresholds', () => {
  it('treats 0 as a value and rejects inverted pairs', () => {
    expect(validateThresholds({ min_spo2: 0, max_spo2: 100, min_bpm: 50, max_bpm: 160 })).toBeNull();
    expect(validateThresholds({ min_spo2: '', max_spo2: 100, min_bpm: 50, max_bpm: 160 })).toMatch(/needs a number/);
    expect(validateThresholds({ min_spo2: 95, max_spo2: 90, min_bpm: 50, max_bpm: 160 })).toMatch(/SpO₂/);
    expect(validateThresholds({ min_spo2: 90, max_spo2: 100, min_bpm: 160, max_bpm: 160 })).toMatch(/heart rate/);
  });
});

describe('ThresholdSettings', () => {
  it('loads the four thresholds and saves them as ints', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    render(<ThresholdSettings />);
    const minSpo2 = await screen.findByLabelText('Alert below', { selector: '#st-min-spo2' });
    expect(minSpo2).toHaveValue(88);
    fireEvent.change(minSpo2, { target: { value: '85' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save thresholds' }));
    await waitFor(() => expect(svc.setSetting).toHaveBeenCalledTimes(4));
    expect(svc.setSetting).toHaveBeenCalledWith('min_spo2', 85, 'int', 'Minimum SpO2 threshold');
    expect(svc.setSetting).toHaveBeenCalledWith('max_bpm', 160, 'int', 'Maximum heart rate threshold');
    expect(await screen.findByText('Thresholds saved.')).toBeInTheDocument();
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('refuses an inverted pair inline without saving', async () => {
    render(<ThresholdSettings />);
    const maxSpo2 = await screen.findByLabelText('Alert above', { selector: '#st-max-spo2' });
    fireEvent.change(maxSpo2, { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save thresholds' }));
    expect(await screen.findByText('Min SpO₂ must be below max SpO₂.')).toHaveClass('em-error');
    expect(svc.setSetting).not.toHaveBeenCalled();
  });
});
