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
// CaptureSheet: keypad gating per vital config, the two-band warn/block
// flow, and the blood-pressure two-step with its cross-field rule.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import CaptureSheet from './CaptureSheet';
import { BUILTIN_CONFIGS } from '../vitalConfigs';

const cfg = (key) => BUILTIN_CONFIGS.find((c) => c.key === key);

// Default expected/implausible mirror the backend seeds.
const RANGES = [
  { vital_key: 'spo2', field_key: '', expected_min: 92, expected_max: 100,
    implausible_min: 30, implausible_max: 100, required: true },
  { vital_key: 'temperature', field_key: '', expected_min: 95, expected_max: 103,
    implausible_min: 80, implausible_max: 110, required: false },
  { vital_key: 'blood_pressure', field_key: 'systolic', expected_min: 70,
    expected_max: 200, implausible_min: 30, implausible_max: 300, required: false },
  { vital_key: 'blood_pressure', field_key: 'diastolic', expected_min: 40,
    expected_max: 120, implausible_min: 10, implausible_max: 200, required: false },
];

const type = (digits) => {
  for (const d of digits) fireEvent.click(screen.getByRole('button', { name: d }));
};

const renderSheet = (key, props = {}) => {
  const onCommit = vi.fn();
  const onClose = vi.fn();
  render(<CaptureSheet config={cfg(key)} ranges={RANGES} patientFirstName="Eli"
                       onCommit={onCommit} onClose={onClose} {...props} />);
  return { onCommit, onClose };
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('keypad configuration', () => {
  it('hides the decimal key for integer-only vitals and caps digits', () => {
    renderSheet('spo2');
    expect(screen.queryByRole('button', { name: 'Decimal point' })).not.toBeInTheDocument();
    type(['9', '8', '1']); // 3-digit budget consumed
    expect(screen.getByRole('button', { name: '5' })).toBeDisabled();
  });

  it('offers the decimal key for temperature and enforces one decimal', () => {
    renderSheet('temperature');
    type(['9', '8']);
    fireEvent.click(screen.getByRole('button', { name: 'Decimal point' }));
    type(['4']);
    expect(screen.getByRole('button', { name: '5' })).toBeDisabled(); // maxDecimals 1
    expect(screen.getByRole('button', { name: /Add reading/i })).toBeEnabled();
  });

  it('disables the primary action while the field is empty', () => {
    renderSheet('spo2');
    expect(screen.getByRole('button', { name: /Add reading/i })).toBeDisabled();
  });
});

describe('two-band flow', () => {
  it('commits an in-range value without interruption', () => {
    const { onCommit } = renderSheet('spo2');
    type(['9', '8']);
    fireEvent.click(screen.getByRole('button', { name: /Add reading/i }));
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({
      vitalKey: 'spo2', value: 98, confirmedAgainstWarning: false,
    }));
  });

  it('warns on a concerning value; confirm carries the value and the flag', () => {
    const { onCommit } = renderSheet('spo2');
    type(['8', '8']);
    fireEvent.click(screen.getByRole('button', { name: /Add reading/i }));

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain("88% is below Eli's expected range (92–100%)");
    expect(alert.textContent).toContain('Re-check probe placement');
    expect(onCommit).not.toHaveBeenCalled();

    // Edit returns to entry with the keypad still visible
    expect(screen.getByRole('button', { name: 'Backspace' })).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Confirm 88%' });
    fireEvent.click(confirm);
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({
      vitalKey: 'spo2', value: 88, confirmedAgainstWarning: true,
      rangeShown: expect.objectContaining({ expected_min: 92 }),
    }));
  });

  it('hard-blocks an implausible value with no confirm path', () => {
    const { onCommit } = renderSheet('spo2');
    type(['8']);
    fireEvent.click(screen.getByRole('button', { name: /Add reading/i }));
    expect(screen.getByRole('alert').textContent).toContain("isn't a possible");
    expect(screen.queryByRole('button', { name: /Confirm/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Edit value/i }));
    expect(screen.getByRole('button', { name: /Add reading/i })).toBeInTheDocument();
    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe('blood pressure two-step', () => {
  it('walks systolic then diastolic and commits both', () => {
    const { onCommit } = renderSheet('blood_pressure');
    expect(screen.getByRole('button', { name: /Next: Diastolic/i })).toBeDisabled();
    type(['1', '1', '8']);
    fireEvent.click(screen.getByRole('button', { name: /Next: Diastolic/i }));
    type(['7', '6']);
    fireEvent.click(screen.getByRole('button', { name: /Add reading/i }));
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({
      vitalKey: 'blood_pressure', systolic: 118, diastolic: 76,
    }));
  });

  it('hard-blocks diastolic >= systolic even when both are individually plausible', () => {
    const { onCommit } = renderSheet('blood_pressure');
    type(['9', '0']);
    fireEvent.click(screen.getByRole('button', { name: /Next: Diastolic/i }));
    type(['1', '1', '8']);
    fireEvent.click(screen.getByRole('button', { name: /Add reading/i }));
    expect(screen.getByRole('alert').textContent)
      .toContain('Diastolic must be lower than systolic');
    expect(screen.queryByRole('button', { name: /Confirm/ })).not.toBeInTheDocument();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('shows one combined warning when both fields are concerning', () => {
    renderSheet('blood_pressure');
    type(['2', '1', '0']); // above systolic expected max 200, below implausible 300
    fireEvent.click(screen.getByRole('button', { name: /Next: Diastolic/i }));
    type(['1', '3', '0']); // above diastolic expected max 120
    fireEvent.click(screen.getByRole('button', { name: /Add reading/i }));
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Confirm 210/130' })).toBeInTheDocument();
  });

  it('lets you jump back to systolic by tapping the field', () => {
    renderSheet('blood_pressure');
    type(['1', '1', '8']);
    fireEvent.click(screen.getByRole('button', { name: /Next: Diastolic/i }));
    fireEvent.click(screen.getByRole('button', { name: /Edit systolic/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Backspace' }));
    expect(screen.getByRole('button', { name: /Systolic: 11/ })).toBeInTheDocument();
  });
});

describe('dismissal protection', () => {
  it('asks before discarding a typed value', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { onClose } = renderSheet('spo2');
    type(['9']);
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes without asking when nothing was entered', () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const { onClose } = renderSheet('spo2');
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
