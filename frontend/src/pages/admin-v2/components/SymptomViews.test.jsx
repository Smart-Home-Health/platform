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
// Active cards + history timeline behaviors.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import SymptomActiveList from './SymptomActiveList';
import SymptomHistoryList from './SymptomHistoryList';

const daysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString();
const ACTIVE = [
  { id: 1, symptom_type: 'pain', severity: 10, location: 'abdomen',
    duration: 'Ongoing', timestamp: daysAgo(4), is_resolved: false },
  { id: 2, symptom_type: 'chills', severity: 9, timestamp: daysAgo(11), is_resolved: false },
];
const HISTORY = [
  ...ACTIVE,
  { id: 3, symptom_type: 'cough', severity: 3, timestamp: daysAgo(2),
    is_resolved: true, resolved_at: daysAgo(1) },
  { id: 4, symptom_type: 'spasticity', severity: 5, timestamp: daysAgo(40),
    is_resolved: true, resolved_at: daysAgo(39) },
];

describe('SymptomActiveList', () => {
  it('summarizes and wires the card actions', () => {
    const onResolve = vi.fn();
    const onEdit = vi.fn();
    render(<SymptomActiveList symptoms={ACTIVE} onResolve={onResolve}
                              onEdit={onEdit} onDelete={vi.fn()} />);
    expect(screen.getByText('2')).toBeInTheDocument();          // 2 Active
    expect(screen.getByText(/11 days/i)).toBeInTheDocument();   // longest
    fireEvent.click(screen.getAllByRole('button', { name: /Resolve/i })[0]);
    expect(onResolve).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit symptom' })[0]);
    expect(onEdit).toHaveBeenCalledWith(ACTIVE[0]);
  });
});

describe('SymptomHistoryList', () => {
  it('sorts newest first and honors the range chips', () => {
    render(<SymptomHistoryList symptoms={HISTORY} symptomTypes={['pain', 'cough']} />);
    const names = () => [...document.querySelectorAll('.sh-name')].map((n) => n.textContent);
    expect(names()).toEqual(['Cough', 'Pain', 'Chills', 'Spasticity']); // desc by time
    expect(screen.getByText(/4 records/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '7D' }));
    expect(names()).toEqual(['Cough', 'Pain']);
  });

  it('filters by search and status', () => {
    render(<SymptomHistoryList symptoms={HISTORY} symptomTypes={['pain', 'cough']} />);
    fireEvent.change(screen.getByPlaceholderText(/Search symptoms/i),
                     { target: { value: 'chills' } });
    expect(screen.getByText(/1 record\b/i)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Search symptoms/i),
                     { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Filter/i }));
    fireEvent.change(screen.getByDisplayValue('All'), { target: { value: 'resolved' } });
    expect(screen.getByText(/2 records/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Resolved/).length).toBeGreaterThan(0);
  });
});
