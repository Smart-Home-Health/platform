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
// Supplies now carries the catalogue's management actions as well as the
// stock view. The catalogue page it replaced had no tests at all, so these
// stand in for the capabilities that moved.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('./AdminV2Layout', () => ({ default: ({ children }) => <div>{children}</div> }));
vi.mock('./components/SupplyCountModal', () => ({
  default: ({ item }) => <div data-testid="count-modal">{item.name}</div>,
}));

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
const create = vi.fn();
const update = vi.fn();
const remove = vi.fn();
const logChange = vi.fn();
const receive = vi.fn();
const open = vi.fn();
vi.mock('../../services/equipment', () => ({
  equipmentService: {
    list: (...a) => list(...a),
    create: (...a) => create(...a),
    update: (...a) => update(...a),
    remove: (...a) => remove(...a),
    logChange: (...a) => logChange(...a),
    receive: (...a) => receive(...a),
    open: (...a) => open(...a),
  },
}));

import AdminV2Inventory from './AdminV2Inventory';

const NOW = new Date('2026-08-19T09:00:00');

const SUPPLIES = [
  {
    id: 1, name: 'Gauze', category: 'supply', quantity: 20, tracking_level: 'item',
    reorder_point: 2, par_level: 10, scheduled_replacement: false,
  },
  {
    id: 2, name: 'Catheter', category: 'supply', quantity: 0, tracking_level: 'item',
    reorder_point: 2, par_level: 10, scheduled_replacement: false, item_number: '14FR',
  },
  {
    id: 3, name: 'Trach tube', category: 'equipment', quantity: 4, tracking_level: 'item',
    reorder_point: 1, par_level: 6, scheduled_replacement: true, due_date: '2026-08-19',
  },
];

const renderPage = () => render(<MemoryRouter><AdminV2Inventory /></MemoryRouter>);
const rowFor = (name) => [...document.querySelectorAll('.sup-row')]
  .find((r) => r.textContent.includes(name));

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  mockUser = { is_system_admin: true, permissions: [] };
  list.mockResolvedValue(SUPPLIES);
  create.mockResolvedValue({ id: 9 });
  update.mockResolvedValue({ status: 'success' });
  remove.mockResolvedValue({ status: 'success' });
  logChange.mockResolvedValue({ success: true });
  receive.mockResolvedValue({ success: true });
  open.mockResolvedValue({ success: true });
});

afterEach(() => vi.useRealTimers());

