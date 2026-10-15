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
import { useState } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActiveInputProvider } from '../../contexts/ActiveInputContext';
import { useVirtualKeyboard } from '../../hooks/useVirtualKeyboard';
import EntityModal from '../vc/EntityModal';
import VirtualKeyboard from './VirtualKeyboard';

function KeyboardForm({ ignored = false, readOnly = false, inDialog = false, onOpenChange, autoFocus = false }) {
  const { showVKB, setShowVKB } = useVirtualKeyboard();
  const [value, setValue] = useState('');
  const field = (
    <label>
      Name
      <input value={value} onChange={(e) => setValue(e.target.value)}
        data-vkb-ignore={ignored ? 'true' : undefined} readOnly={readOnly} autoFocus={autoFocus} />
    </label>
  );
  return (
    <ActiveInputProvider>
      {inDialog ? <EntityModal open onOpenChange={onOpenChange} title="Edit profile">{field}</EntityModal> : field}
      <VirtualKeyboard show={showVKB} onShowChange={setShowVKB} />
      <button type="button">Finish</button>
    </ActiveInputProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, '', '/api/hassio_ingress/session/select-user');
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('VirtualKeyboard control', () => {
  it('offers the control for an initially auto-focused login field', () => {
    render(<KeyboardForm autoFocus />);
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Show keyboard' })).toBeInTheDocument();
  });

  it('offers the keyboard on focus and toggles it without losing the input', async () => {
    const user = userEvent.setup();
    render(<KeyboardForm />);
    expect(screen.queryByRole('button', { name: 'Show keyboard' })).not.toBeInTheDocument();

    const input = screen.getByRole('textbox', { name: 'Name' });
    await user.click(input);
    const showButton = screen.getByRole('button', { name: 'Show keyboard' });
    expect(showButton).toHaveAttribute('aria-expanded', 'false');
    await user.click(showButton);
    expect(input).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Hide keyboard' })).toHaveAttribute('aria-expanded', 'true');
    expect(window.localStorage.getItem('vkb')).toBe('1');
    expect(window.location.search).toBe('');

    await user.click(screen.getByRole('button', { name: 'a', exact: true }));
    expect(input).toHaveValue('a');
    await user.click(screen.getByRole('button', { name: 'Hide keyboard' }));
    expect(input).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'a', exact: true })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('vkb')).toBe('0');

    await user.click(screen.getByRole('button', { name: 'Finish' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Show keyboard' })).not.toBeInTheDocument());
  });

  it('remains usable when reached with Tab and activated with Enter', async () => {
    const user = userEvent.setup();
    render(<KeyboardForm />);
    await user.click(screen.getByRole('textbox', { name: 'Name' }));
    await user.tab();
    expect(screen.getByRole('button', { name: 'Show keyboard' })).toHaveFocus();
    // The normal input-blur delay must not remove a focused keyboard control.
    await act(() => new Promise((resolve) => setTimeout(resolve, 180)));
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Hide keyboard' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'a', exact: true })).toBeInTheDocument();
  });

  it('allows touch users to opt in while preserving the phone default', async () => {
    vi.stubGlobal('navigator', {
      ...window.navigator,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      maxTouchPoints: 5,
    });
    window.history.replaceState({}, '', '/live');
    const user = userEvent.setup();
    render(<KeyboardForm />);
    const input = screen.getByRole('textbox', { name: 'Name' });
    await user.click(input);
    await user.pointer({ keys: '[TouchA]', target: screen.getByRole('button', { name: 'Show keyboard' }) });
    expect(input).toHaveFocus();
    await user.pointer({ keys: '[TouchA]', target: screen.getByRole('button', { name: 'Hide keyboard' }) });
    expect(input).toHaveFocus();
    expect(window.localStorage.getItem('vkb')).toBe('0');
  });

  it('can open from a modal without dismissing it or moving input focus', async () => {
    // Radix disables body pointer events; production CSS re-enables the
    // keyboard root. CSS is disabled in this unit-test environment.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onOpenChange = vi.fn();
    render(<KeyboardForm inDialog onOpenChange={onOpenChange} />);
    const input = screen.getByRole('textbox', { name: 'Name' });
    await user.click(input);
    await user.pointer({ keys: '[TouchA]', target: screen.getByRole('button', { name: 'Show keyboard', hidden: true }) });
    expect(input).toHaveFocus();
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Edit profile' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide keyboard', hidden: true })).toBeInTheDocument();
  });

  it.each([
    ['a field with its own keypad', { ignored: true }],
    ['a read-only field', { readOnly: true }],
  ])('does not offer a keyboard for %s', async (_description, props) => {
    const user = userEvent.setup();
    render(<KeyboardForm {...props} />);
    await user.click(screen.getByRole('textbox', { name: 'Name' }));
    expect(screen.queryByRole('button', { name: 'Show keyboard' })).not.toBeInTheDocument();
  });
});
