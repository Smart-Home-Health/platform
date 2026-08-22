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
// History view of the live Equipment panel: one row per change, and the
// filter that narrows the request to a single supply.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import EquipmentHistory from './EquipmentHistory';

const ITEMS = [{ id: 1, name: 'Trach tie' }, { id: 2, name: 'HME filter' }];
const ROWS = [
  { id: 10, equipment_name: 'Trach tie', changed_at: '2026-08-20T14:05:00Z', changed_by_name: 'Claude', notes: null },
  { id: 11, equipment_name: 'HME filter', changed_at: '2026-08-19T09:00:00Z', changed_by_name: null, notes: 'torn' },
];

describe('EquipmentHistory', () => {
  it('renders one line per change with who/notes as meta', () => {
    const { container } = render(<EquipmentHistory items={ITEMS} rows={ROWS} loading={false} error={null} filter="" onFilter={vi.fn()} />);
    const list = within(container.querySelector('.eq-hist'));
    expect(list.getAllByText('Trach tie')).toHaveLength(1);
    expect(list.getByText('Claude')).toBeInTheDocument();
    expect(list.getByText('torn')).toBeInTheDocument();
  });

  it('narrows to one supply through the filter', () => {
    const onFilter = vi.fn();
    render(<EquipmentHistory items={ITEMS} rows={ROWS} loading={false} error={null} filter="" onFilter={onFilter} />);
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: '2' } });
    expect(onFilter).toHaveBeenCalledWith('2');
  });

  it('says so when nothing has been recorded', () => {
    render(<EquipmentHistory items={ITEMS} rows={[]} loading={false} error={null} filter="" onFilter={vi.fn()} />);
    expect(screen.getByText('No changes recorded')).toBeInTheDocument();
  });
});
