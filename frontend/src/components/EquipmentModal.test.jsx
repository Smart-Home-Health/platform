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
// The live Equipment panel: supplies view, its three bedside actions through
// vc sheets (no window.prompt), the out-of-stock gate, and the dock-driven
// layout. History's Radix view switch is exercised in EquipmentHistory.test.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

import EquipmentModal from './EquipmentModal';
import { ModalDockProvider } from '../contexts/ModalDockContext';

const svc = vi.hoisted(() => ({
  list: vi.fn(),
  changeHistory: vi.fn(),
  receive: vi.fn(),
  open: vi.fn(),
  logChange: vi.fn(),
}));
vi.mock('../services/equipment', () => ({ equipmentService: svc }));

vi.mock('../contexts/AdminPatientContext', () => ({
  useAdminPatient: () => ({ selectedPatient: { id: 5, first_name: 'Test', last_name: 'Testerson' } }),
}));

// The gate does its own fetch; stand in for it so the test sees it open.
vi.mock('./EquipmentRestockGate', () => ({
  default: ({ info }) => (info ? <div data-testid="restock-gate">{info.equipment_name}</div> : null),
}));

const yesterday = new Date(Date.now() - 86400000).toISOString();
const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString();
const ITEMS = [
  { id: 1, name: 'Trach tie', quantity: 4, unit_of_measure: 'EA', scheduled_replacement: true, due_date: yesterday, last_changed: yesterday, useful_days: 7 },
  { id: 2, name: 'HME filter', quantity: 12, scheduled_replacement: true, due_date: nextWeek, last_changed: yesterday, useful_days: 14 },
  { id: 3, name: 'Suction catheter', quantity: 2, scheduled_replacement: false, due_date: null },
];

const renderAt = (dock = {}) => render(
  <ModalDockProvider value={{ docked: true, expanded: false, toggleExpand: vi.fn(), setExpanded: vi.fn(), ...dock }}>
    <EquipmentModal isOpen onClose={vi.fn()} />
  </ModalDockProvider>
);

const card = (name) => screen.getByText(name).closest('[data-testid="eq-card"]');

beforeEach(() => {
  vi.clearAllMocks();
  svc.list.mockResolvedValue(ITEMS);
  svc.changeHistory.mockResolvedValue({ history: [] });
  svc.receive.mockResolvedValue({ success: true });
  svc.open.mockResolvedValue({ success: true });
  svc.logChange.mockResolvedValue({ success: true });
});

describe('EquipmentModal — supplies', () => {
  it('lists the patient\'s supplies with status badges and a due note', async () => {
    renderAt();
    expect(await screen.findByText('Trach tie')).toBeInTheDocument();
    expect(svc.list).toHaveBeenCalledWith(5);
    expect(within(card('Trach tie')).getByText('Due now')).toBeInTheDocument();
    expect(within(card('HME filter')).getByText('On schedule')).toBeInTheDocument();
    expect(within(card('Suction catheter')).getByText('Consumable')).toBeInTheDocument();
    expect(screen.getByText('1 due for change')).toBeInTheDocument();
    // a consumable has no schedule facts, only what is on hand
    expect(within(card('Suction catheter')).queryByText('Due next')).toBeNull();
  });

  it('follows the dock, not the viewport', async () => {
    const { container, unmount } = renderAt({ expanded: false });
    await screen.findByText('Trach tie');
    expect(container.querySelector('.eq-panel.narrow')).toBeInTheDocument();
    unmount();
    const wide = renderAt({ expanded: true });
    await screen.findByText('Trach tie');
    expect(wide.container.querySelector('.eq-panel.wide')).toBeInTheDocument();
  });

  it('records a change through the confirm sheet and refetches', async () => {
    renderAt();
    await screen.findByText('Trach tie');
    fireEvent.click(within(card('Trach tie')).getByRole('button', { name: 'Change now' }));
    expect(await screen.findByText('Mark as changed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark changed' }));
    await waitFor(() => expect(svc.logChange).toHaveBeenCalledTimes(1));
    expect(svc.logChange.mock.calls[0][0]).toBe(1);
    expect(typeof svc.logChange.mock.calls[0][1]).toBe('string');
    await waitFor(() => expect(svc.list).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('Mark as changed')).toBeNull());
  });

  it('opens the restock gate when the change is refused for no stock', async () => {
    const err = Object.assign(new Error('out'), {
      status: 409,
      payload: { error: 'insufficient_quantity', equipment_id: 1, equipment_name: 'Trach tie', current_quantity: 0 },
    });
    svc.logChange.mockRejectedValueOnce(err);
    renderAt();
    await screen.findByText('Trach tie');
    fireEvent.click(within(card('Trach tie')).getByRole('button', { name: 'Change now' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Mark changed' }));
    expect(await screen.findByTestId('restock-gate')).toHaveTextContent('Trach tie');
  });

  it('receives stock through a sheet instead of window.prompt', async () => {
    const prompt = vi.spyOn(window, 'prompt').mockImplementation(() => '1');
    renderAt();
    await screen.findByText('HME filter');
    fireEvent.click(within(card('HME filter')).getByRole('button', { name: 'Receive' }));
    expect(await screen.findByText('Receive — HME filter')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/How many arrived/), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to stock' }));
    await waitFor(() => expect(svc.receive).toHaveBeenCalledWith(2, 3));
    await waitFor(() => expect(svc.list).toHaveBeenCalledTimes(2));
    expect(prompt).not.toHaveBeenCalled();
    prompt.mockRestore();
  });

  it('refuses to use more than is on hand, inline', async () => {
    renderAt();
    await screen.findByText('Suction catheter');
    fireEvent.click(within(card('Suction catheter')).getByRole('button', { name: 'Use' }));
    await screen.findByText('Use — Suction catheter');
    fireEvent.change(screen.getByLabelText(/How many used/), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Take from stock' }));
    expect(await screen.findByText('Only 2 on hand.')).toBeInTheDocument();
    expect(svc.open).not.toHaveBeenCalled();
  });

  it('surfaces a failed save in the sheet rather than an alert', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    svc.open.mockRejectedValueOnce(new Error('Failed to record what was used'));
    renderAt();
    await screen.findByText('Suction catheter');
    fireEvent.click(within(card('Suction catheter')).getByRole('button', { name: 'Use' }));
    await screen.findByText('Use — Suction catheter');
    fireEvent.click(screen.getByRole('button', { name: 'Take from stock' }));
    expect(await screen.findByText('Failed to record what was used')).toBeInTheDocument();
    expect(alert).not.toHaveBeenCalled();
    alert.mockRestore();
  });
});
