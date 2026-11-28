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
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import OccurrenceReminderDialog from './OccurrenceReminderDialog';
import { getLocalDateTimeString } from '../../utils/timezone';

const scheduled = new Date();
scheduled.setHours(8, 0, 0, 0);
const deadline = new Date(scheduled);
deadline.setDate(deadline.getDate() + 3);
const next = new Date(scheduled);
next.setDate(next.getDate() + 1);
const item = { name: 'Weekly task', schedule_id: 11, scheduled_time: scheduled.toISOString(),
  original_due_at: scheduled.toISOString(), deadline_at: deadline.toISOString() };

function show(row = item) {
  const saved = vi.fn();
  render(<OccurrenceReminderDialog item={row} category="care_tasks" patientId={3} onClose={vi.fn()} onSaved={saved} />);
  return saved;
}

afterEach(() => vi.unstubAllGlobals());

it('offers the exact deadline and gets separate confirmation when another occurrence comes first', async () => {
  const writes = [];
  vi.stubGlobal('fetch', vi.fn(async (url, options) => {
    writes.push({ url, method: options.method, body: JSON.parse(options.body) });
    return writes.length === 1
      ? Response.json({ detail: { code: 'overlaps_next', next_at: next.toISOString() } }, { status: 409 })
      : Response.json({ success: true });
  }));
  const saved = show();
  const tooLate = new Date(deadline);
  tooLate.setDate(tooLate.getDate() + 1);
  fireEvent.change(screen.getByLabelText('Remind me on'), { target: { value: getLocalDateTimeString(tooLate) } });
  expect(screen.getByRole('alert')).toHaveTextContent('after this occurrence');
  expect(writes).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Remind me at the deadline' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm overlapping reminder' }));
  await waitFor(() => expect(saved).toHaveBeenCalledWith(deadline));
  const first = { patient_id: 3, schedule_id: 11, scheduled_time: scheduled.toISOString(), remind_at: deadline.toISOString() };
  expect(writes[0]).toEqual({ method: 'PUT', url: expect.stringMatching(/\/api\/schedule\/reminders\/care_tasks$/), body: first });
  expect(writes[1].body).toEqual({ ...first, confirm_next_at: next.toISOString() });
});

it('cancels a snooze using the original firing even if its reminder moved to the following day', async () => {
  const request = vi.fn(async () => Response.json({ success: true }));
  vi.stubGlobal('fetch', request);
  const saved = show({ ...item, remind_at: next.toISOString() });
  expect(screen.getByLabelText('Remind me on')).toHaveValue(getLocalDateTimeString(next));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel reminder change' }));
  await waitFor(() => expect(saved).toHaveBeenCalledWith(scheduled));
  expect(request.mock.calls[0][1].method).toBe('DELETE');
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({
    patient_id: 3, schedule_id: 11, scheduled_time: item.scheduled_time,
  });
});

it('offers both offsets for a repeated hour and keeps an existing reminder on the second one', async () => {
  // Vitest uses America/New_York. The first Sunday in November has two 01:30 slots.
  const first = new Date(new Date().getFullYear() + 1, 10, 1, 1, 30);
  first.setDate(1 + (7 - first.getDay()) % 7);
  const second = new Date(first.getTime() + 3600000);
  const request = vi.fn(async () => Response.json({ success: true }));
  vi.stubGlobal('fetch', request);
  show({ ...item, remind_at: second.toISOString(), deadline_at: new Date(second.getTime() + 86400000).toISOString() });
  expect(screen.getByText(/Enter times in America\/New_York/)).toBeInTheDocument();
  expect(screen.getByLabelText('Which time?')).toHaveValue(String(second.getTimezoneOffset()));
  fireEvent.click(screen.getByRole('button', { name: 'Save reminder' }));
  await waitFor(() => expect(request).toHaveBeenCalled());
  expect(JSON.parse(request.mock.calls[0][1].body).remind_at).toBe(second.toISOString());
});

it('allows shortening a snooze to its future due time and blocks an earlier selection', async () => {
  const due = new Date(next);
  const early = new Date(due.getTime() - 60000);
  const request = vi.fn(async () => Response.json({ success: true }));
  vi.stubGlobal('fetch', request);
  show({ ...item, scheduled_time: due.toISOString(), original_due_at: due.toISOString(), remind_at: deadline.toISOString() });
  const input = screen.getByLabelText('Remind me on');
  fireEvent.change(input, { target: { value: getLocalDateTimeString(early) } });
  expect(screen.getByRole('alert')).toHaveTextContent('Choose the original due time or later');
  expect(screen.getByRole('button', { name: 'Save reminder' })).toBeDisabled();
  expect(request).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: getLocalDateTimeString(due) } });
  fireEvent.click(screen.getByRole('button', { name: 'Save reminder' }));
  await waitFor(() => expect(request).toHaveBeenCalled());
  expect(JSON.parse(request.mock.calls[0][1].body).remind_at).toBe(due.toISOString());
});
