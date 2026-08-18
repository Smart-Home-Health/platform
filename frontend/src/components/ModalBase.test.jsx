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
// How ModalBase decides to dock. `dock` is normally advisory, but a modal that
// renders above the dock provider in the React tree and portals into the board
// has to be able to opt in — the PIN challenge does exactly that.
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import ModalBase from './ModalBase';
import { ModalDockProvider } from '../contexts/ModalDockContext';

const open = (props = {}, dockValue = null) => {
  const ui = <ModalBase isOpen onClose={vi.fn()} title="T" {...props}><p>body</p></ModalBase>;
  return render(dockValue ? <ModalDockProvider value={dockValue}>{ui}</ModalDockProvider> : ui);
};

const overlay = (c) => c.querySelector('.dashboard-modal-overlay');

describe('ModalBase docking', () => {
  it('does not dock outside a provider', () => {
    const { container } = open();
    expect(overlay(container).classList.contains('docked')).toBe(false);
  });

  it('docks inside a provider that offers it', () => {
    const { container } = open({}, { docked: true, expanded: false, toggleExpand: vi.fn() });
    expect(overlay(container).classList.contains('docked')).toBe(true);
  });

  it('dock={false} opts out even inside a provider', () => {
    // The unlock gate uses this — it wants the board, not a side panel.
    const { container } = open({ dock: false }, { docked: true, expanded: false, toggleExpand: vi.fn() });
    expect(overlay(container).classList.contains('docked')).toBe(false);
  });

  it('dock={true} opts in from outside a provider', () => {
    const { container } = open({ dock: true });
    expect(overlay(container).classList.contains('docked')).toBe(true);
  });

  it('carries the narrow class until expanded', () => {
    const { container: narrow } = open({ dock: true });
    expect(narrow.querySelector('.modal-container').classList.contains('ld-dock-narrow')).toBe(true);

    const { container: wide } = open({}, { docked: true, expanded: true, toggleExpand: vi.fn() });
    expect(wide.querySelector('.modal-container').classList.contains('ld-dock-narrow')).toBe(false);
  });

  it('offers no expand control when the host provides no way to expand', () => {
    // A forced dock with no provider has no toggleExpand — an auth prompt has
    // nothing to expand into anyway.
    const { queryByRole } = open({ dock: true });
    expect(queryByRole('button', { name: /expand panel/i })).toBeNull();
  });
});
