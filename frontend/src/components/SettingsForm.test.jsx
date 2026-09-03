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
// The live Settings panel shell: title, dock-driven layout, default view.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SettingsForm from './SettingsForm';
import { ModalDockProvider } from '../contexts/ModalDockContext';

vi.mock('./settings/DashboardSettings', () => ({ default: () => <div data-testid="dash-view" /> }));
vi.mock('./settings/ThresholdSettings', () => ({ default: () => <div data-testid="thr-view" /> }));
vi.mock('./settings/AppearanceSettings', () => ({ default: () => <div data-testid="app-view" /> }));

const renderAt = (dock = {}, initialView) => render(
  <ModalDockProvider value={{ docked: true, expanded: false, toggleExpand: vi.fn(), setExpanded: vi.fn(), ...dock }}>
    <SettingsForm onClose={vi.fn()} initialView={initialView} />
  </ModalDockProvider>
);

describe('SettingsForm', () => {
  it('opens on the dashboard view with the board title', () => {
    renderAt();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Live board · Dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('dash-view')).toBeInTheDocument();
    expect(screen.queryByTestId('thr-view')).toBeNull();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  // The switcher is a Radix Select, which jsdom cannot drive; the view is
  // opened directly and the mapping to its body asserted.
  it('has an appearance view', () => {
    renderAt({}, 'appearance');
    expect(screen.getByText('Live board · Appearance')).toBeInTheDocument();
    expect(screen.getByTestId('app-view')).toBeInTheDocument();
    expect(screen.queryByTestId('dash-view')).toBeNull();
  });

  it('stacks field rows at the narrow stop and only widens when expanded', () => {
    const { container, unmount } = renderAt({ expanded: false });
    expect(container.querySelector('.st-panel.narrow')).toBeInTheDocument();
    unmount();
    const wide = renderAt({ expanded: true });
    expect(wide.container.querySelector('.st-panel.wide')).toBeInTheDocument();
  });
});
