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
// The four palettes in vc-tokens.css share one contract: the same token set
// in every block, literal values (no color-mix — canvas reads them), and
// contrast that holds up. WCAG ratios are computed here with the standard
// relative-luminance formula, so a "small tweak" to a hue that drops body text
// under 7:1 or a state colour under 3:1 fails in `npm test` rather than on
// somebody's screen. Alpha colours are composited over the surface first.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// path.join rather than `new URL('./vc-tokens.css', import.meta.url)`: Vite
// rewrites that static form into a served asset URL, which is not a file.
const css = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'vc-tokens.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

// ---- parse: selector -> { prop: value } (merged across repeated blocks) ----
function parseBlocks(text) {
  const blocks = {};
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(text))) {
    const selector = m[1].trim().replace(/\s+/g, ' ');
    const decls = {};
    for (const line of m[2].split(';')) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      decls[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    blocks[selector] = { ...(blocks[selector] || {}), ...decls };
  }
  return blocks;
}

const blocks = parseBlocks(css);
const bySelector = (first) => {
  const key = Object.keys(blocks).find((s) => s.split(',')[0].trim() === first);
  if (!key) throw new Error(`no block starting with ${first}`);
  return blocks[key];
};

const PALETTES = {
  // The dark block is the multi-selector one (`:root, :root.light .vc-auth, …`);
  // the bare `:root` key is the palette-independent block (fonts, aliases).
  dark: blocks[Object.keys(blocks).find((s) => s.startsWith(':root,'))],
  light: bySelector(':root.light'),
  'dark-hc': bySelector(':root.hc'),
  'light-hc': bySelector(':root.light.hc'),
};
const SHARED = blocks[':root'];

const isToken = (k) => k.startsWith('--vc-') && !k.startsWith('--vc-avatar-');
const CORE_KEYS = Object.keys(PALETTES['light']).filter(isToken).sort();

// Resolve var() within a palette (aliases fall back to the shared :root block).
function resolve(palette, value, depth = 0) {
  if (depth > 8) throw new Error(`var() loop in ${value}`);
  return value.replace(/var\((--[\w-]+)\)/g, (_, name) => {
    const v = palette[name] ?? SHARED[name];
    if (v === undefined) throw new Error(`unknown token ${name}`);
    return resolve(palette, v, depth + 1);
  });
}
const token = (name, value) => resolve(PALETTES[name], PALETTES[name][value] ?? SHARED[value]);

// ---- colour maths ----
function parseColor(str) {
  const s = str.trim();
  let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = [...h].map((c) => c + c).join('');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1);
  }
  m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
  throw new Error(`not a colour: ${str}`);
}
const over = (fg, bg) => {
  const [r, g, b, a] = fg;
  return [r * a + bg[0] * (1 - a), g * a + bg[1] * (1 - a), b * a + bg[2] * (1 - a), 1];
};
function luminance([r, g, b]) {
  const f = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrast(fg, bg) {
  const b = parseColor(bg);
  const f = over(parseColor(fg), b);
  const [hi, lo] = [luminance(f), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const SURFACES = ['--vc-bg-base', '--vc-bg-surface', '--vc-bg-raised'];
const minOnSurfaces = (name, fg) => Math.min(...SURFACES.map((s) => contrast(token(name, fg), token(name, s))));

// ---- contract ----
describe('vc-tokens.css palettes', () => {
  it('finds four palettes with a real token set', () => {
    expect(CORE_KEYS.length).toBeGreaterThan(25);
  });

  for (const name of Object.keys(PALETTES)) {
    it(`${name}: declares every core token`, () => {
      const keys = Object.keys(PALETTES[name]).filter(isToken).sort();
      expect(keys).toEqual(CORE_KEYS);
      expect(PALETTES[name]['color-scheme']).toBe(name.startsWith('light') ? 'light' : 'dark');
    });

    it(`${name}: values are literal, never color-mix()`, () => {
      for (const [k, v] of Object.entries(PALETTES[name])) {
        if (isToken(k)) expect(v, k).not.toMatch(/color-mix\(/);
      }
    });
  }

  // Minimum ratios: normal palettes meet AA (7:1 chosen for body text), the
  // high-contrast palettes meet AAA across the board.
  const RULES = (hc) => ({
    '--vc-text-primary': 7,
    '--vc-text-secondary': hc ? 7 : 4.5,
    // Tertiary is used as small text everywhere (captions, hints, stat
    // labels), so it carries the body-text floor — the theme matrix (axe) found
    // it at ~4:1 when it was pinned to the non-text 3:1.
    '--vc-text-tertiary': hc ? 7 : 4.5,
    '--vc-data-live': hc ? 4.5 : 3,
    '--vc-state-complete': hc ? 4.5 : 3,
    '--vc-state-due': hc ? 4.5 : 3,
    '--vc-state-alert': hc ? 4.5 : 3,
    '--vc-state-idle': 3,
    '--vc-focus-ring': 3,
    ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((i) => [`--vc-series-${i}`, hc ? 4.5 : 3])),
  });

  for (const name of Object.keys(PALETTES)) {
    const hc = name.endsWith('-hc');
    describe(`${name}: contrast`, () => {
      for (const [tok, min] of Object.entries(RULES(hc))) {
        it(`${tok} ≥ ${min}:1 on base / surface / raised`, () => {
          expect(minOnSurfaces(name, tok)).toBeGreaterThanOrEqual(min);
        });
      }
      it('text-on-accent ≥ 4.5:1 on the live accent', () => {
        expect(contrast(token(name, '--vc-text-on-accent'), token(name, '--vc-data-live'))).toBeGreaterThanOrEqual(4.5);
      });
      if (hc) {
        it('hairline is opaque and ≥ 3:1 on every surface', () => {
          expect(parseColor(token(name, '--vc-line-hairline'))[3]).toBe(1);
          expect(minOnSurfaces(name, '--vc-line-hairline')).toBeGreaterThanOrEqual(3);
        });
      }
      it('series aliases resolve to palette colours', () => {
        for (const alias of ['spo2', 'hr', 'pi', 'bp', 'temp', 'weight', 'calories', 'water', 'bathroom']) {
          expect(() => parseColor(token(name, `--vc-series-${alias}`))).not.toThrow();
        }
      });
    });
  }
});
