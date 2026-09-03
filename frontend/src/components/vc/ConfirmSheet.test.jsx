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
// The vc yes/no sheet.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ConfirmSheet from './ConfirmSheet';

describe('ConfirmSheet', () => {
  it('shows the question and fires confirm / cancel', () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ConfirmSheet open onOpenChange={onOpenChange} title="Mark as changed" confirmLabel="Mark changed" onConfirm={onConfirm}>
        Record <strong>Trach tie</strong> as changed now?
      </ConfirmSheet>
    );
    expect(screen.getByText('Mark as changed')).toBeInTheDocument();
    expect(screen.getByText('Trach tie')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark changed' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('marks destructive confirms and disables both buttons while busy', () => {
    render(
      <ConfirmSheet open onOpenChange={vi.fn()} title="Delete" confirmLabel="Delete" tone="destructive" busy onConfirm={vi.fn()}>
        Gone for good.
      </ConfirmSheet>
    );
    const confirm = screen.getByRole('button', { name: /Working/ });
    expect(confirm).toHaveClass('em-submit', 'destructive');
    expect(confirm).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  });

  it('shows an error above the question', () => {
    render(
      <ConfirmSheet open onOpenChange={vi.fn()} title="T" error="Could not record the change" onConfirm={vi.fn()}>
        Q
      </ConfirmSheet>
    );
    expect(screen.getByText('Could not record the change')).toHaveClass('em-error');
  });
});
