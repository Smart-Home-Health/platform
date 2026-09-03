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
// The appearance picker body — theme and contrast as two segmented rows, and
// a line saying where the choice is kept. Shared by the admin sidebar's
// Appearance sheet and the live board's Settings → Appearance view; the host
// supplies the container (`em-form` / `st-form`).
import SegmentedControl from './SegmentedControl';
import { useTheme } from '../../contexts/ThemeContext';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System', title: 'Follow the device setting' },
];
const CONTRAST_OPTIONS = [
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High', title: 'Solid lines and stronger colours (WCAG AAA)' },
];

export default function AppearanceControls() {
  const { theme, contrast, setTheme, setContrast, savesToProfile } = useTheme();
  return (
    <>
      <SegmentedControl label="Theme" options={THEME_OPTIONS} value={theme} onChange={setTheme} size="sm" />
      <SegmentedControl label="Contrast" options={CONTRAST_OPTIONS} value={contrast} onChange={setContrast} size="sm" />
      <p className="em-hint">
        {savesToProfile
          ? 'Saved to your profile and follows you across devices.'
          : 'Saved on this device.'}
      </p>
    </>
  );
}
