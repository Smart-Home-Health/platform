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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, within } from '@testing-library/react';

vi.mock('./AdminV2Layout', () => ({ default: ({ children }) => <div>{children}</div> }));
const { patientCtx } = vi.hoisted(() => ({
  patientCtx: {
    selectedPatient: { id: 5, first_name: 'Eli' },
    patients: [], selectPatient: () => {},
  },
}));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 1 } }) }));
vi.mock('../../contexts/AdminPatientContext', () => ({ useAdminPatient: () => patientCtx }));
vi.mock('react-router-dom', () => ({ useSearchParams: () => [new URLSearchParams(), () => {}] }));
vi.mock('../../config', () => ({ default: { apiUrl: '' } }));

import AdminV2Schedule from './AdminV2Schedule';

const feed = (overrides = {}) => ({
  schedule_id: 3, name: 'Lunch', scheduled_time: '2026-11-23T15:30:00Z',
  default_item: 'Formula', default_amount: 525, default_amount_unit: 'ml',
  completed: false, completed_at: null, log_id: null, ...overrides,
});
const daily = (nutrition) => ({ medications: [], nutrition, care_tasks: [] });
const response = (body) => ({ ok: true, status: 200, json: async () => body });
const rowFor = (name) => screen.getByText(name, { selector: '.admin-v2-schedule-item-name' }).closest('.admin-v2-schedule-item');
const submitCompletion = async () => {
  fireEvent.change(screen.getByLabelText(/Completed At/), { target: { value: '2026-11-23T13:24' } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Mark Complete|Confirm .* Administration/ }));
  });
};

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('alert', vi.fn());
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('AdminV2Schedule completion refresh', () => {
  it.each([
    ['UTC', '2026-11-23T15:30:00Z', '2026-11-23T18:24:00Z'],
    ['negative offset', '2026-11-23T10:30:00-05:00', '2026-11-23T13:24:00-05:00'],
    ['positive offset', '2026-11-23T18:30:00+03:00', '2026-11-23T21:24:00+03:00'],
    ['legacy naive UTC', '2026-11-23T15:30:00', '2026-11-23T18:24:00'],
  ])('shows the saved actual time and enables Undo immediately with %s timestamps', async (_label, scheduledTime, completedAt) => {
    const pending = feed({ scheduled_time: scheduledTime });
    const completed = { ...pending, completed: true, completed_at: completedAt, log_id: 'intake-91' };
    let current = daily([pending]);
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      if (url.includes('/api/schedule/daily')) return response(current);
      if (url.endsWith('/api/schedule/complete/nutrition')) {
        expect(JSON.parse(options.body)).toMatchObject({
          schedule_id: 3, scheduled_time: scheduledTime, completed_at: '2026-11-23T18:24:00.000Z',
        });
        current = daily([completed]);
        return response({ success: true });
      }
      if (options?.method === 'DELETE') {
        current = daily([pending]);
        return response({ success: true });
      }
      return response([]);
    }));
    await act(async () => { render(<AdminV2Schedule />); });
    expect(within(rowFor('Lunch')).getByText('10:30')).toBeInTheDocument();
    expect(document.querySelector('[data-hour="10"]')).toContainElement(rowFor('Lunch'));

    fireEvent.click(rowFor('Lunch'));
    await submitCompletion();

    const completedRow = rowFor('Lunch');
    expect(completedRow).toHaveClass('completed');
    expect(document.querySelector('[data-hour="13"]')).toContainElement(completedRow);
    expect(within(completedRow).getByText('13:24')).toHaveAttribute('title', 'Given at 13:24 (scheduled 10:30)');
    expect(screen.getByText('1/1')).toBeInTheDocument();
    await act(async () => { fireEvent.click(within(completedRow).getByRole('button', { name: 'Undo' })); });
    expect(fetch).toHaveBeenCalledWith('/api/schedule/log/nutrition_intake/intake-91', {
      method: 'DELETE', credentials: 'include',
    });
    expect(rowFor('Lunch')).not.toHaveClass('completed');
    expect(document.querySelector('[data-hour="10"]')).toContainElement(rowFor('Lunch'));
    expect(within(rowFor('Lunch')).getByText('10:30')).toBeInTheDocument();
    expect(screen.getByText('0/1')).toBeInTheDocument();
  });

  it('places completed items in their actual hour and sorts them by the recorded minute', async () => {
    const done = (name, id, due, actual) => feed({
      name, schedule_id: id, scheduled_time: `2026-11-24T${due}:00-05:00`,
      completed: true, completed_at: actual, log_id: id,
    });
    const breakfast = done('Breakfast', 1, '05:00', '2026-11-24T07:23:00-05:00');
    const prn = { ...done('Mixed diaper', 2, '07:04', '2026-11-24T07:04:00-05:00'), is_prn: true, intake_type: 'output' };
    const med = done('Morning dose', 3, '08:30', '2026-11-24T07:40:00-05:00');
    const task = done('Reposition', 4, '06:00', '2026-11-24T07:15:00-05:00');
    const fallback = done('Water', 5, '09:30', 'invalid');
    const pending = feed({ name: 'Pending feed', scheduled_time: '2026-11-24T07:45:00-05:00' });
    const result = { medications: [med], nutrition: [breakfast, prn, pending, fallback], care_tasks: [task] };
    vi.stubGlobal('fetch', vi.fn(async () => response(result)));
    await act(async () => { render(<AdminV2Schedule />); });
    const hour = document.querySelector('[data-hour="7"]');
    expect(Array.from(hour.querySelectorAll('.nutrition .admin-v2-schedule-item-name'), el => el.textContent))
      .toEqual(['Pending feed', 'Mixed diaper', 'Breakfast']);
    expect(hour).toContainElement(rowFor('Morning dose'));
    expect(hour).toContainElement(rowFor('Reposition'));
    expect(document.querySelector('[data-hour="9"]')).toContainElement(rowFor('Water'));
    expect(within(rowFor('Water')).getByText('09:30')).toBeInTheDocument();
  });

  it('shows the completion date when an item on the selected schedule was completed after midnight', async () => {
    const late = feed({ scheduled_time: '2026-11-23T23:00:00-05:00', completed: true,
      completed_at: '2026-11-24T00:12:00-05:00' });
    vi.stubGlobal('fetch', vi.fn(async () => response(daily([late]))));
    await act(async () => { render(<AdminV2Schedule />); });
    expect(document.querySelector('[data-hour="0"]')).toContainElement(rowFor('Lunch'));
    expect(within(rowFor('Lunch')).getByText('Nov 24 00:12')).toBeInTheDocument();
  });

  it.each([false, true])('refreshes bulk results and preserves incomplete rows when partial failure is %s', async (partialFailure) => {
    const lunch = feed();
    const water = feed({ schedule_id: 4, name: 'Water', default_item: 'Water', default_amount: 100 });
    const completed = (item, logId) => ({ ...item, completed: true, completed_at: '2026-11-23T18:24:00Z', log_id: logId });
    let current = daily([lunch, water]);
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (url.includes('/api/schedule/daily')) return response(current);
      if (url.endsWith('/api/schedule/complete/bulk')) {
        current = daily([completed(lunch, 91), partialFailure ? water : completed(water, 92)]);
        return response({ success: true, nutrition: [
          { schedule_id: 3, success: true },
          { schedule_id: 4, success: !partialFailure, ...(partialFailure && { error: 'Could not record water' }) },
        ] });
      }
      return response([]);
    }));
    await act(async () => { render(<AdminV2Schedule />); });
    fireEvent.click(screen.getByTitle('Complete all nutrition this hour'));
    await submitCompletion();

    expect(within(rowFor('Lunch')).getByText('13:24')).toBeInTheDocument();
    expect(within(rowFor('Lunch')).getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    if (partialFailure) {
      expect(rowFor('Water')).not.toHaveClass('completed');
      expect(within(rowFor('Water')).queryByRole('button', { name: 'Undo' })).toBeNull();
      expect(screen.getByText('1/2')).toBeInTheDocument();
      expect(alert).toHaveBeenCalledWith(expect.stringMatching(/Some items could not be recorded/));
    } else {
      expect(within(rowFor('Water')).getByRole('button', { name: 'Undo' })).toBeInTheDocument();
      expect(screen.getByText('2/2')).toBeInTheDocument();
      expect(alert).not.toHaveBeenCalled();
    }
  });
});
