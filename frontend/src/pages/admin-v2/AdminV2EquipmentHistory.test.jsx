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
// The history timeline: that all three records appear, that the change set is
// worded as a grouping rather than a claim, and that the filters narrow it.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('./AdminV2Layout', () => ({ default: ({ children }) => <div>{children}</div> }));

const patient = { id: 1, first_name: 'Pat', last_name: 'Ient' };
vi.mock('../../contexts/AdminPatientContext', () => ({
  useAdminPatient: () => ({
    patients: [patient], selectedPatient: patient,
    selectPatient: vi.fn(), loadingPatients: false,
  }),
}));

const changeHistory = vi.fn();
const recentCounts = vi.fn();
vi.mock('../../services/equipment', () => ({
  equipmentService: {
    changeHistory: (...a) => changeHistory(...a),
    recentCounts: (...a) => recentCounts(...a),
  },
}));

const listShipments = vi.fn();
vi.mock('../../services/shipments', () => ({
  shipmentService: { listShipments: (...a) => listShipments(...a) },
}));

import AdminV2EquipmentHistory from './AdminV2EquipmentHistory';

const NOW = new Date('2026-08-19T12:00:00');

const CHANGES = [
  { id: 1, equipment_id: 10, equipment_name: 'Vent tube', changed_at: '2026-08-18T00:21:00', changed_by_name: 'John' },
  { id: 2, equipment_id: 11, equipment_name: 'Trach tube', changed_at: '2026-08-18T00:22:00', changed_by_name: 'John' },
  { id: 3, equipment_id: 12, equipment_name: 'Humidification chamber', changed_at: '2026-08-18T00:23:00', changed_by_name: 'John' },
];

const COUNTS = [{
  id: 5, equipment_id: 20, equipment_name: 'Connector STRT Two Base',
  quantity_before: 4, quantity_after: 0, note: 'Used / corrected count',
  counted_by_name: 'Mary', counted_at: '2026-08-19T10:42:00',
}];

const SHIPMENTS = [{
  id: 30, supplier_name: 'Pediatric Home Service', order_number: '78599210',
  status: 'complete', item_count: 18, actual_delivery: '2026-08-04T14:15:00',
}];

const renderPage = () => render(
  <MemoryRouter><AdminV2EquipmentHistory /></MemoryRouter>,
);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  changeHistory.mockResolvedValue({ history: CHANGES });
  recentCounts.mockResolvedValue({ counts: COUNTS });
  listShipments.mockResolvedValue({ shipments: SHIPMENTS });
});

afterEach(() => vi.useRealTimers());

describe('AdminV2EquipmentHistory', () => {
  it('shows all three records, not just the change log', async () => {
    // The old page showed changes alone, so a stocktake or an arriving box
    // never appeared in the thing called History.
    renderPage();
    await waitFor(() => expect(screen.getByText('Stock adjustment')).toBeInTheDocument());
    expect(screen.getByText('Shipment received')).toBeInTheDocument();
    expect(screen.getByText('Scheduled changes')).toBeInTheDocument();
  });

  it('states what a stocktake did, in both directions', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Stock adjustment')).toBeInTheDocument());
    const card = document.querySelector('.kind-stock .eh-line');
    expect(card.textContent).toContain('changed 4 → 0 on hand');
    expect(screen.getByText(/by Mary/)).toBeInTheDocument();
  });

  it('words a change set as a grouping, not as one action', async () => {
    // Nothing records that the three were done together; the page must not
    // say they were.
    renderPage();
    await waitFor(() => expect(screen.getByText('Scheduled changes')).toBeInTheDocument());
    expect(screen.getByText('3 equipment items changed')).toBeInTheDocument();
    expect(screen.getByText('logged by John')).toBeInTheDocument();
    expect(screen.queryByText(/changed together/)).not.toBeInTheDocument();
  });

  it('lists the items inside a set, and can hide them', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Trach tube')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Hide the items'));
    expect(screen.queryByText('Trach tube')).not.toBeInTheDocument();
  });

  it('states a single change as one change, not a set of one', async () => {
    changeHistory.mockResolvedValue({ history: [CHANGES[0]] });
    renderPage();
    await waitFor(() => expect(screen.getByText('Scheduled change')).toBeInTheDocument());
    expect(screen.queryByText(/1 equipment items/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Hide the items')).not.toBeInTheDocument();
  });

  it('says how many events and over what span', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText(/3 events ·/)).toBeInTheDocument());
  });

  it('narrows to one kind with the chips', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Stock adjustment')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Deliveries' }));
    await waitFor(() => expect(screen.queryByText('Stock adjustment')).not.toBeInTheDocument());
    expect(screen.getByText('Shipment received')).toBeInTheDocument();
  });

  it('searches inside a change set, not only its heading', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Stock adjustment')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Search history'), { target: { value: 'trach' } });
    await waitFor(() => expect(screen.queryByText('Stock adjustment')).not.toBeInTheDocument());
    expect(screen.getByText('Scheduled changes')).toBeInTheDocument();
  });

  it('drops events outside the chosen range', async () => {
    listShipments.mockResolvedValue({
      shipments: [{ ...SHIPMENTS[0], actual_delivery: '2026-01-04T14:15:00' }],
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('Stock adjustment')).toBeInTheDocument());
    expect(screen.queryByText('Shipment received')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Date range'), { target: { value: '0' } });
    await waitFor(() => expect(screen.getByText('Shipment received')).toBeInTheDocument());
  });

  it('heads the current day as Today', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Today')).toBeInTheDocument());
  });

  it('says so when a filter matches nothing', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Stock adjustment')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Search history'), { target: { value: 'zzzz' } });
    await waitFor(() => expect(screen.getByText('Nothing matches that.')).toBeInTheDocument());
  });

  it('surfaces a failed load instead of an empty timeline', async () => {
    recentCounts.mockRejectedValue(new Error('Boom'));
    renderPage();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Boom'));
  });

  it('disables Export when there is nothing on screen', async () => {
    changeHistory.mockResolvedValue({ history: [] });
    recentCounts.mockResolvedValue({ counts: [] });
    listShipments.mockResolvedValue({ shipments: [] });
    renderPage();
    await waitFor(() => expect(screen.getByRole('button', { name: /Export/ })).toBeDisabled());
  });
});
