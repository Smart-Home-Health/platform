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
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DiarySettings, ObservationForm } from './DiaryForms';

describe('reusable diary settings', () => {
  it('copies an earlier button set into a new diary with its own name and dates', () => {
    const reusable = { name: 'Sleep diary', starts_at: '2025-10-01T00:00:00Z', ends_at: '2025-10-04T00:00:00Z',
      buttons: [{ label: 'Awoke', question: 'Lights on?' }], include_medications: false, include_nutrition: true };
    const save = vi.fn();
    render(<DiarySettings reusable={reusable} onSave={save} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reuse Sleep diary settings' }));
    fireEvent.change(screen.getByLabelText('Diary name'), { target: { value: 'November sleep diary' } });
    fireEvent.change(screen.getByLabelText('Starts'), { target: { value: '2026-11-01T10:30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add button' }));
    fireEvent.change(screen.getByLabelText('Button 2 label'), { target: { value: 'Fell asleep' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create diary' }));
    expect(save).toHaveBeenCalledWith({
      name: 'November sleep diary', starts_at: new Date('2026-11-01T10:30').toISOString(), ends_at: null,
      buttons: [{ label: 'Awoke', question: 'Lights on?' }, { label: 'Fell asleep', question: null }],
      include_medications: false, include_nutrition: true,
    });
    expect(reusable.buttons).toHaveLength(1);
  });

  it('keeps the precise observed instant when editing only the description', () => {
    const save = vi.fn();
    const at = '2026-11-01T06:30:00.493Z'; // Second occurrence of 1:30 AM in New York.
    render(<ObservationForm event={{ id: 9, at, label: 'Awoke' }}
      onSave={save} />);
    fireEvent.change(screen.getByLabelText(/Description/), { target: { value: 'Lights on' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(save).toHaveBeenCalledWith({ observed_at: at, note: 'Lights on', answer: null });
  });

  it.each([
    ['2026-11-01T05:30:00Z', '2026-11-01T01:31', '2026-11-01T05:31:00.000Z'],
    ['2026-11-01T06:30:00Z', '2026-11-01T01:31', '2026-11-01T06:31:00.000Z'],
    ['2026-11-01T06:30:00Z', '2026-07-01T01:31', '2026-07-01T05:31:00.000Z'],
  ])('saves an edit from %s to %s with the applicable offset', (at, wallTime, expected) => {
    const save = vi.fn();
    render(<ObservationForm event={{ id: 1, label: 'Awoke', at }} onSave={save} />);
    fireEvent.change(screen.getByLabelText(/Observed at/), { target: { value: wallTime } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ observed_at: expected }));
  });

  it('allows a diary to end in the repeated hour before its displayed start time', () => {
    const save = vi.fn();
    const initial = { name: 'Overnight', buttons: [{ label: 'Awoke' }],
      starts_at: '2026-11-01T05:45:00Z', ends_at: '2026-11-01T06:15:00Z' };
    render(<DiarySettings initial={initial} onSave={save} />);
    fireEvent.change(screen.getByLabelText('Diary name'), { target: { value: 'Study' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Study', starts_at: initial.starts_at, ends_at: initial.ends_at,
    }));
  });
});
