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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */
import { render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { careTaskService } from '../../../services/careTasks';
import CareTaskHistoryModal from './CareTaskHistoryModal';

it('counts recorded outcomes and shows timing only for completed scheduled tasks', async () => {
  const scheduled = {
    completion_status: 'completed',
    completed_at: '2026-11-25T14:00:00+00:00',
    scheduled_time: '2026-11-25T14:00:00+00:00',
    completed_early: false,
    completed_late: false,
  };
  vi.spyOn(careTaskService, 'history').mockResolvedValue({ history: [
    { ...scheduled, id: 1, task_name: 'First task', completed_late: true },
    { ...scheduled, id: 2, task_name: 'Second task' },
    { ...scheduled, id: 3, task_name: 'Third task', completed_early: true },
    { ...scheduled, id: 4, task_name: 'Fourth task', scheduled_time: null },
    { ...scheduled, id: 5, task_name: 'Fifth task', completion_status: 'skipped', completed_late: true },
    { ...scheduled, id: 6, task_name: 'Sixth task', completion_status: 'partial' },
  ] });
  render(<CareTaskHistoryModal open patient={{ id: 1 }} formatDateTime={(date) => date} />);

  const rows = await screen.findAllByRole('listitem');
  for (const [index, label] of ['Late', 'On time', 'Early', 'As needed', 'Skipped', 'Partial'].entries()) {
    expect(within(rows[index]).getByText(label)).toBeInTheDocument();
  }
  const totals = screen.getByText('entries').parentElement;
  for (const count of ['6 entries', '4 completed', '1 skipped', '1 partial', '1 late']) {
    expect(totals).toHaveTextContent(count);
  }
});
