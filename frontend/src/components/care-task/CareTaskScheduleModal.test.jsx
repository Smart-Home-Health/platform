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
// Editing, deleting and pausing a schedule had endpoints but no UI — the only
// implementation lived in a file nothing imported.
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CareTaskScheduleModal from './CareTaskScheduleModal';

const TASK = { id: 1, name: 'Morning feed' };
const SCHEDULES = [
  { id: 10, care_task_id: 1, cron_expression: '0 12 * * *', description: 'Midday', active: true },
  { id: 11, care_task_id: 1, cron_expression: '0 20 * * *', description: 'Evening', active: false },
];

const setup = (props = {}) => {
  const handlers = {
    onCreate: vi.fn(), onUpdate: vi.fn(), onDelete: vi.fn(),
    onToggle: vi.fn(), onOpenChange: vi.fn(),
  };
  const utils = render(
    <CareTaskScheduleModal
      open task={TASK} schedules={SCHEDULES}
      canCreate canUpdate canDelete
      {...handlers} {...props}
    />,
  );
  return { ...utils, ...handlers };
};

beforeEach(() => vi.clearAllMocks());

describe('CareTaskScheduleModal', () => {
  it('lists the schedules and marks the paused one', () => {
    setup();
    expect(screen.getAllByText(/Daily ·/)).toHaveLength(2);
    expect(screen.getByText('Paused')).toBeInTheDocument();
  });

  it('can delete a schedule', () => {
    const { onDelete } = setup();
    fireEvent.click(screen.getByLabelText(/Delete Daily · 12:00 PM/));
    expect(onDelete).toHaveBeenCalledWith(SCHEDULES[0]);
  });

  it('can pause and resume', () => {
    const { onToggle } = setup();
    fireEvent.click(screen.getByLabelText('Pause schedule'));
    expect(onToggle).toHaveBeenCalledWith(SCHEDULES[0]);
    fireEvent.click(screen.getByLabelText('Resume schedule'));
    expect(onToggle).toHaveBeenCalledWith(SCHEDULES[1]);
  });

  it('edits an existing schedule rather than adding another', () => {
    const { onUpdate, onCreate } = setup();
    fireEvent.click(screen.getByLabelText(/Edit Daily · 12:00 PM/));
    expect(screen.getByText('Edit schedule')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save schedule' }));
    expect(onUpdate).toHaveBeenCalled();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('adds a new schedule', () => {
    const { onCreate } = setup();
    fireEvent.click(screen.getByText('Add a schedule'));
    fireEvent.click(screen.getByRole('button', { name: 'Add schedule' }));
    expect(onCreate).toHaveBeenCalled();
    expect(onCreate.mock.calls[0][0].cron_expression).toMatch(/^\d+ \d+ \* \* \*$/);
  });

  it('offers intake prefill only for a nutrition task', () => {
    setup();
    fireEvent.click(screen.getByText('Add a schedule'));
    expect(screen.queryByText('Intake prefill')).not.toBeInTheDocument();
  });

  it('stores intake prefill as JSON in the notes field', () => {
    const { onCreate } = setup({ isNutritionTask: true });
    fireEvent.click(screen.getByText('Add a schedule'));
    fireEvent.click(screen.getByText('Intake prefill'));
    fireEvent.change(document.getElementById('ct-nut-item'), { target: { value: 'Peptamen' } });
    fireEvent.change(document.getElementById('ct-nut-amount'), { target: { value: '250' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add schedule' }));

    const notes = JSON.parse(onCreate.mock.calls[0][0].notes);
    expect(notes.nutrition.item_name).toBe('Peptamen');
    expect(notes.nutrition.amount).toBe(250);
  });

  it('hides the write actions without permission', () => {
    setup({ canCreate: false, canUpdate: false, canDelete: false });
    expect(screen.queryByText('Add a schedule')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Edit /)).not.toBeInTheDocument();
    // Reading what is scheduled is still fine.
    expect(screen.getAllByText(/Daily ·/)).toHaveLength(2);
  });
});
