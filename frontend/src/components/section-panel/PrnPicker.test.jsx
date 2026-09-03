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
// Step one of the PRN flow.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import PrnPicker from './PrnPicker';
import { medicationRows } from './prnRows';

const MEDS = [
  { id: 1, name: 'Albuterol', concentration: '0.083%', quantity: 19, quantity_unit: 'units' },
  {
    id: 2, name: 'Ondansetron', concentration: '4mg/5ml', quantity: 2, quantity_unit: 'ml',
    low_stock_threshold: 5, low_stock_threshold_type: 'quantity',
  },
];

const open = (props = {}) => render(
  <PrnPicker open onOpenChange={vi.fn()} patientName="Elijah Carty"
             rows={medicationRows(MEDS)} onSelect={vi.fn()} {...props} />
);

describe('PrnPicker', () => {
  it('names the step and what is on offer', () => {
    open();
    expect(screen.getByText('Select medication')).toBeInTheDocument();
    expect(screen.getByText(/Elijah Carty · 2 available/)).toBeInTheDocument();
    expect(screen.getByText(/step 1 of 2/i)).toBeInTheDocument();
  });

  it('shows concentration and what is on hand', () => {
    open();
    const row = screen.getByText('Albuterol').closest('button');
    expect(within(row).getByText('0.083%')).toBeInTheDocument();
    expect(within(row).getByText(/19 units on hand/)).toBeInTheDocument();
  });

  it('marks a medication that is running low', () => {
    open();
    // Radix portals the sheet to <body>, outside RTL's container.
    const low = document.querySelectorAll('.mp-prn-stock.low');
    expect(low).toHaveLength(1);
    expect(low[0].textContent).toMatch(/2 ml on hand/);
    // Amber, per the panel's colour rule — red is for clinical concern.
    const untouched = screen.getByText('Albuterol').closest('button');
    expect(untouched.querySelector('.mp-prn-stock.low')).toBeNull();
  });

  it('hands the chosen medication back for step two', () => {
    const onSelect = vi.fn();
    open({ onSelect });
    fireEvent.click(screen.getByText('Ondansetron').closest('button'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: 'Ondansetron' }));
  });

  it('says so when there is nothing to give, and drops the step footer', () => {
    open({ rows: [] });
    expect(screen.getByText(/no as-needed medications/i)).toBeInTheDocument();
    expect(screen.queryByText(/step 1 of 2/i)).toBeNull();
  });
});
