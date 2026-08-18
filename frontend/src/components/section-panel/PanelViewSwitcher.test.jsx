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
// The panel's view row: which list you're on, plus the section's entry points.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PanelViewSwitcher from './PanelViewSwitcher';

const TWO = [
  { value: 'scheduled', label: 'Scheduled', sublabel: "Today's doses", note: '3 missed', tone: 'due' },
  { value: 'active', label: 'Active', sublabel: 'All profiles', count: 16 },
];
const ONE = [
  { value: 'scheduled', label: 'Scheduled', sublabel: "Today's nutrition", note: '2 due', tone: 'due' },
];

describe('PanelViewSwitcher', () => {
  it('offers a dropdown when there is somewhere to go', () => {
    const { container } = render(
      <PanelViewSwitcher views={TWO} value="scheduled" onChange={vi.fn()} />
    );
    expect(container.querySelector('.mp-view-trigger.static')).toBeNull();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('is a heading, not a dropdown, when there is only one view', () => {
    // A control that cannot go anywhere misrepresents what is available.
    const { container } = render(
      <PanelViewSwitcher views={ONE} value="scheduled" onChange={vi.fn()} />
    );
    expect(container.querySelector('.mp-view-trigger.static')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
    // The outstanding count still earns its place.
    expect(screen.getByText('2 due')).toBeInTheDocument();
  });

  it('renders one button per entry point, with its count', () => {
    render(
      <PanelViewSwitcher views={TWO} value="scheduled" onChange={vi.fn()} actions={[
        { label: 'PRN', count: 5, onClick: vi.fn() },
      ]} />
    );
    const btn = screen.getByRole('button', { name: /PRN/ });
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).toContain('5');
  });

  it('supports a section with more than one entry point', () => {
    const intake = vi.fn();
    const output = vi.fn();
    render(
      <PanelViewSwitcher views={ONE} value="scheduled" onChange={vi.fn()} actions={[
        { label: 'Intake', onClick: intake },
        { label: 'Output', onClick: output },
      ]} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Output' }));
    expect(output).toHaveBeenCalledTimes(1);
    expect(intake).not.toHaveBeenCalled();
  });

  it('omits the count where a section has none to report', () => {
    const { container } = render(
      <PanelViewSwitcher views={ONE} value="scheduled" onChange={vi.fn()} actions={[
        { label: 'Intake', onClick: vi.fn() },
      ]} />
    );
    expect(container.querySelector('.mp-prn-count')).toBeNull();
  });

  it('disables an entry point the section cannot offer', () => {
    render(
      <PanelViewSwitcher views={ONE} value="scheduled" onChange={vi.fn()} actions={[
        { label: 'Intake', onClick: vi.fn(), disabled: true },
      ]} />
    );
    expect(screen.getByRole('button', { name: 'Intake' })).toBeDisabled();
  });
});
