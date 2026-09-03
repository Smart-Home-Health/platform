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
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

const themeCtx = vi.hoisted(() => ({
  theme: 'dark', contrast: 'normal', setTheme: vi.fn(), setContrast: vi.fn(), savesToProfile: true,
}));
vi.mock('../../contexts/ThemeContext', () => ({ useTheme: () => themeCtx }));

import AppearanceControls from './AppearanceControls';

beforeEach(() => {
  vi.clearAllMocks();
  themeCtx.theme = 'dark';
  themeCtx.contrast = 'normal';
  themeCtx.savesToProfile = true;
});

describe('AppearanceControls', () => {
  it('renders theme and contrast as radiogroups with the current values checked', () => {
    render(<AppearanceControls />);
    const theme = screen.getByRole('radiogroup', { name: 'Theme' });
    const contrast = screen.getByRole('radiogroup', { name: 'Contrast' });
    expect(within(theme).getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
    expect(within(theme).getAllByRole('radio')).toHaveLength(3);
    expect(within(contrast).getByRole('radio', { name: 'Normal' })).toHaveAttribute('aria-checked', 'true');
  });

  it('routes a pick to the right setter', () => {
    render(<AppearanceControls />);
    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(themeCtx.setTheme).toHaveBeenCalledWith('light');
    fireEvent.click(screen.getByRole('radio', { name: 'High' }));
    expect(themeCtx.setContrast).toHaveBeenCalledWith('high');
  });

  it('says where the choice is kept', () => {
    const { rerender } = render(<AppearanceControls />);
    expect(screen.getByText(/saved to your profile/i)).toBeInTheDocument();
    themeCtx.savesToProfile = false;
    rerender(<AppearanceControls />);
    expect(screen.getByText(/saved on this device/i)).toBeInTheDocument();
  });
});
