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
// The two vc skin sheets must stay reachable from the live board, which is
// dark-only regardless of the user's saved theme. Every dark-gated rule is
// therefore scoped `:root:is(:not(.light), .dash-scheme-dark)`; a bare
// `:root:not(.light)` would silently drop the skin for a light-theme user on
// /live (the board pins `dash-scheme-dark` on <html>, never removes `light`).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SHEETS = ['./vc-forms.css', './vc-content.css'];
const GATE = ':root:is(:not(.light), .dash-scheme-dark)';

describe('vc skin dark gating', () => {
  for (const sheet of SHEETS) {
    it(`${sheet} has no bare :root:not(.light) selectors`, () => {
      const css = readFileSync(fileURLToPath(new URL(sheet, import.meta.url)), 'utf8');
      const bare = css.split('\n').filter((l) => l.includes(':root:not(.light)'));
      expect(bare).toEqual([]);
      expect(css.includes(GATE)).toBe(true);
    });
  }
});
