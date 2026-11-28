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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ScheduleHistoryButton from './ScheduleHistoryButton';

afterEach(() => vi.unstubAllGlobals());

describe('recent schedule history', () => {
  it.each([
    ['medication', { medication_id: 9 }, '/api/medications/history?medication_id=9&patient_id=5&limit=10',
      { administered_at: '2026-11-20T18:00:00', status: 'on-time', dose_amount: 0.5, dose_unit: 'mg' }, '0.5 mg'],
    ['care-task', { care_task_id: 8 }, '/api/care-tasks/history?task_id=8&patient_id=5&limit=10',
      { completed_at: '2026-11-20T18:00:00Z', completion_status: 'skipped' }, 'Skipped'],
    ['nutrition', { schedule_id: 7 }, '/api/patients/5/nutrition-intake?schedule_id=7&limit=10',
      { consumed_at: '2026-11-20T18:00:00Z', amount: 125, amount_unit: 'mL' }, '125 mL'],
  ])('loads the selected %s and patient only when opened', async (type, item, path, record, label) => {
    const rows = [{ id: 1, notes: 'Last recorded note', ...record }];
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => type === 'nutrition' ? rows : { history: rows } });
    vi.stubGlobal('fetch', fetch);
    const selectRow = vi.fn();
    render(<div onClick={selectRow}><ScheduleHistoryButton type={type} item={{ ...item, name: 'Example' }} patientId={5} /></div>);
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Recent history' }));
    expect(await screen.findByText('Last recorded note')).toBeVisible();
    expect(screen.getByText(label)).toBeVisible();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining(path), expect.objectContaining({ credentials: 'include' }));
    expect(selectRow).not.toHaveBeenCalled();
  });

  it('offers no intake history for fixed checks or flushes', () => {
    const { rerender } = render(<ScheduleHistoryButton type="nutrition" patientId={5}
      item={{ schedule_id: 10, row_kind: 'diaper_check' }} />);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<ScheduleHistoryButton type="nutrition" patientId={5} item={{ schedule_id: 10, row_kind: 'flush' }} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
