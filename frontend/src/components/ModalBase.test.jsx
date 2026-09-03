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
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import ModalBase from './ModalBase';
import { ModalDockProvider } from '../contexts/ModalDockContext';

const open = (props = {}, dockValue = null) => {
  const ui = <ModalBase isOpen onClose={vi.fn()} title="T" {...props}><p>body</p></ModalBase>;
  return render(dockValue ? <ModalDockProvider value={dockValue}>{ui}</ModalDockProvider> : ui);
};

const overlay = (c) => c.querySelector('.mb-overlay');

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
    expect(narrow.querySelector('.mb-panel').classList.contains('ld-dock-narrow')).toBe(true);

    const { container: wide } = open({}, { docked: true, expanded: true, toggleExpand: vi.fn() });
    expect(wide.querySelector('.mb-panel').classList.contains('ld-dock-narrow')).toBe(false);
  });

  it('offers no expand control when the host provides no way to expand', () => {
    // A forced dock with no provider has no toggleExpand — an auth prompt has
    // nothing to expand into anyway.
    const { queryByRole } = open({ dock: true });
    expect(queryByRole('button', { name: /expand panel/i })).toBeNull();
  });
});

describe('ModalBase chrome', () => {
  it('closes from a close button reachable by its label, not a × glyph', () => {
    const onClose = vi.fn();
    const { getByLabelText, container } = open({ onClose });
    // The old shell rendered a bare "×" with no accessible name.
    expect(container.textContent).not.toContain('×');
    fireEvent.click(getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders the mb-* family, not the old generic modal-* names', () => {
    // Those names were generic enough that a dead .alert-detail-modal block in
    // App.css silently outranked them. Guard against the prefix coming back.
    const { container } = open();
    expect(container.querySelector('.mb-panel')).toBeTruthy();
    expect(container.querySelector('.mb-head')).toBeTruthy();
    expect(container.querySelector('.mb-body')).toBeTruthy();
    expect(container.querySelector('.mb-title')).toBeTruthy();
    expect(container.querySelector('.modal-container, .modal-header, .modal-body, .modal-title')).toBeNull();
  });
});

describe('ModalBase accessibility', () => {
  afterEach(() => {
    document.body.style.overflow = '';
    document.querySelectorAll('.em-panel, .em-multi-pop, .nip-root').forEach((n) => n.remove());
  });

  it('is a labelled modal dialog', () => {
    const { getByRole, container } = open();
    const dialog = getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const title = container.querySelector('.mb-title');
    expect(dialog.getAttribute('aria-labelledby')).toBe(title.id);
    expect(title.id).toBeTruthy();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    open({ onClose });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('dismissible={false} refuses Escape', () => {
    // The unlock gate and the patient picker: the keyboard must not do what
    // the close button already refuses to do.
    const onClose = vi.fn();
    open({ onClose, dismissible: false });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('yields Escape to a surface open above it', () => {
    // CareTaskModal and NutritionModal render an EntityModal inside a
    // ModalBase; one Escape must not close both.
    const onClose = vi.fn();
    open({ onClose });
    const above = document.createElement('div');
    above.className = 'em-panel';
    document.body.appendChild(above);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('restores focus to the trigger on close', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { container, unmount } = open();
    // Focus actually moved INTO the panel, not merely off the trigger.
    expect(container.querySelector('.mb-panel').contains(document.activeElement)).toBe(true);

    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('restores the previous body overflow rather than forcing auto', () => {
    // The old cleanup set 'auto' unconditionally on every dep change, so a
    // nested modal closing released the outer one's scroll lock.
    document.body.style.overflow = 'scroll';
    const original = window.innerWidth;
    window.innerWidth = 500; // the sheet only locks scroll on the mobile shape
    const { unmount } = open();
    // Assert the lock engaged first, or the restore assertion is vacuous.
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('scroll');
    window.innerWidth = original;
  });
});
