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
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ShipmentCard from './ShipmentCard';
import ShipmentItemCard from './ShipmentItemCard';

const shipment = { id: 7, order_number: '78711852', status: 'shipped', item_count: 14 };

describe('ShipmentCard', () => {
  it('shows the status the server reported, not a guess', () => {
    render(<ShipmentCard shipment={{ ...shipment, status: 'receiving' }} />);
    expect(screen.getByText('Receiving')).toBeInTheDocument();
  });

  it('renders complete as Received, which is what the user calls it', () => {
    // "Received" is also the rail's last step, so assert on the status pill.
    const { container } = render(<ShipmentCard shipment={{ ...shipment, status: 'complete' }} />);
    expect(container.querySelector('.sc-status').textContent).toBe('Received');
  });

  it('falls back to the id when there is no order or PO number', () => {
    render(<ShipmentCard shipment={{ id: 42, status: 'draft' }} />);
    expect(screen.getByRole('button', { name: '#42' })).toBeInTheDocument();
  });

  it('renders an em dash for a detail with no value', () => {
    // A blank cell reads as a loading failure; the dash says "not set".
    render(<ShipmentCard shipment={shipment}
                         details={[{ label: 'Tracking', value: null }]} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('flags a partial delivery as needing attention', () => {
    const { container } = render(<ShipmentCard shipment={{ ...shipment, status: 'partial' }} />);
    expect(container.querySelector('.needs-attention')).toBeTruthy();
  });

  it('flags unresolved alerts even when the delivery completed', () => {
    const { container } = render(
      <ShipmentCard shipment={{ ...shipment, status: 'complete', unresolved_alert_count: 1 }} />,
    );
    expect(container.querySelector('.needs-attention')).toBeTruthy();
  });

  it('opens from the heading and from the footer action', () => {
    const onOpen = vi.fn();
    const action = { label: 'Track package', onClick: vi.fn() };
    render(<ShipmentCard shipment={shipment} onOpen={onOpen} action={action} />);

    fireEvent.click(screen.getByRole('button', { name: '78711852' }));
    expect(onOpen).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Track package'));
    expect(action.onClick).toHaveBeenCalled();
  });

  it('hides the kebab when there is nothing in it', () => {
    render(<ShipmentCard shipment={shipment} menu={[]} />);
    expect(screen.queryByLabelText(/Actions for/)).not.toBeInTheDocument();
  });
});

describe('ShipmentItemCard', () => {
  const item = {
    id: 1, item_description: 'Trach suction catheter', item_number: '14FR-100',
    qty_ordered: 30, qty_received: 0, receipts: [],
  };

  it('distinguishes nothing-recorded from a recorded zero', () => {
    render(<ShipmentItemCard index={1} item={item} />);
    expect(screen.getByText('—')).toBeInTheDocument();

    render(<ShipmentItemCard index={1}
                             item={{ ...item, qty_received: 0, receipts: [{ id: 9 }] }} />);
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
  });

  it('offers the stepper only while the list is editable', () => {
    const { rerender } = render(<ShipmentItemCard index={1} item={item} />);
    expect(screen.queryByLabelText(/One more/)).not.toBeInTheDocument();

    rerender(<ShipmentItemCard index={1} item={item} editableQty onQtyChange={vi.fn()} />);
    expect(screen.getByLabelText(/One more/)).toBeInTheDocument();
  });

  it('steps the quantity up and down', () => {
    const onQtyChange = vi.fn();
    render(<ShipmentItemCard index={1} item={item} editableQty onQtyChange={onQtyChange} />);

    fireEvent.click(screen.getByLabelText(/One more/));
    expect(onQtyChange).toHaveBeenCalledWith(31);
    fireEvent.click(screen.getByLabelText(/One fewer/));
    expect(onQtyChange).toHaveBeenCalledWith(29);
  });

  it('never steps below zero', () => {
    const onQtyChange = vi.fn();
    render(<ShipmentItemCard index={1} item={{ ...item, qty_ordered: 0 }}
                             editableQty onQtyChange={onQtyChange} />);
    expect(screen.getByLabelText(/One fewer/)).toBeDisabled();
  });

  it('shows what is still to follow', () => {
    render(<ShipmentItemCard index={1} item={{ ...item, qty_backordered: 6 }} />);
    expect(screen.getByText('To follow')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
  });
});
