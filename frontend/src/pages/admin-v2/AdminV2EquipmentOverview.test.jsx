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
// The overview's claims: the four counts, what lands on the attention list,
// and that logging a change goes through the endpoint that enforces stock.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('./AdminV2Layout', () => ({ default: ({ children }) => <div>{children}</div> }));

let mockUser = { is_system_admin: true, permissions: [] };
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));

const patient = { id: 1, first_name: 'Pat', last_name: 'Ient' };
vi.mock('../../contexts/AdminPatientContext', () => ({
  useAdminPatient: () => ({
    patients: [patient], selectedPatient: patient,
    selectPatient: vi.fn(), loadingPatients: false,
  }),
}));

const list = vi.fn();
const changeHistory = vi.fn();
const logChange = vi.fn();
vi.mock('../../services/equipment', () => ({
  equipmentService: {
    list: (...a) => list(...a),
    changeHistory: (...a) => changeHistory(...a),
    logChange: (...a) => logChange(...a),
  },
}));

const listShipments = vi.fn();
vi.mock('../../services/shipments', () => ({
  shipmentService: { listShipments: (...a) => listShipments(...a) },
}));

import AdminV2EquipmentOverview from './AdminV2EquipmentOverview';

// Frozen so "due today" is a fixed question.
const NOW = new Date('2026-08-19T09:00:00');

const EQUIPMENT = [
  {
    id: 1, name: 'Trach tube', category: 'Airway', scheduled_replacement: true,
    due_date: '2026-08-19', quantity: 4, tracking_level: 'item',
    reorder_point: 1, par_level: 6,
  },
  {
    id: 2, name: 'Vent tube', category: 'Respiratory', scheduled_replacement: true,
    due_date: '2026-08-26', quantity: 10, tracking_level: 'item',
    reorder_point: 2, par_level: 8,
  },
  {
    id: 3, name: 'Mask, trach', category: 'Airway', scheduled_replacement: false,
    quantity: 0, tracking_level: 'item', reorder_point: 2, par_level: 10,
  },
];

const renderPage = () => render(
  <MemoryRouter><AdminV2EquipmentOverview /></MemoryRouter>,
);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  mockUser = { is_system_admin: true, permissions: [] };
  list.mockResolvedValue(EQUIPMENT);
  listShipments.mockResolvedValue({ shipments: [] });
  changeHistory.mockResolvedValue({ history: [] });
  logChange.mockResolvedValue({ success: true });
});

afterEach(() => vi.useRealTimers());

const tile = (label) => screen.getByText(label).parentElement.querySelector('.eo-stat-value');

/** The Log change button on a named row — every scheduled item has one. */
const logChangeButtonFor = (name) => [...document.querySelectorAll('.eo-row')]
  .find((r) => r.textContent.includes(name))
  .querySelector('button');

describe('AdminV2EquipmentOverview', () => {
  it('counts what the four tiles claim', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Tracked')).toBeInTheDocument());
    expect(tile('Tracked').textContent).toBe('3');
    expect(tile('Due now').textContent).toBe('1');    // due today; the 26th is not due
    expect(tile('Low stock').textContent).toBe('2');  // one at zero, one under par
    expect(tile('Incoming').textContent).toBe('0');
  });

  it('counts only open shipments as incoming', async () => {
    listShipments.mockResolvedValue({
      shipments: [
        { id: 1, status: 'shipped' },
        { id: 2, status: 'complete' },   // landed — not incoming
        { id: 3, status: 'draft' },
      ],
    });
    renderPage();
    await waitFor(() => expect(tile('Incoming').textContent).toBe('2'));
  });

  it('leads the attention list with the most urgent thing', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Needs attention')).toBeInTheDocument());
    const names = [...document.querySelectorAll('.eo-row-name')].map((n) => n.textContent);
    expect(names[0]).toBe('Mask, trach');   // none on hand outranks a change due today
    expect(names).toContain('Trach tube');
  });

  it('offers Log change only for a scheduled item', async () => {
    renderPage();
    await waitFor(() => expect(document.querySelector('.eo-row-name')).toBeTruthy());
    const rows = [...document.querySelectorAll('.eo-row')];
    const trach = rows.find((r) => r.textContent.includes('Trach tube'));
    const mask = rows.find((r) => r.textContent.includes('Mask, trach'));
    expect(trach.textContent).toContain('Log change');
    // A supply that is merely short is restocked, not "changed".
    expect(mask.textContent).not.toContain('Log change');
  });

  it('records a change through the endpoint that enforces stock', async () => {
    renderPage();
    await waitFor(() => expect(document.querySelector('.eo-row-name')).toBeTruthy());
    fireEvent.click(logChangeButtonFor('Trach tube'));
    await waitFor(() => expect(logChange).toHaveBeenCalledWith(1, expect.any(String)));
  });

  it('surfaces the API refusal rather than a generic failure', async () => {
    // The endpoint 409s with the supply's name and count when stock is out.
    logChange.mockRejectedValue(new Error('Trach tube has 0 on hand.'));
    renderPage();
    await waitFor(() => expect(document.querySelector('.eo-row-name')).toBeTruthy());
    fireEvent.click(logChangeButtonFor('Trach tube'));
    await waitFor(() => expect(screen.getByRole('alert'))
      .toHaveTextContent('Trach tube has 0 on hand.'));
  });

  it('hides Log change from a user without equipment.change', async () => {
    mockUser = { is_system_admin: false, permissions: ['equipment.read'] };
    renderPage();
    await waitFor(() => expect(document.querySelector('.eo-row-name')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Log change/ })).not.toBeInTheDocument();
  });

  it('reports readiness per category, worst first', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Stock readiness')).toBeInTheDocument());
    const labels = [...document.querySelectorAll('.eo-bar-label')].map((n) => n.textContent);
    // Airway: 0 of 2 at par. Respiratory: 1 of 1.
    expect(labels[0]).toBe('Airway');
    const values = [...document.querySelectorAll('.eo-bar-value')].map((n) => n.textContent);
    expect(values[0]).toBe('0%');
  });

  it('says there is nothing to measure when no levels are set', async () => {
    list.mockResolvedValue([
      { id: 1, name: 'Thing', quantity: 3, tracking_level: 'item', reorder_point: null, par_level: null },
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText(/nothing\s+to measure readiness against/))
      .toBeInTheDocument());
  });

  it('groups upcoming changes by day and marks today', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Upcoming changes')).toBeInTheDocument());
    expect(screen.getByText('Today')).toBeInTheDocument();
    const dates = [...document.querySelectorAll('.eo-tl-date')].map((n) => n.textContent);
    expect(dates).toHaveLength(2);
  });

  it('says so when nothing needs attention', async () => {
    list.mockResolvedValue([
      { id: 1, name: 'Fine', quantity: 20, tracking_level: 'item', reorder_point: 2, par_level: 10 },
    ]);
    renderPage();
    await waitFor(() => expect(screen.getByText('Nothing due and nothing short.'))
      .toBeInTheDocument());
  });

  it('surfaces a failed load instead of an empty dashboard', async () => {
    list.mockRejectedValue(new Error('Boom'));
    renderPage();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Boom'));
  });
});
