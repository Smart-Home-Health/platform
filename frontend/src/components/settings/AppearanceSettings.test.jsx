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
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const themeCtx = vi.hoisted(() => ({
  theme: 'system', contrast: 'high', setTheme: vi.fn(), setContrast: vi.fn(), savesToProfile: false,
}));
vi.mock('../../contexts/ThemeContext', () => ({ useTheme: () => themeCtx }));

import AppearanceSettings from './AppearanceSettings';

describe('AppearanceSettings', () => {
  it('renders the picker inside the settings section chassis', () => {
    render(<AppearanceSettings />);
    expect(screen.getByRole('heading', { name: 'Appearance' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'System' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'High' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/saved on this device/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(themeCtx.setTheme).toHaveBeenCalledWith('dark');
  });
});
