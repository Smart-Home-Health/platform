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
import { describe, it, expect } from 'vitest';
import { AVATAR_HUES, identiconElements, identiconMarkup, planIdenticon } from './identicon';

const seeds = [];
for (let i = 1; i <= 200; i += 1) seeds.push(`user:${i}`, `patient:${i}`);

describe('identicon', () => {
  it('is deterministic', () => {
    expect(identiconMarkup('user:1')).toBe(identiconMarkup('user:1'));
    expect(planIdenticon('patient:42')).toEqual(planIdenticon('patient:42'));
  });

  it('differs across seeds — no collisions over 400 household-scale seeds', () => {
    const seen = new Set(seeds.map(identiconMarkup));
    expect(seen.size).toBe(seeds.length);
    expect(identiconMarkup('user:1')).not.toBe(identiconMarkup('user:2'));
  });

  it('a shuffled seed (uuid) changes the picture', () => {
    expect(identiconMarkup('user:1')).not.toBe(identiconMarkup('0d4b4f2a-1c1b-4c9e-9d1e-7e0e9a6a1f22'));
  });

  it('draws exactly three marks in two distinct palette hues, never all one shape', () => {
    seeds.forEach((seed) => {
      const { hues, marks } = planIdenticon(seed);
      expect(marks).toHaveLength(3);
      expect(hues[0]).not.toBe(hues[1]);
      expect(AVATAR_HUES).toContain(hues[0]);
      expect(AVATAR_HUES).toContain(hues[1]);
      expect(new Set(marks.map((m) => m.hue))).toEqual(new Set(hues));
      expect(new Set(marks.map((m) => m.shape)).size).toBeGreaterThan(1);
    });
  });

  it('never overlaps marks on the grid', () => {
    const size = { quarter: () => [2, 2], dot: () => [1, 1] };
    seeds.forEach((seed) => {
      const cells = new Set();
      planIdenticon(seed).marks.forEach((m) => {
        let fw; let fh;
        if (size[m.shape]) [fw, fh] = size[m.shape]();
        else {
          const wide = m.shape === 'half' ? m.orient % 2 === 0 : m.orient === 0;
          [fw, fh] = wide ? [2, 1] : [1, 2];
        }
        for (let c = m.col; c < m.col + fw; c += 1) {
          for (let r = m.row; r < m.row + fh; r += 1) {
            const key = `${c},${r}`;
            expect(cells.has(key)).toBe(false);
            expect(c).toBeLessThan(4);
            expect(r).toBeLessThan(4);
            cells.add(key);
          }
        }
      });
    });
  });

  it('uses only palette tokens — no raw hex', () => {
    const svg = identiconMarkup('user:9');
    expect(svg).not.toMatch(/#[0-9a-f]{3,8}/i);
    expect(svg).toContain('fill="var(--vc-avatar-tile)"');
    const fills = [...svg.matchAll(/fill="var\(--vc-avatar-([a-z-]+)\)"/g)].map((m) => m[1]);
    expect(new Set(fills.filter((f) => f !== 'tile')).size).toBe(2);
  });

  it('starts with the tile rect', () => {
    expect(identiconElements('user:3')[0]).toMatchObject({ tag: 'rect', attrs: { rx: 14 } });
    expect(identiconElements('user:3')).toHaveLength(4);
  });
});
