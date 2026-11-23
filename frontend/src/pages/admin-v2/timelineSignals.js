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
const MAX_GAP_MS = 60_000;

export function signalMinutes(rows, signal) {
  const points = [];
  for (const row of rows) {
    const y = row[signal];
    if (y == null || y === -1) continue;
    const minute = Date.parse(row.ts);
    const [first, last] = row.sample_offsets_ms?.[signal] ?? [0, 0];
    points.push({ x: minute + first, end: minute + last, y });
  }
  return points;
}

// Draw each run through its last valid reading and keep isolated samples visible.
// Null separators are for Chart.js only; statistics use the original minute averages.
export function tracePoints(minutes) {
  const trace = [];
  let runStart = true;
  minutes.forEach((point, i) => {
    const next = minutes[i + 1];
    const runEnd = !next || next.x - point.end > MAX_GAP_MS;
    trace.push({ x: point.x, y: point.y, isolated: runStart && runEnd && point.x === point.end });
    if (runEnd && point.end > point.x) trace.push({ x: point.end, y: point.y });
    if (runEnd && next) trace.push({ x: (point.end + next.x) / 2, y: null });
    runStart = runEnd;
  });
  return trace;
}

export function sampleAt(minutes, time) {
  if (time == null || !minutes.length) return null;
  const index = minutes.findIndex(point => point.end >= time);
  const right = minutes[index];
  if (right && right.x <= time) return right;
  const left = index === -1 ? minutes[minutes.length - 1] : minutes[index - 1];
  if (left && right && right.x - left.end > MAX_GAP_MS) return null;
  const before = left ? time - left.end : Infinity;
  const after = right ? right.x - time : Infinity;
  if (Math.min(before, after) > MAX_GAP_MS) return null;
  return before <= after ? left : right;
}
