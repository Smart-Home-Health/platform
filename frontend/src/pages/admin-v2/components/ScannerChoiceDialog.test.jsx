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
// ScannerChoiceDialog: camera-vs-external chooser shown before every scan,
// with the last-used choice remembered per device and preselected.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import ScannerChoiceDialog, { SCANNER_CHOICE_KEY } from './ScannerChoiceDialog';

beforeEach(() => {
  localStorage.clear();
});

describe('ScannerChoiceDialog', () => {
  it('renders nothing when closed', () => {
    render(<ScannerChoiceDialog open={false} onChoose={vi.fn()} />);
    expect(screen.queryByText('How do you want to scan?')).not.toBeInTheDocument();
  });

  it('shows both options and preselects the camera by default', () => {
    render(<ScannerChoiceDialog open onChoose={vi.fn()} />);
    const camera = screen.getByRole('button', { name: /Use the camera/ });
    const external = screen.getByRole('button', { name: /Use an external scanner/ });
    expect(camera).toHaveAttribute('data-preselected');
    expect(external).not.toHaveAttribute('data-preselected');
    expect(screen.getByText('Last used')).toBeInTheDocument();
  });

  it('preselects the external scanner when it was used last', () => {
    localStorage.setItem(SCANNER_CHOICE_KEY, 'external');
    render(<ScannerChoiceDialog open onChoose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Use an external scanner/ })).toHaveAttribute('data-preselected');
    expect(screen.getByRole('button', { name: /Use the camera/ })).not.toHaveAttribute('data-preselected');
  });

  it('reports the camera choice and remembers it', () => {
    const onChoose = vi.fn();
    render(<ScannerChoiceDialog open onChoose={onChoose} />);
    fireEvent.click(screen.getByRole('button', { name: /Use the camera/ }));
    expect(onChoose).toHaveBeenCalledWith('camera');
    expect(localStorage.getItem(SCANNER_CHOICE_KEY)).toBe('camera');
  });

  it('reports the external choice and remembers it', () => {
    const onChoose = vi.fn();
    render(<ScannerChoiceDialog open onChoose={onChoose} />);
    fireEvent.click(screen.getByRole('button', { name: /Use an external scanner/ }));
    expect(onChoose).toHaveBeenCalledWith('external');
    expect(localStorage.getItem(SCANNER_CHOICE_KEY)).toBe('external');
  });

  it('cancel calls onClose without choosing', () => {
    const onChoose = vi.fn();
    const onClose = vi.fn();
    render(<ScannerChoiceDialog open onChoose={onChoose} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(onChoose).not.toHaveBeenCalled();
    expect(localStorage.getItem(SCANNER_CHOICE_KEY)).toBeNull();
  });
});
