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
// Deterministic generated avatars — the person's visual fingerprint.
//
// A seed string is hashed (FNV-1a) into a small PRNG (mulberry32), and the
// PRNG picks, in a fixed order: two distinct hues from the eight-colour avatar
// palette, then three marks from a four-shape vocabulary (quarter-disc,
// half-disc, bar, dot), each with an orientation and a free spot on a 4×4
// grid. Same seed, same picture, forever; no image is stored anywhere.
//
// Identity is carried by shape + orientation + position as well as colour, so
// two avatars still read as different when the hues do not. Colours are CSS
// custom properties (see vc-tokens.css), never hex, so the same plan renders
// correctly on the dark login screen and the light admin cards.

export const AVATAR_HUES = [
  'mustard', 'teal', 'terracotta', 'olive', 'dusty-blue', 'plum', 'sage', 'rust',
];

const SIZE = 64;          // viewBox edge
const CELL = 16;          // 4×4 grid
const GRID = 4;
const TILE_RADIUS = 14;   // ≈22% — matches .pa's border-radius

const SHAPES = ['quarter', 'half', 'bar', 'dot'];
const ORIENTATIONS = { quarter: 4, half: 4, bar: 2, dot: 1 };

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(a) {
  let state = a >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Grid footprint (columns × rows) of a shape in a given orientation. */
function footprint(shape, orient) {
  if (shape === 'quarter') return [2, 2];
  if (shape === 'dot') return [1, 1];
  // half: orient 0/2 = flat side N/S (wide), 1/3 = flat side E/W (tall).
  // bar: orient 0 = wide, 1 = tall.
  const wide = shape === 'half' ? orient % 2 === 0 : orient === 0;
  return wide ? [2, 1] : [1, 2];
}

/** Pure description of an avatar: which hues, which marks where. */
export function planIdenticon(seed) {
  const rnd = mulberry32(fnv1a(String(seed)));
  const pick = (n) => Math.floor(rnd() * n);

  const a = pick(AVATAR_HUES.length);
  const b = (a + 1 + pick(AVATAR_HUES.length - 1)) % AVATAR_HUES.length;
  const hues = [AVATAR_HUES[a], AVATAR_HUES[b]];

  const shapes = [pick(4), pick(4), pick(4)].map((i) => SHAPES[i]);
  if (shapes[0] === shapes[1] && shapes[1] === shapes[2]) {
    shapes[2] = SHAPES[(SHAPES.indexOf(shapes[2]) + 1) % SHAPES.length];
  }

  const occupied = new Set();
  const marks = [];
  shapes.forEach((wanted, i) => {
    let shape = wanted;
    let orient = pick(ORIENTATIONS[shape]);
    let anchors = freeAnchors(occupied, ...footprint(shape, orient));
    if (anchors.length === 0) {
      shape = 'dot';
      orient = 0;
      anchors = freeAnchors(occupied, 1, 1);
    }
    const [col, row] = anchors[pick(anchors.length)];
    const [fw, fh] = footprint(shape, orient);
    for (let c = col; c < col + fw; c += 1) {
      for (let r = row; r < row + fh; r += 1) occupied.add(`${c},${r}`);
    }
    // Marks 0 and 2 wear hue A, mark 1 wears hue B: both hues always appear.
    marks.push({ shape, orient, col, row, hue: hues[i === 1 ? 1 : 0] });
  });

  return { hues, marks };
}

function freeAnchors(occupied, fw, fh) {
  const anchors = [];
  for (let r = 0; r + fh <= GRID; r += 1) {
    for (let c = 0; c + fw <= GRID; c += 1) {
      let free = true;
      for (let dc = 0; dc < fw && free; dc += 1) {
        for (let dr = 0; dr < fh && free; dr += 1) {
          if (occupied.has(`${c + dc},${r + dr}`)) free = false;
        }
      }
      if (free) anchors.push([c, r]);
    }
  }
  return anchors;
}

const fill = (hue) => `var(--vc-avatar-${hue})`;

/** One mark → { tag, attrs } for an SVG element inside viewBox 0 0 64 64. */
function markElement({ shape, orient, col, row, hue }) {
  const x0 = col * CELL;
  const y0 = row * CELL;
  const f = fill(hue);
  if (shape === 'dot') {
    return { tag: 'circle', attrs: { cx: x0 + 8, cy: y0 + 8, r: 6.5, fill: f } };
  }
  if (shape === 'bar') {
    const [fw, fh] = footprint(shape, orient);
    return {
      tag: 'rect',
      attrs: { x: x0 + 3, y: y0 + 3, width: fw * CELL - 6, height: fh * CELL - 6, rx: 5, fill: f },
    };
  }
  if (shape === 'quarter') {
    const x1 = x0 + 32;
    const y1 = y0 + 32;
    // Centre sits in one corner of the 2×2 box; the arc sweeps clockwise.
    const d = [
      `M${x0},${y0} L${x1},${y0} A32,32 0 0,1 ${x0},${y1} Z`,
      `M${x1},${y0} L${x1},${y1} A32,32 0 0,1 ${x0},${y0} Z`,
      `M${x1},${y1} L${x0},${y1} A32,32 0 0,1 ${x1},${y0} Z`,
      `M${x0},${y1} L${x0},${y0} A32,32 0 0,1 ${x1},${y1} Z`,
    ][orient];
    return { tag: 'path', attrs: { d, fill: f } };
  }
  // half-disc: 0 flat-top (dome down), 1 flat-right (dome left),
  // 2 flat-bottom (dome up), 3 flat-left (dome right).
  const [fw, fh] = footprint(shape, orient);
  const x1 = x0 + fw * CELL;
  const y1 = y0 + fh * CELL;
  const d = [
    `M${x0},${y0} L${x1},${y0} A16,16 0 0,1 ${x0},${y0} Z`,
    `M${x1},${y0} L${x1},${y1} A16,16 0 0,1 ${x1},${y0} Z`,
    `M${x1},${y1} L${x0},${y1} A16,16 0 0,1 ${x1},${y1} Z`,
    `M${x0},${y1} L${x0},${y0} A16,16 0 0,1 ${x0},${y1} Z`,
  ][orient];
  return { tag: 'path', attrs: { d, fill: f } };
}

/** Tile + marks as plain { tag, attrs } records — React or string renderers
 * map over this. The tile rect comes first so the SVG is complete on its own. */
export function identiconElements(seed) {
  const plan = planIdenticon(seed);
  return [
    { tag: 'rect', attrs: { x: 0, y: 0, width: SIZE, height: SIZE, rx: TILE_RADIUS, fill: 'var(--vc-avatar-tile)' } },
    ...plan.marks.map(markElement),
  ];
}

export const IDENTICON_VIEWBOX = `0 0 ${SIZE} ${SIZE}`;

/** Whole avatar as an SVG string — for tests and anywhere React is not. */
export function identiconMarkup(seed, size = SIZE) {
  const body = identiconElements(seed)
    .map(({ tag, attrs }) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')}/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${IDENTICON_VIEWBOX}" width="${size}" height="${size}">${body}</svg>`;
}
