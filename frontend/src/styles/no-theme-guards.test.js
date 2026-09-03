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
// Theming is token-driven: the palette (dark / light / high-contrast) is chosen
// ONCE, in styles/vc-tokens.css, by the class on <html>. No other stylesheet
// may scope a rule to a theme class. The old `:root:not(.light)` guards were
// written when a light theme fell through to a legacy palette that no longer
// exists — with `.light` set, every guarded rule silently dropped and the page
// lost its skin. This test keeps that from coming back.
//
// `.force-dark` (the live board's old self-pin) and `dash-scheme-*` (its
// portal remap) are gone too: the board follows the palette on <html>.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOKEN_SHEET = path.join(SRC, 'styles', 'vc-tokens.css');

// Everywhere: the retired guard shapes.
const FORBIDDEN = [':root:not(.light)', ':root:is(:not(.light)', ':root.dark', '.force-dark', 'dash-scheme-'];
// Everywhere except the token sheet: theme-class selectors.
const TOKEN_SHEET_ONLY = [':root.light', ':root.hc', 'html.light', 'html.hc'];

function cssFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) cssFiles(p, out);
    else if (name.endsWith('.css')) out.push(p);
  }
  return out;
}

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('stylesheets never scope rules to a theme class', () => {
  const files = cssFiles(SRC);

  it('sees the stylesheets', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  for (const file of files) {
    const rel = path.relative(SRC, file);
    it(rel, () => {
      const css = stripComments(readFileSync(file, 'utf8'));
      const needles = file === TOKEN_SHEET ? FORBIDDEN : [...FORBIDDEN, ...TOKEN_SHEET_ONLY];
      const hits = css
        .split('\n')
        .map((line, i) => ({ line: i + 1, text: line }))
        .filter(({ text }) => needles.some((n) => text.includes(n)))
        .map(({ line, text }) => `${line}: ${text.trim()}`);
      expect(hits).toEqual([]);
    });
  }
});
