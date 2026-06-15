/*
 * Smart Home Health Hub
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
import { useState, useEffect } from 'react';

/**
 * Recharts (and other SVG/canvas charts) need literal color strings, so they
 * can't use CSS classes/vars directly. This hook resolves the theme tokens to
 * concrete colors and forces a re-render on light/dark switches (via a
 * MutationObserver on the <html> class) so charts recolor live.
 *
 * Series colors should stay vivid and are kept inline at call sites; this only
 * provides the theme-following chrome: grid, axis text, tooltip, and the
 * `cutout` (matches the card background, e.g. for min-area "eraser" bands).
 */
export function useChartColors() {
  const [, force] = useState(0);
  useEffect(() => {
    const obs = new MutationObserver(() => force(v => v + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  const read = (token, fallback) => {
    if (typeof window === 'undefined') return fallback;
    return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || fallback;
  };
  return {
    grid: read('--border', '#374151'),
    axis: read('--muted-foreground', '#9ca3af'),
    cutout: read('--card', '#1f2937'),
    foreground: read('--foreground', '#e6edf3'),
  };
}
