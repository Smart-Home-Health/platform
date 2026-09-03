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
import { cropRect } from './imageCrop';

describe('cropRect', () => {
  it('takes the centre square of a landscape', () => {
    expect(cropRect(4000, 3000)).toEqual({ sx: 500, sy: 0, side: 3000, out: 256 });
  });
  it('takes the centre square of a portrait', () => {
    expect(cropRect(600, 1000)).toEqual({ sx: 0, sy: 200, side: 600, out: 256 });
  });
  it('never upscales a small image', () => {
    expect(cropRect(120, 90)).toEqual({ sx: 15, sy: 0, side: 90, out: 90 });
  });
  it('honours a custom target', () => {
    expect(cropRect(1000, 1000, 128).out).toBe(128);
  });
});