describe('AdminV2Inventory', () => {
  it('reads the equipment catalogue, not the inventory summary', async () => {
    // The summary omits nine fields the edit form needs and answers the
    // stock question with a different rule.
    renderPage();
    await waitFor(() => expect(list).toHaveBeenCalledWith(1));
  });

  it('opens on what is short', async () => {
    renderPage();
    await waitFor(() => expect(document.querySelector('.sup-row')).toBeTruthy());
    const names = [...document.querySelectorAll('.sup-name')].map((n) => n.textContent);
    expect(names[0]).toBe('Catheter');   // none on hand
  });

  it('states stock against the level set for it', async () => {
    renderPage();
    await waitFor(() => expect(rowFor('Gauze')).toBeTruthy());
    expect(within(rowFor('Gauze')).getByText('Stocked')).toBeInTheDocument();
    expect(within(rowFor('Catheter')).getByText('None on hand')).toBeInTheDocument();
    // 4 of 6 is under par but above the reorder point.
    expect(within(rowFor('Trach tube')).getByText('Low')).toBeInTheDocument();
  });

  it('shows a due scheduled change alongside the stock state', async () => {
    renderPage();
    await waitFor(() => expect(rowFor('Trach tube')).toBeTruthy());
    expect(within(rowFor('Trach tube')).getByText('Due today')).toBeInTheDocument();
  });

  it('says what the target is rather than a bare second number', async () => {
    renderPage();
    await waitFor(() => expect(rowFor('Gauze')).toBeTruthy());
    expect(within(rowFor('Gauze')).getByText('of 10')).toBeInTheDocument();
  });

  it('adds a supply', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /Add supply/ })).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: /Add supply/ })[0]);
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Syringe' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add supply' }));
    await waitFor(() => expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Syringe', patient_id: 1 }),
    ));
  });

  it('edits a supply through the same form', async () => {
    renderPage();
    await waitFor(() => expect(rowFor('Gauze')).toBeTruthy());
    fireEvent.click(within(rowFor('Gauze')).getByLabelText('Actions for Gauze'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Gauze pads' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save supply' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith(
      1, expect.objectContaining({ name: 'Gauze pads' }),
    ));
  });

  it('will not save a scheduled supply without its schedule', async () => {
    // The API answers 400 when either is missing; the form says so first.
    renderPage();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Add supply/ })[0]).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: /Add supply/ })[0]);
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Vent tube' } });
    fireEvent.click(screen.getByLabelText('This is replaced on a schedule'));
    expect(screen.getByRole('button', { name: 'Add supply' })).toBeDisabled();
  });

  it('offers only the tracking levels the column stores', async () => {
    // The old form offered quantity/lot/serial, which the backend does not
    // recognise, and could never set 'none' to turn the stock gate off.
    renderPage();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /Add supply/ })[0]).toBeInTheDocument());
    fireEvent.click(screen.getAllByRole('button', { name: /Add supply/ })[0]);
    fireEvent.click(screen.getByText('Stock levels'));
    const options = [...screen.getByLabelText(/How it is counted/).options].map((o) => o.value);
    expect(options).toEqual(['item', 'box', 'none']);
  });

  it('logs a change only for a scheduled supply', async () => {
    renderPage();
    await waitFor(() => expect(rowFor('Trach tube')).toBeTruthy());
    expect(within(rowFor('Trach tube')).getByText('Log change')).toBeInTheDocument();
    expect(within(rowFor('Gauze')).queryByText('Log change')).not.toBeInTheDocument();

    fireEvent.click(within(rowFor('Trach tube')).getByText('Log change'));
    await waitFor(() => expect(logChange).toHaveBeenCalledWith(3, expect.any(String)));
  });

  it('opens the restock gate when a change is refused for want of stock', async () => {
    const err = new Error('Trach tube has 0 on hand.');
    err.payload = {
      error: 'insufficient_quantity', equipment_id: 3,
      equipment_name: 'Trach tube', current_quantity: 0,
    };
    logChange.mockRejectedValue(err);
    renderPage();
    await waitFor(() => expect(rowFor('Trach tube')).toBeTruthy());
    fireEvent.click(within(rowFor('Trach tube')).getByText('Log change'));
    // The gate renders the supply's name from the 409 payload.
    await waitFor(() => expect(screen.getAllByText(/Trach tube/).length).toBeGreaterThan(1));
  });

  it('records what arrived and what was used', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('3');
    renderPage();
    await waitFor(() => expect(rowFor('Gauze')).toBeTruthy());

    fireEvent.click(within(rowFor('Gauze')).getByLabelText('Actions for Gauze'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Record what arrived' }));
    await waitFor(() => expect(receive).toHaveBeenCalledWith(1, 3));

    fireEvent.click(within(rowFor('Gauze')).getByLabelText('Actions for Gauze'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Record what was used' }));
    await waitFor(() => expect(open).toHaveBeenCalledWith(1, 3));
  });

  it('refuses to use more than is on hand', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('99');
    renderPage();
    await waitFor(() => expect(rowFor('Gauze')).toBeTruthy());
    fireEvent.click(within(rowFor('Gauze')).getByLabelText('Actions for Gauze'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Record what was used' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Only 20'));
    expect(open).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric amount instead of sending NaN', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('lots');
    renderPage();
    await waitFor(() => expect(rowFor('Gauze')).toBeTruthy());
    fireEvent.click(within(rowFor('Gauze')).getByLabelText('Actions for Gauze'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Record what arrived' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(receive).not.toHaveBeenCalled();
  });

  it('opens the audited count for a supply', async () => {
    renderPage();
    await waitFor(() => expect(rowFor('Gauze')).toBeTruthy());
    fireEvent.click(within(rowFor('Gauze')).getByText('Count'));
    expect(screen.getByTestId('count-modal')).toHaveTextContent('Gauze');
  });

  it('searches name, item number and location', async () => {
    renderPage();
    await waitFor(() => expect(rowFor('Gauze')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Search supplies'), { target: { value: '14FR' } });
    await waitFor(() => expect(document.querySelectorAll('.sup-row')).toHaveLength(1));
    expect(rowFor('Catheter')).toBeTruthy();
  });

  it('filters by the categories the data actually has', async () => {
    renderPage();
    await waitFor(() => expect(rowFor('Gauze')).toBeTruthy());
    // 'medication' was offered by the old form and handled by no filter.
    expect(screen.queryByRole('button', { name: 'medication' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'equipment' }));
    await waitFor(() => expect(document.querySelectorAll('.sup-row')).toHaveLength(1));
  });

  it('hides every write action from a read-only user', async () => {
    // The old page showed Change, Receive and Use to everyone, so a
    // read-only caregiver got a 403 from a button that looked available.
    mockUser = { is_system_admin: false, permissions: ['equipment.read'] };
    renderPage();
    await waitFor(() => expect(rowFor('Gauze')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Add supply/ })).not.toBeInTheDocument();
    expect(within(rowFor('Gauze')).queryByText('Count')).not.toBeInTheDocument();
    expect(within(rowFor('Trach tube')).queryByText('Log change')).not.toBeInTheDocument();
    expect(within(rowFor('Gauze')).queryByLabelText(/Actions for/)).not.toBeInTheDocument();
  });

  it('points an empty catalogue at both ways to fill it', async () => {
    list.mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(screen.getByText('Nothing tracked yet.')).toBeInTheDocument());
    expect(screen.getAllByRole('button', { name: /Scan a packing slip/ }).length).toBeGreaterThan(0);
  });

  it('surfaces a failed load instead of an empty list', async () => {
    list.mockRejectedValue(new Error('Boom'));
    renderPage();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Boom'));
  });
});
