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
// The Deliveries list: grouping, the counts, and the permission gating that
// used to ask for equipment.* while the endpoints required shipments.*.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('./AdminV2Layout', () => ({ default: ({ children }) => <div>{children}</div> }));

let mockUser = { is_system_admin: false, permissions: [] };
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));

const patient = { id: 1, first_name: 'Pat', last_name: 'Ient' };
vi.mock('../../contexts/AdminPatientContext', () => ({
  useAdminPatient: () => ({
    patients: [patient],
    selectedPatient: patient,
    selectPatient: vi.fn(),
    loadingPatients: false,
  }),
}));

const listShipments = vi.fn();
const listTemplates = vi.fn();
vi.mock('../../services/shipments', () => ({
  shipmentService: {
    listShipments: (...a) => listShipments(...a),
    listTemplates: (...a) => listTemplates(...a),
    createShipment: vi.fn(),
    copyShipment: vi.fn(),
    patchShipment: vi.fn(),
    deleteShipment: vi.fn(),
    createDeliveryFromTemplate: vi.fn(),
  },
}));

vi.mock('../../services/businesses', () => ({
  businessService: { listDmeSuppliers: async () => [{ id: 9, name: 'Pediatric Home Service' }] },
}));

import AdminV2Shipments from './AdminV2Shipments';

const SHIPMENTS = [
  { id: 1, order_number: '78711852', status: 'shipped', supplier_id: 9, item_count: 14, tracking_number: '1Z8400000000392' },
  { id: 2, status: 'draft', supplier_id: 9, item_count: 0, updated_at: '2026-08-18T10:00:00Z' },
  { id: 3, order_number: '78599210', status: 'complete', supplier_id: 9, item_count: 18, finalized_at: '2026-08-04T10:00:00Z' },
  { id: 4, order_number: '78500000', status: 'partial', supplier_id: 9, item_count: 3, finalized_at: '2026-08-01T10:00:00Z' },
];

const renderPage = () => render(
  <MemoryRouter><AdminV2Shipments /></MemoryRouter>,
);

beforeEach(() => {
  vi.clearAllMocks();
  mockUser = { is_system_admin: true, permissions: [] };
  listShipments.mockResolvedValue({ shipments: SHIPMENTS });
  listTemplates.mockResolvedValue({ shipments: [] });
});

describe('AdminV2Shipments', () => {
  it('splits the list into what is moving and what has landed', async () => {
    renderPage();
    // shipped + draft are open; complete + partial have landed
    await waitFor(() => expect(screen.getByText('In progress (2)')).toBeInTheDocument());
    expect(screen.getByText('Recent (2)')).toBeInTheDocument();
  });

  it('counts open, drafts and what needs attention', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Open')).toBeInTheDocument());
    const value = (label) => screen.getByText(label).parentElement.querySelector('.sh-stat-value');
    expect(value('Open').textContent).toBe('2');
    expect(value('Drafts').textContent).toBe('1');
    // the partial delivery is the one that wants a person
    expect(value('Needs attention').textContent).toBe('1');
  });

  it('falls back to the id when a draft has no order number', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: '#2' })).toBeInTheDocument());
  });

  it('searches across order, tracking and supplier', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('In progress (2)')).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('Search shipments'));
    fireEvent.change(screen.getByPlaceholderText(/Order, PO, tracking/), {
      target: { value: '1Z84' },
    });
    await waitFor(() => expect(screen.getByText('In progress (1)')).toBeInTheDocument());
    expect(screen.queryByText(/Recent/)).not.toBeInTheDocument();
  });

  it('hides New from a user without shipments.create', async () => {
    mockUser = { is_system_admin: false, permissions: ['shipments.read'] };
    renderPage();
    await waitFor(() => expect(screen.getByText('Shipments')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /New/ })).not.toBeInTheDocument();
  });

  it('does not accept equipment.* in place of shipments.*', async () => {
    // The old page gated every button on equipment.*, so this user saw
    // actions whose endpoints would have refused them.
    mockUser = { is_system_admin: false, permissions: ['equipment.create', 'equipment.delete'] };
    renderPage();
    await waitFor(() => expect(screen.getByText('Shipments')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /New/ })).not.toBeInTheDocument();
  });

  it('shows New to a user who holds shipments.create', async () => {
    mockUser = { is_system_admin: false, permissions: ['shipments.read', 'shipments.create'] };
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /New/ })).toBeInTheDocument());
  });

  it('says so when there is nothing rather than rendering empty groups', async () => {
    listShipments.mockResolvedValue({ shipments: [] });
    renderPage();
    await waitFor(() => expect(screen.getByText('No shipments yet.')).toBeInTheDocument());
  });

  it('surfaces a failed load instead of showing an empty list', async () => {
    listShipments.mockRejectedValue(new Error('Boom'));
    renderPage();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Boom'));
  });
});
