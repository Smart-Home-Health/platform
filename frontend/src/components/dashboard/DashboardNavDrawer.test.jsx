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
// The live dashboard's phone navigation. What is worth pinning down is that it
// derives from the top bar's action list rather than a copy of it, that a tap
// both acts and closes, and that a section with no actions leaves no empty
// group heading behind.
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import DashboardNavDrawer from './DashboardNavDrawer';

const actions = [
  { key: 'capture', group: 'record', label: 'Capture Vitals', icon: null, onClick: vi.fn(), badge: 0 },
  { key: 'medications', group: 'care', label: 'Medications', icon: null, onClick: vi.fn(), badge: 3 },
  { key: 'alerts', group: 'monitoring', label: 'Alerts', icon: null, onClick: vi.fn(), badge: 351 },
];

const setup = (props = {}) =>
  render(
    <DashboardNavDrawer
      open
      onClose={vi.fn()}
      actions={actions}
      patientName="Test Testerson"
      onSettings={vi.fn()}
      {...props}
    />
  );

describe('DashboardNavDrawer', () => {
  it('renders nothing when closed', () => {
    const { container } = setup({ open: false });
    expect(container).toBeEmptyDOMElement();
  });

  it('groups the top bar actions under their section labels', () => {
    setup();
    const labels = screen.getAllByText(/^(Record|Care|Monitoring|Account)$/).map(n => n.textContent);
    expect(labels).toEqual(['Record', 'Care', 'Monitoring', 'Account']);
    expect(screen.getByText('Capture Vitals')).toBeInTheDocument();
    expect(screen.getByText('Medications')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('drops a group heading when nothing is in it', () => {
    setup({ actions: actions.filter(a => a.group !== 'care') });
    expect(screen.queryByText('Care')).not.toBeInTheDocument();
    expect(screen.getByText('Record')).toBeInTheDocument();
  });

  it('shows the patient the drawer is acting on', () => {
    setup();
    expect(screen.getByText('Test Testerson')).toBeInTheDocument();
  });

  it('caps a large badge rather than widening the row', () => {
    setup();
    expect(screen.getByText('99+')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('omits the badge entirely when nothing is due', () => {
    const { container } = setup({ actions: [actions[0]] });
    expect(container.querySelectorAll('.dn-item-badge')).toHaveLength(0);
  });

  it('runs the action and closes on tap', () => {
    const onClose = vi.fn();
    const onClick = vi.fn();
    setup({ onClose, actions: [{ ...actions[1], onClick }] });
    fireEvent.click(screen.getByText('Medications'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on the scrim but not on the drawer body', () => {
    const onClose = vi.fn();
    const { container } = setup({ onClose });
    fireEvent.click(container.querySelector('.dn-drawer'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector('.dn-overlay'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
