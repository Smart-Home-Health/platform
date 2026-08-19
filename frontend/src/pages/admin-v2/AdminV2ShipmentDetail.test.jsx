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
// The shipment detail wizard: which step it opens on, what is editable
// where, and that receiving goes through reconcile rather than the removed
// receive + PATCH + finalize path.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('./AdminV2Layout', () => ({ default: ({ children }) => <div>{children}</div> }));

// The scanning stack owns its own tests; stub it out of the page's way.
vi.mock('./components/PackingSlipCapture', () => ({ default: () => null }));
vi.mock('./components/CsvItemImport', () => ({ default: () => null }));
vi.mock('./components/ScannerChoiceDialog', () => ({ default: () => null }));
vi.mock('./components/ExternalScanDialog', () => ({ default: () => null }));
vi.mock('../../lib/slipScanner', () => ({ parseSlipBarcode: () => null }));

let mockUser = { is_system_admin: true, permissions: [] };
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));

const patient = { id: 1, first_name: 'Pat', last_name: 'Ient' };
vi.mock('../../contexts/AdminPatientContext', () => ({
  useAdminPatient: () => ({
    patients: [patient], selectedPatient: patient, selectPatient: vi.fn(),
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useParams: () => ({ id: '5' }) };
});

const getShipment = vi.fn();
const reconcileShipment = vi.fn();
const patchShipment = vi.fn();
const updateItem = vi.fn();
vi.mock('../../services/shipments', () => ({
  shipmentService: {
    getShipment: (...a) => getShipment(...a),
    reconcileShipment: (...a) => reconcileShipment(...a),
    patchShipment: (...a) => patchShipment(...a),
    updateItem: (...a) => updateItem(...a),
    addItem: vi.fn(), deleteItem: vi.fn(), bulkAddItems: vi.fn(),
    deleteShipment: vi.fn(), copyShipment: vi.fn(), deleteDocument: vi.fn(),
    createDeliveryFromTemplate: vi.fn(),
    documentRawUrl: () => 'blob:slip',
  },
}));
vi.mock('../../services/businesses', () => ({
  businessService: { listDmeSuppliers: async () => [{ id: 9, name: 'Pediatric Home Service' }] },
}));
vi.mock('../../services/equipment', () => ({
  equipmentService: { list: async () => ({ equipment: [] }), update: vi.fn() },
}));

import AdminV2ShipmentDetail from './AdminV2ShipmentDetail';

const ITEM = {
  id: 11, item_description: 'Trach suction catheter', item_number: '14FR-100',
  qty_ordered: 30, qty_shipped: 30, qty_received: 0, receipts: [],
};

const shipment = (over = {}) => ({
  id: 5, order_number: '78711852', status: 'draft', supplier_id: 9,
  items: [ITEM], documents: [], alerts: [], finalized_at: null, ...over,
});

const renderPage = () => render(
  <MemoryRouter><AdminV2ShipmentDetail /></MemoryRouter>,
);

beforeEach(() => {
  vi.clearAllMocks();
  mockUser = { is_system_admin: true, permissions: [] };
  window.sessionStorage.clear();
  getShipment.mockResolvedValue(shipment());
  reconcileShipment.mockResolvedValue({ success: true, alerts_created: 0 });
  patchShipment.mockResolvedValue({ success: true });
  updateItem.mockResolvedValue({ success: true });
});

describe('AdminV2ShipmentDetail', () => {
  it('opens a draft on the list it still needs', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Items')).toBeInTheDocument());
    expect(screen.getByText('Trach suction catheter')).toBeInTheDocument();
  });

  it('opens an in-flight shipment on shipping, not on the list', async () => {
    getShipment.mockResolvedValue(shipment({ status: 'shipped' }));
    renderPage();
    // 'Shipping' is also the step tab, so assert on the section heading.
    await waitFor(() => expect(
      screen.getByRole('heading', { name: 'Shipping' }),
    ).toBeInTheDocument());
    expect(screen.queryByText('Trach suction catheter')).not.toBeInTheDocument();
  });

  it('opens an arrived shipment on receive', async () => {
    getShipment.mockResolvedValue(shipment({ status: 'receiving' }));
    renderPage();
    await waitFor(() => expect(
      screen.getByRole('button', { name: /Everything came as usual/ }),
    ).toBeInTheDocument());
  });

  it('states absent reference numbers rather than leaving them blank', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/PO not added/)).toBeInTheDocument());
    expect(screen.getByText(/Order 78711852/)).toBeInTheDocument();
  });

  it('lets the quantity be stepped while the shipment is a draft', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByLabelText(/One more/)).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/One more/));
    await waitFor(() => expect(updateItem).toHaveBeenCalledWith('5', 11, { qty_ordered: 31 }));
  });

  it('stops the quantity being edited once the shipment is placed', async () => {
    // By then it is a claim about what the supplier sent, not what we asked for.
    getShipment.mockResolvedValue(shipment({ status: 'ordered' }));
    renderPage();
    await waitFor(() => expect(
      screen.getByRole('heading', { name: 'Shipping' }),
    ).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /1\s*Build list/ }));
    expect(await screen.findByText('Trach suction catheter')).toBeInTheDocument();
    expect(screen.queryByLabelText(/One more/)).not.toBeInTheDocument();
  });

  it('receives through reconcile in one call', async () => {
    getShipment.mockResolvedValue(shipment({ status: 'receiving' }));
    renderPage();
    const confirm = await screen.findByRole('button', { name: /Everything came as usual/ });
    fireEvent.click(confirm);
    await waitFor(() => expect(reconcileShipment)
      .toHaveBeenCalledWith('5', { mode: 'same_as_usual' }));
  });

  it('reports what reconcile created rather than a bare success', async () => {
    getShipment.mockResolvedValue(shipment({ status: 'receiving' }));
    reconcileShipment.mockResolvedValue({
      success: true, backorder_shipment_id: 77, alerts_created: 2,
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Everything came as usual/ }));
    await waitFor(() => expect(screen.getByText(/Backorder #77 created/)).toBeInTheDocument());
    expect(screen.getByText(/2 alert\(s\) raised/)).toBeInTheDocument();
  });

  it('surfaces a reconcile failure instead of implying it worked', async () => {
    getShipment.mockResolvedValue(shipment({ status: 'receiving' }));
    reconcileShipment.mockResolvedValue({ success: false, error: 'Already finalized' });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Everything came as usual/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Already finalized'));
  });

  it('shows a finalized shipment as done, with no way to receive it again', async () => {
    getShipment.mockResolvedValue(shipment({
      status: 'complete', finalized_at: '2026-08-19T00:00:00Z',
    }));
    renderPage();
    await waitFor(() => expect(screen.getByText(/Finalized/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Everything came as usual/ })).not.toBeInTheDocument();
  });

  it('treats a standing order as a template, never as a delivery', async () => {
    getShipment.mockResolvedValue(shipment({ is_template: true }));
    renderPage();
    await waitFor(() => expect(screen.getByText(/never\s+receives supplies itself/))
      .toBeInTheDocument());
    expect(screen.queryByRole('navigation', { name: 'Shipment progress' })).not.toBeInTheDocument();
  });

  it('hides receiving from a user without shipments.receive', async () => {
    mockUser = { is_system_admin: false, permissions: ['shipments.read', 'shipments.update'] };
    getShipment.mockResolvedValue(shipment({ status: 'receiving' }));
    renderPage();
    await waitFor(() => expect(
      screen.getByRole('heading', { name: 'Receive' }),
    ).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Everything came as usual/ })).not.toBeInTheDocument();
  });
});
