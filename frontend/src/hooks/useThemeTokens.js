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
import { useEffect, useMemo, useState } from 'react';
import { readChartChrome, readSeries } from '../utils/themeTokens';

/**
 * Resolved chart colours that follow the palette.
 *
 * The palette is a class on <html> (see contexts/ThemeContext), so a
 * MutationObserver on that class is the re-render trigger; it fires after the
 * DOM has changed, which is later than any React effect ordering could
 * guarantee. The result is memoised on the observed version so a 1 Hz board
 * keeps its memo hits between palette changes.
 *
 * Canvas charts (chart.js) should put `version` in the deps of the effect
 * that builds the chart; SVG charts can use `var(--vc-*)` strings directly
 * and do not need this hook at all.
 */
export function useThemeTokens() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return undefined;
    const obs = new MutationObserver(() => setVersion((v) => v + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return useMemo(
    () => ({ version, chrome: readChartChrome(), series: readSeries() }),
    [version],
  );
}
