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
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import CareTaskModal from './CareTaskModal';
import MedicationModal from './MedicationModal';
import NutritionModal from './NutritionModal';

const { auth } = vi.hoisted(() => ({ auth: { user: { id: 1, permissions: [] } } }));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../config', () => ({ default: { apiUrl: '' }, apiFetch: (...args) => fetch(...args) }));
vi.mock('./ModalBase', () => ({ default: ({ children }) => <div>{children}</div> }));

const patient = { id: 27, first_name: 'Sam', last_name: 'West' };
const response = body => ({ ok: true, json: async () => body });
const panels = [
  ['medications', MedicationModal, 'Give an as-needed medication'],
  ['nutrition', NutritionModal, 'Log an ad-hoc intake'],
  ['care_tasks', CareTaskModal, 'Record an ad-hoc care task'],
];

function lastScheduleQuery() {
  const requests = fetch.mock.calls.map(([url]) => new URL(url, window.location.origin))
    .filter(url => url.pathname === '/api/schedule/daily');
  return requests.at(-1).searchParams;
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  auth.user.permissions = [
    'medications.read', 'medications.administer',
    'nutrition.read', 'nutrition.create', 'care_tasks.read', 'care_tasks.perform',
  ];
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (url.includes('/api/admin/medications/active')) return response([{ id: 9, name: 'Med', as_needed: true }]);
    if (url.includes('/api/care-tasks/active')) return response({ care_tasks: [{ id: 6, name: 'Task' }] });
    return response({ medications: [], nutrition: [], care_tasks: [] });
  }));
});

it.each([
  [MedicationModal, '/api/admin/medications/active'],
  [CareTaskModal, '/api/care-tasks/active'],
])('does not request an active catalog without its category read permission', async (Panel, endpoint) => {
  auth.user.permissions = ['nutrition.read'];
  await act(async () => { render(<MemoryRouter><Panel patient={patient} onClose={() => {}} /></MemoryRouter>); });
  expect(fetch.mock.calls.some(([url]) => url.includes(endpoint))).toBe(false);
});

describe.each(panels)('live %s schedule', (category, Panel, action) => {
  it('keeps the patient and category on previous, next, date picker and Today', async () => {
    await act(async () => { render(<MemoryRouter><Panel patient={patient} onClose={() => {}} /></MemoryRouter>); });
    const input = screen.getByLabelText('Schedule date');
    const today = input.value;
    const checkRequest = (expectedDay) => {
      const params = lastScheduleQuery();
      expect(params.get('patient_id')).toBe('27');
      expect(params.get('category')).toBe(category);
      expect(params.get('target_date')).toBe(expectedDay);
    };
    checkRequest(today);
    expect(screen.getByTitle(action)).toBeEnabled();
    await act(async () => { fireEvent.change(input, { target: { value: '2026-04-01' } }); });
    checkRequest('2026-04-01');
    await act(async () => { fireEvent.click(screen.getByTitle('Previous Day')); });
    checkRequest('2026-03-31');
    await act(async () => { fireEvent.click(screen.getByTitle('Next Day')); });
    checkRequest('2026-04-01');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Go to Today' })); });
    checkRequest(today);
    expect(input.value).toEqual(today);
  });

  it('keeps date navigation available to readers with write actions disabled', async () => {
    auth.user.permissions = [`${category}.read`];
    await act(async () => { render(<MemoryRouter><Panel patient={patient} onClose={() => {}} /></MemoryRouter>); });
    expect(screen.getByTitle('Previous Day')).toBeEnabled();
    expect(screen.getByTitle(action)).toBeDisabled();
  });
});
